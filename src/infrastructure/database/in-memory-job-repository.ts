import { randomUUID } from 'node:crypto';
import type { Job } from '../../domain/models/job.js';
import type {
  JobListOptions,
  JobListResult,
  JobRecord,
  JobRepository,
  SaveJobsResult,
} from '../../application/ports/job-repository.js';

function buildJobKey(job: Job): string {
  return `${job.source}:${job.url}`;
}

export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, JobRecord>();

  async saveMany(jobs: Job[]): Promise<SaveJobsResult> {
    let created = 0;
    let updated = 0;

    for (const job of jobs) {
      const key = buildJobKey(job);
      const existing = this.jobs.get(key);

      if (existing) {
        this.jobs.set(key, {
          ...existing,
          ...job,
        });
        updated += 1;
      } else {
        this.jobs.set(key, {
          id: randomUUID(),
          ...job,
        });
        created += 1;
      }
    }

    return { created, updated };
  }

  async findById(id: string): Promise<JobRecord | null> {
    for (const job of this.jobs.values()) {
      if (job.id === id) {
        return job;
      }
    }

    return null;
  }

  async findMany(options: JobListOptions = {}): Promise<JobListResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;

    let jobs = Array.from(this.jobs.values());

    if (options.source) {
      jobs = jobs.filter((job) => job.source === options.source);
    }

    jobs.sort(
      (left, right) => right.scrapedAt.getTime() - left.scrapedAt.getTime(),
    );

    const total = jobs.length;
    const start = (page - 1) * pageSize;
    const paginatedJobs = jobs.slice(start, start + pageSize);

    return {
      jobs: paginatedJobs,
      total,
      page,
      pageSize,
    };
  }

  clear(): void {
    this.jobs.clear();
  }
}
