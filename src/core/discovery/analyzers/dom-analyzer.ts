/**
 * DOM & Content Analyzer
 *
 * Evaluates SSR vs CSR rendering paradigms, extracts high-confidence selector hierarchies,
 * detects pagination and infinite scroll mechanisms, and maps apply workflows (including
 * resume upload inputs and ATS redirects).
 */

import type { Page } from 'playwright';
import * as cheerio from 'cheerio';
import type { IDomAnalyzer } from '../interfaces/dom-analyzer.interface.js';
import type {
  RenderingDetection,
  SelectorHierarchy,
  SelectorCandidate,
  PaginationDetection,
  ApplyWorkflowDetection,
  ResumeUploadDetection,
} from '../types.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('dom-analyzer');

export class DomAnalyzer implements IDomAnalyzer {
  /**
   * Evaluates SSR vs CSR rendering by inspecting raw HTML vs hydrated DOM.
   */
  detectRendering(rawHtml: string, hydratedHtml: string): RenderingDetection {
    const rawLen = rawHtml.length;
    const hydratedLen = hydratedHtml.length;
    const evidence: string[] = [];

    // Framework detection
    let framework: RenderingDetection['frameworkDetected'] = 'Unknown';

    if (rawHtml.includes('__NEXT_DATA__') || hydratedHtml.includes('__NEXT_DATA__')) {
      framework = 'Next.js';
      evidence.push('Found Next.js __NEXT_DATA__ hydration payload');
    } else if (rawHtml.includes('__NUXT__') || hydratedHtml.includes('__NUXT__')) {
      framework = 'Nuxt';
      evidence.push('Found Nuxt __NUXT__ state');
    } else if (rawHtml.includes('__remixContext') || hydratedHtml.includes('__remixContext')) {
      framework = 'Remix';
      evidence.push('Found Remix context');
    } else if (rawHtml.includes('data-reactroot') || rawHtml.includes('react-root')) {
      framework = 'React';
      evidence.push('Found React DOM root marker');
    } else if (rawHtml.includes('ng-version') || hydratedHtml.includes('ng-version')) {
      framework = 'Angular';
      evidence.push('Found Angular ng-version attribute');
    } else if (rawHtml.includes('data-v-') || hydratedHtml.includes('data-v-')) {
      framework = 'Vue';
      evidence.push('Found Vue scoped CSS attribute markers');
    }

    const $raw = cheerio.load(rawHtml);
    const $hydrated = cheerio.load(hydratedHtml);

    const rawJobKeywords = (rawHtml.match(/job|career|position|opening/gi) || []).length;
    const hydratedJobKeywords = (hydratedHtml.match(/job|career|position|opening/gi) || []).length;

    const rawNodeCount = $raw('*').length;
    const hydratedNodeCount = $hydrated('*').length;

    // Evaluate content growth ratio
    const contentGrowthRatio = hydratedLen > 0 ? hydratedLen / Math.max(1, rawLen) : 1;
    const nodeGrowthRatio = hydratedNodeCount > 0 ? hydratedNodeCount / Math.max(1, rawNodeCount) : 1;

    let ssrConfidence = 0.5;
    let csrConfidence = 0.5;

    // Check if raw HTML contains job cards already
    const rawHasContent = rawJobKeywords > 10 && rawLen > 20000 && hydratedJobKeywords >= rawJobKeywords;
    const isSinglePageAppShell = rawLen < 15000 && (rawHtml.includes('<div id="root"></div>') || rawHtml.includes('<div id="app"></div>'));

    if (isSinglePageAppShell || nodeGrowthRatio > 2.0) {
      csrConfidence = 0.9;
      ssrConfidence = 0.1;
      evidence.push(`Raw HTML is minimal client shell (${rawLen} bytes, ${rawNodeCount} nodes) vs hydrated (${hydratedLen} bytes, ${hydratedNodeCount} nodes)`);
    } else if (rawHasContent && Math.abs(contentGrowthRatio - 1) < 0.3) {
      ssrConfidence = 0.9;
      csrConfidence = 0.1;
      evidence.push(`Raw HTML already includes rich server-rendered content (${rawJobKeywords} job keywords, ${rawLen} bytes)`);
    } else {
      evidence.push('Hybrid / Universal rendering detected with progressive hydration');
      ssrConfidence = 0.6;
      csrConfidence = 0.6;
    }

    const renderType: RenderingDetection['renderType'] =
      ssrConfidence > 0.7 ? 'SSR' : csrConfidence > 0.7 ? 'CSR' : 'HYBRID';

    return {
      renderType,
      ssrConfidence: Math.round(ssrConfidence * 100) / 100,
      csrConfidence: Math.round(csrConfidence * 100) / 100,
      frameworkDetected: framework,
      hydrationScriptFound: evidence.some((e) => e.includes('hydration') || e.includes('state')),
      initialHtmlContentLength: rawLen,
      hydratedDomContentLength: hydratedLen,
      domNodeCount: hydratedNodeCount,
      evidence,
    };
  }

