# AI Maintenance Rules

This document is the single source of truth for AI agents operating on this codebase.

Before making any code changes:
1. Read this entire document.
2. Read the project documentation structure under `docs/` (`architecture.md`, `scraping.md`, `api.md`, `matching.md`, `deployment.md`, `development.md`, `decisions.md`).
3. Understand the architecture, implementation layers, and decisions.
4. Preserve the documented architecture design decisions.
5. Reuse existing implementations.

---

# AI Development Workflow

## Documentation First (Mandatory)

Before implementing any feature, bug fix, or refactor:

1. Read `AGENTS.md`.
2. Read the relevant documentation based on the request:
   - `README.md` – project overview & setup
   - `docs/architecture.md` – architecture
   - `docs/scraping.md` – scraping pipeline
   - `docs/api.md` – APIs
   - `docs/matching.md` – matching
   - `docs/development.md` – development guidelines
   - `docs/decisions.md` – architecture decisions
   - `CHANGELOG.md` – recent changes
3. Inspect the existing implementation before writing code.
4. Reuse existing components whenever possible.
5. Never introduce duplicate logic or unnecessary abstractions.

## Before Coding

Always provide:

- Relevant documentation reviewed
- Existing implementation identified
- Files to modify/create
- Architecture impact
- Implementation plan

## After Coding

Before considering the task complete:

- Ensure the project builds successfully.
- Update all affected documentation.
- Update `AGENTS.md` if project state changed.
- Append an entry to `CHANGELOG.md`.
- Keep documentation synchronized with the codebase.

## Completion Checklist

- [ ] Code implemented
- [ ] Existing functionality preserved
- [ ] Documentation updated
- [ ] AGENTS.md synchronized
- [ ] CHANGELOG.md updated
- [ ] Build passes

A task is **not complete** until both the code and documentation are synchronized.

---

## Documentation Maintenance Rules

Whenever implementation changes are made, the AI agent must automatically determine which documentation files require updates. Do not wait for or require the user to explicitly request documentation updates; they are a core part of task completion. A task is not considered complete until all affected documentation files have been synchronized.

### Mapping of Changes to Documentation Files

- **Architecture changes** (e.g. folder structure, layers, dependency injection, feature list)
  → Update [docs/architecture.md](docs/architecture.md)
- **Scraping flow changes** (e.g. fallback strategies, ATS adapters, Apify, Crawlee, normalizers, reliability/retry settings)
  → Update [docs/scraping.md](docs/scraping.md)
- **API changes** (e.g. endpoint routes, request/response body schemas, query parameters)
  → Update [docs/api.md](docs/api.md)
- **Matching changes** (e.g. matching scoring algorithm, weight adjustments, exports, file templates)
  → Update [docs/matching.md](docs/matching.md)
- **Deployment changes** (e.g. environment variables, volume assets, system/docker requirements)
  → Update [docs/deployment.md](docs/deployment.md)
- **Architecture decisions change** (e.g. adding new ADRs, status updates to decisions)
  → Update [docs/decisions.md](docs/decisions.md)
- **Development context / Roadmap changes** (e.g. updating roadmap checklists, local setup, test run scripts)
  → Update [docs/development.md](docs/development.md)
- **Implementation history changes** (e.g. any code change, fix, or feature addition)
  → Append a new entry to [CHANGELOG.md](CHANGELOG.md) under the release date (never edit historical entries)
- **Project rules / state changes** (e.g. modifying code quality guidelines or checklist requirements)
  → Synchronize [AGENTS.md](AGENTS.md)

---

## Recommended Documentation Layout

All documentation files reside in the following repository paths:
```
job-scraper-platform/
│
├── README.md              # User-facing overview (short)
├── AGENTS.md              # AI source of truth
├── CHANGELOG.md           # Chronological implementation history
│
└── docs/
    ├── architecture.md    # System design, layers, DI, diagrams
    ├── scraping.md        # Scraping pipeline, ATS, Apify, Crawlee, Playwright
    ├── api.md             # API reference
    ├── matching.md        # Matching engine & exports
    ├── development.md     # Contribution guide & extension points
    ├── decisions.md       # Architecture Decision Records (ADRs)
    └── deployment.md      # Deployment, environment, operations
```
