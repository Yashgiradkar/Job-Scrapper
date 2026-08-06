# Job Scraper Platform

> **AI Maintenance Rules — Single Source of Truth**
>
> Before making any code changes: read this entire document, understand the architecture,
> and preserve documented decisions unless explicitly instructed otherwise.
> After any implementation, update **only the affected sections** and append a Progress Log entry.

---

## Project Overview

MVP foundation for a scalable job scraping platform built with Node.js, TypeScript, Playwright,
Prisma, and PostgreSQL. The platform supports multiple concurrent scraping strategies:
ATS API adapters → Apify Actors → Crawlee crawlers → direct Playwright automation.

---

## Folder Structure

```
job-scraper-platform/
├── src/
│   ├── api/                              # HTTP layer (Express routes & middleware)
│   │   ├── routes/
│   │   │   ├── scrape-routes.ts          # POST /scrape
│   │   │   ├── match-routes.ts           # /match/runs/*
│   │   │   └── job-routes.ts             # GET /jobs, /jobs/:id
│   │   ├── middleware/
│   │   │   ├── error-handler.ts
│   │   │   ├── async-handler.ts
│   │   │   └── request-logger.ts
│   │   └── app.ts
│   │
│   ├── application/                      # Use cases & orchestration
│   │   ├── scraper-runner.ts             # Worker pool, queue, events, cancellation
│   │   ├── job-match-service.ts          # CSV-driven company matching run
│   │   ├── job-matching-engine.ts        # Weighted scoring engine
│   │   ├── job-match-run-manager.ts      # Run lifecycle manager
│   │   ├── export/
│   │   │   └── matched-jobs-exporter.ts  # CSV / XLS export
│   │   └── ports/
│   │       └── job-repository.ts         # Repository interface (port)
│   │
│   ├── domain/                           # Core business logic — no external deps
│   │   ├── models/
│   │   │   ├── job.ts                    # Job & CreateJobInput interfaces + factory
│   │   │   ├── job-normalizer.ts         # *** NEW *** Normalizes all scraper outputs
│   │   │   └── company-career-page.ts
│   │   ├── scrapers/
│   │   │   ├── base-scraper.ts           # Abstract base; buildJob auto-normalizes
│   │   │   └── scraper-registry.ts       # Name → BaseScraper registry
│   │   └── errors/
│   │       └── app-error.ts
│   │
│   ├── infrastructure/                   # External integrations
│   │   ├── browser/
│   │   │   └── browser-manager.ts        # Playwright browser pool + screenshot-on-failure
│   │   ├── config/
│   │   │   └── config.ts                 # Zod-validated env config (all sections)
│   │   ├── database/
│   │   │   ├── prisma-client.ts
│   │   │   ├── prisma-job-repository.ts
│   │   │   ├── in-memory-job-repository.ts
│   │   │   └── job-mapper.ts
│   │   ├── logging/
│   │   │   └── logger.ts                 # Pino structured logging factory
│   │   ├── scraping/
│   │   │   ├── ats-job-source.ts         # Greenhouse, Lever, Workday, Ashby adapters
│   │   │   └── reliable-executor.ts      # *** NEW *** Retry/rate-limit/circuit-breaker/metrics
│   │   ├── apify/                        # *** NEW *** Apify SDK wrappers
│   │   │   ├── config.ts                 # Reads APIFY_TOKEN from central config
│   │   │   ├── apify-client.ts           # Lazy-initialized ApifyClient singleton
│   │   │   ├── actor-runner.ts           # Run actors, return ActorRunResult
│   │   │   ├── dataset-reader.ts         # Read dataset items after actor run
│   │   │   ├── request-queue.ts          # Create/push/delete remote request queues
│   │   │   └── index.ts                  # Re-exports + singleton getters
│   │   └── crawlee/                      # *** NEW *** Crawlee crawler wrappers
│   │       ├── crawlee-runner.ts         # PlaywrightCrawler / CheerioCrawler + pool/proxy/retry
│   │       └── index.ts                  # Re-exports + singleton getter
│   │
│   ├── scrapers/                         # Site-specific implementations
│   │   ├── company-career-page-scraper.ts # ATS → Apify → Crawlee → Playwright pipeline
│   │   ├── sample-jobs-scraper.ts         # Deterministic scraper for local testing
│   │   └── index.ts                       # Factory: createScrapers()
│   │
│   ├── composition-root.ts               # Dependency wiring (unchanged)
│   └── main.ts                           # Entry point
│
├── prisma/
│   └── schema.prisma
├── public/                               # Web UI (static)
├── python/                               # Optional Python scripts
├── screenshots/                          # *** NEW *** Failure screenshots (auto-created)
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Layer Responsibilities

| Layer | Folder | Purpose |
|---|---|---|
| API | `src/api/` | HTTP only — parse requests, return responses |
| Application | `src/application/` | Orchestrate domain + infrastructure for use cases |
| Domain | `src/domain/` | Pure business rules, models, scraper contracts |
| Infrastructure | `src/infrastructure/` | Playwright, Prisma, Apify, Crawlee, config, logging |
| Scrapers | `src/scrapers/` | Pluggable site-specific implementations |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/scrape` | Run registered scrapers (`{ "scrapers": ["name"] }` optional) |
| GET | `/jobs` | List persisted jobs (`source`, `page`, `pageSize` params) |
| GET | `/jobs/:id` | Get one job by id |
| POST | `/match/runs` | Start a CSV-driven company scrape + matching run |
| GET | `/match/runs/:id` | Read run status, logs, metrics, matched jobs |
| POST | `/match/runs/:id/stop` | Cancel an active run |
| GET | `/match/runs/:id/export.csv` | Export matched jobs as CSV |
| GET | `/match/runs/:id/export.xls` | Export matched jobs as Excel-compatible HTML |

