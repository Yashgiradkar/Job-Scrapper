import { NotFoundError, ValidationError } from '../errors/app-error.js';
import type { BaseScraper } from './base-scraper.js';

export class ScraperRegistry {
  private readonly scrapers = new Map<string, BaseScraper>();

  register(scraper: BaseScraper): this {
    if (this.scrapers.has(scraper.name)) {
      throw new ValidationError(
        `Scraper '${scraper.name}' is already registered`,
      );
    }

    this.scrapers.set(scraper.name, scraper);
    return this;
  }

  registerMany(scrapers: BaseScraper[]): this {
    for (const scraper of scrapers) {
      this.register(scraper);
    }
    return this;
  }

  get(name: string): BaseScraper {
    const scraper = this.scrapers.get(name);

    if (!scraper) {
      throw new NotFoundError('Scraper', name);
    }

    return scraper;
  }

  has(name: string): boolean {
    return this.scrapers.has(name);
  }

  getAll(): BaseScraper[] {
    return Array.from(this.scrapers.values());
  }

  getNames(): string[] {
    return Array.from(this.scrapers.keys());
  }

  resolve(names?: string[]): BaseScraper[] {
    if (!names || names.length === 0) {
      return this.getAll();
    }

    return names.map((name) => this.get(name));
  }
}

export function createScraperRegistry(
  scrapers: BaseScraper[] = [],
): ScraperRegistry {
  return new ScraperRegistry().registerMany(scrapers);
}
