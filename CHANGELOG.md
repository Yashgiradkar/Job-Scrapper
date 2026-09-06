# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

---

## [Unreleased]

### Added
- **User Profile Loader** (`src/infrastructure/config/profile-loader.ts`): New utility that parses `data_folder/plain_text_resume.yaml` and `data_folder/work_preferences.yaml` at runtime to produce a structured `JobSearchCriteria` object. Skills are aggregated across all experience entries; total experience is calculated from employment period date strings. Blacklists are read directly from `work_preferences.yaml`.
- **`GET /match/profile` Endpoint**: Exposes the loaded user profile as a JSON response so the frontend can fetch it on page load.
- **Form Autofill**: `public/app.js` now calls `GET /match/profile` on startup and populates all search form fields (Roles, Skills, Locations, Experience, Remote checkbox) with data from the YAML files automatically.
- **Blacklist Filtering in `JobSearchCriteria`**: Added optional `companyBlacklist`, `titleBlacklist`, and `locationBlacklist` fields to the `JobSearchCriteria` interface.
- **Blacklist Enforcement in `JobMatchService`**: The matching loop now calls `isBlacklisted()` before scoring each job. Jobs matching any blacklist are silently skipped and excluded from results.
- **Job Auto-Application Flow** (`src/application/apply-job-service.ts`, `src/application/apply-job-session-store.ts`): Implemented Playwright automation to fill application form fields utilizing the candidate profile and preferences YAML data. Form automation is designed to navigate steps and pause on final review/preview page.
- **Job Auto-Application Endpoints** (`src/api/routes/apply-routes.ts`): Created `POST /apply-job` to launch, fill, and preview applications, and `POST /apply-job/:sessionId/submit` to execute the final submission of a paused application.
- **Application Error Handling** (`src/domain/errors/app-error.ts`): Added `ApplicationError` (status 422) for application automation failures.
- **WorkflowContext** (`src/core/workflow/context.ts`): Runtime execution container holding the Playwright Page, candidate profile, key-value variable store, and WorkflowLogger.
- **WorkflowState** (`src/core/workflow/state.ts`): Tracks execution status, current step index, and named checkpoints enabling resume-from-checkpoint behaviour.
- **WorkflowStep / BaseWorkflowStep** (`src/core/workflow/step.ts`): Interface + abstract base every step implements: execute(), rollback(), validate(), retry(), timeout().
- **WorkflowRegistry** (`src/core/workflow/registry.ts`): Static name → StepConstructor registry; steps self-register via side-effect import.
- **WorkflowExecutor** (`src/core/workflow/executor.ts`): Sequentially executes steps with per-step timeouts, auto-retries, failure screenshots, and reverse rollback chain on fatal errors.
- **WorkflowFactory / WorkflowBuilder** (`src/core/workflow/factory.ts`): Parses a JSON workflow definition into a typed WorkflowStep[] array; imperative builder alternative also provided.
- **WorkflowValidator** (`src/core/workflow/validator.ts`): Zod-based JSON schema validation for workflow definitions with registered-step lookup.
- **Built-in Reusable Steps** (`src/core/workflow/steps/`): OpenPage, Click, FillText, SelectDropdown, CheckCheckbox, SelectRadio, UploadFile, Scroll, Wait, Screenshot, SetVariable, If (conditional branching with elementExists/variableEquals/urlContains), Loop (iteration with configurable break conditions).
- **Production PostgreSQL Database Schema** (`database/schema.sql`): Comprehensive 23-table relational schema covering users, preferences, resumes, versioning, companies, jobs, AI matches, cover letters, applications, status history, interviews, offers, rejections, automation runs, partitioned automation logs, browser sessions, search history, bookmarks, notifications, API keys, AI usage, files, and audit logs. Includes 6 domain ENUMs, automatic triggers for `updated_at` and application status tracking, 8 stored procedures/functions, and 7 analytical dashboard views.
- **Phase -2: Discovery Engine** (`src/core/discovery/`):
  - **Network Traffic Analyzer** (`src/core/discovery/analyzers/network-analyzer.ts`): Intercepts HTTP/HTTPS traffic to classify REST job endpoints, GraphQL queries/mutations, XHR vs Fetch traffic, query parameters, cookies (session, security, tracking), and auth mechanisms (Bearer, API keys, CSRF).
  - **DOM & Content Analyzer** (`src/core/discovery/analyzers/dom-analyzer.ts`): Evaluates SSR vs CSR rendering, extracts multi-candidate selector hierarchies with confidence scoring, tests infinite scroll DOM growth, and maps apply workflows (modals, external ATS redirects, resume file uploads).
  - **RSS & Feed Detector** (`src/core/discovery/analyzers/rss-detector.ts`): Discovers and validates RSS 2.0 and Atom feeds via HTML link tags and probe endpoints using `rss-parser`.
  - **Anti-Bot Detector** (`src/core/discovery/analyzers/antibot-detector.ts`): Identifies Cloudflare (Turnstile/challenge), DataDome, PerimeterX / HUMAN, Akamai Bot Manager, AWS WAF, and CAPTCHA walls with tailored bypass recommendations.
  - **Plugin & Workflow Scaffold Generator** (`src/core/discovery/generators/scaffold-generator.ts`): Synthesizes discovery reports into production TypeScript plugins, executable JSON workflows, selector fallback maps, and Markdown technical audit reports.
  - **Discovery Engine Orchestrator** (`src/core/discovery/engine/discovery-engine.ts`): Complete Playwright-driven facade coordinating network capture, DOM inspection, and scaffold generation with full Dependency Injection (DIP).
  - **Automated Test Suite**: Added 15 comprehensive unit and lifecycle tests with 100% pass rate under `src/core/discovery/__tests__/`.



