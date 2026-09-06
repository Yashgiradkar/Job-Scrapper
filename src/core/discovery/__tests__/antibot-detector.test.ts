/**
 * Unit Tests for AntiBotDetector
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AntiBotDetector } from '../analyzers/antibot-detector.js';
import type { NetworkObservation } from '../types.js';

describe('AntiBotDetector', () => {
  const detector = new AntiBotDetector();

  test('identifies Cloudflare bot challenge via headers and cookies', () => {
    const observations: NetworkObservation[] = [
      {
        id: 'obs-cf',
        url: 'https://careers.example.com',
        method: 'GET',
        resourceType: 'document',
        status: 403,
        statusText: 'Forbidden',
        requestHeaders: {},
        responseHeaders: {
          'cf-ray': '8792019ab921c-EWR',
          server: 'cloudflare',
          'set-cookie': 'cf_clearance=abc123token',
        },
        mimeType: 'text/html',
        timing: 300,
        isXhrOrFetch: false,
      },
    ];

    const result = detector.detect(
      observations,
      '<html><head><title>Just a moment...</title></head><body><div id="cf-browser-verification"></div></body></html>',
      'Just a moment...',
    );

    assert.equal(result.detected, true);
    assert.equal(result.provider, 'cloudflare');
    assert.ok(result.confidence >= 0.9);
    assert.ok(result.signaturesFound.length > 0);
    assert.ok(result.bypassRecommendations.length > 0);
  });

  test('identifies DataDome bot challenge via cookie and script', () => {
    const observations: NetworkObservation[] = [
      {
        id: 'obs-dd',
        url: 'https://careers.example.com',
        method: 'GET',
        resourceType: 'document',
        status: 200,
        statusText: 'OK',
        requestHeaders: {},
        responseHeaders: {
          'set-cookie': 'datadome=3A94KLa918B; Path=/',
        },
        mimeType: 'text/html',
        timing: 150,
        isXhrOrFetch: false,
      },
    ];

    const result = detector.detect(
      observations,
      '<html><head><script src="https://ct.captcha-delivery.com/c.js"></script></head><body></body></html>',
      'Careers at Acme',
    );

    assert.equal(result.detected, true);
    assert.equal(result.provider, 'datadome');
    assert.ok(result.signaturesFound.some((s) => s.includes('datadome')));
  });

  test('returns detected: false for normal unblocked websites', () => {
    const observations: NetworkObservation[] = [
      {
        id: 'obs-clean',
        url: 'https://open-source.org/jobs',
        method: 'GET',
        resourceType: 'document',
        status: 200,
        statusText: 'OK',
        requestHeaders: {},
        responseHeaders: {
          server: 'nginx',
          'content-type': 'text/html; charset=utf-8',
        },
        mimeType: 'text/html',
        timing: 90,
        isXhrOrFetch: false,
      },
    ];

    const result = detector.detect(
      observations,
      '<html><head><title>Open Jobs</title></head><body><h1>Join Our Team</h1></body></html>',
      'Open Jobs',
    );

    assert.equal(result.detected, false);
    assert.equal(result.provider, 'none');
    assert.equal(result.confidence, 1.0);
  });
});
