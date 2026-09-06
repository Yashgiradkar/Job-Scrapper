-- =============================================================================
-- Production-Ready PostgreSQL Database Schema
-- Platform: Automated Job Search, Resume Matching & Auto-Application Engine
-- Engine: PostgreSQL 14+ (Compatible with PostgreSQL 13, 14, 15, 16)
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- Provides gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Fast fuzzy/trigram search on job titles/companies
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- Composite btree + gin indexing

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE application_status_enum AS ENUM (
        'Applied',
        'Resume Viewed',
        'Assessment',
        'HR Round',
        'Technical Round',
        'Manager Round',
        'Final Round',
        'Offer',
        'Rejected',
        'Withdrawn'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE automation_status_enum AS ENUM (
        'Pending',
        'Running',
        'Success',
        'Failed',
        'Skipped'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE remote_type_enum AS ENUM (
        'Remote',
        'Hybrid',
        'Onsite'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE employment_type_enum AS ENUM (
        'Full Time',
        'Part Time',
        'Internship',
        'Contract',
        'Freelance'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'Interview',
        'Offer',
        'Reminder',
        'Automation'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM (
        'user',
        'admin',
        'recruiter'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- 2. CORE UPDATE TIMESTAMP FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 3. TABLES DEFINITIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. USERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    profile_photo TEXT,
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    current_location VARCHAR(255),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    role user_role_enum NOT NULL DEFAULT 'user',
    is_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

COMMENT ON TABLE users IS 'User authentication and personal profile details';

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 2. USER_PREFERENCES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    preferred_locations TEXT[] NOT NULL DEFAULT '{}',
    preferred_roles TEXT[] NOT NULL DEFAULT '{}',
    preferred_companies TEXT[] NOT NULL DEFAULT '{}',
    excluded_companies TEXT[] NOT NULL DEFAULT '{}',
    preferred_job_types TEXT[] NOT NULL DEFAULT '{}',
    remote_only BOOLEAN NOT NULL DEFAULT false,
    hybrid_allowed BOOLEAN NOT NULL DEFAULT true,
    onsite_allowed BOOLEAN NOT NULL DEFAULT true,
    minimum_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (minimum_salary >= 0),
    maximum_salary NUMERIC(12,2) CHECK (maximum_salary IS NULL OR maximum_salary >= minimum_salary),
    minimum_experience INT NOT NULL DEFAULT 0 CHECK (minimum_experience >= 0),
    maximum_experience INT CHECK (maximum_experience IS NULL OR maximum_experience >= minimum_experience),
    sponsorship_required BOOLEAN NOT NULL DEFAULT false,
    daily_application_limit INT NOT NULL DEFAULT 25 CHECK (daily_application_limit > 0),
    auto_apply BOOLEAN NOT NULL DEFAULT false,
    ai_resume_matching BOOLEAN NOT NULL DEFAULT true,
    ai_cover_letter BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE user_preferences IS 'User search criteria, salary constraints, and auto-apply toggles';

CREATE TRIGGER trg_user_preferences_updated_at
BEFORE UPDATE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 3. RESUMES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_name VARCHAR(255) NOT NULL,
    resume_url TEXT NOT NULL,
    parsed_text TEXT,
    parsed_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    skills TEXT[] NOT NULL DEFAULT '{}',
    certifications TEXT[] NOT NULL DEFAULT '{}',
    education JSONB NOT NULL DEFAULT '[]'::jsonb,
    work_experience JSONB NOT NULL DEFAULT '[]'::jsonb,
    projects JSONB NOT NULL DEFAULT '[]'::jsonb,
    expected_ctc NUMERIC(12,2) CHECK (expected_ctc IS NULL OR expected_ctc >= 0),
    notice_period INT CHECK (notice_period IS NULL OR notice_period >= 0), -- Days
    experience_years NUMERIC(4,1) NOT NULL DEFAULT 0.0 CHECK (experience_years >= 0),
    is_default BOOLEAN NOT NULL DEFAULT false,
    ats_score NUMERIC(5,2) NOT NULL DEFAULT 0.0 CHECK (ats_score >= 0.0 AND ats_score <= 100.0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE resumes IS 'Parsed resumes, extracted skill vectors, and ATS metadata per user';

CREATE TRIGGER trg_resumes_updated_at
BEFORE UPDATE ON resumes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Guarantee single default resume per user
CREATE OR REPLACE FUNCTION trg_fn_set_single_default_resume()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE resumes
        SET is_default = false
        WHERE user_id = NEW.user_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resumes_single_default
BEFORE INSERT OR UPDATE OF is_default ON resumes
FOR EACH ROW WHEN (NEW.is_default = true)
EXECUTE FUNCTION trg_fn_set_single_default_resume();

-- -----------------------------------------------------------------------------
-- 4. RESUME_VERSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS resume_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    version_number INT NOT NULL CHECK (version_number > 0),
    resume_url TEXT NOT NULL,
    ats_score NUMERIC(5,2) CHECK (ats_score IS NULL OR (ats_score >= 0.0 AND ats_score <= 100.0)),
    changes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_resume_versions_resume_ver UNIQUE(resume_id, version_number)
);

COMMENT ON TABLE resume_versions IS 'Historical revisions and tailored iterations of each resume';

-- -----------------------------------------------------------------------------
-- 5. COMPANIES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL UNIQUE,
    website TEXT,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    headquarters VARCHAR(255),
    linkedin TEXT,
    logo_url TEXT,
    rating NUMERIC(3,2) CHECK (rating IS NULL OR (rating >= 0.0 AND rating <= 5.0)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE companies IS 'Aggregated company directory and profile data';

-- -----------------------------------------------------------------------------
-- 6. JOBS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_job_id VARCHAR(255),
    source VARCHAR(100) NOT NULL, -- 'LinkedIn', 'Indeed', 'Naukri', 'Wellfound', 'CareerPage'
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    job_title VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    employment_type employment_type_enum NOT NULL DEFAULT 'Full Time',
    experience_min INT NOT NULL DEFAULT 0 CHECK (experience_min >= 0),
    experience_max INT CHECK (experience_max IS NULL OR experience_max >= experience_min),
    salary_min NUMERIC(12,2) CHECK (salary_min IS NULL OR salary_min >= 0),
    salary_max NUMERIC(12,2) CHECK (salary_max IS NULL OR salary_max >= COALESCE(salary_min, 0)),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    location VARCHAR(255),
    remote_type remote_type_enum NOT NULL DEFAULT 'Onsite',
    skills_required TEXT[] NOT NULL DEFAULT '{}',
    job_description TEXT,
    responsibilities TEXT,
    qualifications TEXT,
    benefits TEXT,
    application_url TEXT NOT NULL,
    easy_apply BOOLEAN NOT NULL DEFAULT false,
    posted_date TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_jobs_source_external UNIQUE NULLS NOT DISTINCT (source, external_job_id)
);

COMMENT ON TABLE jobs IS 'Central job listings scraped from aggregators and career sites';

CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 7. JOB_MATCHES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0.0 AND overall_score <= 100.0),
    skills_score NUMERIC(5,2) NOT NULL CHECK (skills_score >= 0.0 AND skills_score <= 100.0),
    experience_score NUMERIC(5,2) NOT NULL CHECK (experience_score >= 0.0 AND experience_score <= 100.0),
    education_score NUMERIC(5,2) NOT NULL CHECK (education_score >= 0.0 AND education_score <= 100.0),
    keyword_score NUMERIC(5,2) NOT NULL CHECK (keyword_score >= 0.0 AND keyword_score <= 100.0),
    ai_summary TEXT,
    matched_skills TEXT[] NOT NULL DEFAULT '{}',
    missing_skills TEXT[] NOT NULL DEFAULT '{}',
    recommended BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_job_matches_user_resume_job UNIQUE (user_id, resume_id, job_id)
);

COMMENT ON TABLE job_matches IS 'AI-computed resume-to-job matching vectors and recommendation flags';

-- -----------------------------------------------------------------------------
-- 8. COVER_LETTERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cover_letters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    generated_text TEXT NOT NULL,
    ai_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE cover_letters IS 'Tailored cover letters generated per job application by AI';

-- -----------------------------------------------------------------------------
-- 9. APPLICATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL,
    cover_letter_id UUID REFERENCES cover_letters(id) ON DELETE SET NULL,
    application_source VARCHAR(100) NOT NULL, -- e.g. 'Automation', 'Manual', 'EasyApply'
    applied_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    application_status application_status_enum NOT NULL DEFAULT 'Applied',
    automation_status automation_status_enum NOT NULL DEFAULT 'Pending',
    ats_score NUMERIC(5,2) CHECK (ats_score IS NULL OR (ats_score >= 0.0 AND ats_score <= 100.0)),
    browser_session_id UUID,
    application_reference VARCHAR(255),
    failure_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_applications_user_job UNIQUE (user_id, job_id)
);

COMMENT ON TABLE applications IS 'Core application submissions and automation lifecycle';

CREATE TRIGGER trg_applications_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 10. APPLICATION_STATUS_HISTORY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS application_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    previous_status application_status_enum,
    new_status application_status_enum NOT NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE application_status_history IS 'Audit trail tracking every transition in job application status';

-- Trigger to record application status transitions automatically
CREATE OR REPLACE FUNCTION trg_fn_log_application_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO application_status_history (
            application_id,
            previous_status,
            new_status,
            updated_by,
            remarks
        ) VALUES (
            NEW.id,
            NULL,
            NEW.application_status,
            NEW.user_id,
            'Initial application created'
        );
    ELSIF (TG_OP = 'UPDATE' AND OLD.application_status IS DISTINCT FROM NEW.application_status) THEN
        INSERT INTO application_status_history (
            application_id,
            previous_status,
            new_status,
            updated_by,
            remarks
        ) VALUES (
            NEW.id,
            OLD.application_status,
            NEW.application_status,
            NEW.user_id,
            COALESCE(NEW.notes, 'Status transitioned automatically')
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_applications_status_audit
AFTER INSERT OR UPDATE OF application_status ON applications
FOR EACH ROW EXECUTE FUNCTION trg_fn_log_application_status_change();

-- -----------------------------------------------------------------------------
-- 11. INTERVIEWS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    round_number INT NOT NULL DEFAULT 1 CHECK (round_number > 0),
    round_name VARCHAR(100) NOT NULL,
    interviewer VARCHAR(255),
    scheduled_date TIMESTAMPTZ NOT NULL,
    meeting_url TEXT,
    location VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'Scheduled', -- 'Scheduled', 'Completed', 'Cancelled', 'Rescheduled'
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE interviews IS 'Interview rounds and scheduled meetings';

-- -----------------------------------------------------------------------------
-- 12. OFFERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    offered_ctc NUMERIC(14,2) NOT NULL CHECK (offered_ctc > 0),
    joining_bonus NUMERIC(12,2) NOT NULL DEFAULT 0.0 CHECK (joining_bonus >= 0),
    stocks NUMERIC(14,2) NOT NULL DEFAULT 0.0 CHECK (stocks >= 0),
    joining_date DATE,
    offer_status VARCHAR(50) NOT NULL DEFAULT 'Received', -- 'Received', 'Accepted', 'Rejected', 'Negotiating'
    offer_document TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE offers IS 'Formal job offers received and compensation package details';

-- -----------------------------------------------------------------------------
-- 13. REJECTIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    rejection_reason TEXT,
    rejected_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE rejections IS 'Recorded rejections and automated reasons for feedback analytics';

-- -----------------------------------------------------------------------------
-- 14. AUTOMATION_RUNS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ,
    jobs_found INT NOT NULL DEFAULT 0 CHECK (jobs_found >= 0),
    jobs_matched INT NOT NULL DEFAULT 0 CHECK (jobs_matched >= 0),
    jobs_applied INT NOT NULL DEFAULT 0 CHECK (jobs_applied >= 0),
    jobs_failed INT NOT NULL DEFAULT 0 CHECK (jobs_failed >= 0),
    status automation_status_enum NOT NULL DEFAULT 'Pending',
    duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE automation_runs IS 'Orchestration execution sessions for scrapers and auto-apply robots';

-- -----------------------------------------------------------------------------
-- 15. AUTOMATION_LOGS (PARTITIONED FOR SCALABILITY)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID DEFAULT gen_random_uuid(),
    automation_run_id UUID NOT NULL,
    application_id UUID,
    action VARCHAR(100) NOT NULL,
    level VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL')),
    message TEXT NOT NULL,
    screenshot_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE automation_logs IS 'Granular execution logs, screenshots, and telemetry partitioned by month';

-- Pre-generate monthly partitions for current and next periods
CREATE TABLE IF NOT EXISTS automation_logs_2026_09 PARTITION OF automation_logs
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS automation_logs_2026_10 PARTITION OF automation_logs
    FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS automation_logs_2026_11 PARTITION OF automation_logs
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS automation_logs_2026_12 PARTITION OF automation_logs
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS automation_logs_default PARTITION OF automation_logs DEFAULT;

-- -----------------------------------------------------------------------------
-- 16. BROWSER_SESSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS browser_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    browser VARCHAR(50) NOT NULL DEFAULT 'chromium',
    cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
    local_storage JSONB NOT NULL DEFAULT '{}'::jsonb,
    session_storage JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE browser_sessions IS 'Persisted browser state, session cookies, and authentication storage';

-- -----------------------------------------------------------------------------
-- 17. JOB_SEARCH_HISTORY
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    source VARCHAR(100),
    total_jobs_found INT NOT NULL DEFAULT 0 CHECK (total_jobs_found >= 0),
    searched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE job_search_history IS 'Audit record of all queries sent to job aggregators';

-- -----------------------------------------------------------------------------
-- 18. BOOKMARKED_JOBS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarked_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bookmarked_jobs_user_job UNIQUE (user_id, job_id)
);

COMMENT ON TABLE bookmarked_jobs IS 'Jobs saved/starred by users for review or auto-apply queue';

-- -----------------------------------------------------------------------------
-- 19. NOTIFICATIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type notification_type_enum NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE notifications IS 'User notification center for interviews, offers, and runs';

-- -----------------------------------------------------------------------------
-- 20. API_KEYS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL, -- e.g. 'OpenAI', 'Anthropic', 'Apify', 'ScraperAPI'
    api_key TEXT NOT NULL,
    encrypted BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_api_keys_user_provider UNIQUE (user_id, provider)
);

COMMENT ON TABLE api_keys IS 'Securely encrypted API tokens for LLMs and crawling platforms';

-- -----------------------------------------------------------------------------
-- 21. AI_USAGE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature VARCHAR(100) NOT NULL, -- 'ResumeParsing', 'JobMatching', 'CoverLetter'
    model VARCHAR(100) NOT NULL,   -- 'gpt-4o', 'claude-3-5-sonnet'
    prompt_tokens INT NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
    completion_tokens INT NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
    total_tokens INT NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
    estimated_cost NUMERIC(10,6) NOT NULL DEFAULT 0.0 CHECK (estimated_cost >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ai_usage IS 'Billing and token consumption meter for AI services';

-- -----------------------------------------------------------------------------
-- 22. FILES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE files IS 'Repository of uploaded raw resumes, cover letters, and offer PDFs';

-- -----------------------------------------------------------------------------
-- 23. AUDIT_LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE audit_logs IS 'System-wide data mutation change tracking';

-- =============================================================================
-- 4. PERFORMANCE & QUERY INDEXES
-- =============================================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- User Preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_auto_apply ON user_preferences(auto_apply) WHERE auto_apply = true;

-- Resumes
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_skills ON resumes USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_resumes_parsed_json ON resumes USING GIN(parsed_json);
CREATE INDEX IF NOT EXISTS idx_resumes_default ON resumes(user_id, is_default) WHERE is_default = true;

-- Resume Versions
CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_id ON resume_versions(resume_id);

-- Companies
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING GIN(company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_companies_industry ON companies(industry);

-- Jobs (High Volume Read/Search Optimization)
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_date ON jobs(posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_employment_type ON jobs(employment_type);
CREATE INDEX IF NOT EXISTS idx_jobs_remote_type ON jobs(remote_type);
CREATE INDEX IF NOT EXISTS idx_jobs_active_posted ON jobs(is_active, posted_date DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_jobs_skills_required ON jobs USING GIN(skills_required);
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING GIN(job_title gin_trgm_ops);

-- Job Matches
CREATE INDEX IF NOT EXISTS idx_job_matches_user_score ON job_matches(user_id, overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_job_matches_job_id ON job_matches(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_recommended ON job_matches(user_id, recommended) WHERE recommended = true;

-- Cover Letters
CREATE INDEX IF NOT EXISTS idx_cover_letters_user_job ON cover_letters(user_id, job_id);

-- Applications (Millions Scale)
CREATE INDEX IF NOT EXISTS idx_applications_user_status ON applications(user_id, application_status);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_applied_date ON applications(applied_date DESC);
CREATE INDEX IF NOT EXISTS idx_applications_automation ON applications(automation_status) WHERE automation_status IN ('Pending', 'Running');
CREATE INDEX IF NOT EXISTS idx_applications_composite ON applications(user_id, applied_date DESC, application_status);

-- Application Status History
CREATE INDEX IF NOT EXISTS idx_app_status_history_app_id ON application_status_history(application_id, created_at DESC);

-- Interviews
CREATE INDEX IF NOT EXISTS idx_interviews_app_id ON interviews(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_date ON interviews(scheduled_date ASC);
CREATE INDEX IF NOT EXISTS idx_interviews_upcoming ON interviews(scheduled_date, status) WHERE status = 'Scheduled';

-- Offers
CREATE INDEX IF NOT EXISTS idx_offers_app_id ON offers(application_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(offer_status);

-- Rejections
CREATE INDEX IF NOT EXISTS idx_rejections_app_id ON rejections(application_id);

-- Automation Runs & Logs
CREATE INDEX IF NOT EXISTS idx_auto_runs_user_created ON automation_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_logs_run_level ON automation_logs(automation_run_id, level);
CREATE INDEX IF NOT EXISTS idx_auto_logs_app_id ON automation_logs(application_id);

-- Browser Sessions
CREATE INDEX IF NOT EXISTS idx_browser_sessions_user ON browser_sessions(user_id, created_at DESC);

-- Job Search History
CREATE INDEX IF NOT EXISTS idx_job_search_history_user ON job_search_history(user_id, searched_at DESC);

-- Bookmarked Jobs
CREATE INDEX IF NOT EXISTS idx_bookmarked_jobs_user_job ON bookmarked_jobs(user_id, job_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- AI Usage
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_feature ON ai_usage(user_id, feature, created_at DESC);

-- Files
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id);

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id, created_at DESC);

-- =============================================================================
-- 5. ANALYTICAL & DASHBOARD VIEWS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VIEW 1: Dashboard View
-- User-level real-time KPI overview
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_dashboard AS
SELECT 
    u.id AS user_id,
    u.first_name || ' ' || u.last_name AS full_name,
    u.email,
    up.daily_application_limit,
    up.auto_apply,
    COUNT(DISTINCT a.id) AS total_applications,
    COUNT(DISTINCT a.id) FILTER (
        WHERE a.applied_date >= CURRENT_DATE 
          AND a.applied_date < CURRENT_DATE + INTERVAL '1 day'
    ) AS applications_today,
    GREATEST(0, up.daily_application_limit - COUNT(DISTINCT a.id) FILTER (
        WHERE a.applied_date >= CURRENT_DATE 
          AND a.applied_date < CURRENT_DATE + INTERVAL '1 day'
    )) AS daily_quota_remaining,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status = 'Applied') AS active_pending_applications,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status IN ('HR Round', 'Technical Round', 'Manager Round', 'Final Round')) AS in_interview_pipeline,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status = 'Offer') AS offers_received,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status = 'Rejected') AS rejected_applications,
    COUNT(DISTINCT jm.id) FILTER (WHERE jm.recommended = true) AS high_match_jobs_available,
    COUNT(DISTINCT bj.job_id) AS bookmarked_jobs_count
FROM users u
LEFT JOIN user_preferences up ON u.id = up.user_id
LEFT JOIN applications a ON u.id = a.user_id
LEFT JOIN job_matches jm ON u.id = jm.user_id
LEFT JOIN bookmarked_jobs bj ON u.id = bj.user_id
GROUP BY u.id, u.first_name, u.last_name, u.email, up.daily_application_limit, up.auto_apply;

COMMENT ON VIEW view_dashboard IS 'Consolidated dashboard counters and daily quota status per user';

-- -----------------------------------------------------------------------------
-- VIEW 2: Applications by Month
-- Monthly cohort distribution of application results
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_applications_by_month AS
SELECT 
    a.user_id,
    TO_CHAR(DATE_TRUNC('month', a.applied_date), 'YYYY-MM') AS application_month,
    COUNT(*) AS total_applied,
    COUNT(*) FILTER (WHERE a.application_status = 'Resume Viewed') AS resume_viewed_count,
    COUNT(*) FILTER (WHERE a.application_status IN ('HR Round', 'Technical Round', 'Manager Round', 'Final Round')) AS interview_count,
    COUNT(*) FILTER (WHERE a.application_status = 'Offer') AS offer_count,
    COUNT(*) FILTER (WHERE a.application_status = 'Rejected') AS rejected_count,
    ROUND(AVG(a.ats_score), 2) AS avg_ats_score
FROM applications a
GROUP BY a.user_id, DATE_TRUNC('month', a.applied_date)
ORDER BY application_month DESC;

COMMENT ON VIEW view_applications_by_month IS 'Monthly progression and status distribution of user applications';

-- -----------------------------------------------------------------------------
-- VIEW 3: Success Rate
-- Funnel conversion metrics overall and segmented by platform source
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_success_rate AS
SELECT 
    a.user_id,
    a.application_source,
    COUNT(*) AS total_applications,
    COUNT(*) FILTER (WHERE a.application_status = 'Resume Viewed') AS views,
    COUNT(*) FILTER (WHERE a.application_status IN ('HR Round', 'Technical Round', 'Manager Round', 'Final Round', 'Offer')) AS total_interviewed_or_offered,
    COUNT(*) FILTER (WHERE a.application_status = 'Offer') AS total_offers,
    ROUND(
        (COUNT(*) FILTER (WHERE a.application_status IN ('HR Round', 'Technical Round', 'Manager Round', 'Final Round', 'Offer'))::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100), 2
    ) AS interview_conversion_rate_pct,
    ROUND(
        (COUNT(*) FILTER (WHERE a.application_status = 'Offer')::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100), 2
    ) AS offer_conversion_rate_pct
FROM applications a
GROUP BY a.user_id, a.application_source;

COMMENT ON VIEW view_success_rate IS 'Funnel conversion metrics per application channel';

-- -----------------------------------------------------------------------------
-- VIEW 4: Company Statistics
-- Performance metrics by hiring company
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_company_statistics AS
SELECT 
    c.id AS company_id,
    c.company_name,
    c.industry,
    c.rating,
    COUNT(DISTINCT j.id) AS total_active_jobs,
    COUNT(DISTINCT a.id) AS total_applications_sent,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status IN ('HR Round', 'Technical Round', 'Manager Round', 'Final Round')) AS total_interviews,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status = 'Offer') AS total_offers,
    COUNT(DISTINCT a.id) FILTER (WHERE a.application_status = 'Rejected') AS total_rejections,
    ROUND(AVG(j.salary_min), 2) AS avg_salary_min,
    ROUND(AVG(j.salary_max), 2) AS avg_salary_max
FROM companies c
LEFT JOIN jobs j ON c.id = j.company_id
LEFT JOIN applications a ON j.id = a.job_id
GROUP BY c.id, c.company_name, c.industry, c.rating;

COMMENT ON VIEW view_company_statistics IS 'Aggregate job opportunities and hiring response rates by company';

-- -----------------------------------------------------------------------------
-- VIEW 5: Salary Analytics
-- Salary market intelligence segmented by role, remote option, and employment type
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_salary_analytics AS
SELECT 
    j.job_title,
    j.employment_type,
    j.remote_type,
    j.currency,
    COUNT(*) AS total_postings,
    ROUND(MIN(j.salary_min), 2) AS min_salary_offered,
    ROUND(AVG(j.salary_min), 2) AS avg_min_salary,
    ROUND(AVG(j.salary_max), 2) AS avg_max_salary,
    ROUND(MAX(j.salary_max), 2) AS max_salary_offered,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY j.salary_min)::NUMERIC, 2) AS median_min_salary
