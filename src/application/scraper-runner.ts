import type { Page } from 'playwright';
import { ValidationError } from '../domain/errors/app-error.js';
import type { ScraperRegistry } from '../domain/scrapers/scraper-registry.js';
import type { BaseScraper } from '../domain/scrapers/base-scraper.js';
import type { BrowserManager } from '../infrastructure/browser/browser-manager.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import type {
  JobRepository,
  SaveJobsResult,
} from './ports/job-repository.js';

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

export class ScraperRunner {
  private readonly logger = createLogger('scraper-runner');

  constructor(
    private readonly registry: ScraperRegistry,
    private readonly browserManager: BrowserManager,
    private readonly jobRepository: JobRepository,
  ) {}

  async run(scraperNames?: string[]): Promise<ScrapeRunResult> {
    const scrapers = this.registry.resolve(scraperNames);

    if (scrapers.length === 0) {
      throw new ValidationError('No scrapers available to run');
    }

    const startedAt = new Date();
    const scraperResults: ScraperRunResult[] = [];

    this.logger.info(
      { scrapers: scrapers.map((scraper) => scraper.name) },
      'Starting scrape run',
    );

    try {
      for (const scraper of scrapers) {
        const result = await this.runScraper(scraper);
        scraperResults.push(result);
      }
    } finally {
      await this.browserManager.close();
    }

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
      {
        durationMs: runResult.durationMs,
        totals: runResult.totals,
      },
      'Scrape run completed',
    );

    return runResult;
  }

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

      this.logger.error(
        { scraper: scraper.name, err: error },
        'Scraper failed',
      );

      return this.buildScraperResult(scraper.name, false, 0, {
        created: 0,
        updated: 0,
      }, message);
    }
  }

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

  private buildTotals(
    scraperResults: ScraperRunResult[],
  ): ScrapeRunResult['totals'] {
    return scraperResults.reduce(
      (totals, result) => ({
        jobsFound: totals.jobsFound + result.jobsFound,
        jobsCreated: totals.jobsCreated + result.jobsCreated,
        jobsUpdated: totals.jobsUpdated + result.jobsUpdated,
        scrapersSucceeded:
          totals.scrapersSucceeded + (result.success ? 1 : 0),
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
