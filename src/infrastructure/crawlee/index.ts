import { CrawleeRunner } from './crawlee-runner.js';

export * from './crawlee-runner.js';

let sharedCrawleeRunner: CrawleeRunner | undefined;

export function getCrawleeRunner(): CrawleeRunner {
  if (!sharedCrawleeRunner) {
    sharedCrawleeRunner = new CrawleeRunner();
  }
  return sharedCrawleeRunner;
}
