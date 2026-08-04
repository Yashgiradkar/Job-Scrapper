import { ValidationError } from '../errors/app-error.js';

export interface Job {
  title: string;
  company: string;
  location?: string;
  description?: string;
  salary?: string;
  url: string;
  source: string;
  externalId?: string;
  postedAt?: Date;
  scrapedAt: Date;
}

export interface CreateJobInput {
  title: string;
  company: string;
  location?: string;
  description?: string;
  salary?: string;
  url: string;
  source: string;
  externalId?: string;
  postedAt?: Date;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function createJob(input: CreateJobInput): Job {
  const title = input.title.trim();
  const company = input.company.trim();
  const url = input.url.trim();
  const source = input.source.trim();

  if (!title) {
    throw new ValidationError('Job title is required');
  }

  if (!company) {
    throw new ValidationError('Job company is required');
  }

  if (!url) {
    throw new ValidationError('Job url is required');
  }

  if (!source) {
    throw new ValidationError('Job source is required');
  }

  return {
    title,
    company,
    location: trimOptional(input.location),
    description: trimOptional(input.description),
    salary: trimOptional(input.salary),
    url,
    source,
    externalId: trimOptional(input.externalId),
    postedAt: input.postedAt,
    scrapedAt: new Date(),
  };
}

export function createJobs(inputs: CreateJobInput[]): Job[] {
  return inputs.map(createJob);
}
