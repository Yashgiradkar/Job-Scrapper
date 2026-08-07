import { Router } from 'express';
import { z } from 'zod';
import type { JobMatchRunManager } from '../../application/job-match-run-manager.js';
import {
  exportMatchedJobsToCsv,
  exportMatchedJobsToExcelHtml,
} from '../../application/export/matched-jobs-exporter.js';
import { ValidationError } from '../../domain/errors/app-error.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { loadUserProfile } from '../../infrastructure/config/profile-loader.js';

const matchRequestSchema = z.object({
  csv: z.string().optional(),
  companies: z
    .array(
      z.object({
        company: z.string().trim().min(1),
        careerPageUrl: z.string().trim().url(),
      }),
    )
    .optional(),
  criteria: z.object({
    roles: z.array(z.string().trim().min(1)).default([]),
    skills: z.array(z.string().trim().min(1)).default([]),
    locations: z.array(z.string().trim().min(1)).default([]),
    experience: z.string().trim().optional(),
    remote: z.boolean().optional(),
    minimumMatchPercentage: z.coerce.number().min(0).max(100).default(70),
    companyBlacklist: z.array(z.string().trim().min(1)).default([]),
    titleBlacklist: z.array(z.string().trim().min(1)).default([]),
    locationBlacklist: z.array(z.string().trim().min(1)).default([]),
  }),
});

export function createMatchRouter(runManager: JobMatchRunManager): Router {
  const router = Router();

  /**
   * GET /match/profile
   * Returns pre-filled search criteria loaded from plain_text_resume.yaml and work_preferences.yaml.
   * The frontend uses this to auto-populate the search form on page load.
   */
  router.get(
    '/profile',
    asyncHandler(async (_request, response) => {
      const profile = loadUserProfile();
      response.json(profile.criteria);
    }),
  );

  router.post(
    '/runs',
    asyncHandler(async (request, response) => {
      const result = matchRequestSchema.safeParse(request.body);

      if (!result.success) {
        throw new ValidationError('Invalid match request', result.error);
      }

      response.status(202).json(runManager.start(result.data));
    }),
  );

  router.get(
    '/runs/:id',
    asyncHandler(async (request, response) => {
      response.json(runManager.get(request.params.id));
    }),
  );

  router.post(
    '/runs/:id/stop',
    asyncHandler(async (request, response) => {
      response.json(runManager.stop(request.params.id));
    }),
  );

  router.get(
    '/runs/:id/export.csv',
    asyncHandler(async (request, response) => {
      const run = runManager.get(request.params.id);
      const jobs = run.result?.results ?? [];

      response.header('content-type', 'text/csv');
      response.attachment(`matched-jobs-${run.id}.csv`);
      response.send(exportMatchedJobsToCsv(jobs));
    }),
  );

  router.get(
    '/runs/:id/export.xls',
    asyncHandler(async (request, response) => {
      const run = runManager.get(request.params.id);
      const jobs = run.result?.results ?? [];

      response.header('content-type', 'application/vnd.ms-excel');
      response.attachment(`matched-jobs-${run.id}.xls`);
      response.send(exportMatchedJobsToExcelHtml(jobs));
    }),
  );

  return router;
}
