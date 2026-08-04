import type { BaseScraper } from '../domain/scrapers/base-scraper.js';
import { SampleJobsScraper } from './sample-jobs-scraper.js';

export function createScrapers(): BaseScraper[] {
  return [new SampleJobsScraper()];
}
