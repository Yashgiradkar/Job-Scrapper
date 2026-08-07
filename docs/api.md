# API Endpoint Reference

This document provides details on all HTTP API endpoints exposed by the Job Scraper Platform.

---

## Endpoint Overview

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/scrape` | Run registered scrapers (`{ "scrapers": ["name"] }` optional) |
| GET | `/jobs` | List persisted jobs (`source`, `page`, `pageSize` params) |
| GET | `/jobs/:id` | Get one job by id |
| GET | `/match/profile` | Return pre-filled search criteria from user YAML profile files |
| POST | `/match/runs` | Start a CSV-driven company scrape + matching run |
| GET | `/match/runs/:id` | Read run status, logs, metrics, matched jobs |
| POST | `/match/runs/:id/stop` | Cancel an active run |
| GET | `/match/runs/:id/export.csv` | Export matched jobs as CSV |
| GET | `/match/runs/:id/export.xls` | Export matched jobs as Excel-compatible HTML |

---

## Detailed Request & Response Formats

### 1. Health Check
* **Path**: `GET /health`
* **Response**: `200 OK`
```json
{
  "status": "ok"
}
```

---

### 2. Get User Profile (Pre-fill Criteria)
* **Path**: `GET /match/profile`
* **Description**: Reads `data_folder/plain_text_resume.yaml` and `data_folder/work_preferences.yaml` to produce pre-filled search criteria. The frontend uses this to auto-populate all form fields on page load.
* **Response**: `200 OK`
```json
{
  "roles": ["Software engineer"],
  "skills": ["NestJS", "Docker", "MongoDB", "Node.js", "Express.js", "React.js"],
  "locations": ["Germany"],
  "experience": "1.7 years",
  "remote": true,
  "minimumMatchPercentage": 70,
  "companyBlacklist": ["wayfair", "Crossover"],
  "titleBlacklist": ["word1", "word2"],
  "locationBlacklist": ["Brazil"]
}
```

### 2. Run Scrapers
* **Path**: `POST /scrape`
* **Request Body**:
```json
{
  "scrapers": ["sample-jobs"]
}
```
* **Response**: `202 Accepted`
```json
{
  "startedAt": "2026-08-07T00:00:00.000Z",
  "finishedAt": "2026-08-07T00:00:02.000Z",
  "durationMs": 2000,
  "scrapers": [
    {
      "name": "sample-jobs",
      "success": true,
      "jobsFound": 3,
      "jobsCreated": 3,
      "jobsUpdated": 0
    }
  ],
  "totals": {
    "jobsFound": 3,
    "jobsCreated": 3,
    "jobsUpdated": 0,
    "scrapersSucceeded": 1,
    "scrapersFailed": 0
  }
}
```

### 3. List Jobs
* **Path**: `GET /jobs`
* **Query Parameters**:
  - `source` (string, optional): Filter by scraper/source name.
  - `page` (number, optional): Page offset index. Default is `1`.
  - `pageSize` (number, optional): Page capacity limit. Default is `20`.
* **Response**: `200 OK`
```json
[
  {
    "id": "uuid-string",
    "title": "Software Engineer",
    "company": "Acme",
    "location": "New York, NY",
    "remote": true,
    "url": "https://example.com/job/123",
    "description": "Job details text...",
    "employmentType": "Full-time",
    "skills": ["TypeScript", "Node.js"],
    "experience": 3,
    "createdAt": "2026-08-07T00:00:00.000Z"
  }
]
```

### 4. Get Job by ID
* **Path**: `GET /jobs/:id`
* **Response**: `200 OK`

---

## Match Run Management

### 5. Start Match Run
* **Path**: `POST /match/runs`
* **Request Body (Multipart Form-Data)**:
  - `file`: CSV file containing columns `company` and `url`.
  - `remoteOnly` (string, optional): Set to `"true"` to filter matches to remote jobs only.
* **Response**: `201 Created`
```json
{
  "id": "run-uuid-string",
  "status": "pending",
  "remoteOnly": true,
  "createdAt": "2026-08-07T00:00:00.000Z"
}
```

### 6. Read Match Run Status
* **Path**: `GET /match/runs/:id`
* **Response**: `200 OK`
```json
{
  "id": "run-uuid-string",
  "status": "completed",
  "progress": {
    "total": 5,
    "processed": 5,
    "succeeded": 5,
    "failed": 0
  },
  "metrics": {
    "durationMs": 4200,
    "jobsFound": 12,
    "matchesFound": 4
  },
  "logs": [
    "Starting run...",
    "Processed Acme: 4 jobs found, 2 matches."
  ],
  "matches": [
    {
      "id": "match-uuid",
      "score": 0.85,
      "job": {
        "title": "Senior React Developer",
        "company": "Acme",
        "location": "Remote"
      }
    }
  ]
}
```

### 7. Stop Match Run
* **Path**: `POST /match/runs/:id/stop`
* **Response**: `200 OK`
```json
{
  "message": "Run stopped successfully"
}
```

### 8. Export Matches (CSV / XLS)
* **Paths**:
  - `GET /match/runs/:id/export.csv`
  - `GET /match/runs/:id/export.xls`
* **Response**: Binary file download streams (CSV text or spreadsheet content type).
