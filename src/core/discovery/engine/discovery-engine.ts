/**
 * Discovery Engine (Phase -2 Orchestrator)
 *
 * Coordinates network interception, DOM inspection, RSS feed discovery,
 * anti-bot heuristics, and automated plugin/workflow scaffold generation.
 *
 * Implements clean architecture with full Dependency Injection (DIP).
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import type { INetworkAnalyzer } from '../interfaces/network-analyzer.interface.js';
import type { IDomAnalyzer } from '../interfaces/dom-analyzer.interface.js';
import type { IRssDetector } from '../interfaces/rss-detector.interface.js';
import type { IAntiBotDetector } from '../interfaces/antibot-detector.interface.js';
import type { IScaffoldGenerator } from '../interfaces/scaffold-generator.interface.js';
import {
  type DiscoveryOptions,
  type DiscoveryReport,
  type DiscoveryResult,
  type NetworkObservation,
  DiscoveryOptionsSchema,
} from '../types.js';
import { NetworkAnalyzer } from '../analyzers/network-analyzer.js';
import { DomAnalyzer } from '../analyzers/dom-analyzer.js';
import { RssDetector } from '../analyzers/rss-detector.js';
import { AntiBotDetector } from '../analyzers/antibot-detector.js';
import { ScaffoldGenerator } from '../generators/scaffold-generator.js';
import { NavigationTimeoutError, DiscoveryEngineError } from '../errors.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('discovery-engine');

export interface DiscoveryEngineDependencies {
  networkAnalyzer?: INetworkAnalyzer;
  domAnalyzer?: IDomAnalyzer;
  rssDetector?: IRssDetector;
  antiBotDetector?: IAntiBotDetector;
  scaffoldGenerator?: IScaffoldGenerator;
}

export class DiscoveryEngine {
  private readonly networkAnalyzer: INetworkAnalyzer;
  private readonly domAnalyzer: IDomAnalyzer;
  private readonly rssDetector: IRssDetector;
  private readonly antiBotDetector: IAntiBotDetector;
  private readonly scaffoldGenerator: IScaffoldGenerator;

  constructor(deps: DiscoveryEngineDependencies = {}) {
    this.networkAnalyzer = deps.networkAnalyzer ?? new NetworkAnalyzer();
    this.domAnalyzer = deps.domAnalyzer ?? new DomAnalyzer();
    this.rssDetector = deps.rssDetector ?? new RssDetector();
    this.antiBotDetector = deps.antiBotDetector ?? new AntiBotDetector();
    this.scaffoldGenerator = deps.scaffoldGenerator ?? new ScaffoldGenerator();
  }

  /**
   * Discovers and analyzes a target website.
   */
  async analyze(rawOptions: DiscoveryOptions): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const options = DiscoveryOptionsSchema.parse(rawOptions);
    const targetUrl = options.targetUrl;

    let domain = '';
    try {
      domain = new URL(targetUrl).hostname;
    } catch {
      throw new DiscoveryEngineError('Invalid target URL', 'INVALID_URL', targetUrl);
    }

    logger.info({ targetUrl, domain }, 'Starting automated website discovery');

    this.networkAnalyzer.reset();

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      context = await browser.newContext({
        viewport: options.viewport,
        userAgent:
          options.userAgent ||
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        extraHTTPHeaders: options.customHeaders,
      });

      page = await context.newPage();

      // Attach network observer
      this.attachNetworkInterceptor(page);

      // Navigate to target URL
      let rawHtml = '';
      try {
        const response = await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: options.navigationTimeoutMs,
        });

        if (response) {
          try {
            rawHtml = await response.text();
          } catch {
            rawHtml = await page.content();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Timeout')) {
          throw new NavigationTimeoutError(targetUrl, options.navigationTimeoutMs);
        }
        logger.warn({ err, targetUrl }, 'Initial navigation warning, attempting to proceed');
      }

      // Wait a grace period for initial network settling
      await page.waitForTimeout(options.captureNetworkWindowMs);

      // Get hydrated HTML and title
      const hydratedHtml = await page.content();
      const pageTitle = await page.title();

      // 1. Analyze Network Traffic
      const networkResult = this.networkAnalyzer.analyze(targetUrl);

      // 2. Evaluate Rendering (SSR vs CSR)
      const renderingResult = this.domAnalyzer.detectRendering(rawHtml, hydratedHtml);

      // 3. Detect Anti-Bot Protection
      const antiBotResult = this.antiBotDetector.detect(
        (this.networkAnalyzer as any).observations || [],
        hydratedHtml,
        pageTitle,
      );

      // 4. Check for RSS/Atom Feeds
      let rssResult;
      if (options.checkRss) {
        try {
          rssResult = await this.rssDetector.detectFeeds(targetUrl, hydratedHtml);
        } catch (err) {
          logger.debug({ err }, 'RSS discovery failed or not found');
        }
      }

      // 5. Extract Selectors
      const selectorHierarchy = await this.domAnalyzer.extractSelectors(page, hydratedHtml);

      // 6. Pagination & Infinite Scroll Detection
      const initialCardCount = selectorHierarchy.jobCard[0]?.matchCount ?? 0;
      const paginationResult = await this.domAnalyzer.detectPagination(
        page,
        initialCardCount,
        options.simulateInteractions,
      );

      // 7. Apply Workflow & Resume Upload Detection
      const applyWorkflowResult = await this.domAnalyzer.detectApplyWorkflow(page, hydratedHtml);

      // 8. Recommend Architecture Strategy
      const { recommendedStrategy, confidenceScore } = this.determineRecommendedStrategy({
        network: networkResult,
        rss: rssResult,
        rendering: renderingResult,
        antiBot: antiBotResult,
      });

      const durationMs = Date.now() - startTime;

      const report: DiscoveryReport = {
        id: randomUUID(),
        targetUrl,
        domain,
        discoveredAt: new Date().toISOString(),
        durationMs,
        recommendedStrategy,
        confidenceScore,
        network: networkResult,
        rendering: renderingResult,
        rss: rssResult,
        pagination: paginationResult,
        applyWorkflow: applyWorkflowResult,
        antiBot: antiBotResult,
        selectors: selectorHierarchy,
        metadata: {
          pageTitle,
          estimatedJobCount: initialCardCount > 0 ? initialCardCount : undefined,
        },
      };

      // 9. Generate Artifacts
      const pluginScaffold = this.scaffoldGenerator.generatePluginScaffold(report);
      const workflowScaffold = this.scaffoldGenerator.generateWorkflowScaffold(report);
      const selectorMap = this.scaffoldGenerator.generateSelectorMap(report);
      const markdownDoc = this.scaffoldGenerator.generateMarkdownDoc(report);

      logger.info(
        { targetUrl, recommendedStrategy, confidenceScore, durationMs },
        'Website discovery completed successfully',
      );

      return {
        report,
        artifacts: {
          pluginScaffold,
          workflowScaffold,
          selectorMap,
          markdownDoc,
        },
      };
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Attaches request and response listeners to record telemetry.
   */
  private attachNetworkInterceptor(page: Page): void {
    page.on('request', (_request) => {
      // Basic observation capture on request start
    });

    page.on('response', async (response) => {
      try {
        const request = response.request();
        const url = response.url();
        const method = request.method() as any;
        const resourceType = request.resourceType();
        const status = response.status();
        const statusText = response.statusText();
        const requestHeaders = request.headers();
        const responseHeaders = response.headers();
        const postData = request.postData();

        let responseBody: string | null = null;
        const isJsonOrText =
          (responseHeaders['content-type']?.includes('json') ||
            responseHeaders['content-type']?.includes('text') ||
            responseHeaders['content-type']?.includes('javascript')) ??
          false;

        if (isJsonOrText && status >= 200 && status < 400) {
          try {
            responseBody = await response.text();
            // Truncate excessively large response payloads (> 500KB)
            if (responseBody && responseBody.length > 500_000) {
              responseBody = responseBody.substring(0, 500_000);
            }
          } catch {
            // Body unavailable or closed
          }
        }

        const observation: NetworkObservation = {
          id: randomUUID(),
          url,
          method,
          resourceType,
          status,
          statusText,
          requestHeaders,
          responseHeaders,
          postData,
          responseBody,
          mimeType: responseHeaders['content-type'] || '',
          timing: 0,
          isXhrOrFetch: resourceType === 'xhr' || resourceType === 'fetch',
        };

        this.networkAnalyzer.recordObservation(observation);
      } catch {
        // Suppress response inspection errors during teardown
      }
    });
  }

  /**
   * Determines the optimal scraping strategy based on discovery intelligence.
   */
  private determineRecommendedStrategy(params: {
    network: DiscoveryReport['network'];
    rss?: DiscoveryReport['rss'];
    rendering: DiscoveryReport['rendering'];
    antiBot: DiscoveryReport['antiBot'];
  }): {
    recommendedStrategy: DiscoveryReport['recommendedStrategy'];
    confidenceScore: number;
  } {
    // 1. If clean REST API found with high confidence and no blocking auth
    const jobRest = params.network.restEndpoints.find((r) => r.isJobListCandidate && r.confidence >= 0.7);
    if (jobRest) {
      return {
        recommendedStrategy: 'REST_API',
        confidenceScore: jobRest.confidence,
      };
    }

    // 2. If valid RSS feed detected with items
    if (params.rss && params.rss.isValid && params.rss.itemCount > 0) {
      return {
        recommendedStrategy: 'RSS_FEED',
        confidenceScore: 0.9,
      };
    }

    // 3. If GraphQL endpoint detected with job query
    const jobGql = params.network.graphQLEndpoints.find((g) => g.confidence >= 0.8);
    if (jobGql) {
      return {
        recommendedStrategy: 'GRAPHQL',
        confidenceScore: jobGql.confidence,
      };
    }

    // 4. If anti-bot challenge is heavy, might require manual or specialized strategy
    if (params.antiBot.detected && params.antiBot.confidence > 0.9 && params.antiBot.challengeType === 'captcha') {
      return {
        recommendedStrategy: 'MANUAL',
        confidenceScore: 0.65,
      };
    }

    // 5. Playwright SSR vs CSR
    if (params.rendering.renderType === 'SSR' && params.rendering.ssrConfidence >= 0.8) {
      return {
        recommendedStrategy: 'PLAYWRIGHT_SSR',
        confidenceScore: params.rendering.ssrConfidence,
      };
    }

    return {
      recommendedStrategy: 'PLAYWRIGHT_CSR',
      confidenceScore: Math.max(0.7, params.rendering.csrConfidence),
    };
  }
}
