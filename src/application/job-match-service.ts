import type { Page } from 'playwright';
import type { JobRepository } from './ports/job-repository.js';
import {
  JobMatchingEngine,
  type JobSearchCriteria,
  type MatchScore,
} from './job-matching-engine.js';
import {
  createCompanyCareerPage,
  parseCompanyCsv,
  type CompanyCareerPage,
} from '../domain/models/company-career-page.js';
import type { Job } from '../domain/models/job.js';
import { ValidationError } from '../domain/errors/app-error.js';
import type { BrowserManager } from '../infrastructure/browser/browser-manager.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { CompanyCareerPageScraper } from '../scrapers/company-career-page-scraper.js';

export interface JobMatchRequest {
  csv?: string;
  companies?: CompanyCareerPage[];
  criteria: JobSearchCriteria;
}

export interface MatchedJob {
  company: string;
  title: string;
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  experience?: string;
  location?: string;
  jobUrl: string;
  careerPageUrl: string;
  dateScraped: string;
  score: MatchScore;
  description?: string;
}

export interface JobMatchRunResult {
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  companiesProcessed: number;
  jobsFound: number;
  matchedJobs: number;
  successes: number;
  failures: number;
  results: MatchedJob[];
  logs: string[];
}

export class JobMatchService {
  private readonly logger = createLogger('job-match-service');

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly jobRepository: JobRepository,
    private readonly matchingEngine: JobMatchingEngine,
  ) {}

  async run(request: JobMatchRequest, signal?: AbortSignal): Promise<JobMatchRunResult> {
    const companies = this.resolveCompanies(request);

    if (companies.length === 0) {
      throw new ValidationError('At least one company career page is required');
    }

    const startedAt = new Date();
    const logs: string[] = [];
    const results: MatchedJob[] = [];
    let jobsFound = 0;
    let successes = 0;
    let failures = 0;

    this.log(logs, `Starting matching run for ${companies.length} companies`);

    try {
      for (const company of companies) {
        if (signal?.aborted) {
          this.log(logs, 'Matching run stopped by user');
          break;
        }

        try {
          this.log(logs, `Scraping ${company.company}`);
          const jobs = await this.scrapeCompany(company);
          jobsFound += jobs.length;
          successes += 1;

          await this.jobRepository.saveMany(jobs);

          for (const job of jobs) {
            // Skip jobs matching any blacklist from work_preferences.yaml
            if (this.isBlacklisted(job, request.criteria)) {
              continue;
            }

            const score = this.matchingEngine.match(job, request.criteria);

            if (score.overallMatchPercentage >= request.criteria.minimumMatchPercentage) {
              results.push(toMatchedJob(job, company.careerPageUrl, score));
            }
          }

          this.log(logs, `${company.company}: found ${jobs.length} jobs`);
        } catch (error) {
          failures += 1;
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.log(logs, `${company.company}: failed - ${message}`);
          this.logger.warn({ err: error, company }, 'Company scrape failed');
        }
      }
    } finally {
      await this.browserManager.close();
    }

    const finishedAt = new Date();

    return {
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      companiesProcessed: successes + failures,
      jobsFound,
      matchedJobs: results.length,
      successes,
      failures,
      results: results.sort((left, right) => right.matchPercentage - left.matchPercentage),
      logs,
    };
  }

  private resolveCompanies(request: JobMatchRequest): CompanyCareerPage[] {
    if (request.companies?.length) {
      return request.companies.map(createCompanyCareerPage);
    }

    if (request.csv) {
      return parseCompanyCsv(request.csv);
    }

    return [];
  }

  private async scrapeCompany(company: CompanyCareerPage): Promise<Job[]> {
    const scraper = new CompanyCareerPageScraper(company);
    return this.browserManager.withPage((page: Page) => scraper.run(page));
  }

  /**
   * Returns true if the job should be excluded based on blacklists in work_preferences.yaml.
   * Checks company name, job title keywords, and job location against the respective blacklists.
   */
  private isBlacklisted(job: import('../domain/models/job.js').Job, criteria: import('./job-matching-engine.js').JobSearchCriteria): boolean {
    const { companyBlacklist = [], titleBlacklist = [], locationBlacklist = [] } = criteria;

    const companyLower = job.company?.toLowerCase() ?? '';
    if (companyBlacklist.some((b) => companyLower.includes(b.toLowerCase()))) {
      return true;
    }

    const titleLower = job.title?.toLowerCase() ?? '';
    if (titleBlacklist.some((b) => titleLower.includes(b.toLowerCase()))) {
      return true;
    }

    const locationLower = job.location?.toLowerCase() ?? '';
    if (locationBlacklist.some((b) => locationLower.includes(b.toLowerCase()))) {
      return true;
    }

    return false;
  }

  private log(logs: string[], message: string): void {
    logs.push(`${new Date().toISOString()} ${message}`);
    this.logger.info({ message }, 'Match run progress');
  }
}

function toMatchedJob(job: Job, careerPageUrl: string, score: MatchScore): MatchedJob {
  return {
    company: job.company,
    title: job.title,
    matchPercentage: score.overallMatchPercentage,
    matchedSkills: score.matchedSkills,
    missingSkills: score.missingSkills,
    experience: extractExperience(job),
    location: job.location,
    jobUrl: job.url,
    careerPageUrl,
    dateScraped: job.scrapedAt.toISOString(),
    score,
    description: job.description,
  };
}

function extractExperience(job: Job): string | undefined {
  const text = [job.title, job.description].filter(Boolean).join(' ');
  const match = text.match(/\b\d+\+?\s*(?:years|yrs|year)\b/i);
  return match?.[0];
}
