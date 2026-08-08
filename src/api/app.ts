import express from 'express';
import path from 'node:path';
import type { JobRepository } from '../application/ports/job-repository.js';
import type { ScraperRunner } from '../application/scraper-runner.js';
import type { JobMatchRunManager } from '../application/job-match-run-manager.js';
import type { ApplyJobService } from '../application/apply-job-service.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { createJobRouter } from './routes/job-routes.js';
import { createMatchRouter } from './routes/match-routes.js';
import { createScrapeRouter } from './routes/scrape-routes.js';
import { createApplyRouter } from './routes/apply-routes.js';

export interface AppDependencies {
  jobRepository: JobRepository;
  scraperRunner: ScraperRunner;
  jobMatchRunManager: JobMatchRunManager;
  applyJobService: ApplyJobService;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const publicPath = path.resolve(process.cwd(), 'public');

  app.use(express.json({ limit: '5mb' }));
  app.use(requestLogger);
  app.use(express.static(publicPath));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.use('/scrape', createScrapeRouter(dependencies.scraperRunner));
  app.use('/jobs', createJobRouter(dependencies.jobRepository));
  app.use('/match', createMatchRouter(dependencies.jobMatchRunManager));
  app.use('/apply-job', createApplyRouter(dependencies.applyJobService));
  app.use(errorHandler);

  return app;
}
