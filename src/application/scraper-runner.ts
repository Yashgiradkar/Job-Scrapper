import { EventEmitter } from 'events';
import type { Page } from 'playwright';
import { ValidationError } from '../domain/errors/app-error.js';
import type { ScraperRegistry } from '../domain/scrapers/scraper-registry.js';
import type { BaseScraper } from '../domain/scrapers/base-scraper.js';
import type { BrowserManager } from '../infrastructure/browser/browser-manager.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { getConfig } from '../infrastructure/config/config.js';
import type {
  JobRepository,
  SaveJobsResult,
} from './ports/job-repository.js';

// ─── Public result types (unchanged) ─────────────────────────────────────────

export interface ScraperRunResult {
  name: string;
  success: boolean;
  jobsFound: number;
  jobsCreated: number;
  jobsUpdated: number;
  error?: string;
}

export interface ScrapeRunResult {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  scrapers: ScraperRunResult[];
  totals: {
    jobsFound: number;
    jobsCreated: number;
    jobsUpdated: number;
    scrapersSucceeded: number;
    scrapersFailed: number;
  };
}

// ─── New opt-in run options (additive, backwards-compatible) ──────────────────

export interface RunOptions {
  /** Cancel an in-progress run. Workers finish their current scraper then stop. */
  signal?: AbortSignal;
  /** Override the configured SCRAPER_CONCURRENCY for this specific run. */
  concurrency?: number;
}

// ─── Progress event payloads ─────────────────────────────────────────────────

export interface ScraperStartEvent {
  scraperName: string;
  completed: number;
  total: number;
}

export interface ScraperDoneEvent {
  result: ScraperRunResult;
  completed: number;
  total: number;
}

export interface ScraperFailEvent {
  scraperName: string;
  error: string;
  completed: number;
  total: number;
}

export interface RunCompleteEvent {
  result: ScrapeRunResult;
}

// ─── Internal queue ───────────────────────────────────────────────────────────

class ScraperQueue {
  private readonly items: BaseScraper[];

  constructor(scrapers: BaseScraper[]) {
    // Spread so we don't mutate the caller's array
    this.items = [...scrapers];
  }

  pop(): BaseScraper | undefined {
    return this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }
}

// ─── ScraperRunner (constructor unchanged) ────────────────────────────────────

export class ScraperRunner {
  private readonly logger = createLogger('scraper-runner');

  /** Subscribe to scraper lifecycle events for live progress. */
  readonly events = new EventEmitter();

  constructor(
    private readonly registry: ScraperRegistry,
    private readonly browserManager: BrowserManager,
    private readonly jobRepository: JobRepository,
  ) {}

  // ── Public API (run signature is backwards-compatible) ─────────────────────

  async run(scraperNames?: string[], options?: RunOptions): Promise<ScrapeRunResult> {
    const scrapers = this.registry.resolve(scraperNames);

    if (scrapers.length === 0) {
      throw new ValidationError('No scrapers available to run');
    }

    const concurrency = options?.concurrency ?? getConfig().scraper.concurrency;
    const signal = options?.signal;
    const total = scrapers.length;
    const queue = new ScraperQueue(scrapers);
    const startedAt = new Date();
    const scraperResults: ScraperRunResult[] = [];
    let completed = 0;

    this.logger.info(
      {
        scrapers: scrapers.map((s) => s.name),
        concurrency,
        total,
      },
      'Starting scrape run',
    );

    // ── Worker pool: spawn N workers, each draining the queue ──────────────

    const workers = Array.from({ length: Math.min(concurrency, total) }, () =>
      this.runWorker(queue, scraperResults, signal, () => {
        completed++;
        return { completed, total };
      }),
    );

    try {
      await Promise.all(workers);
    } finally {
      await this.browserManager.close();
    }

    // ── Aggregate & return ──────────────────────────────────────────────────

    const finishedAt = new Date();
    const totals = this.buildTotals(scraperResults);

    const runResult: ScrapeRunResult = {
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      scrapers: scraperResults,
      totals,
    };

    this.logger.info(
      { durationMs: runResult.durationMs, totals: runResult.totals },
      'Scrape run completed',
    );

    this.events.emit('run:complete', { result: runResult } satisfies RunCompleteEvent);

    return runResult;
  }

  // ── Worker: pops from the queue until empty or cancelled ──────────────────

  private async runWorker(
    queue: ScraperQueue,
    results: ScraperRunResult[],
    signal: AbortSignal | undefined,
    onComplete: () => { completed: number; total: number },
  ): Promise<void> {
    while (true) {
      // Respect cancellation before starting each unit of work
      if (signal?.aborted) {
        this.logger.warn('Worker stopped: AbortSignal received');
        break;
      }

      const scraper = queue.pop();
      if (!scraper) break; // queue exhausted

      const { completed, total } = onComplete(); // increment counter eagerly so events are accurate

      this.events.emit('scraper:start', {
        scraperName: scraper.name,
        completed: completed - 1, // pre-start count
        total,
      } satisfies ScraperStartEvent);

      const result = await this.runScraper(scraper);
      results.push(result);

      if (result.success) {
        this.events.emit('scraper:done', {
          result,
          completed,
          total,
        } satisfies ScraperDoneEvent);
      } else {
        this.events.emit('scraper:fail', {
          scraperName: scraper.name,
          error: result.error ?? 'Unknown error',
          completed,
          total,
        } satisfies ScraperFailEvent);
      }

      this.logger.info(
        {
          scraperName: scraper.name,
          success: result.success,
          progress: `${completed}/${total}`,
        },
        'Worker progress update',
      );
    }
  }

  // ── Per-scraper execution (identical logic to before) ─────────────────────

  private async runScraper(scraper: BaseScraper): Promise<ScraperRunResult> {
    this.logger.info({ scraper: scraper.name }, 'Running scraper');

    try {
      const jobs = await this.browserManager.withPage((page: Page) =>
        scraper.run(page),
      );

      const saveResult = await this.jobRepository.saveMany(jobs);

      this.logger.info(
        {
          scraper: scraper.name,
          jobsFound: jobs.length,
          jobsCreated: saveResult.created,
          jobsUpdated: saveResult.updated,
        },
        'Scraper completed successfully',
      );

      return this.buildScraperResult(scraper.name, true, jobs.length, saveResult);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown scraping error';

      this.logger.error({ scraper: scraper.name, err: error }, 'Scraper failed');

      return this.buildScraperResult(scraper.name, false, 0, { created: 0, updated: 0 }, message);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildScraperResult(
    name: string,
    success: boolean,
    jobsFound: number,
    saveResult: SaveJobsResult,
    error?: string,
  ): ScraperRunResult {
    return {
      name,
      success,
      jobsFound,
      jobsCreated: saveResult.created,
      jobsUpdated: saveResult.updated,
      error,
    };
  }

  private buildTotals(scraperResults: ScraperRunResult[]): ScrapeRunResult['totals'] {
    return scraperResults.reduce(
      (totals, result) => ({
        jobsFound: totals.jobsFound + result.jobsFound,
        jobsCreated: totals.jobsCreated + result.jobsCreated,
        jobsUpdated: totals.jobsUpdated + result.jobsUpdated,
        scrapersSucceeded: totals.scrapersSucceeded + (result.success ? 1 : 0),
        scrapersFailed: totals.scrapersFailed + (result.success ? 0 : 1),
      }),
      {
        jobsFound: 0,
        jobsCreated: 0,
        jobsUpdated: 0,
        scrapersSucceeded: 0,
        scrapersFailed: 0,
      },
    );
  }
}
