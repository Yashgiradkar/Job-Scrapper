import type { Page } from 'playwright';
import { ScraperError } from '../errors/app-error.js';
import {
  createJob,
  type CreateJobInput,
  type Job,
} from '../models/job.js';
import { JobNormalizer } from '../models/job-normalizer.js';

export abstract class BaseScraper {
  abstract readonly name: string;
  abstract readonly sourceUrl: string;

  abstract scrape(page: Page): Promise<Job[]>;

  async run(page: Page): Promise<Job[]> {
    try {
      return await this.scrape(page);
    } catch (error) {
      if (error instanceof ScraperError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown scraping error';

      throw new ScraperError(this.name, message, error);
    }
  }

  protected buildJob(
    input: Omit<CreateJobInput, 'source'>,
  ): Job {
    const normalizedInput = JobNormalizer.normalize({
      ...input,
      source: this.name,
    });
    return createJob(normalizedInput);
  }

  protected async goto(
    page: Page,
    url: string = this.sourceUrl,
  ): Promise<void> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  protected async extractText(
    page: Page,
    selector: string,
  ): Promise<string | undefined> {
    const element = page.locator(selector).first();
    const count = await element.count();

    if (count === 0) {
      return undefined;
    }

    const text = await element.textContent();
    const trimmed = text?.trim();
    return trimmed ? trimmed : undefined;
  }

  protected async extractAttribute(
    page: Page,
    selector: string,
    attribute: string,
  ): Promise<string | undefined> {
    const element = page.locator(selector).first();
    const count = await element.count();

    if (count === 0) {
      return undefined;
    }

    const value = await element.getAttribute(attribute);
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }
}
