# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

---

## [Unreleased]

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
