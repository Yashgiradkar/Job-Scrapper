/**
 * Interface for DOM & Content Analyzer (ISP & DIP compliance)
 */

import type { Page } from 'playwright';
import type {
  RenderingDetection,
  SelectorHierarchy,
  PaginationDetection,
  ApplyWorkflowDetection,
} from '../types.js';

export interface IDomAnalyzer {
  /**
   * Evaluates rendering paradigm (SSR vs CSR) by comparing initial raw HTML
   * against the hydrated live DOM.
   */
  detectRendering(rawHtml: string, hydratedHtml: string): RenderingDetection;

  /**
   * Extracts candidate CSS/XPath/Data-attribute selectors for core elements
   * (containers, job cards, titles, locations, compensation, etc.).
   */
  extractSelectors(page: Page, html: string): Promise<SelectorHierarchy>;

  /**
   * Detects pagination controls and checks whether infinite scroll triggers DOM growth.
   */
  detectPagination(
    page: Page,
    initialCardCount: number,
    simulateScroll: boolean,
  ): Promise<PaginationDetection>;

  /**
   * Analyzes apply workflows (modals, external redirects, resume upload file inputs).
   */
  detectApplyWorkflow(page: Page, html: string): Promise<ApplyWorkflowDetection>;
}
