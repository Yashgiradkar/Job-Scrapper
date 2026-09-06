# Architecture Reference

This document describes the codebase structure, layer responsibilities, dependency injection topology, and feature capabilities of the Job Scraper Platform.

---

## Folder Structure

```
job-scraper-platform/
├── database/
│   └── schema.sql                        # Production PostgreSQL relational schema (23 tables, views, triggers)
├── src/
│   ├── api/                              # HTTP layer (Express routes & middleware)
│   │   ├── routes/
│   │   │   ├── scrape-routes.ts          # POST /scrape
│   │   │   ├── match-routes.ts           # /match/runs/*
│   │   │   ├── job-routes.ts             # GET /jobs, /jobs/:id
│   │   │   └── apply-routes.ts           # POST /apply-job, /apply-job/:sessionId/submit
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
│   │   ├── apply-job-service.ts          # Playwright form autofill automation
│   │   ├── apply-job-session-store.ts    # In-memory browser session manager (10 min TTL)
│   │   ├── export/
│   │   │   └── matched-jobs-exporter.ts  # CSV / XLS export
│   │   └── ports/
│   │       └── job-repository.ts         # Repository interface (port)

│   │
│   ├── domain/                           # Core business logic — no external deps
│   │   ├── models/
│   │   │   ├── job.ts                    # Job & CreateJobInput interfaces + factory
│   │   │   ├── job-normalizer.ts         # Normalizes all scraper outputs
│   │   │   └── company-career-page.ts
│   │   ├── scrapers/
│   │   │   ├── base-scraper.ts           # Abstract base; buildJob auto-normalizes
│   │   │   └── scraper-registry.ts       # Name → BaseScraper registry
│   │   └── errors/
│   │       └── app-error.ts
│   │
│   ├── core/                             # Automation Engine Core Modules
│   │   └── discovery/                    # Phase -2: Autonomous Discovery & Reverse-Engineering Engine
│   │       ├── types.ts                  # Zod schemas & discovery telemetry types
│   │       ├── errors.ts                 # Discovery error hierarchy
│   │       ├── interfaces/               # ISP & DIP contracts
│   │       ├── analyzers/                # Network, DOM, RSS, Anti-Bot analyzers
│   │       ├── generators/               # Scaffold & workflow generators
│   │       └── engine/                   # DiscoveryEngine facade orchestrator
│   │
│   ├── infrastructure/                   # External integrations
│   │   ├── browser/
│   │   │   └── browser-manager.ts        # Playwright browser pool + screenshot-on-failure
│   │   ├── config/
│   │   │   ├── config.ts                 # Zod-validated env config (all sections)
│   │   │   └── profile-loader.ts         # Loads plain_text_resume.yaml + work_preferences.yaml → JobSearchCriteria
│   │   ├── database/
│   │   │   ├── prisma-client.ts
│   │   │   ├── prisma-job-repository.ts
│   │   │   ├── in-memory-job-repository.ts
│   │   │   └── job-mapper.ts
│   │   ├── logging/
│   │   │   └── logger.ts                 # Pino structured logging factory
│   │   ├── scraping/
│   │   │   ├── ats-job-source.ts         # Greenhouse, Lever, Workday, Ashby adapters
│   │   │   └── reliable-executor.ts      # Retry/rate-limit/circuit-breaker/metrics
│   │   ├── apify/                        # Apify SDK wrappers
│   │   │   ├── config.ts                 # Reads APIFY_TOKEN from central config
│   │   │   ├── apify-client.ts           # Lazy-initialized ApifyClient singleton
│   │   │   ├── actor-runner.ts           # Run actors, return ActorRunResult
│   │   │   ├── dataset-reader.ts         # Read dataset items after actor run
│   │   │   ├── request-queue.ts          # Create/push/delete remote request queues
│   │   │   └── index.ts                  # Re-exports + singleton getters
│   │   └── crawlee/                      # Crawlee crawler wrappers
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
├── screenshots/                          # Failure screenshots (auto-created)
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

## Implemented Features

### Core Scraping
- `BaseScraper` abstract class with `run()` / `scrape()` / `buildJob()` lifecycle
- `ScraperRegistry` for name-based scraper resolution
- `SampleJobsScraper` for deterministic local testing
- `CompanyCareerPageScraper` — tiered multi-strategy scraper

### ATS API Adapters
- `GreenhouseJobSource` — boards-api.greenhouse.io
- `LeverJobSource` — api.lever.co
- `AshbyJobSource` — api.ashbyhq.com
- `WorkdayJobSource` — `myworkdayjobs.com` CXS API

### Apify Integration
- `ApifyClient` wrapper with lazy initialization
- `ActorRunner` — trigger actors, collect `ActorRunResult`
- `DatasetReader` — fetch dataset items post-run
- `RequestQueue` — create/push/delete remote request queues
- `Configuration` — reads `APIFY_TOKEN` and `APIFY_ACTOR_MAPPING` from central config
- `CompanyCareerPageScraper` tries configured actor (by company name or domain) before Crawlee

### Crawlee Integration
- `CrawleeRunner` wrapping `PlaywrightCrawler` / `CheerioCrawler`
- Session pool (maxPoolSize 50), proxy support, concurrency, retry config
- `CompanyCareerPageScraper` falls back to Crawlee when no ATS or Actor matches

### Job Normalization
- `JobNormalizer` static class normalizing all scraper outputs
  - Title: emoji removal, whitespace collapse
  - Company: legal suffix stripping (LLC, Inc, Corp…)
  - URL: absolute URL validation
  - Description: HTML tag stripping
  - Location: capitalize, "Remote" standardization
  - Remote: auto-detected from location / description keywords
  - Employment type: detected and mapped to Full-time / Part-time / Contract / Internship
  - Skills: extracted from 40-entry keyword list (TypeScript, React, AWS, etc.)
  - Experience: regex extraction of year requirements
- `BaseScraper.buildJob()` automatically routes through `JobNormalizer` — all scrapers normalized at one boundary
- `Job` and `CreateJobInput` extended with `remote`, `employmentType`, `skills`, `experience`
- `JobMatchingEngine` uses pre-normalized `skills[]` and `experience` fields when available

### Scraping Reliability (`ReliableExecutor`)
- Exponential backoff retry (3 retries, ×2 factor, 1 s base delay)
- Domain-based rate limiter (1.5 s default inter-request interval)
- Circuit breaker per domain: CLOSED → OPEN after 3 consecutive failures, 30 s cooldown, HALF_OPEN probe
- Outer timeout enforcement (45 s default)
- Pino metrics: heap memory before/after, execution duration, dataset size
- `BrowserManager.createPage()` intercepts `page.goto()` to route through `ReliableExecutor` automatically
- `BrowserManager.withPage()` captures a full-page screenshot on failure → `screenshots/failure-<ts>.png`

### ScraperRunner Concurrency
- Configurable worker pool driven by `SCRAPER_CONCURRENCY` (env, default 2, max 20)
- `ScraperQueue` — safe pop queue (copy-on-create, never mutates registry)
- N concurrent workers via `Promise.all`, each draining the queue
- `AbortSignal`-based cancellation — workers stop between scrapers; in-flight scrape completes cleanly
- `EventEmitter` progress surface (`runner.events`):
  - `scraper:start` → `{ scraperName, completed, total }`
  - `scraper:done` → `{ result: ScraperRunResult, completed, total }`
  - `scraper:fail` → `{ scraperName, error, completed, total }`
  - `run:complete` → `{ result: ScrapeRunResult }`

### Matching & Export
- Weighted scoring engine: role, skills, experience, location
- Match weights configurable via env
- CSV upload: `company,url` column headers (or headerless)
- Supports Greenhouse, Lever, Workday, Ashby URLs automatically
- Remote-only filter
- Stop/cancel active matching run
- Export matched jobs as CSV or Excel-compatible HTML