  /**
   * Extracts candidate selectors with confidence scoring.
   */
  async extractSelectors(page: Page, html: string): Promise<SelectorHierarchy> {
    const $ = cheerio.load(html);

    return {
      container: await this.scoreCandidates(page, $, [
        '[data-testid*="job-list"]',
        '[data-testid*="jobs-list"]',
        '[class*="job-list"]',
        '[class*="jobs-list"]',
        '[class*="careers-list"]',
        '[class*="openings-list"]',
        'ul[class*="job"]',
        'div[role="feed"]',
        'main section',
      ]),
      jobCard: await this.scoreCandidates(page, $, [
        '[data-testid*="job-card"]',
        '[data-testid*="job-item"]',
        'li[class*="job"]',
        'article[class*="job"]',
        'div[class*="job-card"]',
        'div[class*="posting"]',
        'div[class*="opening"]',
        'a[href*="/job/"]',
        'a[href*="/jobs/"]',
        'a[href*="/careers/"]',
      ]),
      title: await this.scoreCandidates(page, $, [
        '[data-testid*="job-title"]',
        '[data-testid*="title"]',
        'h2[class*="title"]',
        'h3[class*="title"]',
        'h1',
        'h2',
        'h3',
        'a[class*="title"]',
        'div[class*="title"]',
      ]),
      company: await this.scoreCandidates(page, $, [
        '[data-testid*="company-name"]',
        '[data-testid*="company"]',
        '[class*="company-name"]',
        '[class*="company"]',
        '[class*="employer"]',
        'span[class*="company"]',
      ]),
      location: await this.scoreCandidates(page, $, [
        '[data-testid*="location"]',
        '[data-testid*="job-location"]',
        '[class*="location"]',
        '[class*="workplace"]',
        'span[class*="location"]',
        'div[class*="location"]',
      ]),
      salary: await this.scoreCandidates(page, $, [
        '[data-testid*="salary"]',
        '[data-testid*="compensation"]',
        '[class*="salary"]',
        '[class*="compensation"]',
        '[class*="pay"]',
        'span[class*="salary"]',
      ]),
      description: await this.scoreCandidates(page, $, [
        '[data-testid*="job-description"]',
        '[data-testid*="description"]',
        '[class*="job-description"]',
        '[class*="description"]',
        '[class*="details-content"]',
        'article section',
      ]),
      applyButton: await this.scoreCandidates(page, $, [
        '[data-testid*="apply-button"]',
        '[data-testid*="apply"]',
        'a[href*="apply"]',
        'button[class*="apply"]',
        'button:has-text("Apply")',
        'a:has-text("Apply")',
        'button[type="submit"]',
      ]),
      paginationNext: await this.scoreCandidates(page, $, [
        '[data-testid*="pagination-next"]',
        'a[rel="next"]',
        'button[aria-label*="next" i]',
        'a[aria-label*="next" i]',
        'button:has-text("Next")',
        'a:has-text("Next")',
        '[class*="pagination__next"]',
      ]),
      resumeUpload: await this.scoreCandidates(page, $, [
        'input[type="file"][name*="resume"]',
        'input[type="file"][id*="resume"]',
        'input[type="file"][accept*="pdf"]',
        'input[type="file"]',
        '[data-testid*="resume-upload"]',
        '[class*="dropzone"]',
      ]),
    };
  }