---

## Implemented Features

### Core Scraping
- [x] `BaseScraper` abstract class with `run()` / `scrape()` / `buildJob()` lifecycle
- [x] `ScraperRegistry` for name-based scraper resolution
- [x] `SampleJobsScraper` for deterministic local testing
- [x] `CompanyCareerPageScraper` — tiered multi-strategy scraper

### ATS API Adapters
- [x] `GreenhouseJobSource` — boards-api.greenhouse.io
- [x] `LeverJobSource` — api.lever.co
- [x] `AshbyJobSource` — api.ashbyhq.com
- [x] `WorkdayJobSource` — `myworkdayjobs.com` CXS API

### Apify Integration
- [x] `ApifyClient` wrapper with lazy initialization
- [x] `ActorRunner` — trigger actors, collect `ActorRunResult`
- [x] `DatasetReader` — fetch dataset items post-run
- [x] `RequestQueue` — create/push/delete remote request queues
- [x] `Configuration` — reads `APIFY_TOKEN` and `APIFY_ACTOR_MAPPING` from central config
- [x] Singleton getters: `getApifyClient()`, `getActorRunner()`, `getDatasetReader()`
- [x] `CompanyCareerPageScraper` tries configured actor (by company name or domain) before Crawlee

### Crawlee Integration
- [x] `CrawleeRunner` wrapping `PlaywrightCrawler` / `CheerioCrawler`
- [x] Session pool (maxPoolSize 50), proxy support, concurrency, retry config
- [x] Singleton getter `getCrawleeRunner()`
- [x] `CompanyCareerPageScraper` falls back to Crawlee when no ATS or Actor matches

