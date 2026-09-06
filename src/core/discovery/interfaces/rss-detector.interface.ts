/**
 * Interface for RSS & Feed Detector
 */

import type { RssFeedDetection } from '../types.js';

export interface IRssDetector {
  /**
   * Discovers and parses RSS or Atom feeds for a target URL and page HTML.
   */
  detectFeeds(targetUrl: string, pageHtml: string): Promise<RssFeedDetection | undefined>;
}
