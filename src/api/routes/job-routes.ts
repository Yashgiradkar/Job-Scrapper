import { Router } from 'express';
import { z } from 'zod';
import type { JobRepository } from '../../application/ports/job-repository.js';
import { NotFoundError, ValidationError } from '../../domain/errors/app-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

const listJobsQuerySchema = z.object({
  source: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export function createJobRouter(jobRepository: JobRepository): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (request, response) => {
      const result = listJobsQuerySchema.safeParse(request.query);

      if (!result.success) {
        throw new ValidationError('Invalid jobs query', result.error);
      }

      const jobs = await jobRepository.findMany(result.data);
      response.json(jobs);
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (request, response) => {
      const job = await jobRepository.findById(request.params.id);

      if (!job) {
        throw new NotFoundError('Job', request.params.id);
      }

      response.json(job);
    }),
  );

  return router;
}
