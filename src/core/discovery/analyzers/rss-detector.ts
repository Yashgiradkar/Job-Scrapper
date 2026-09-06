/**
 * RSS & Atom Feed Detector
 *
 * Discovers and validates RSS, Atom, and JSON syndication feeds on target career sites.
 * Evaluates both `<link rel="alternate">` tags in HTML and probes canonical endpoints.
 */

import RssParser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';
import type { IRssDetector } from '../interfaces/rss-detector.interface.js';
import type { RssFeedDetection, RssFeedItem } from '../types.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('rss-detector');

const CANONICAL_FEED_PATHS = [
  '/rss',
  '/feed',
  '/jobs.rss',
  '/careers/rss',
  '/feed.xml',
  '/rss.xml',
  '/atom.xml',
];

export class RssDetector implements IRssDetector {
  private parser: RssParser;

  constructor() {
    this.parser = new RssParser({
      timeout: 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      },
    });
  }

  async detectFeeds(targetUrl: string, pageHtml: string): Promise<RssFeedDetection | undefined> {
    logger.debug({ targetUrl }, 'Scanning for RSS/Atom syndication feeds');

    // 1. Scan HTML `<link>` tags
    const linkedFeeds = this.extractLinkedFeeds(pageHtml, targetUrl);

    for (const feedUrl of linkedFeeds) {
      const validated = await this.validateAndParseFeed(feedUrl);
      if (validated) {
        return validated;
      }
    }

    // 2. Probe canonical paths on target origin
    try {
      const origin = new URL(targetUrl).origin;
      for (const path of CANONICAL_FEED_PATHS) {
        const candidateUrl = `${origin}${path}`;
        const validated = await this.validateAndParseFeed(candidateUrl);
        if (validated) {
          return validated;
        }
      }
    } catch {
      // Invalid base URL; return undefined
    }

    return undefined;
  }

  private extractLinkedFeeds(html: string, baseUrl: string): string[] {
    const feeds: string[] = [];
    try {
      const $ = cheerio.load(html);
      $('link[type*="rss"], link[type*="atom"], link[type*="xml"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) {
          try {
            const resolved = new URL(href, baseUrl).toString();
            feeds.push(resolved);
          } catch {
            // Ignore invalid URL
          }
        }
      });
    } catch (err) {
      logger.debug({ err }, 'Cheerio failed parsing link tags for RSS');
    }
    return Array.from(new Set(feeds));
  }

  private async validateAndParseFeed(feedUrl: string): Promise<RssFeedDetection | undefined> {
    try {
      // Fast pre-flight check to verify content-type or status
      const headResponse = await axios.get(feedUrl, {
        timeout: 5000,
        validateStatus: (status) => status === 200,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      const bodyText = typeof headResponse.data === 'string' ? headResponse.data : JSON.stringify(headResponse.data);
      if (!bodyText.includes('<rss') && !bodyText.includes('<feed') && !bodyText.includes('<?xml')) {
        return undefined;
      }

      const feed = await this.parser.parseString(bodyText);

      const sampleItems: RssFeedItem[] = (feed.items || []).slice(0, 5).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        contentSnippet: item.contentSnippet?.substring(0, 200),
        guid: item.guid,
      }));

      const isAtom = bodyText.includes('<feed') && bodyText.includes('xmlns="http://www.w3.org/2005/Atom"');

      return {
        feedUrl,
        title: feed.title,
        description: feed.description,
        format: isAtom ? 'atom' : 'rss2',
        itemCount: feed.items?.length ?? 0,
        sampleItems,
        isValid: true,
      };
    } catch {
      // Not a valid RSS feed or request failed
      return undefined;
    }
  }
}
