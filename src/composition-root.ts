import { ScraperRunner } from './application/scraper-runner.js';
import { JobMatchingEngine } from './application/job-matching-engine.js';
import { JobMatchService } from './application/job-match-service.js';
import { JobMatchRunManager } from './application/job-match-run-manager.js';
import { ApplyJobService } from './application/apply-job-service.js';
import { createScraperRegistry } from './domain/scrapers/scraper-registry.js';
import { createApp } from './api/app.js';
import { getBrowserManager } from './infrastructure/browser/browser-manager.js';
import { PrismaJobRepository } from './infrastructure/database/prisma-job-repository.js';
import { createScrapers } from './scrapers/index.js';

export function createApplication() {
  const jobRepository = new PrismaJobRepository();
  const browserManager = getBrowserManager();
  const scraperRegistry = createScraperRegistry(createScrapers());
  const scraperRunner = new ScraperRunner(
    scraperRegistry,
    browserManager,
    jobRepository,
  );
  const matchingEngine = new JobMatchingEngine();
  const jobMatchService = new JobMatchService(
    browserManager,
    jobRepository,
    matchingEngine,
  );
  const jobMatchRunManager = new JobMatchRunManager(jobMatchService);
  const applyJobService = new ApplyJobService();

  return createApp({
    jobRepository,
    scraperRunner,
    jobMatchRunManager,
    applyJobService,
  });
}
