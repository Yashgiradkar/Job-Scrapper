/**
 * ContextManager
 * Creates and manages Playwright BrowserContexts with a unified set of options
 * including cookies, storage state, proxies, and locale/timezone injection.
 */
import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from 'playwright';
import { getCoreConfig } from '../config/core-config.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('context-manager');

export interface ContextCreationOptions {
  storageState?: BrowserContextOptions['storageState'];
  proxy?: { server: string; username?: string; password?: string };
  extraHeaders?: Record<string, string>;
  permissions?: string[];
  baseUrl?: string;
}

export class ContextManager {
  async create(
    browser: Browser,
    options: ContextCreationOptions = {},
  ): Promise<BrowserContext> {
    const cfg = getCoreConfig();

    const contextOptions: BrowserContextOptions = {
      viewport: { width: cfg.viewportWidth, height: cfg.viewportHeight },
      userAgent: cfg.userAgent,
      locale: cfg.locale,
      timezoneId: cfg.timezone,
      storageState: options.storageState,
      extraHTTPHeaders: options.extraHeaders,
      permissions: options.permissions,
      baseURL: options.baseUrl,
    };

    if (options.proxy ?? cfg.proxyServer) {
      contextOptions.proxy = options.proxy ?? {
        server: cfg.proxyServer!,
        username: cfg.proxyUsername,
        password: cfg.proxyPassword,
      };
    }

    const context = await browser.newContext(contextOptions);

    // Set default navigation timeout on the context itself
    context.setDefaultNavigationTimeout(cfg.navigationTimeoutMs);
    context.setDefaultTimeout(cfg.actionTimeoutMs);

    logger.debug({ viewport: contextOptions.viewport }, 'Created new BrowserContext');
    return context;
  }

  async close(context: BrowserContext): Promise<void> {
    await context.close();
    logger.debug('Closed BrowserContext');
  }
}
