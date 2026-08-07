# Developer Guide

This document describes how to set up the repository locally, execute validation checks, add custom scrapers or ATS adapters, and view the feature roadmap.

---

## Local Setup Walkthrough

### Prerequisites
- **Node.js**: Version 18 or above
- **PostgreSQL**: A running instance with database access credentials
- **Playwright System Deps**: Chrome/Webkit browser engines

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
Copy the example environment template and configure database connections:
```bash
cp .env.example .env
```
Update `.env` with your `DATABASE_URL` (e.g. `postgresql://user:password@localhost:5432/job_scraper`).

### 3. Deploy Database Migrations
Initialize Prisma schema tables:
```bash
npx prisma migrate dev
```

### 4. Build and Run Server
Start the Express server in development mode with live watch-reload:
```bash
npm run dev
```

---

## Testing

### Run Tests
```bash
npm test
```

### Compile Code
To perform a TypeScript compilation check:
```bash
npm run build
```

---

## Guide: Adding a New Custom Scraper

1. Create a new scraper class under `src/scrapers/` (e.g. `src/scrapers/my-company-scraper.ts`):
   ```typescript
   import { Page } from 'playwright';
   import { BaseScraper } from '../domain/scrapers/base-scraper.js';
   import { CreateJobInput } from '../domain/models/job.js';

   export class MyCompanyScraper extends BaseScraper {
     constructor() {
       super('my-company', 'https://example.com/careers');
     }

     protected async scrape(page: Page): Promise<CreateJobInput[]> {
       await page.goto(this.sourceUrl);
       // Select job element nodes and map them to job object shape:
       return [
         {
           title: 'Full Stack Engineer',
           url: 'https://example.com/jobs/1',
           location: 'San Francisco, CA',
           description: 'Job description content...',
         }
       ];
     }
   }
   ```
2. Register the scraper in `src/scrapers/index.ts`:
   ```typescript
   import { MyCompanyScraper } from './my-company-scraper.js';

   export function createScrapers(): BaseScraper[] {
     return [
       new MyCompanyScraper(),
       // ...other scrapers
     ];
   }
   ```

---

## Guide: Adding a New ATS Adapter

1. Open `src/infrastructure/scraping/ats-job-source.ts`.
2. Implement your logic as a subclass of `AtsJobSource` or add domain checks under `CompanyCareerPageScraper`:
   - Inspect the URL structure.
   - Route execution to target the JSON REST feed of the tracking provider.

---

## TODO Roadmap

### High Priority
- [ ] Add unit tests for `JobNormalizer` (edge cases: emojis, non-ASCII, HTML entities).
- [ ] Add unit tests for `ReliableExecutor` (retry, circuit breaker state machine).
- [ ] Add integration test for `CompanyCareerPageScraper` fallback chain.
- [ ] Persist `remote`, `employmentType`, `skills`, `experience` to the database (Prisma schema migration required).

### Medium Priority
- [ ] Expose `runner.events` via SSE endpoint (`GET /scrape/events`) for live UI progress.
- [ ] Add `POST /scrape` cancellation endpoint using `AbortController`.
- [ ] Add `GET /scrape/status` to query current in-progress run state.
- [ ] Add retry-count metric to `ScraperRunResult`.
- [ ] Screenshot cleanup policy (keep last N, delete older files).
- [ ] Support multiple proxies with round-robin for Crawlee.

### Low Priority
- [ ] Support custom Crawlee router rules per domain.
- [ ] Add Apify Actor caching (skip re-run if dataset is fresh within TTL).
- [ ] Python scraper bridge integration (`python/` directory).
- [ ] Scraper plugin system (load scrapers from external packages).
- [ ] Admin UI for circuit breaker state and rate limiter status.
