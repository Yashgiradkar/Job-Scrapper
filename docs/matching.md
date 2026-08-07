# Job Matching Reference

This document explains the matching scoring algorithm, weight mappings, input specifications, and export details of the Job Matching Engine.

---

## Matching Algorithm & Weights

The matching engine checks scraped jobs against developer profiles using a weighted scoring model:

$$Score = (w_{role} \times S_{role}) + (w_{skills} \times S_{skills}) + (w_{exp} \times S_{exp}) + (w_{loc} \times S_{loc})$$

### Score Components

1. **Role Match ($S_{role}$)**:
   - Evaluates match between developer target roles and job titles.
   - Utilizes string similarity thresholds and regex search rules.
2. **Skills Match ($S_{skills}$)**:
   - Compares profile skills against job skill tags.
   - Pre-normalized skills are extracted by `JobNormalizer` from the job description.
3. **Experience Match ($S_{exp}$)**:
   - Matches profile years of experience against job requirements extracted via `JobNormalizer`.
4. **Location Match ($S_{loc}$)**:
   - Checks matching geographic preferences (e.g. city or state match).
   - Remote preference filters restrict candidate evaluation if remote-only is chosen.

### Default Scoring Weights
Weights are configurable in the environment config:
* **Role Weight (`MATCH_ROLE_WEIGHT`)**: Default `0.35` (35%)
* **Skills Weight (`MATCH_SKILLS_WEIGHT`)**: Default `0.35` (35%)
* **Experience Weight (`MATCH_EXPERIENCE_WEIGHT`)**: Default `0.15` (15%)
* **Location Weight (`MATCH_LOCATION_WEIGHT`)**: Default `0.15` (15%)

---

## User Profile Auto-Loading

The system reads user preferences and resume data from the `data_folder/` directory at runtime:

| File | Purpose |
|---|---|
| `plain_text_resume.yaml` | Source of skills (aggregated from all `skills_acquired` lists in `experience_details`) and experience calculation (from `employment_period` fields). |
| `work_preferences.yaml` | Source of target `positions`, `locations`, work-mode flags (`remote`, `hybrid`, `onsite`), and blacklists. |

These values are exposed via `GET /match/profile` and the UI automatically populates all search criteria form fields on page load.

---

## Blacklist Filtering

Before scoring, `JobMatchService` checks each scraped job against three optional blacklists sourced from `work_preferences.yaml`:

| Blacklist Key | Yaml Field | Behaviour |
|---|---|---|
| `companyBlacklist` | `company_blacklist` | Excludes any job whose company name contains a blacklisted term (case-insensitive). |
| `titleBlacklist` | `title_blacklist` | Excludes any job whose title contains a blacklisted keyword (case-insensitive). |
| `locationBlacklist` | `location_blacklist` | Excludes any job whose location contains a blacklisted term (case-insensitive). |

Blacklisted jobs are silently skipped — they are never scored or included in `results`. They are still counted in `jobsFound`.

---

## CSV Upload Layout

To run a match execution (`POST /match/runs`), clients upload a CSV configuration mapping companies to career pages:

### CSV Headers
The file can have headers (`company,url`) or be headerless.

### CSV Structure Example
```csv
company,url
Google,https://www.google.com/about/careers/applications/
Lever,https://jobs.lever.co/lever
Ashby,https://jobs.ashbyhq.com/ashby
```

---

## Match Exports

Supported matched job export formats:

1. **CSV Export (`/match/runs/:id/export.csv`)**:
   - Contains columns: `Company`, `Job Title`, `Location`, `Match Score`, `Job URL`, `Skills`, `Experience Required`, `Employment Type`.
   - UTF-8 text representation, fields separated by commas.
2. **Excel-Compatible HTML Export (`/match/runs/:id/export.xls`)**:
   - Returns a structured HTML table with Excel-friendly mime-types.
   - Auto-opens as a native table inside Microsoft Excel or Google Sheets.