---

## [0.1.0] - 2026-08-07

### Added
- **Apify SDK Infrastructure**: Added wrappers for lazy-loading ApifyClient, running Actors, dataset reading, request queue management, and config setup.
- **Crawlee Infrastructure**: Added CrawleeRunner supporting PlaywrightCrawler, CheerioCrawler, autoscaled session pool, proxies, and custom retries.
- **JobNormalizer**: Created domain-level JobNormalizer to parse and sanitize job fields (e.g. title emoji stripping, company suffix cleaning, remote detection, skills extraction, experience parsing).
- **Scraper Concurrency & Events**: Added worker pool, queue drainage, AbortSignal task cancellation, and event progress monitoring (`scraper:start`, `scraper:done`, `scraper:fail`, `run:complete`) to ScraperRunner.
- **Scraping Reliability**: Implemented ReliableExecutor handling domain-based rate limits, timeouts, circuit breakers, and heap memory metric logging.
- **Screenshots on Failure**: BrowserManager now captures screenshots to `screenshots/` automatically if page executions throw exceptions.
- **Project Documentation Architecture**: Restructured project docs into modular reference files under `docs/`, `AGENTS.md`, and `CHANGELOG.md`.
- **AI Documentation Maintenance Rules**: Added explicit auto-sync mapping rules and mandatory verification/pre-flight checklists inside `AGENTS.md` for future sessions.
- **AI Development Workflow**: Added the mandatory "Documentation First" workflow and completion checklist to `AGENTS.md`.
- **Environment Template**: Updated `.env` with variables for Apify, Crawlee, and Scraper concurrency.

### Changed
- **CompanyCareerPageScraper fallback pipeline**: Updated company page parsing flow to try ATS APIs first, then configured Apify Actors, then Crawlee fallbacks, and finally direct Playwright crawling.
- **Playwright Navigation Interception**: Hooked ReliableExecutor directly into `page.goto` inside BrowserManager to ensure all scrapers benefit from rate limiting and retries automatically.
- **JobMatchingEngine**: Modified engine scoring logic to prioritize using pre-normalized skill and experience values.
