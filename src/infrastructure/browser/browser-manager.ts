import {
  chromium,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from 'playwright';
import { getConfig } from '../config/config.js';
import { createLogger } from '../logging/logger.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class BrowserManager {
  private browser: Browser | null = null;
  private readonly logger = createLogger('browser-manager');

  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    const config = getConfig();

    this.logger.info(
      { headless: config.playwright.headless },
      'Launching Chromium browser',
    );

    this.browser = await chromium.launch({
      headless: config.playwright.headless,
    });

    return this.browser;
  }

  async createPage(
    contextOptions: BrowserContextOptions = {},
  ): Promise<Page> {
    const browser = await this.getBrowser();
    const config = getConfig();

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: DEFAULT_USER_AGENT,
      ...contextOptions,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(config.playwright.timeoutMs);
    page.setDefaultNavigationTimeout(config.playwright.timeoutMs);

    this.logger.debug('Created new browser page');

    return page;
  }

  async closePage(page: Page): Promise<void> {
    const context = page.context();

    if (!page.isClosed()) {
      await page.close();
    }

    await context.close();
    this.logger.debug('Closed browser page and context');
  }

  async withPage<T>(
    fn: (page: Page) => Promise<T>,
    contextOptions?: BrowserContextOptions,
  ): Promise<T> {
    const page = await this.createPage(contextOptions);

    try {
      return await fn(page);
    } finally {
      await this.closePage(page);
    }
  }

  async close(): Promise<void> {
    if (!this.browser) {
      return;
    }

    if (this.browser.isConnected()) {
      await this.browser.close();
      this.logger.info('Browser closed');
    }

    this.browser = null;
  }

  isRunning(): boolean {
    return this.browser?.isConnected() ?? false;
  }
}

let sharedBrowserManager: BrowserManager | undefined;

export function getBrowserManager(): BrowserManager {
  if (!sharedBrowserManager) {
    sharedBrowserManager = new BrowserManager();
  }

  return sharedBrowserManager;
}

export async function resetBrowserManager(): Promise<void> {
  if (sharedBrowserManager) {
    await sharedBrowserManager.close();
    sharedBrowserManager = undefined;
  }
}
