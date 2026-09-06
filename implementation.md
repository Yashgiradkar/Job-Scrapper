# Implementation Plan — Phase 0: Core Framework

This document outlines the detailed roadmap, tasks, and directory structure for building the modular, production-ready **Core Framework (Phase 0)** of the AI Job Automation Platform.

---

## 1. Browser Layer
Robust browser wrapper to handle automation session states, persistent states, storage, proxies, window tabs, downloads, and uploads.

- [x] **Core Configuration (`src/core/config/core-config.ts`)**
- [x] **Context Manager (`src/core/browser/context-manager.ts`)**
- [ ] **Browser Manager (`src/core/browser/browser-manager.ts`)** — launches Browser, manages context lifecycles, and serves as base launcher.
- [ ] **Session & Cookie Manager (`src/core/browser/session-manager.ts`)** — manages session persistence, loading, cookies extraction, saving, and local/session storage injection.
- [ ] **Proxy & Network Manager (`src/core/browser/network-manager.ts`)** — handles dynamic proxy configurations, intercepting requests/responses, and network idle state detection.
- [ ] **Tab & Window Manager (`src/core/browser/window-manager.ts`)** — manages multiple tabs/pages, switching contexts, and tracking popup windows.
- [ ] **Download & Upload Manager (`src/core/browser/transfer-manager.ts`)** — handles automated downloads, streaming files, and preparing upload assets safely.

---

## 2. Action Engine
Provides low-level, self-healing user interaction actions. All actions automatically run with retry wrappers and dynamic wait actions.

- [ ] **Abstract Action Base (`src/core/actions/base-action.ts`)**
- [ ] **Interactive Actions (`src/core/actions/interactive-actions.ts`)**
  - `ClickAction`
  - `FillAction`
  - `HoverAction`
  - `KeyboardAction`
  - `MouseAction`
  - `ScrollAction`
- [ ] **Utility Actions (`src/core/actions/utility-actions.ts`)**
  - `UploadAction`
  - `DownloadAction`
  - `WaitAction`
  - `RetryAction`

---

## 3. Selector Engine
Resolves web selectors from external configurations. **No selectors should be hardcoded in any automation logic.**

- [ ] **Selector Core (`src/core/selectors/selector-resolver.ts`)**
  - `SelectorResolver` — resolves names to target selector strings based on current URL or portal ID.
  - `SelectorRegistry` — stores and validates available selectors.
- [ ] **Dynamic Builder (`src/core/selectors/dynamic-builder.ts`)**
  - `DynamicSelectorBuilder` — compiles complex or parameterized selectors (e.g. xpath, text matches).

---

## 4. Form Engine
Heuristics-driven form interactive handlers that know how to identify, fill, select, check, and upload fields dynamically inside multi-page wizard forms.

- [ ] **Field Handlers (`src/core/forms/field-handlers.ts`)**
  - `TextboxHandler`
  - `DropdownHandler`
  - `CheckboxHandler`
  - `RadioHandler`
  - `DatePickerHandler`
  - `AutocompleteHandler`
- [ ] **Upload & Wizard Handlers (`src/core/forms/wizard-handlers.ts`)**
  - `FileUploader`
  - `ConditionalQuestionsHandler`
  - `MultiPageFormsWizard`

---

## 5. AI Layer (Interfaces Only)
Abstract interfaces for the AI-assisted parsing, matching, and question-answering logic. No direct API implementations.

- [ ] **AI Service Interfaces (`src/core/ai/interfaces.ts`)**
  - `AIService`
  - `QuestionAnalyzer`
  - `ResumeMatcher`
  - `JobScorer`
  - `CoverLetterGenerator`
  - `AnswerGenerator`
  - `QuestionClassifier`
  - `JobSummarizer`

---

## 6. Resume & Candidate Engine
Handles raw resume file metadata parsing, version control, and typed candidate profile models.

- [ ] **Resume Engine (`src/core/resume/resume-manager.ts`)**
  - `ResumeParser`
  - `ResumeSelector`
  - `ResumeUploader`
  - `ResumeValidator`
  - `ResumeVersionManager`
- [ ] **Candidate Engine (`src/core/candidate/candidate-profile.ts`)**
  - Data models for Personal Info, Skills, Experience, Education, Projects, Salary, Notice Period, Visa, Portfolio, GitHub, LinkedIn, and Preferences.

---

## 7. Application Engine
Validates job descriptions against candidates, tracks submission state, and prevents double-applying.

- [ ] **Application Core (`src/core/application-engine/app-coordinator.ts`)**
  - `EligibilityChecker`
  - `QuestionResolver`
  - `ApplicationTracker`
  - `DuplicateDetector`
  - `ApplicationVerifier`

---

## 8. Persistence Layer
Maintains system data. SQLite backend using the Repository Pattern with migration paths to PostgreSQL.

- [ ] **Database Schema & client (`src/core/persistence/db-client.ts`)**
- [ ] **Repositories (`src/core/persistence/repositories/`)**
  - `JobRepository`
  - `ApplicationRepository`
  - `CandidateRepository`
  - `ResumeRepository`

---

## 9. Logging & Metrics
Structured execution history logging, DOM snapshots, HTML source saving, and metrics calculations.

- [ ] **Logging System (`src/core/logging/execution-logger.ts`)**
  - `ExecutionLogs`
  - `ScreenshotRecorder`
  - `NetworkConsoleSniffer`
  - `DOMSnapshotSaver`
  - `PerformanceMetricsCollector`
