import type { Locator, Page } from 'playwright';
import type { CompanyCareerPage } from '../domain/models/company-career-page.js';
import type { Job } from '../domain/models/job.js';
import { BaseScraper } from '../domain/scrapers/base-scraper.js';
import { fetchFromAtsIfSupported } from '../infrastructure/scraping/ats-job-source.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import { getConfig } from '../infrastructure/config/config.js';
import {
  getActorRunner,
  getDatasetReader,
} from '../infrastructure/apify/index.js';
import { getCrawleeRunner, type CrawleeJobInput } from '../infrastructure/crawlee/index.js';

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

    const actorId = this.getMappedActorId();
    if (actorId) {
      try {
        const apifyJobs = await this.scrapeWithApify(actorId);
        if (apifyJobs.length > 0) {
          return apifyJobs;
        }
      } catch (error) {
        const logger = createLogger('company-career-page-scraper');
        logger.error(
          { company: this.company.company, actorId, err: error },
          'Apify scraping failed; falling back to Crawlee',
        );
      }
    }

    // Try Crawlee runner
    try {
      const crawleeJobs = await this.scrapeWithCrawlee();
      if (crawleeJobs.length > 0) {
        return crawleeJobs;
      }
    } catch (error) {
      const logger = createLogger('company-career-page-scraper');
      logger.error(
        { company: this.company.company, err: error },
        'Crawlee scraping failed; falling back to direct Playwright',
      );
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

  private getMappedActorId(): string | undefined {
    try {
      const appConfig = getConfig();
      const mapping = appConfig.apify?.actorMapping;
      if (!mapping || Object.keys(mapping).length === 0) {
        return undefined;
      }

      // 1. Check company name matching (normalized case-insensitive)
      const companyKey = this.company.company.toLowerCase().trim();
      if (mapping[companyKey]) {
        return mapping[companyKey];
      }

      // 2. Check career page URL domain name
      const parsedUrl = new URL(this.sourceUrl);
      const hostname = parsedUrl.hostname.toLowerCase();

      // Check exact hostname (e.g. boards.greenhouse.io)
      if (mapping[hostname]) {
        return mapping[hostname];
      }

      // Check apex domain (e.g. greenhouse.io)
      const domainParts = hostname.split('.');
      if (domainParts.length >= 2) {
        const apexDomain = domainParts.slice(-2).join('.');
        if (mapping[apexDomain]) {
          return mapping[apexDomain];
        }
      }
    } catch (error) {
      // Squelch errors
    }
    return undefined;
  }

  private async scrapeWithApify(actorId: string): Promise<Job[]> {
    const logger = createLogger('company-career-page-scraper');
    logger.info(
      { company: this.company.company, actorId },
      'Starting Apify Actor scrape',
    );

    const runner = getActorRunner();
    const reader = getDatasetReader();

    const input = {
      startUrls: [{ url: this.sourceUrl }],
    };

    const runResult = await runner.run(actorId, input);
    logger.info(
      {
        company: this.company.company,
        runId: runResult.id,
        datasetId: runResult.defaultDatasetId,
      },
      'Apify Actor run completed; retrieving dataset items',
    );

    const items = await reader.readItems(runResult.defaultDatasetId);
    const jobs: Job[] = [];

    for (const item of items) {
      const title = item.title || item.jobTitle || item.position;
      const url = item.url || item.jobUrl || item.link;

      if (!title || !url) {
        continue;
      }

      const location = item.location || item.jobLocation || item.city;
      const description = item.description || item.jobDescription || item.body;
      const salary = item.salary || item.pay || item.compensation;
      const externalId = item.externalId || item.id || item.jobId;

      let postedAt: Date | undefined;
      const postedAtRaw = item.postedAt || item.date || item.postDate;
      if (postedAtRaw) {
        const parsedDate = new Date(postedAtRaw);
        if (!isNaN(parsedDate.getTime())) {
          postedAt = parsedDate;
        }
      }

      jobs.push(
        this.buildJob({
          title: String(title),
          company: this.company.company,
          location: location ? String(location) : undefined,
          description: description ? String(description) : undefined,
          salary: salary ? String(salary) : undefined,
          url: toAbsoluteUrl(String(url), this.sourceUrl),
          externalId: externalId ? String(externalId) : undefined,
          postedAt,
        }),
      );
    }

    logger.info(
      { company: this.company.company, jobsFound: jobs.length },
      'Successfully completed and mapped Apify Actor jobs',
    );

    return jobs;
  }

  private async scrapeWithCrawlee(): Promise<Job[]> {
    const logger = createLogger('company-career-page-scraper');
    logger.info(
      { company: this.company.company },
      'Starting Crawlee fallback scrape',
    );

    const runner = getCrawleeRunner();

    const crawledJobs = await runner.crawl(this.sourceUrl, async (htmlOrPage, crawlerType) => {
      if (crawlerType === 'cheerio') {
        return extractFromCheerio(htmlOrPage, this.sourceUrl);
      } else {
        return extractFromPlaywright(htmlOrPage, this.sourceUrl);
      }
    });

    const jobs = crawledJobs.map((cj) =>
      this.buildJob({
        title: cj.title,
        company: this.company.company,
        location: cj.location,
        description: cj.description,
        url: cj.url,
        externalId: cj.externalId,
      }),
    );

    logger.info(
      { company: this.company.company, jobsFound: jobs.length },
      'Successfully completed and mapped Crawlee jobs',
    );

    return dedupeJobs(jobs);
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

function extractFromCheerio($: any, sourceUrl: string): CrawleeJobInput[] {
  const cards: { text: string; href: string }[] = [];
  $('article, li, div').each((_: number, element: any) => {
    const el = $(element);
    const link = el.find('a[href]').first();
    if (link.length > 0) {
      const text = el.text() || '';
      const href = link.attr('href') || '';
      if (/job|career|opening|position|role/i.test(text + href)) {
        cards.push({ text, href });
      }
    }
  });

  const jobs: CrawleeJobInput[] = [];

  for (const card of cards.slice(0, 75)) {
    const title = extractLikelyTitle(card.text);
    if (!title) {
      continue;
    }
    jobs.push({
      title,
      location: extractLikelyLocation(card.text),
      description: card.text,
      url: toAbsoluteUrl(card.href, sourceUrl),
      externalId: toAbsoluteUrl(card.href, sourceUrl),
    });
  }

  if (jobs.length > 0) {
    return jobs;
  }

  const JOB_LINK_PATTERN = /job|career|opening|position|role/i;
  $('a[href]').slice(0, 150).each((_: number, element: any) => {
    const link = $(element);
    const text = link.text()?.trim() || '';
    const href = link.attr('href') || '';
    if (JOB_LINK_PATTERN.test(`${text} ${href}`)) {
      const title = extractLikelyTitle(text);
      if (title) {
        jobs.push({
          title,
          description: text,
          url: toAbsoluteUrl(href, sourceUrl),
          externalId: toAbsoluteUrl(href, sourceUrl),
        });
      }
    }
  });

  return jobs;
}

async function extractFromPlaywright(page: Page, sourceUrl: string): Promise<CrawleeJobInput[]> {
  await page.goto(sourceUrl, { waitUntil: 'domcontentloaded' });
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

  const jobs: CrawleeJobInput[] = [];

  for (const card of jobCards) {
    const title = extractLikelyTitle(card.text);

    if (!title) {
      continue;
    }

    jobs.push({
      title,
      location: extractLikelyLocation(card.text),
      description: card.text,
      url: toAbsoluteUrl(card.href, sourceUrl),
      externalId: toAbsoluteUrl(card.href, sourceUrl),
    });
  }

  if (jobs.length > 0) {
    return jobs;
  }

  const JOB_LINK_PATTERN = /job|career|opening|position|role/i;
  const links = await page.locator('a[href]').all();
  for (const link of links.slice(0, 150)) {
    const text = (await link.innerText()).trim();
    const href = await link.getAttribute('href');

    if (!href || !JOB_LINK_PATTERN.test(`${text} ${href}`)) {
      continue;
    }

    const title = extractLikelyTitle(text);

    if (!title) {
      continue;
    }

    jobs.push({
      title,
      description: text,
      url: toAbsoluteUrl(href, sourceUrl),
      externalId: toAbsoluteUrl(href, sourceUrl),
    });
  }

  return jobs;
}
