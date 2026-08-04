import type { Job } from '../../domain/models/job.js';
import type {
  JobListOptions,
  JobListResult,
  JobRecord,
  JobRepository,
  SaveJobsResult,
} from '../../application/ports/job-repository.js';
import { getPrismaClient } from './prisma-client.js';
import { toJobRecord, toPrismaJobData } from './job-mapper.js';

export class PrismaJobRepository implements JobRepository {
  private readonly prisma = getPrismaClient();

  async saveMany(jobs: Job[]): Promise<SaveJobsResult> {
    let created = 0;
    let updated = 0;

    for (const job of jobs) {
      const existing = await this.prisma.job.findUnique({
        where: {
          source_url: {
            source: job.source,
            url: job.url,
          },
        },
        select: { id: true },
      });

      await this.prisma.job.upsert({
        where: {
          source_url: {
            source: job.source,
            url: job.url,
          },
        },
        create: toPrismaJobData(job),
        update: toPrismaJobData(job),
      });

      if (existing) {
        updated += 1;
      } else {
        created += 1;
      }
    }

    return { created, updated };
  }

  async findById(id: string): Promise<JobRecord | null> {
    const record = await this.prisma.job.findUnique({
      where: { id },
    });

    return record ? toJobRecord(record) : null;
  }

  async findMany(options: JobListOptions = {}): Promise<JobListResult> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = options.source ? { source: options.source } : undefined;

    const [records, total] = await this.prisma.$transaction([
      this.prisma.job.findMany({
        where,
        orderBy: { scrapedAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      jobs: records.map(toJobRecord),
      total,
      page,
      pageSize,
    };
  }
}
