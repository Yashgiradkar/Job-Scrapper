import type { Job as PrismaJob } from '@prisma/client';
import type { Job } from '../../domain/models/job.js';
import type { JobRecord } from '../../application/ports/job-repository.js';

export function toJobRecord(record: PrismaJob): JobRecord {
  return {
    id: record.id,
    title: record.title,
    company: record.company,
    location: record.location ?? undefined,
    description: record.description ?? undefined,
    salary: record.salary ?? undefined,
    url: record.url,
    source: record.source,
    externalId: record.externalId ?? undefined,
    postedAt: record.postedAt ?? undefined,
    scrapedAt: record.scrapedAt,
  };
}

export function toPrismaJobData(job: Job) {
  return {
    title: job.title,
    company: job.company,
    location: job.location ?? null,
    description: job.description ?? null,
    salary: job.salary ?? null,
    url: job.url,
    source: job.source,
    externalId: job.externalId ?? null,
    postedAt: job.postedAt ?? null,
    scrapedAt: job.scrapedAt,
  };
}
