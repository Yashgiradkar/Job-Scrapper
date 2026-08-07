# Job Scraper Platform

[![Node.js](https://img.shields.io/badge/node-%3E%3D%2018-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%3E%3D%205-blue.svg)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/prisma-%3E%3D%205-blue.svg)](https://www.prisma.io/)
[![Playwright](https://img.shields.io/badge/playwright-%3E%3D%201.40-blue.svg)](https://playwright.dev/)

An enterprise-ready job scraping and developer job matching engine. It extracts job listings using a tiered fallback scraping strategy: ATS API endpoint requests, remote Apify Actors, Crawlee automated crawls, or local Playwright scripts.

---

## Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Set up local configuration environment
cp .env.example .env

# 3. Create database tables
npx prisma migrate dev

# 4. Start the watch-dev server
npm run dev
```

---

## Documentation Index

Explore the modular documentation files for deep technical details and architecture design rules:

| Documentation Section | Location | Description |
|---|---|---|
| 🏗️ **Architecture Reference** | [docs/architecture.md](docs/architecture.md) | File layout, layer responsibilities, DI trees, and feature capability matrices. |
| 🕷️ **Scraping Subsystem** | [docs/scraping.md](docs/scraping.md) | Fallback pipeline, ATS adapters, Apify & Crawlee configuration, rate limits, and normalization rules. |
| 🔌 **API Endpoints** | [docs/api.md](docs/api.md) | REST request and response schema references for jobs, scraper runs, and match executions. |
| 🎯 **Job Matching Engine** | [docs/matching.md](docs/matching.md) | Weighted score computation logic, CSV inputs, and sheet export specifications. |
| ⚙️ **Deployment Guide** | [docs/deployment.md](docs/deployment.md) | Environment configuration variables list, prerequisites, and runtime settings. |
| 💻 **Developer Guide** | [docs/development.md](docs/development.md) | Local environment startup, command executions, scraper extension guides, and future roadmap. |
| 📜 **Architecture Decisions** | [docs/decisions.md](docs/decisions.md) | ADR ledger documenting historical decisions (AD-1 through AD-8). |
| 🤖 **AI Assistant Rules** | [AGENTS.md](AGENTS.md) | Required practices and checklist constraints for AI agents. |
| 🔄 **Changelog History** | [CHANGELOG.md](CHANGELOG.md) | Complete version progression and change description ledger. |
