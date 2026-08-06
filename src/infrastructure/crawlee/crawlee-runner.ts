import { PlaywrightCrawler, CheerioCrawler, ProxyConfiguration } from 'crawlee';
import { getConfig } from '../config/config.js';
import { createLogger } from '../logging/logger.js';

export interface CrawleeJobInput {
  title: string;
  location?: string;
  description?: string;
  url: string;
  externalId?: string;
}

export class CrawleeRunner {
  private readonly logger = createLogger('crawlee-runner');

  async crawl(
    url: string,
    extractor: (htmlOrPage: any, crawlerType: 'cheerio' | 'playwright') => Promise<CrawleeJobInput[]>,
  ): Promise<CrawleeJobInput[]> {
    const config = getConfig();
    const crawlerType = config.crawlee.crawlerType;
    const maxRetries = config.crawlee.maxRetries;
    const proxyUrl = config.crawlee.proxyUrl;
    const maxConcurrency = config.crawlee.maxConcurrency;

    this.logger.info(
      { url, crawlerType, maxRetries, maxConcurrency },
      'Starting Crawlee crawl run',
    );

    const proxyConfiguration = proxyUrl
      ? new ProxyConfiguration({ proxyUrls: [proxyUrl] })
      : undefined;

    const jobs: CrawleeJobInput[] = [];

    if (crawlerType === 'cheerio') {
      const crawler = new CheerioCrawler({
        maxRequestRetries: maxRetries,
        useSessionPool: true,
        sessionPoolOptions: {
          maxPoolSize: 50,
        },
        minConcurrency: 1,
        maxConcurrency,
        proxyConfiguration,
        requestHandler: async ({ $, request }) => {
          this.logger.debug({ url: request.url }, 'CheerioCrawler handling request');
          const extracted = await extractor($, 'cheerio');
          jobs.push(...extracted);
        },
      });

      await crawler.run([url]);
    } else {
      const crawler = new PlaywrightCrawler({
        maxRequestRetries: maxRetries,
        useSessionPool: true,
        sessionPoolOptions: {
          maxPoolSize: 50,
        },
        minConcurrency: 1,
        maxConcurrency,
        proxyConfiguration,
        requestHandler: async ({ page, request }) => {
          this.logger.debug({ url: request.url }, 'PlaywrightCrawler handling request');
          const extracted = await extractor(page, 'playwright');
          jobs.push(...extracted);
        },
      });

      await crawler.run([url]);
    }

    this.logger.info(
      { url, jobsFound: jobs.length },
      'Crawlee crawl completed successfully',
    );

    return jobs;
  }
}
