# Scraping Subsystem Reference

This document describes the design, execution flow, fallbacks, reliability policies, and normalization logic of the Scraping Subsystem.

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

## ATS Adapters

When career page URLs match supported Applicant Tracking Systems (ATS), we bypass full browser rendering and fetch jobs directly through high-efficiency JSON/API endpoints:

1. **Greenhouse (`GreenhouseJobSource`)**:
   - Matches URLs targeting `boards.greenhouse.io` or `boards-api.greenhouse.io`.
   - Uses the Greenhouse Boards API.
2. **Lever (`LeverJobSource`)**:
   - Matches URLs targeting `api.lever.co` or `jobs.lever.co`.
   - Uses the public Lever Jobs API.
3. **Ashby (`AshbyJobSource`)**:
   - Matches URLs targeting `api.ashbyhq.com` or `jobs.ashbyhq.com`.
   - Uses Ashby's public API endpoints.
4. **Workday (`WorkdayJobSource`)**:
   - Matches standard Workday tenant URLs (containing `myworkdayjobs.com`).
   - Targets the inner Workday CXS pagination API (`/play/menu/` and `/wday/cxs/`).

---

## Apify Actor Integration

When an Apify mapping is defined under `APIFY_ACTOR_MAPPING`, `CompanyCareerPageScraper` triggers a remote actor instead of local crawling:
- Uses `ApifyClient` resolved on-demand.
- Actor inputs specify `{ startUrls: [{ url }] }`.
- Fetches and processes items via `DatasetReader` once the actor run succeeds.
- If actor execution fails (e.g. rate limit, execution timeout), it logs the error and gracefully falls back to Crawlee/Playwright.

---

## Crawlee Runner

When no ATS API or Apify actor is matched, the default crawler fallback is **Crawlee**:
- **PlaywrightCrawler**: Runs headless browser operations under Crawlee's scheduling, concurrency management, and proxy routing pool.
- **CheerioCrawler**: Runs rapid raw HTML requests when `CRAWLEE_CRAWLER_TYPE=cheerio` is configured (useful for high-speed, lightweight static HTML parsing).
- Automatically routes traffic through `PROXY_URL` if set.
- Managed by `CrawleeRunner` with customizable max concurrency (`CRAWLEE_MAX_CONCURRENCY`) and retry limits (`CRAWLEE_MAX_RETRIES`).

---

## Scraping Reliability Policies (`ReliableExecutor`)

To protect scrapers from anti-bot mechanisms, rate limits, and network errors, all low-level Playwright page navigations in `BrowserManager.createPage()` route through `ReliableExecutor.execute()` with the following policies:

1. **Exponential Retry**:
   - Retries failed operations up to 3 times.
   - Delay increases exponentially with a multiplier factor of 2 (base delay 1 s).
2. **Rate Limiting**:
   - Ensures requests to the same domain maintain a minimum interval of 1.5 s to avoid triggering rate limit walls.
3. **Circuit Breaker**:
   - Tracks consecutive navigation failures per domain (host).
   - Trips to `OPEN` after 3 consecutive failures.
   - Stays `OPEN` for 30 s, failing fast immediately for any queries targeting that domain during cooldown.
   - Transitions to `HALF_OPEN` to probe domain availability once cooldown expires.
4. **Timeouts**:
   - Imposes a strict outer timeout of 45 s per navigation.
5. **Screenshots on Failure**:
   - If an error is thrown during a browser session managed by `withPage`, a full-page screenshot of the state is captured and stored under `screenshots/failure-<unix-ts>.png`.

---

## Job Normalizer Field Reference

The `JobNormalizer` guarantees that all job data objects written to the repository adhere to the same schema constraints:

- **title**: Trims whitespace, collapses multiple spaces, and strips out emojis.
- **company**: Standardizes the naming structure by stripping corporate suffixes like `LLC`, `Inc.`, `Incorporated`, `Corp.`, `Co.`, etc.
- **url**: Verifies that the URL is absolute and correctly formatted.
- **description**: Strips any HTML tags to preserve plain text, keeping layout structure readable.
- **location**: Standardizes text representation and capitalizes location values (e.g., converting "nyc" or "new york city" to "New York, NY").
- **remote**: Automatically detects remote status from location string matching or description analysis.
- **employmentType**: Standardizes job types into one of: `Full-time`, `Part-time`, `Contract`, `Internship`.
- **skills**: Scans the text using a 40-item keyword map (e.g. `React`, `TypeScript`, `AWS`, `Python`) to extract structured skill tags.
- **experience**: Uses regex filters to extract the number of required years of experience.

---

## ScraperRunner Event Reference

`ScraperRunner` exposes a Node `EventEmitter` instance on its `events` property:

### `scraper:start`
Fired when a worker starts executing a scraper.
```typescript
interface ScraperStartEvent {
  scraperName: string;
  completed: number;
  total: number;
}
```

### `scraper:done`
Fired when a scraper completes execution successfully and saves its findings.
```typescript
interface ScraperDoneEvent {
  result: ScraperRunResult;
  completed: number;
  total: number;
}
```

### `scraper:fail`
Fired when a scraper execution throws an error that is caught.
```typescript
interface ScraperFailEvent {
  scraperName: string;
  error: string;
  completed: number;
  total: number;
}
```

### `run:complete`
Fired when the entire scraper run queue has been fully processed.
```typescript
interface RunCompleteEvent {
  result: ScrapeRunResult;
}
```
