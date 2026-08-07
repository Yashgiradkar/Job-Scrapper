# Deployment & Configuration Reference

This document explains system requirements, operational variables, and file storage layout.

---

## Environment Variables

### Core Configuration
| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | PostgreSQL connection string. Must start with `postgresql://`. |
| `PORT` | `3000` | Port for the Express application server. |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`). |
| `LOG_LEVEL` | `info` | Pino logging filter level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`). |

### Playwright Settings
| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_HEADLESS` | `true` | Boolean string (`true`/`false`) determining whether to launch browsers headless. |
| `PLAYWRIGHT_TIMEOUT_MS` | `30000` | Navigation/action timeout boundary inside Playwright contexts. |

### Matching Settings
| Variable | Default | Description |
|---|---|---|
| `MATCH_ROLE_WEIGHT` | `0.35` | Title similarity weight ratio (0.0 to 1.0). |
| `MATCH_SKILLS_WEIGHT` | `0.35` | Skills analysis weight ratio (0.0 to 1.0). |
| `MATCH_EXPERIENCE_WEIGHT` | `0.15` | Experience comparison weight ratio (0.0 to 1.0). |
| `MATCH_LOCATION_WEIGHT` | `0.15` | Location compatibility weight ratio (0.0 to 1.0). |

### Apify Integration Settings
| Variable | Default | Description |
|---|---|---|
| `APIFY_TOKEN` | *(optional)* | Auth token for remote Apify API access. |
| `APIFY_ACTOR_MAPPING` | `{}` | JSON or comma-separated pairs mapping company names to Apify Actor IDs. |

### Crawlee Fallback Settings
| Variable | Default | Description |
|---|---|---|
| `CRAWLEE_CRAWLER_TYPE` | `playwright` | Engine used for local fallback crawls (`playwright` or `cheerio`). |
| `CRAWLEE_MAX_CONCURRENCY` | `5` | Request concurrency boundary inside Crawlee queues. |
| `CRAWLEE_MAX_RETRIES` | `3` | Max download retries in Crawlee browser engines. |
| `PROXY_URL` | *(optional)* | HTTP proxy connection string passed to Crawlee browser contexts. |

### Scraper Concurrency Settings
| Variable | Default | Description |
|---|---|---|
| `SCRAPER_CONCURRENCY` | `2` | Number of worker threads running concurrently inside `ScraperRunner`. |

---

## Persistent File Assets

### Screenshots Directory
- Located at the project root under `screenshots/`.
- Screen captures are auto-generated when local Playwright crawlers encounter execution failures.
- Captured files conform to `screenshots/failure-<unix-ts>.png`.
- Ensure directory permissions allow write access by the running Node process.