  /**
   * Detects pagination mechanisms and tests infinite scroll.
   */
  async detectPagination(
    page: Page,
    initialCardCount: number,
    simulateScroll: boolean,
  ): Promise<PaginationDetection> {
    // 1. Check numbered pagination in DOM
    const nextBtn = await page.$(
      'a[rel="next"], button[aria-label*="next" i], a:has-text("Next"), button:has-text("Next"), [class*="pagination__next"]',
    );
    const hasNextBtn = Boolean(nextBtn);

    const loadMoreBtn = await page.$(
      'button:has-text("Load More"), button:has-text("Show More"), button:has-text("View More"), [data-testid*="load-more"]',
    );
    const hasLoadMore = Boolean(loadMoreBtn);

    let infiniteScrollDetected = false;
    let domGrowthOnScroll = false;
    let newItemsLoaded = 0;

    if (simulateScroll && initialCardCount > 0) {
      try {
        // Scroll down in increments to trigger IntersectionObserver or scroll listeners
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
          await page.waitForTimeout(800);
        }

        // Measure card count after scrolling
        const currentCards = await page.$$(
          '[data-testid*="job-card"], [data-testid*="job-item"], li[class*="job"], article[class*="job"], div[class*="job-card"]',
        );
        const countAfter = currentCards.length;

        if (countAfter > initialCardCount) {
          domGrowthOnScroll = true;
          infiniteScrollDetected = true;
          newItemsLoaded = countAfter - initialCardCount;
          logger.info(
            { initialCardCount, countAfter, newItemsLoaded },
            'Infinite scroll detected: items grew dynamically upon scroll',
          );
        }
      } catch (err) {
        logger.debug({ err }, 'Error during infinite scroll simulation');
      }
    }

    let type: PaginationDetection['type'] = 'none';
    if (infiniteScrollDetected) {
      type = 'infinite_scroll';
    } else if (hasLoadMore) {
      type = 'load_more';
    } else if (hasNextBtn) {
      type = 'next_prev';
    }

