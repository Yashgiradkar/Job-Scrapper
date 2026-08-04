import type { Locator, Page } from 'playwright';
import type { CompanyCareerPage } from '../domain/models/company-career-page.js';
import type { Job } from '../domain/models/job.js';
import { BaseScraper } from '../domain/scrapers/base-scraper.js';
import { fetchFromAtsIfSupported } from '../infrastructure/scraping/ats-job-source.js';

const JOB_LINK_PATTERN = /job|career|opening|position|role/i;

export class CompanyCareerPageScraper extends BaseScraper {
  readonly name: string;
  readonly sourceUrl: string;

  constructor(private readonly company: CompanyCareerPage) {
    super();
    this.name = company.company;
    this.sourceUrl = company.careerPageUrl;
  }

  async scrape(page: Page): Promise<Job[]> {
    const atsJobs = await fetchFromAtsIfSupported(this.company);

    if (atsJobs) {
      return atsJobs.map((job) => this.buildJob(job));
    }

    await this.goto(page);

    const jobCards = await page
      .locator('article, li, div')
      .filter({ has: page.locator('a[href]') })
      .evaluateAll((elements) =>
        elements
          .map((element) => ({
            text: element.textContent ?? '',
            href: element.querySelector('a[href]')?.getAttribute('href') ?? '',
          }))
          .filter((item) => /job|career|opening|position|role/i.test(item.text + item.href))
          .slice(0, 75),
      );

    const jobs: Job[] = [];

    for (const card of jobCards) {
      const title = extractLikelyTitle(card.text);

      if (!title) {
        continue;
      }

      jobs.push(
        this.buildJob({
          title,
          company: this.company.company,
          location: extractLikelyLocation(card.text),
          description: card.text,
          url: toAbsoluteUrl(card.href, this.sourceUrl),
          externalId: toAbsoluteUrl(card.href, this.sourceUrl),
        }),
      );
    }

    if (jobs.length > 0) {
      return dedupeJobs(jobs);
    }

    return this.extractFromLinks(page);
  }

  private async extractFromLinks(page: Page): Promise<Job[]> {
    const links = await page.locator('a[href]').all();
    const jobs: Job[] = [];

    for (const link of links.slice(0, 150)) {
      const job = await this.jobFromLink(link);

      if (job) {
        jobs.push(job);
      }
    }

    return dedupeJobs(jobs);
  }

  private async jobFromLink(link: Locator): Promise<Job | undefined> {
    const text = (await link.innerText()).trim();
    const href = await link.getAttribute('href');

    if (!href || !JOB_LINK_PATTERN.test(`${text} ${href}`)) {
      return undefined;
    }

    const title = extractLikelyTitle(text);

    if (!title) {
      return undefined;
    }

    return this.buildJob({
      title,
      company: this.company.company,
      description: text,
      url: toAbsoluteUrl(href, this.sourceUrl),
      externalId: toAbsoluteUrl(href, this.sourceUrl),
    });
  }
}

function extractLikelyTitle(text: string): string | undefined {
  const lines = text
    .split(/\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines.find((line) => line.length >= 4 && line.length <= 120);
  return title?.replace(/^apply\s+for\s+/i, '').trim();
}

function extractLikelyLocation(text: string): string | undefined {
  const lines = text
    .split(/\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.find((line) =>
    /remote|hybrid|onsite|india|united states|usa|canada|uk|europe|new york|san francisco|bengaluru|bangalore|pune|mumbai|delhi/i.test(
      line,
    ),
  );
}

function toAbsoluteUrl(href: string, baseUrl: string): string {
  return new URL(href, baseUrl).toString();
}

function dedupeJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.source}:${job.url}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
