# Job Scraper Platform

MVP foundation for a scalable job scraping platform built with Node.js, TypeScript, Playwright, Prisma, and PostgreSQL.

## Project Structure

```
job-scraper-platform/
├── src/
│   ├── api/                    # HTTP layer (Express routes & middleware)
│   │   ├── routes/             # Route handlers
│   │   └── middleware/         # Error handling, request logging
│   ├── application/            # Use cases & orchestration
│   │   ├── scraper-runner.ts   # Executes one or more scrapers
│   │   ├── job-match-service.ts
│   │   ├── job-matching-engine.ts
│   │   └── ports/              # Interfaces owned by the application layer
│   ├── domain/                 # Core business logic (no external deps)
│   │   ├── models/             # Job and other domain types
│   │   ├── scrapers/           # BaseScraper abstract class & registry
│   │   └── errors/             # Domain/application error types
│   ├── infrastructure/         # External integrations
│   │   ├── browser/            # Playwright browser manager
│   │   ├── config/             # Environment configuration
│   │   ├── database/           # Prisma client & repositories
│   │   ├── scraping/           # ATS API adapters
│   │   └── logging/            # Structured logging (pino)
│   ├── scrapers/               # Site-specific scraper implementations
│   │   ├── company-career-page-scraper.ts
│   │   └── sample-jobs-scraper.ts
│   ├── composition-root.ts     # Dependency wiring
│   └── main.ts                 # Application entry point
├── prisma/
│   └── schema.prisma           # Database schema
├── public/                     # Web UI
├── python/                     # Optional Python scripts for complex sites
├── .env.example                # Environment variable template
├── package.json
└── tsconfig.json
```

## Layer Responsibilities

| Layer | Folder | Purpose |
|-------|--------|---------|
| API | `src/api/` | HTTP concerns only — parses requests, returns responses |
| Application | `src/application/` | Orchestrates domain + infrastructure for use cases |
| Domain | `src/domain/` | Pure business rules, models, scraper contracts |
| Infrastructure | `src/infrastructure/` | Playwright, Prisma, config, logging |
| Scrapers | `src/scrapers/` | Pluggable site-specific implementations |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Basic service health check |
| POST | `/scrape` | Runs all registered scrapers or selected scrapers from `{ "scrapers": ["sample-jobs"] }` |
| GET | `/jobs` | Lists persisted jobs with optional `source`, `page`, and `pageSize` query params |
| GET | `/jobs/:id` | Returns one persisted job by id |
| POST | `/match/runs` | Starts a CSV-driven company scrape and matching run |
| GET | `/match/runs/:id` | Reads run status, logs, dashboard metrics, and matched jobs |
| POST | `/match/runs/:id/stop` | Requests cancellation for an active run |
| GET | `/match/runs/:id/export.csv` | Exports matched jobs as CSV |
| GET | `/match/runs/:id/export.xls` | Exports matched jobs as Excel-compatible HTML |

## Matching Flow

The web UI is available at `/`. Upload a CSV with `company,url` columns, enter roles, skills, locations, experience, and minimum match percentage, then start a matching run.

The company career scraper detects Greenhouse, Lever, Workday, and Ashby URLs and uses their public APIs first. If no supported ATS API is detected, it falls back to browser scraping through the existing Playwright `BrowserManager`.

Matching scores role, skills, experience, and location independently, then combines them with configurable weights:

```
MATCH_ROLE_WEIGHT=0.35
MATCH_SKILLS_WEIGHT=0.35
MATCH_EXPERIENCE_WEIGHT=0.15
MATCH_LOCATION_WEIGHT=0.15
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

If Playwright browsers are not installed yet, install Chromium:

```bash
npx playwright install chromium
```

### 2. Configure Environment

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Update `DATABASE_URL` in `.env`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/job_scraper
PORT=3000
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=30000
LOG_LEVEL=info
MATCH_ROLE_WEIGHT=0.35
MATCH_SKILLS_WEIGHT=0.35
MATCH_EXPERIENCE_WEIGHT=0.15
MATCH_LOCATION_WEIGHT=0.15
```

