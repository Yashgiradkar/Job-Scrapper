/**
 * Integration & Lifecycle Tests for DiscoveryEngine
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DiscoveryEngine } from '../engine/discovery-engine.js';
import { NetworkAnalyzer } from '../analyzers/network-analyzer.js';
import { DomAnalyzer } from '../analyzers/dom-analyzer.js';
import { AntiBotDetector } from '../analyzers/antibot-detector.js';
import { ScaffoldGenerator } from '../generators/scaffold-generator.js';
import { DiscoveryEngineError } from '../errors.js';

describe('DiscoveryEngine', () => {
  test('instantiates with default or custom injected dependencies', () => {
    const customNetwork = new NetworkAnalyzer();
    const customDom = new DomAnalyzer();
    const customAntiBot = new AntiBotDetector();
    const customScaffold = new ScaffoldGenerator();

    const engine = new DiscoveryEngine({
      networkAnalyzer: customNetwork,
      domAnalyzer: customDom,
      antiBotDetector: customAntiBot,
      scaffoldGenerator: customScaffold,
    });

    assert.ok(engine);
  });

  test('validates target URL using Zod schema', async () => {
    const engine = new DiscoveryEngine();

    await assert.rejects(
      async () => {
        await engine.analyze({
          targetUrl: 'not-a-valid-url',
        } as any);
      },
      (err: any) => {
        return err.name === 'ZodError' || err instanceof DiscoveryEngineError;
      },
    );
  });
});