### Job Normalization
- [x] `JobNormalizer` static class normalizing all scraper outputs
  - Title: emoji removal, whitespace collapse
  - Company: legal suffix stripping (LLC, Inc, Corp…)
  - URL: absolute URL validation
  - Description: HTML tag stripping
  - Location: capitalize, "Remote" standardization
  - Remote: auto-detected from location / description keywords
  - Employment type: detected and mapped to Full-time / Part-time / Contract / Internship
  - Skills: extracted from 40-entry keyword list (TypeScript, React, AWS, etc.)
  - Experience: regex extraction of year requirements
- [x] `BaseScraper.buildJob()` automatically routes through `JobNormalizer` — all scrapers normalized at one boundary
- [x] `Job` and `CreateJobInput` extended with `remote`, `employmentType`, `skills`, `experience`
- [x] `JobMatchingEngine` uses pre-normalized `skills[]` and `experience` fields when available

### Scraping Reliability (`ReliableExecutor`)
- [x] Exponential backoff retry (3 retries, ×2 factor, 1 s base delay)
- [x] Domain-based rate limiter (1.5 s default inter-request interval)
- [x] Circuit breaker per domain: CLOSED → OPEN after 3 consecutive failures, 30 s cooldown, HALF_OPEN probe
- [x] Outer timeout enforcement (45 s default)
- [x] Pino metrics: heap memory before/after, execution duration, dataset size
- [x] `BrowserManager.createPage()` intercepts `page.goto()` to route through `ReliableExecutor` automatically
- [x] `BrowserManager.withPage()` captures a full-page screenshot on failure → `screenshots/failure-<ts>.png`

### ScraperRunner Concurrency
- [x] Configurable worker pool driven by `SCRAPER_CONCURRENCY` (env, default 2, max 20)
- [x] `ScraperQueue` — safe pop queue (copy-on-create, never mutates registry)
- [x] N concurrent workers via `Promise.all`, each draining the queue
- [x] `AbortSignal`-based cancellation — workers stop between scrapers; in-flight scrape completes cleanly
- [x] `EventEmitter` progress surface (`runner.events`):
  - `scraper:start` → `{ scraperName, completed, total }`
  - `scraper:done` → `{ result: ScraperRunResult, completed, total }`
  - `scraper:fail` → `{ scraperName, error, completed, total }`
  - `run:complete` → `{ result: ScrapeRunResult }`

### Matching & Export
- [x] Weighted scoring engine: role, skills, experience, location
- [x] Match weights configurable via env
- [x] CSV upload: `company,url` column headers (or headerless)
- [x] Supports Greenhouse, Lever, Workday, Ashby URLs automatically
- [x] Remote-only filter
- [x] Stop/cancel active matching run
- [x] Export matched jobs as CSV or Excel-compatible HTML

---

## Scraping Pipeline Execution Order

For each company career page URL in a match run, or each registered scraper in a scrape run:

```
1. ATS API Check
   └─ Does the URL match Greenhouse / Lever / Workday / Ashby?
      ├─ YES → fetch via ATS adapter (no browser needed) → normalize → return jobs
      └─ NO  ↓

2. Apify Actor Check (CompanyCareerPageScraper only)
   └─ Does APIFY_ACTOR_MAPPING contain this company name or domain?
      ├─ YES → ActorRunner.run(actorId, { startUrls }) → DatasetReader.readItems()
      │         → normalize → return jobs
      │         → on failure: log error, fall through to step 3
      └─ NO  ↓

3. Crawlee Fallback (CompanyCareerPageScraper only)
   └─ CrawleeRunner.crawl(url, extractor)
      ├─ CRAWLEE_CRAWLER_TYPE=playwright → PlaywrightCrawler
      ├─ CRAWLEE_CRAWLER_TYPE=cheerio   → CheerioCrawler
      │  → normalize → return jobs if found
      │  → on failure: log error, fall through to step 4
      └─ NO JOBS / FAILURE ↓

4. Direct Playwright Fallback
   └─ BrowserManager.withPage() → page.goto() [wrapped in ReliableExecutor]
      → DOM card extraction → link extraction → normalize → return jobs
      → on failure: screenshot saved to screenshots/failure-<ts>.png

All job outputs pass through BaseScraper.buildJob() → JobNormalizer.normalize()
```