### 3. Run PostgreSQL

Use any local PostgreSQL database. For example, with Docker:

```bash
docker run --name job-scraper-postgres \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=job_scraper \
  -p 5432:5432 \
  -d postgres:16
```

If the container already exists, start it again:

```bash
docker start job-scraper-postgres
```

### 4. Apply Database Schema

Generate the Prisma client:

```bash
npm run db:generate
```

Apply the schema to the database:

```bash
npm run db:push
```

For migration-based development, use:

```bash
npm run db:migrate
```

You can inspect data with Prisma Studio:

```bash
npm run db:studio
```

### 5. Run Backend

Start the backend in development mode:

```bash
npm run dev
```

The API runs on:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok" }
```

For production-style execution:

```bash
npm run build
npm start
```

### 6. Run Frontend

The frontend is served by the same backend. After running `npm run dev`, open:

```text
http://localhost:3000
```

There is no separate frontend dev server in this MVP. Static UI files live in `public/`.

## CSV Format

Upload a CSV with company names and career page URLs.

Example:

```csv
company,url
Acme Careers,https://boards.greenhouse.io/acme
Example Corp,https://jobs.lever.co/example
Workday Company,https://company.wd1.myworkdayjobs.com/en-US/careers
Ashby Startup,https://jobs.ashbyhq.com/startup
```

The CSV parser also accepts rows without headers:

```csv
Acme Careers,https://boards.greenhouse.io/acme
Example Corp,https://jobs.lever.co/example
```

## How To Apply Filters From UI

1. Open `http://localhost:3000`.
2. Select your CSV file in the `Company CSV` field.
3. Enter one or more roles in `Roles`, separated by commas.

```text
Backend Engineer, Python Developer, Platform Engineer
```

4. Enter required skills in `Skills`, separated by commas.

```text
Python, TypeScript, Playwright, PostgreSQL, AWS
```

5. Enter preferred locations in `Locations`, separated by commas.

```text
Remote, Pune, Bengaluru, New York
```

6. Enter experience, for example:

```text
3 years
```

7. Set `Minimum Match %`, for example `70`.
8. Enable `Remote only` if you only want remote-friendly roles.
9. Click `Start`.
10. Watch live progress in `Live Logs`.
11. Review matched jobs in the results table.
12. Click a job title to open the details modal.
13. Use `CSV` or `Excel` to export matched jobs.
14. Click `Stop` to request cancellation while a run is active.

## Matching Output

The results table and export include:

| Column | Description |
|--------|-------------|
| Company | Company name from the uploaded CSV |
| Job Title | Scraped job title |
| Match Percentage | Overall weighted match score |
| Matched Skills | Skills found in the job title or description |
| Missing Skills | Requested skills not found |
| Experience | Extracted experience signal when available |
| Location | Scraped job location |
| Job URL | Direct job posting URL |
| Career Page | Source career page from the CSV |
| Date Scraped | Timestamp when the job was scraped |

## Common Commands

```bash
npm run dev          # Run backend and frontend locally
npm run build        # Compile TypeScript
npm start            # Run compiled app from dist/
npm run db:generate  # Generate Prisma client
npm run db:push      # Push Prisma schema to database
npm run db:migrate   # Create/apply Prisma migration
npm run db:studio    # Open Prisma Studio
```

## Troubleshooting

If the app fails with `DATABASE_URL is required`, check that `.env` exists and contains a PostgreSQL connection string.

If scraping fails in browser mode, run:

```bash
npx playwright install chromium
```

If no jobs are returned from an ATS URL, confirm the company career URL is public and uses a supported ATS format. The scraper currently supports Greenhouse, Lever, Workday, and Ashby before falling back to browser scraping.

The MVP includes a deterministic `sample-jobs` scraper so the runner and API can be tested without relying on a third-party website.