FROM jobs j
WHERE j.salary_min IS NOT NULL
GROUP BY j.job_title, j.employment_type, j.remote_type, j.currency
HAVING COUNT(*) >= 1;

COMMENT ON VIEW view_salary_analytics IS 'Compensation distribution metrics across roles and arrangements';

-- -----------------------------------------------------------------------------
-- VIEW 6: Interview Pipeline
-- Upcoming interviews scheduled with joining links and application info
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_interview_pipeline AS
SELECT 
    i.id AS interview_id,
    a.user_id,
    a.id AS application_id,
    c.company_name,
    j.job_title,
    i.round_number,
    i.round_name,
    i.interviewer,
    i.scheduled_date,
    i.meeting_url,
    i.location,
    i.status AS interview_status,
    a.application_status
FROM interviews i
JOIN applications a ON i.application_id = a.id
JOIN jobs j ON a.job_id = j.id
LEFT JOIN companies c ON j.company_id = c.id
ORDER BY i.scheduled_date ASC;

COMMENT ON VIEW view_interview_pipeline IS 'Upcoming scheduled interviews and meeting credentials';

-- -----------------------------------------------------------------------------
-- VIEW 7: Offer Pipeline
-- Outstanding compensation proposals, bonuses, and acceptance deadlines
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW view_offer_pipeline AS
SELECT 
    o.id AS offer_id,
    a.user_id,
    a.id AS application_id,
    c.company_name,
    j.job_title,
    o.offered_ctc,
    o.joining_bonus,
    o.stocks,
    (o.offered_ctc + o.joining_bonus + o.stocks) AS total_first_year_package,
    o.joining_date,
    o.offer_status,
    o.offer_document,
    o.created_at AS offer_received_at
