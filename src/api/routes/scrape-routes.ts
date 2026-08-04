import { Router } from 'express';
import { z } from 'zod';
import type { ScraperRunner } from '../../application/scraper-runner.js';
import { ValidationError } from '../../domain/errors/app-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

const scrapeRequestSchema = z.object({
  scrapers: z.array(z.string().trim().min(1)).optional(),
});

export function createScrapeRouter(scraperRunner: ScraperRunner): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (request, response) => {
      const result = scrapeRequestSchema.safeParse(request.body);

      if (!result.success) {
        throw new ValidationError('Invalid scrape request', result.error);
      }

      const runResult = await scraperRunner.run(result.data.scrapers);
      response.status(202).json(runResult);
    }),
  );

  return router;
}
