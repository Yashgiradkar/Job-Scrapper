# Architecture Decisions (ADR)

This document contains a historical ledger of design and architectural decisions made for the Job Scraper Platform.

---

## Architectural Decision Records

### AD-1: Domain Layer Isolation
* **Status**: Approved
* **Context**: We want to make core business entities and logic portable and decoupled from framework dependencies.
* **Decision**: The `domain/` layer contains pure TypeScript interfaces and utility logic. No database connections (Prisma), network clients (axios, crawlee), or API libraries can be imported inside this directory.

### AD-2: Normalization Boundary at BaseScraper
* **Status**: Approved
* **Context**: Scrapers return job data in differing formats (variations in remote detection, company names, HTML strings).
* **Decision**: Enforce normalization automatically at the single boundary: `BaseScraper.buildJob()`. All scrapers must utilize this pipeline method. This ensures that any data entering downstream matching or persistence layers is pre-normalized.

### AD-3: Automatic Reliability via Browser Page Goto Interception
* **Status**: Approved
* **Context**: Applying retry, rate-limiting, and circuit breaker policies inside every custom scraper codebase leads to logic duplication and code bloat.
* **Decision**: We override/intercept Playwright's low-level `page.goto` function inside `BrowserManager.createPage()`. Reliable policies are automatically applied at execution time based on navigation target hostname mapping.

### AD-4: Lazy Singleton Allocation for Heavy Infrastructure
* **Status**: Approved
* **Context**: Apify, Crawlee, and Playwright modules have slow startup times and resource overhead if initialized during main app bootstrap.
* **Decision**: Expose lazy singleton resolution helper getters (e.g. `getActorRunner()`, `getCrawleeRunner()`). Connections are established only on demand.

### AD-5: Registry Safety using ScraperQueue Copies
* **Status**: Approved
* **Context**: Parallel worker runs pulling from a shared array reference could experience race conditions, item duplication, or state mutations.
* **Decision**: Workers process a local copy of scraper targets wrapped in `ScraperQueue` which pop references sequentially. The core registry remains immutable.

### AD-6: Abort Checks between Scraper Operations
* **Status**: Approved
* **Context**: Terminating a browser operation or SQL transaction mid-run can cause incomplete writes or database corruption.
* **Decision**: Cancellation signals (`AbortSignal`) are checked between scraper queue item allocations. In-progress scraping executions run to completion before processing terminates.

### AD-7: Idempotency of JobNormalizer
* **Status**: Approved
* **Context**: Scrapers might parse properties that are already standardized, or apply matching checks repeatedly.
* **Decision**: `JobNormalizer.normalize()` is pure and idempotent. Re-running it on an already normalized job object returns identical structures without errors or drift.

### AD-8: Circuit Breakers Separated by Domain Hostnames
* **Status**: Approved
* **Context**: A single carrier site failing (due to anti-bot walls or maintenance) should not stop scraping operations across unaffected companies.
* **Decision**: The circuit breaker is mapped globally using a map keyed by URL hostname. Failure rates trip breaker status on a per-domain basis.