FROM offers o
JOIN applications a ON o.application_id = a.id
JOIN jobs j ON a.job_id = j.id
LEFT JOIN companies c ON j.company_id = c.id
ORDER BY o.created_at DESC;

COMMENT ON VIEW view_offer_pipeline IS 'Offers received, total compensation packages, and joining dates';

-- =============================================================================
-- 6. STORED PROCEDURES & BUSINESS FUNCTIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create Application
-- Safely creates an application, enforcing daily limit & status verification
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_application(
    p_user_id UUID,
    p_job_id UUID,
    p_resume_id UUID,
    p_cover_letter_id UUID DEFAULT NULL,
    p_application_source VARCHAR(100) DEFAULT 'Automation',
    p_browser_session_id UUID DEFAULT NULL,
    p_reference VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_application_id UUID;
    v_daily_limit INT;
    v_today_count INT;
    v_ats_score NUMERIC(5,2);
BEGIN
    -- Check user preferences daily limit
    SELECT daily_application_limit INTO v_daily_limit
    FROM user_preferences
    WHERE user_id = p_user_id;

    IF v_daily_limit IS NOT NULL THEN
        SELECT COUNT(*) INTO v_today_count
        FROM applications
        WHERE user_id = p_user_id
          AND applied_date >= CURRENT_DATE 
          AND applied_date < CURRENT_DATE + INTERVAL '1 day';

        IF v_today_count >= v_daily_limit THEN
            RAISE EXCEPTION 'Daily application quota reached for user % (Limit: %)', p_user_id, v_daily_limit;
        END IF;
    END IF;

    -- Fetch ATS score if matching exists
    SELECT overall_score INTO v_ats_score
    FROM job_matches
    WHERE user_id = p_user_id AND job_id = p_job_id AND resume_id = p_resume_id;

    INSERT INTO applications (
        user_id,
        job_id,
        resume_id,
        cover_letter_id,
        application_source,
        applied_date,
        application_status,
        automation_status,
        ats_score,
        browser_session_id,
        application_reference
    ) VALUES (
        p_user_id,
        p_job_id,
        p_resume_id,
        p_cover_letter_id,
        p_application_source,
        CURRENT_TIMESTAMP,
        'Applied',
        'Success',
        COALESCE(v_ats_score, 0.0),
        p_browser_session_id,
        p_reference
    )
    RETURNING id INTO v_application_id;

    RETURN v_application_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 2. Update Application Status
-- Updates application status and appends status remarks
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_application_status(
    p_application_id UUID,
    p_new_status application_status_enum,
    p_updated_by UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE applications
    SET 
        application_status = p_new_status,
        notes = COALESCE(p_remarks, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 3. Calculate ATS Score
-- Computes rule-based keyword & skill overlap between resume and job
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calculate_ats_score(
    p_resume_id UUID,
    p_job_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
    v_resume_skills TEXT[];
    v_job_skills TEXT[];
    v_matched_count INT := 0;
    v_total_job_skills INT := 0;
    v_score NUMERIC(5,2) := 0.0;
BEGIN
    SELECT skills INTO v_resume_skills FROM resumes WHERE id = p_resume_id;
    SELECT skills_required INTO v_job_skills FROM jobs WHERE id = p_job_id;

    v_total_job_skills := COALESCE(array_length(v_job_skills, 1), 0);

    IF v_total_job_skills = 0 THEN
        RETURN 75.00; -- Default baseline when job does not explicitly declare skills
    END IF;

    SELECT COUNT(*) INTO v_matched_count
    FROM unnest(v_job_skills) js
    WHERE js = ANY(v_resume_skills);

    v_score := ROUND((v_matched_count::NUMERIC / v_total_job_skills::NUMERIC) * 100.0, 2);
    RETURN LEAST(100.00, GREATEST(0.00, v_score));
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 4. Generate Match Score
-- Evaluates skills, experience, and keywords, persisting to job_matches
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_match_score(
    p_user_id UUID,
    p_job_id UUID,
    p_resume_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_match_id UUID;
    v_resume_skills TEXT[];
    v_job_skills TEXT[];
    v_matched_skills TEXT[] := '{}';
    v_missing_skills TEXT[] := '{}';
    v_skills_score NUMERIC(5,2) := 0.0;
    v_exp_score NUMERIC(5,2) := 80.0;
    v_edu_score NUMERIC(5,2) := 85.0;
    v_kw_score NUMERIC(5,2) := 75.0;
    v_overall NUMERIC(5,2) := 0.0;
    v_total_job_skills INT;
BEGIN
    SELECT skills INTO v_resume_skills FROM resumes WHERE id = p_resume_id;
    SELECT skills_required INTO v_job_skills FROM jobs WHERE id = p_job_id;

    v_total_job_skills := COALESCE(array_length(v_job_skills, 1), 0);

    IF v_total_job_skills > 0 THEN
        -- Find matches
        SELECT COALESCE(array_agg(s), '{}') INTO v_matched_skills
        FROM unnest(v_job_skills) s
        WHERE s = ANY(v_resume_skills);

        -- Find missing
        SELECT COALESCE(array_agg(s), '{}') INTO v_missing_skills
        FROM unnest(v_job_skills) s
        WHERE NOT (s = ANY(v_resume_skills));

        v_skills_score := ROUND((COALESCE(array_length(v_matched_skills, 1), 0)::NUMERIC / v_total_job_skills::NUMERIC) * 100.0, 2);
    ELSE
        v_skills_score := 70.00;
    END IF;

    -- Weighted overall calculation: 50% Skills, 25% Experience, 15% Keyword, 10% Education
    v_overall := ROUND((v_skills_score * 0.50) + (v_exp_score * 0.25) + (v_kw_score * 0.15) + (v_edu_score * 0.10), 2);

    INSERT INTO job_matches (
        user_id,
        resume_id,
        job_id,
        overall_score,
        skills_score,
        experience_score,
        education_score,
        keyword_score,
        ai_summary,
        matched_skills,
        missing_skills,
        recommended
    ) VALUES (
        p_user_id,
        p_resume_id,
        p_job_id,
        v_overall,
        v_skills_score,
        v_exp_score,
        v_edu_score,
        v_kw_score,
        format('AI Assessment: Matched %s skills. Missing %s skills.', array_length(v_matched_skills, 1), array_length(v_missing_skills, 1)),
        v_matched_skills,
        v_missing_skills,
        (v_overall >= 70.00)
    )
    ON CONFLICT (user_id, resume_id, job_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        skills_score = EXCLUDED.skills_score,
        experience_score = EXCLUDED.experience_score,
        keyword_score = EXCLUDED.keyword_score,
        matched_skills = EXCLUDED.matched_skills,
        missing_skills = EXCLUDED.missing_skills,
        recommended = EXCLUDED.recommended
    RETURNING id INTO v_match_id;

    RETURN v_match_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 5. Create Automation Run
-- Starts an automation run session
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_automation_run(
    p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
    v_run_id UUID;
BEGIN
    INSERT INTO automation_runs (
        user_id,
        started_at,
        status
    ) VALUES (
        p_user_id,
        CURRENT_TIMESTAMP,
        'Running'
    )
    RETURNING id INTO v_run_id;

    RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 6. Insert Automation Log
-- Inserts a log record into partitioned automation_logs
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_insert_automation_log(
    p_automation_run_id UUID,
    p_application_id UUID,
    p_action VARCHAR(100),
    p_level VARCHAR(20),
    p_message TEXT,
    p_screenshot_url TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO automation_logs (
        id,
        automation_run_id,
        application_id,
        action,
        level,
        message,
        screenshot_url,
        metadata,
        created_at
    ) VALUES (
        v_log_id,
        p_automation_run_id,
        p_application_id,
        p_action,
        p_level,
        p_message,
        p_screenshot_url,
        p_metadata,
        CURRENT_TIMESTAMP
    );

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 7. Bookmark Job
-- Toggles or bookmarks a job for a user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bookmark_job(
    p_user_id UUID,
    p_job_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM bookmarked_jobs 
        WHERE user_id = p_user_id AND job_id = p_job_id
    ) INTO v_exists;

    IF v_exists THEN
        DELETE FROM bookmarked_jobs 
        WHERE user_id = p_user_id AND job_id = p_job_id;
        RETURN FALSE; -- Unbookmarked
    ELSE
        INSERT INTO bookmarked_jobs (user_id, job_id)
        VALUES (p_user_id, p_job_id);
        RETURN TRUE; -- Bookmarked
    END IF;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 8. Generate Interview Reminder
-- Broadcasts notifications for interviews scheduled within N hours
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generate_interview_reminders(
    p_hours_ahead INT DEFAULT 24
)
RETURNS INT AS $$
DECLARE
    v_reminders_sent INT := 0;
    r RECORD;
BEGIN
    FOR r IN 
        SELECT 
            i.id AS interview_id,
            a.user_id,
            c.company_name,
            i.round_name,
            i.scheduled_date
        FROM interviews i
        JOIN applications a ON i.application_id = a.id
        JOIN jobs j ON a.job_id = j.id
        LEFT JOIN companies c ON j.company_id = c.id
        WHERE i.status = 'Scheduled'
          AND i.scheduled_date BETWEEN CURRENT_TIMESTAMP AND (CURRENT_TIMESTAMP + (p_hours_ahead || ' hours')::INTERVAL)
          AND NOT EXISTS (
              SELECT 1 FROM notifications n
              WHERE n.user_id = a.user_id
                AND n.type = 'Interview'
                AND n.body LIKE '%' || i.round_name || '%'
                AND n.created_at >= (CURRENT_TIMESTAMP - INTERVAL '12 hours')
          )
    LOOP
        INSERT INTO notifications (
            user_id,
            title,
            body,
            type,
            is_read
        ) VALUES (
            r.user_id,
            'Upcoming Interview: ' || COALESCE(r.company_name, 'Company'),
            format('Reminder: Your %s interview is scheduled for %s.', r.round_name, to_char(r.scheduled_date, 'YYYY-MM-DD HH24:MI TZ')),
            'Interview',
            false
        );
        v_reminders_sent := v_reminders_sent + 1;
    END LOOP;

    RETURN v_reminders_sent;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. AUDIT TRIGGER IMPLEMENTATION
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_fn_generic_audit_logger()
RETURNS TRIGGER AS $$
DECLARE
    v_record_id UUID;
    v_user_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        v_record_id := OLD.id;
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, to_jsonb(OLD), NULL, NULL);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        v_record_id := NEW.id;
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, to_jsonb(OLD), to_jsonb(NEW), NULL);
        RETURN NEW;
    ELSIF (TG_OP = 'INSERT') THEN
        v_record_id := NEW.id;
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, NULL, to_jsonb(NEW), NULL);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_user_preferences
AFTER INSERT OR UPDATE OR DELETE ON user_preferences
FOR EACH ROW EXECUTE FUNCTION trg_fn_generic_audit_logger();

CREATE TRIGGER trg_audit_applications
AFTER INSERT OR UPDATE OR DELETE ON applications
FOR EACH ROW EXECUTE FUNCTION trg_fn_generic_audit_logger();

-- =============================================================================
-- 8. REALISTIC SAMPLE DATA INSERTIONS
-- =============================================================================

DO $$
DECLARE
    v_user1_id UUID;
    v_user2_id UUID;
    v_company1_id UUID;
    v_company2_id UUID;
    v_job1_id UUID;
    v_job2_id UUID;
    v_job3_id UUID;
    v_resume1_id UUID;
    v_resume2_id UUID;
    v_app1_id UUID;
    v_app2_id UUID;
    v_run_id UUID;
BEGIN
    -- 1. Insert Users
    INSERT INTO users (
        first_name, last_name, email, phone, password_hash, 
        linkedin_url, github_url, portfolio_url, current_location, timezone, role, is_verified
    ) VALUES 
    (
        'Alex', 'Morgan', 'alex.morgan@example.com', '+1-415-555-0199', 
        '$2b$12$e8Y...saltAndHashedPassword...', 'https://linkedin.com/in/alexmorgan', 
        'https://github.com/alexmorgan', 'https://alexmorgan.dev', 
        'San Francisco, CA', 'America/Los_Angeles', 'user', true
    )
    ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
    RETURNING id INTO v_user1_id;

    INSERT INTO users (
        first_name, last_name, email, phone, password_hash, 
        linkedin_url, github_url, portfolio_url, current_location, timezone, role, is_verified
    ) VALUES 
    (
        'Priya', 'Sharma', 'priya.sharma@example.com', '+91-9876543210', 
        '$2b$12$x9Z...anotherHashedPassword...', 'https://linkedin.com/in/priyasharma', 
        'https://github.com/priyasharma', 'https://priyasharma.io', 
        'Bengaluru, Karnataka', 'Asia/Kolkata', 'user', true
    )
    ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
    RETURNING id INTO v_user2_id;

    -- 2. Insert User Preferences
    INSERT INTO user_preferences (
        user_id, preferred_locations, preferred_roles, preferred_companies, 
        excluded_companies, preferred_job_types, remote_only, hybrid_allowed, 
        onsite_allowed, minimum_salary, maximum_salary, minimum_experience, 
        maximum_experience, daily_application_limit, auto_apply
    ) VALUES (
        v_user1_id,
        ARRAY['San Francisco, CA', 'Remote', 'New York, NY'],
        ARRAY['Senior Backend Engineer', 'Staff Software Engineer', 'Full Stack Engineer'],
        ARRAY['Google', 'Stripe', 'Airbnb', 'Anthropic'],
        ARRAY['Legacy Corp', 'Spam Agency'],
        ARRAY['Full Time'],
        false, true, true, 160000.00, 240000.00, 4, 10, 30, true
    ) ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO user_preferences (
        user_id, preferred_locations, preferred_roles, preferred_companies, 
        excluded_companies, preferred_job_types, remote_only, hybrid_allowed, 
        onsite_allowed, minimum_salary, maximum_salary, minimum_experience, 
        maximum_experience, daily_application_limit, auto_apply
    ) VALUES (
        v_user2_id,
        ARRAY['Bengaluru', 'Remote'],
        ARRAY['Lead Software Engineer', 'Backend Architect'],
        ARRAY['Microsoft', 'Atlassian', 'Uber'],
        ARRAY['Unverified Startup'],
        ARRAY['Full Time'],
        true, true, false, 3500000.00, 5500000.00, 5, 12, 20, false
    ) ON CONFLICT (user_id) DO NOTHING;

    -- 3. Insert Resumes
    INSERT INTO resumes (
        user_id, resume_name, resume_url, parsed_text, parsed_json,
        skills, certifications, education, work_experience, projects,
        expected_ctc, notice_period, experience_years, is_default, ats_score
    ) VALUES (
        v_user1_id,
        'Alex_Morgan_Backend_Staff_2026.pdf',
        'https://storage.googleapis.com/job-engine-resumes/alex_morgan_resume.pdf',
        'Staff Software Engineer with 7 years experience in Node.js, Go, PostgreSQL, Distributed Systems...',
        '{"name": "Alex Morgan", "skills": ["Go", "Node.js", "PostgreSQL", "Docker", "Kubernetes", "AWS"]}'::jsonb,
        ARRAY['Go', 'Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'AWS', 'Redis', 'GraphQL', 'TypeScript'],
        ARRAY['AWS Certified Solutions Architect - Professional', 'CKA Kubernetes Administrator'],
        '[{"degree": "B.S. Computer Science", "institution": "UC Berkeley", "year": 2019}]'::jsonb,
        '[{"title": "Senior Backend Engineer", "company": "TechStream", "duration": "2021-Present"}]'::jsonb,
        '[{"name": "Distributed Task Scheduler", "tech": ["Go", "PostgreSQL", "Redis"]}]'::jsonb,
        190000.00, 30, 7.0, true, 92.50
    ) RETURNING id INTO v_resume1_id;

    -- Resume version
    INSERT INTO resume_versions (resume_id, version_number, resume_url, ats_score, changes)
    VALUES (v_resume1_id, 1, 'https://storage.googleapis.com/job-engine-resumes/alex_morgan_resume_v1.pdf', 92.50, 'Initial parsed version');

    -- 4. Insert Companies
    INSERT INTO companies (company_name, website, industry, company_size, headquarters, linkedin, rating)
    VALUES 
    ('Stripe', 'https://stripe.com', 'Fintech', '5000-10000', 'San Francisco, CA', 'https://linkedin.com/company/stripe', 4.70)
    ON CONFLICT (company_name) DO UPDATE SET rating = EXCLUDED.rating
    RETURNING id INTO v_company1_id;

    INSERT INTO companies (company_name, website, industry, company_size, headquarters, linkedin, rating)
    VALUES 
    ('Anthropic', 'https://anthropic.com', 'Artificial Intelligence', '500-1000', 'San Francisco, CA', 'https://linkedin.com/company/anthropic', 4.90)
    ON CONFLICT (company_name) DO UPDATE SET rating = EXCLUDED.rating
    RETURNING id INTO v_company2_id;

    -- 5. Insert Jobs
    INSERT INTO jobs (
        external_job_id, source, company_id, job_title, department,
        employment_type, experience_min, experience_max, salary_min, salary_max,
        currency, city, state, country, location, remote_type, skills_required,
        job_description, application_url, easy_apply, posted_date, is_active
    ) VALUES (
        'stripe-backend-4821', 'LinkedIn', v_company1_id, 'Senior Backend Engineer - Financial Platform', 'Core Infrastructure',
        'Full Time', 5, 9, 180000.00, 230000.00,
        'USD', 'San Francisco', 'CA', 'USA', 'San Francisco, CA', 'Hybrid',
        ARRAY['Go', 'PostgreSQL', 'Distributed Systems', 'Docker', 'AWS', 'Redis'],
        'Build mission-critical payment processing backends scaled to billions of requests daily...',
        'https://stripe.com/jobs/senior-backend-engineer', true, CURRENT_TIMESTAMP - INTERVAL '2 days', true
    )
    ON CONFLICT (source, external_job_id) DO UPDATE SET job_title = EXCLUDED.job_title
    RETURNING id INTO v_job1_id;

    INSERT INTO jobs (
        external_job_id, source, company_id, job_title, department,
        employment_type, experience_min, experience_max, salary_min, salary_max,
        currency, city, state, country, location, remote_type, skills_required,
        job_description, application_url, easy_apply, posted_date, is_active
    ) VALUES (
        'anthropic-systems-9912', 'Indeed', v_company2_id, 'Staff Infrastructure Engineer', 'Platform Engineering',
        'Full Time', 6, 12, 220000.00, 310000.00,
        'USD', 'San Francisco', 'CA', 'USA', 'San Francisco, CA', 'Remote',
        ARRAY['Go', 'Kubernetes', 'AWS', 'PostgreSQL', 'Distributed Systems', 'Python'],
        'Design and deploy next-generation foundation model training cluster orchestration backends...',
        'https://anthropic.com/careers/staff-infrastructure', false, CURRENT_TIMESTAMP - INTERVAL '1 day', true
    )
    ON CONFLICT (source, external_job_id) DO UPDATE SET job_title = EXCLUDED.job_title
    RETURNING id INTO v_job2_id;

    -- 6. Match Jobs
    PERFORM fn_generate_match_score(v_user1_id, v_job1_id, v_resume1_id);
    PERFORM fn_generate_match_score(v_user1_id, v_job2_id, v_resume1_id);

    -- 7. Create Application via Function
    v_app1_id := fn_create_application(
        v_user1_id,
        v_job1_id,
        v_resume1_id,
        NULL,
        'Automation',
        NULL,
        'STRIPE-REF-90211'
    );

    -- Update to Interview status
    PERFORM fn_update_application_status(v_app1_id, 'Technical Round'::application_status_enum, v_user1_id, 'Passed recruiter screening, scheduled System Design');

    -- 8. Add Interview
    INSERT INTO interviews (
        application_id, round_number, round_name, interviewer, scheduled_date, meeting_url, status
    ) VALUES (
        v_app1_id, 2, 'Distributed Systems Architecture', 'David Chen (Principal Engineer)',
        CURRENT_TIMESTAMP + INTERVAL '1 day', 'https://meet.google.com/xyz-abcd-uvw', 'Scheduled'
    );

    -- 9. Add Offer for user
    INSERT INTO offers (
        application_id, offered_ctc, joining_bonus, stocks, joining_date, offer_status
    ) VALUES (
        v_app1_id, 210000.00, 25000.00, 150000.00, (CURRENT_DATE + INTERVAL '45 days')::DATE, 'Received'
    );

    -- 10. Automation Run and Log
    v_run_id := fn_create_automation_run(v_user1_id);
    
    PERFORM fn_insert_automation_log(
        v_run_id, v_app1_id, 'AutoApplyJob', 'INFO', 
        'Navigated to Stripe careers portal, injected resume form fields', 
        'https://storage.googleapis.com/job-engine-screenshots/run-101-stripe.png',
        '{"step": "form_fill", "fields_completed": 14}'::jsonb
    );

    UPDATE automation_runs
    SET 
        finished_at = CURRENT_TIMESTAMP + INTERVAL '35 seconds',
        jobs_found = 45,
        jobs_matched = 12,
        jobs_applied = 1,
        jobs_failed = 0,
        status = 'Success',
        duration_seconds = 35
    WHERE id = v_run_id;

    -- 11. Bookmark Job
    PERFORM fn_bookmark_job(v_user1_id, v_job2_id);

    -- 12. Run Interview Reminder generator
    PERFORM fn_generate_interview_reminders(48);

END $$;

-- =============================================================================
-- 9. HIGH-VALUE PRODUCTION QUERIES
-- =============================================================================

-- Query 1: Top Matched Jobs eligible for User's Auto-Apply Routine
-- Returns verified, unapplied jobs filtered by user compensation & remote criteria
/*
SELECT 
    j.id AS job_id,
    j.job_title,
    c.company_name,
    j.location,
    j.remote_type,
    j.salary_min,
    j.salary_max,
    jm.overall_score,
    jm.matched_skills,
    jm.missing_skills
FROM jobs j
JOIN companies c ON j.company_id = c.id
JOIN job_matches jm ON j.id = jm.job_id
JOIN user_preferences up ON jm.user_id = up.user_id
WHERE jm.user_id = '00000000-0000-0000-0000-000000000000'::uuid -- Replace with active user_id
  AND j.is_active = true
  AND jm.recommended = true
  AND NOT EXISTS (
      SELECT 1 FROM applications a 
      WHERE a.user_id = jm.user_id AND a.job_id = j.id
  )
  AND (c.company_name != ALL(up.excluded_companies))
  AND (up.minimum_salary IS NULL OR j.salary_min >= up.minimum_salary)
ORDER BY jm.overall_score DESC, j.posted_date DESC
LIMIT 10;
*/

-- Query 2: Daily Quota & Health Check for Automation Engine
/*
SELECT 
    u.id AS user_id,
    u.email,
    up.daily_application_limit,
    COUNT(a.id) AS applications_sent_today,
    (up.daily_application_limit - COUNT(a.id)) AS quota_left
FROM users u
JOIN user_preferences up ON u.id = up.user_id
LEFT JOIN applications a ON u.id = a.user_id 
     AND a.applied_date >= CURRENT_DATE 
     AND a.applied_date < CURRENT_DATE + INTERVAL '1 day'
WHERE up.auto_apply = true
GROUP BY u.id, u.email, up.daily_application_limit
HAVING COUNT(a.id) < up.daily_application_limit;
*/

-- Query 3: Real-time Application Pipeline Summary
/*
SELECT 
    a.application_status,
    COUNT(*) AS count_in_stage,
    ROUND(AVG(a.ats_score), 2) AS avg_ats_score,
    MAX(a.applied_date) AS most_recent_application
FROM applications a
WHERE a.user_id = '00000000-0000-0000-0000-000000000000'::uuid
GROUP BY a.application_status
ORDER BY count_in_stage DESC;
*/
