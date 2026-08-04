import type { Job } from '../../domain/models/job.js';

export interface SaveJobsResult {
  created: number;
  updated: number;
}

export interface JobRecord extends Job {
  id: string;
}

export interface JobListOptions {
  source?: string;
  page?: number;
  pageSize?: number;
}

export interface JobListResult {
  jobs: JobRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobRepository {
  saveMany(jobs: Job[]): Promise<SaveJobsResult>;
  findById(id: string): Promise<JobRecord | null>;
  findMany(options?: JobListOptions): Promise<JobListResult>;
}
