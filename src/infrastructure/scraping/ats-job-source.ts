import type { CreateJobInput } from '../../domain/models/job.js';
import type { CompanyCareerPage } from '../../domain/models/company-career-page.js';
import { createLogger } from '../logging/logger.js';

export interface AtsJobSource {
  canHandle(careerPageUrl: string): boolean;
  fetchJobs(company: CompanyCareerPage): Promise<Omit<CreateJobInput, 'source'>[]>;
}

const logger = createLogger('ats-job-source');

export class GreenhouseJobSource implements AtsJobSource {
  canHandle(careerPageUrl: string): boolean {
    return careerPageUrl.includes('greenhouse.io') || careerPageUrl.includes('boards.greenhouse');
  }

  async fetchJobs(company: CompanyCareerPage): Promise<Omit<CreateJobInput, 'source'>[]> {
    const boardToken = extractLastPathSegment(company.careerPageUrl);

    if (!boardToken) {
      return [];
    }

    const response = await fetchJson<GreenhouseResponse>(
      `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`,
    );

    return response.jobs.map((job) => ({
      title: job.title,
      company: company.company,
      location: job.location?.name,
      description: stripHtml(job.content),
      url: job.absolute_url,
      externalId: String(job.id),
    }));
  }
}

export class LeverJobSource implements AtsJobSource {
  canHandle(careerPageUrl: string): boolean {
    return careerPageUrl.includes('lever.co');
  }

  async fetchJobs(company: CompanyCareerPage): Promise<Omit<CreateJobInput, 'source'>[]> {
    const companySlug = extractLeverCompanySlug(company.careerPageUrl);

    if (!companySlug) {
      return [];
    }

    const jobs = await fetchJson<LeverJob[]>(
      `https://api.lever.co/v0/postings/${companySlug}?mode=json`,
    );

    return jobs.map((job) => ({
      title: job.text,
      company: company.company,
      location: job.categories?.location,
      description: stripHtml(job.descriptionPlain ?? job.description ?? ''),
      url: job.hostedUrl,
      externalId: job.id,
    }));
  }
}

export class AshbyJobSource implements AtsJobSource {
  canHandle(careerPageUrl: string): boolean {
    return careerPageUrl.includes('ashbyhq.com');
  }

  async fetchJobs(company: CompanyCareerPage): Promise<Omit<CreateJobInput, 'source'>[]> {
    const organization = extractLastPathSegment(company.careerPageUrl);

    if (!organization) {
      return [];
    }

    const response = await fetchJson<AshbyResponse>(
      `https://api.ashbyhq.com/posting-api/job-board/${organization}`,
    );

    return response.jobs.map((job) => ({
      title: job.title,
      company: company.company,
      location: job.location,
      description: stripHtml(job.descriptionHtml ?? ''),
      url: job.jobUrl,
      externalId: job.id,
    }));
  }
}

export class WorkdayJobSource implements AtsJobSource {
  canHandle(careerPageUrl: string): boolean {
    return careerPageUrl.includes('myworkdayjobs.com');
  }

  async fetchJobs(company: CompanyCareerPage): Promise<Omit<CreateJobInput, 'source'>[]> {
    const endpoint = buildWorkdayEndpoint(company.careerPageUrl);

    if (!endpoint) {
      return [];
    }

    const response = await fetchJson<WorkdayResponse>(endpoint.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: 100, offset: 0, searchText: '' }),
    });

    return response.jobPostings.map((job) => ({
      title: job.title,
      company: company.company,
      location: job.locationsText,
      description: [job.title, job.locationsText].filter(Boolean).join(' '),
      url: new URL(job.externalPath, endpoint.origin).toString(),
      externalId: job.bulletFields?.join('|') ?? job.externalPath,
    }));
  }
}

export function createDefaultAtsJobSources(): AtsJobSource[] {
  return [
    new GreenhouseJobSource(),
    new LeverJobSource(),
    new WorkdayJobSource(),
    new AshbyJobSource(),
  ];
}

export async function fetchFromAtsIfSupported(
  company: CompanyCareerPage,
  sources: AtsJobSource[] = createDefaultAtsJobSources(),
): Promise<Omit<CreateJobInput, 'source'>[] | undefined> {
  const source = sources.find((candidate) => candidate.canHandle(company.careerPageUrl));

  if (!source) {
    return undefined;
  }

  try {
    return await source.fetchJobs(company);
  } catch (error) {
    logger.warn(
      { err: error, company: company.company, careerPageUrl: company.careerPageUrl },
      'ATS API fetch failed; falling back to browser scraping',
    );
    return undefined;
  }
}

interface GreenhouseResponse {
  jobs: Array<{
    id: number;
    title: string;
    absolute_url: string;
    content?: string;
    location?: { name?: string };
  }>;
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  description?: string;
  descriptionPlain?: string;
  categories?: {
    location?: string;
  };
}

interface AshbyResponse {
  jobs: Array<{
    id: string;
    title: string;
    location?: string;
    descriptionHtml?: string;
    jobUrl: string;
  }>;
}

interface WorkdayResponse {
  jobPostings: Array<{
    title: string;
    externalPath: string;
    locationsText?: string;
    bulletFields?: string[];
  }>;
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': 'job-scraper-platform/0.1',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function extractLastPathSegment(url: string): string | undefined {
  const parsedUrl = new URL(url);
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  return segments.at(-1);
}

function extractLeverCompanySlug(url: string): string | undefined {
  const parsedUrl = new URL(url);
  const segments = parsedUrl.pathname.split('/').filter(Boolean);

  if (parsedUrl.hostname === 'jobs.lever.co') {
    return segments[0];
  }

  return segments.at(-1);
}

function buildWorkdayEndpoint(
  url: string,
): { apiUrl: string; origin: string } | undefined {
  const parsedUrl = new URL(url);
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  const site = segments.at(-1);
  const tenant = parsedUrl.hostname.split('.')[0];

  if (!site || !tenant) {
    return undefined;
  }

  return {
    origin: parsedUrl.origin,
    apiUrl: `${parsedUrl.origin}/wday/cxs/${tenant}/${site}/jobs`,
  };
}

function stripHtml(html: string | undefined): string | undefined {
  const stripped = html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || undefined;
}