---

## Architecture Decisions

| ID | Decision | Rationale |
|---|---|---|
| AD-1 | Domain layer has zero external deps | Keeps business logic testable and portable |
| AD-2 | `BaseScraper.buildJob()` is the normalization boundary | Single place to enforce Job domain integrity across all scrapers |
| AD-3 | `BrowserManager.createPage()` intercepts `page.goto()` | Applies reliability (rate limit, retry, circuit breaker) transparently without touching scraper code |
| AD-4 | Apify infra uses lazy singletons | Avoids SDK init cost and config parsing on every request |
| AD-5 | `ScraperQueue` copies scrapers on construction | Workers never mutate the registry; re-runs are safe |
| AD-6 | `AbortSignal` checked between scrapers, not mid-scraper | Ensures the repository stays consistent; no partial job saves |
| AD-7 | `JobNormalizer.normalize()` is idempotent | Can be called multiple times without drift |
| AD-8 | Circuit breaker is per-domain, not global | One broken site does not halt scraping of all others |

---

## Environment Variables

### Core
| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `LOG_LEVEL` | `info` | Pino log level |

### Playwright
| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_HEADLESS` | `true` | Run Chromium headless |
| `PLAYWRIGHT_TIMEOUT_MS` | `30000` | Default page/navigation timeout |

### Matching
| Variable | Default | Description |
|---|---|---|
| `MATCH_ROLE_WEIGHT` | `0.35` | Scoring weight for role match |
| `MATCH_SKILLS_WEIGHT` | `0.35` | Scoring weight for skills match |
| `MATCH_EXPERIENCE_WEIGHT` | `0.15` | Scoring weight for experience match |
| `MATCH_LOCATION_WEIGHT` | `0.15` | Scoring weight for location match |

### Apify
| Variable | Default | Description |
|---|---|---|
| `APIFY_TOKEN` | *(optional)* | Apify API token — required only when actors are mapped |
| `APIFY_ACTOR_MAPPING` | `{}` | JSON or `key=value,…` mapping company names / domains to Actor IDs |

Examples:
```bash
APIFY_ACTOR_MAPPING='{"acme":"apify/web-scraper","example.com":"apify/web-scraper"}'
APIFY_ACTOR_MAPPING='acme=apify/web-scraper,example.com=apify/web-scraper'
```

### Crawlee
| Variable | Default | Description |
|---|---|---|
| `CRAWLEE_CRAWLER_TYPE` | `playwright` | `playwright` or `cheerio` |
| `CRAWLEE_MAX_CONCURRENCY` | `5` | Max parallel Crawlee requests |
| `CRAWLEE_MAX_RETRIES` | `3` | Max retries inside Crawlee crawler |
| `PROXY_URL` | *(optional)* | HTTP proxy for Crawlee requests |

### Scraper Concurrency
| Variable | Default | Description |
|---|---|---|
| `SCRAPER_CONCURRENCY` | `2` | Max scrapers running in parallel (1–20) |

---

## Dependency Injection (composition-root.ts)

```
PrismaJobRepository
BrowserManager (singleton via getBrowserManager())
ScraperRegistry ← createScrapers() [SampleJobsScraper, ...]

ScraperRunner(registry, browserManager, jobRepository)
  └─ runner.events  ← EventEmitter (subscribe externally for progress)

JobMatchingEngine()
JobMatchService(browserManager, jobRepository, matchingEngine)
JobMatchRunManager(jobMatchService)