    return {
      type,
      nextButtonSelector: hasNextBtn ? 'a[rel="next"], button[aria-label*="next" i], button:has-text("Next")' : undefined,
      loadMoreSelector: hasLoadMore ? 'button:has-text("Load More"), button:has-text("Show More")' : undefined,
      infiniteScrollDetected,
      domGrowthOnScroll,
      newItemsLoadedOnScroll: newItemsLoaded,
    };
  }

  /**
   * Analyzes apply workflows: file uploads, modals, form fields, and external redirects.
   */
  async detectApplyWorkflow(page: Page, html: string): Promise<ApplyWorkflowDetection> {
    const $ = cheerio.load(html);

    // 1. Check for ATS external redirect patterns
    const atsDomains = ['greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'ashbyhq.com', 'smartrecruiters.com', 'bamboohr.com', 'recruitee.com', 'workable.com'];
    let externalRedirectUrl: string | undefined;

    $('a[href*="apply"], a[class*="apply"], button[class*="apply"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        for (const ats of atsDomains) {
          if (href.includes(ats)) {
            externalRedirectUrl = href;
            break;
          }
        }
      }
    });

    // 2. Detect resume file upload input
    const resumeUpload = await this.detectResumeUpload(page, $);

    // 3. Detect form fields on the page or inside apply containers
    const detectedFields: ApplyWorkflowDetection['detectedFields'] = [];

    $('input, textarea, select').each((_, el) => {
      const $el = $(el);
      const name = $el.attr('name') || $el.attr('id') || $el.attr('placeholder') || '';
      const type = ($el.attr('type') || el.tagName).toLowerCase();
      const required = Boolean($el.attr('required')) || $el.attr('aria-required') === 'true';

      if (!name && !type) return;

      let fieldType: ApplyWorkflowDetection['detectedFields'][0]['fieldType'] = 'text';
      if (type === 'email') fieldType = 'email';
      else if (type === 'tel' || name.toLowerCase().includes('phone')) fieldType = 'phone';
      else if (type === 'file') fieldType = 'file';
      else if (el.tagName === 'textarea') fieldType = 'textarea';
      else if (el.tagName === 'select') fieldType = 'select';
      else if (type === 'checkbox') fieldType = 'checkbox';
      else if (type === 'radio') fieldType = 'radio';

      let selector = '';
      if ($el.attr('name')) selector = `[name="${$el.attr('name')}"]`;
      else if ($el.attr('id')) selector = `#${$el.attr('id')}`;
      else if ($el.attr('data-testid')) selector = `[data-testid="${$el.attr('data-testid')}"]`;

      if (selector) {
        detectedFields.push({
          fieldName: name,
          fieldType,
          selector,
          isRequired: required,
        });
      }
    });

    // Determine overall workflow type
    let workflowType: ApplyWorkflowDetection['workflowType'] = 'unknown';
    if (externalRedirectUrl) {
      workflowType = 'external_redirect';
    } else if (resumeUpload.inputSelector && detectedFields.length > 3) {
      workflowType = 'single_page_form';
    } else if (html.toLowerCase().includes('easy apply') || html.toLowerCase().includes('quick apply')) {
      workflowType = 'easy_apply_modal';
    } else if (detectedFields.length > 0) {
      workflowType = 'multi_step_form';
    }

    return {
      workflowType,
      applyButtonSelector: '[data-testid*="apply"], button:has-text("Apply"), a:has-text("Apply")',
      externalRedirectUrl,
      formStepCount: detectedFields.length > 5 ? 2 : 1,
      detectedFields: detectedFields.slice(0, 15),
      resumeUpload,
    };
  }

  private async detectResumeUpload(_page: Page, $: cheerio.CheerioAPI): Promise<ResumeUploadDetection> {
    const fileInput = $('input[type="file"]');
    const hasInput = fileInput.length > 0;

    let inputSelector: string | undefined;
    let acceptAttribute: string | undefined;
    let isMultiple = false;
    const supportedExtensions: string[] = [];

    if (hasInput) {
      const first = fileInput.first();
      acceptAttribute = first.attr('accept');
      isMultiple = Boolean(first.attr('multiple'));

      const id = first.attr('id');
      const name = first.attr('name');
      if (id) inputSelector = `input#${id}`;
      else if (name) inputSelector = `input[name="${name}"]`;
      else inputSelector = 'input[type="file"]';

      if (acceptAttribute) {
        if (acceptAttribute.includes('pdf')) supportedExtensions.push('.pdf');
        if (acceptAttribute.includes('doc')) supportedExtensions.push('.doc', '.docx');
      } else {
        supportedExtensions.push('.pdf', '.doc', '.docx');
      }
    } else {
      // Look for dropzone containers
      const dropzone = $('[class*="dropzone"], [data-testid*="resume"], [class*="file-upload"]');
      if (dropzone.length > 0) {
        inputSelector = '[class*="dropzone"]';
        supportedExtensions.push('.pdf', '.doc', '.docx');
      }
    }

    return {
      inputSelector,
      acceptAttribute,
      isMultiple,
      supportedExtensions,
      confidence: hasInput ? 0.95 : inputSelector ? 0.7 : 0.0,
    };
  }

  private async scoreCandidates(
    page: Page,
    $: cheerio.CheerioAPI,
    candidates: string[],
  ): Promise<SelectorCandidate[]> {
    const results: SelectorCandidate[] = [];

    for (const sel of candidates) {
      try {
        let matchCount = 0;
        let sampleText: string | undefined;

        // Cheerio count
        const cheerioCount = $(sel).length;
        if (cheerioCount > 0) {
          matchCount = cheerioCount;
          sampleText = $(sel).first().text().trim().substring(0, 80);
        } else {
          // Check in live page if selector includes Playwright-specific pseudo-selectors (:has-text)
          try {
            const count = await page.locator(sel).count();
            if (count > 0) {
              matchCount = count;
              sampleText = (await page.locator(sel).first().textContent())?.trim().substring(0, 80);
            }
          } catch {
            // Not a valid selector syntax
          }
        }

        if (matchCount > 0) {
          // Specificity score: data-testid > id > class > tag
          let specificity = 1;
          if (sel.includes('data-testid')) specificity = 10;
          else if (sel.includes('#')) specificity = 8;
          else if (sel.includes('.')) specificity = 5;
          else if (sel.includes(':has-text')) specificity = 6;

          const confidence = Math.min(1.0, 0.4 + specificity * 0.06);

          results.push({
            selector: sel,
            specificity,
            matchCount,
            sampleText: sampleText || undefined,
            confidence: Math.round(confidence * 100) / 100,
          });
        }
      } catch {
        // Skip invalid selector
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence);
  }
}
