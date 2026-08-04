import type { Page } from 'playwright';
import type { Job } from '../domain/models/job.js';
import { BaseScraper } from '../domain/scrapers/base-scraper.js';

const SAMPLE_JOBS_HTML = `
  <main>
    <article class="job-card" data-id="sample-001">
      <h2 class="title">Senior TypeScript Engineer</h2>
      <p class="company">Acme Jobs</p>
      <p class="location">Remote</p>
      <p class="salary">$120k - $150k</p>
      <a class="apply-link" href="https://example.com/jobs/senior-typescript-engineer">Apply</a>
      <p class="description">Build and maintain scalable scraping workflows.</p>
    </article>
    <article class="job-card" data-id="sample-002">
      <h2 class="title">Platform Backend Engineer</h2>
      <p class="company">Acme Jobs</p>
      <p class="location">New York, NY</p>
      <p class="salary">$130k - $165k</p>
      <a class="apply-link" href="https://example.com/jobs/platform-backend-engineer">Apply</a>
      <p class="description">Design API and persistence foundations for job data.</p>
    </article>
  </main>
`;

export class SampleJobsScraper extends BaseScraper {
  readonly name = 'sample-jobs';
  readonly sourceUrl = 'https://example.com/jobs';

  async scrape(page: Page): Promise<Job[]> {
    await page.setContent(SAMPLE_JOBS_HTML, { waitUntil: 'domcontentloaded' });

    const cards = await page.locator('.job-card').all();
    const jobs: Job[] = [];

    for (const card of cards) {
      const externalId = await card.getAttribute('data-id');
      const title = await card.locator('.title').innerText();
      const company = await card.locator('.company').innerText();
      const location = await card.locator('.location').innerText();
      const salary = await card.locator('.salary').innerText();
      const url = await card.locator('.apply-link').getAttribute('href');
      const description = await card.locator('.description').innerText();

      jobs.push(
        this.buildJob({
          title,
          company,
          location,
          salary,
          url: url ?? this.sourceUrl,
          description,
          externalId: externalId ?? undefined,
        }),
      );
    }

    return jobs;
  }
}
