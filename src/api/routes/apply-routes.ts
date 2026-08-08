import { Router } from 'express';
import { z } from 'zod';
import type { ApplyJobService } from '../../application/apply-job-service.js';
import { ValidationError } from '../../domain/errors/app-error.js';
import { asyncHandler } from '../middleware/async-handler.js';

const applyRequestSchema = z.object({
  jobUrl: z.string().trim().url({ message: 'Must be a valid URL' }),
});

export function createApplyRouter(applyJobService: ApplyJobService): Router {
  const router = Router();

  /**
   * POST /apply-job
   * Initiates the automation process to fill application form fields for a given job URL.
   * Stops at the preview / review step and returns session info.
   */
  router.post(
    '/',
    asyncHandler(async (request, response) => {
      const result = applyRequestSchema.safeParse(request.body);

      if (!result.success) {
        throw new ValidationError('Invalid apply request', result.error);
      }

      const runResult = await applyJobService.applyToJob(result.data.jobUrl);
      response.status(200).json(runResult);
    }),
  );

  /**
   * POST /apply-job/:sessionId/submit
   * Submits the job application after reviewing the preview state.
   */
  router.post(
    '/:sessionId/submit',
    asyncHandler(async (request, response) => {
      const { sessionId } = request.params;
      
      if (!sessionId) {
        throw new ValidationError('Session ID is required');
      }

      const runResult = await applyJobService.submitApplication(sessionId);
      response.status(200).json(runResult);
    }),
  );

  return router;
}