createApp({ jobRepository, scraperRunner, jobMatchRunManager })
```

Apify and Crawlee singletons are resolved on-demand inside scraper methods:
- `getActorRunner()` / `getDatasetReader()` → via `src/infrastructure/apify/index.ts`
- `getCrawleeRunner()` → via `src/infrastructure/crawlee/index.ts`

---

## TODO Roadmap

### High Priority
- [ ] Add unit tests for `JobNormalizer` (edge cases: emojis, non-ASCII, HTML entities)
- [ ] Add unit tests for `ReliableExecutor` (retry, circuit breaker state machine)
- [ ] Add integration test for `CompanyCareerPageScraper` fallback chain
- [ ] Persist `remote`, `employmentType`, `skills`, `experience` to the database (Prisma schema migration required)

### Medium Priority
- [ ] Expose `runner.events` via SSE endpoint (`GET /scrape/events`) for live UI progress
- [ ] Add `POST /scrape` cancellation endpoint using `AbortController`
- [ ] Add `GET /scrape/status` to query current in-progress run state
- [ ] Add retry-count metric to `ScraperRunResult`
- [ ] Screenshot cleanup policy (keep last N, delete older files)
- [ ] Support multiple proxies with round-robin for Crawlee

### Low Priority
- [ ] Support custom Crawlee router rules per domain
- [ ] Add Apify Actor caching (skip re-run if dataset is fresh within TTL)
- [ ] Python scraper bridge integration (`python/` directory)
- [ ] Scraper plugin system (load scrapers from external packages)
- [ ] Admin UI for circuit breaker state and rate limiter status

---

## Progress Log

### 2026-08-07

---

**Feature:** Apify SDK Infrastructure Layer

**Files Added:**
- `src/infrastructure/apify/config.ts`
- `src/infrastructure/apify/apify-client.ts`
- `src/infrastructure/apify/actor-runner.ts`
- `src/infrastructure/apify/dataset-reader.ts`
- `src/infrastructure/apify/request-queue.ts`
- `src/infrastructure/apify/index.ts`

**Files Modified:**
- `package.json` (added `apify-client` dependency)

**Architecture Impact:**
New infrastructure module. No existing code changed.

**Environment Changes:**
None (token and mapping wired in subsequent task).

**Notes:**
Singleton getters pattern mirrors `getBrowserManager()`. `apify-client` wraps the official Apify REST API.

**Next Recommended Task:** Integrate Apify into `CompanyCareerPageScraper`.

---

**Feature:** Apify Actor Integration into CompanyCareerPageScraper

**Files Added:**
None.

**Files Modified:**
- `src/infrastructure/config/config.ts` (added `apify` schema block)
- `src/infrastructure/apify/config.ts` (delegated to central config)
- `src/infrastructure/apify/index.ts` (added singleton getters)
- `src/scrapers/company-career-page-scraper.ts` (added `getMappedActorId()`, `scrapeWithApify()`)

**Architecture Impact:**
`CompanyCareerPageScraper` now follows a 3-step fallback: ATS API → Apify Actor → Playwright. Actor is selected by matching company name or career page domain against `APIFY_ACTOR_MAPPING`.

**Environment Changes:**
- `APIFY_TOKEN` — Apify API token
- `APIFY_ACTOR_MAPPING` — company/domain → actor ID mapping

**Notes:**
Apify failure is caught and logged; falls back to Playwright without interrupting the run.

**Next Recommended Task:** Add Crawlee as the second fallback (before Playwright).

---

**Feature:** Crawlee Infrastructure Layer + CompanyCareerPageScraper Integration

**Files Added:**
- `src/infrastructure/crawlee/crawlee-runner.ts`
- `src/infrastructure/crawlee/index.ts`

**Files Modified:**
- `package.json` (added `crawlee` dependency)
- `src/infrastructure/config/config.ts` (added `crawlee` schema block)
- `src/scrapers/company-career-page-scraper.ts` (added `scrapeWithCrawlee()`, Cheerio/Playwright extractors)

**Architecture Impact:**
Full 4-step fallback chain now in place: ATS API → Apify Actor → Crawlee → Direct Playwright.
`extractFromCheerio()` and `extractFromPlaywright()` are module-level pure functions — no state.

**Environment Changes:**
- `CRAWLEE_CRAWLER_TYPE` — `playwright` (default) or `cheerio`
- `CRAWLEE_MAX_CONCURRENCY` — parallel requests inside Crawlee (default 5)
- `CRAWLEE_MAX_RETRIES` — per-request retries inside Crawlee (default 3)
- `PROXY_URL` — optional HTTP proxy for Crawlee

**Notes:**
Crawlee manages its own browser/session pool separately from `BrowserManager`. The two browser lifecycles do not interfere.

**Next Recommended Task:** Introduce `JobNormalizer` to standardize all scraper outputs.

---

**Feature:** Reusable JobNormalizer

**Files Added:**
- `src/domain/models/job-normalizer.ts`

**Files Modified:**
- `src/domain/models/job.ts` (added `remote`, `employmentType`, `skills`, `experience` to interfaces)
- `src/domain/scrapers/base-scraper.ts` (routes `buildJob` through `JobNormalizer.normalize`)
- `src/application/job-matching-engine.ts` (uses `job.skills[]` and `job.experience` when present)

**Architecture Impact:**
Normalization is now a domain-layer concern applied at the single `buildJob` boundary. All scrapers (ATS, Playwright, Apify, Crawlee) produce identical `Job` shapes without any per-scraper changes.

**Environment Changes:**
None.

**Notes:**
`JobNormalizer.normalize()` is idempotent and pure (no side effects). The 40-entry skills keyword list is embedded in the file and easy to extend.

**Next Recommended Task:** Add scraping reliability (retries, rate limiting, circuit breaker).

---

**Feature:** Scraping Reliability — ReliableExecutor + BrowserManager Hardening

**Files Added:**
- `src/infrastructure/scraping/reliable-executor.ts`
- `screenshots/` directory (auto-created at runtime on first failure)

**Files Modified:**
- `src/infrastructure/browser/browser-manager.ts` (goto interception + failure screenshot)

**Architecture Impact:**
`ReliableExecutor` is a global utility with process-singleton `CircuitBreaker` and `RateLimiter` keyed by hostname. All Playwright page navigations now pass through it automatically via the `page.goto()` intercept in `createPage()`. No application-layer changes.

**Environment Changes:**
None (all thresholds currently hardcoded: 3 retries, 45 s timeout, 1.5 s rate limit, 3-failure circuit trip, 30 s cooldown).

**Notes:**
Screenshots are saved to `screenshots/failure-<unix-ts>.png`. Directory is created on first failure. No cleanup policy yet — see TODO.

**Next Recommended Task:** Improve ScraperRunner concurrency.

---

**Feature:** ScraperRunner — Worker Pool, Queue, Cancellation, Progress Events

**Files Added:**
None.

**Files Modified:**
- `src/infrastructure/config/config.ts` (added `scraper.concurrency` field)
- `src/application/scraper-runner.ts` (full rewrite; all public APIs preserved)

**Architecture Impact:**
Behavior-extending, not behavior-replacing. `POST /scrape` still returns `ScrapeRunResult` unchanged.
New additive exports: `RunOptions`, `ScraperStartEvent`, `ScraperDoneEvent`, `ScraperFailEvent`, `RunCompleteEvent`.
`ScraperQueue` and worker pool are private implementation details.

**Environment Changes:**
- `SCRAPER_CONCURRENCY` — max parallel scrapers (default 2, max 20)

**Notes:**
`AbortSignal` cancellation is checked *between* scrapers, not mid-scraper, to keep repository writes consistent. `runner.events` is a Node.js `EventEmitter` — subscribe before calling `run()`.

**Next Recommended Task:**
Expose `runner.events` via an SSE endpoint for live UI progress, or persist `remote`/`employmentType`/`skills`/`experience` fields to the database via a Prisma migration.
