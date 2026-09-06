/**
 * Unit Tests for ScaffoldGenerator
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ScaffoldGenerator } from '../generators/scaffold-generator.js';
import type { DiscoveryReport } from '../types.js';

describe('ScaffoldGenerator', () => {
  const generator = new ScaffoldGenerator();

  const mockReport: DiscoveryReport = {
    id: 'report-123',
    targetUrl: 'https://careers.uber.com/jobs',
    domain: 'careers.uber.com',
    discoveredAt: '2026-09-06T12:00:00Z',
    durationMs: 3200,
    recommendedStrategy: 'REST_API',
    confidenceScore: 0.95,
    network: {
      totalRequests: 42,
      xhrFetchCount: 15,
      restEndpoints: [
        {
          endpoint: 'https://careers.uber.com/api/jobs',
          method: 'GET',
          urlPattern: 'https://careers.uber.com/api/jobs',
          queryParams: ['limit', 'offset'],
          confidence: 0.95,
          isJobListCandidate: true,
          isJobDetailCandidate: false,
          authHeaderPresent: false,
        },
      ],
      graphQLEndpoints: [],
      cookies: [],
      authMechanisms: [],
    },
    rendering: {
      renderType: 'SSR',
      ssrConfidence: 0.9,
      csrConfidence: 0.1,
      frameworkDetected: 'Next.js',
      hydrationScriptFound: true,
      initialHtmlContentLength: 85000,
      hydratedDomContentLength: 92000,
      domNodeCount: 1200,
      evidence: ['Server rendered Next.js'],
    },
    pagination: {
      type: 'infinite_scroll',
      infiniteScrollDetected: true,
      domGrowthOnScroll: true,
      newItemsLoadedOnScroll: 10,
    },
    applyWorkflow: {
      workflowType: 'easy_apply_modal',
      applyButtonSelector: 'button:has-text("Apply")',
      resumeUpload: {
        inputSelector: 'input[type="file"]',
        isMultiple: false,
        supportedExtensions: ['.pdf', '.docx'],
        confidence: 0.9,
      },
      detectedFields: [],
    },
    antiBot: {
      detected: false,
      provider: 'none',
      confidence: 1.0,
      signaturesFound: [],
      challengeType: 'none',
      bypassRecommendations: [],
    },
    selectors: {
      container: [{ selector: '.jobs-container', specificity: 5, matchCount: 1, confidence: 0.8 }],
      jobCard: [{ selector: '.job-card', specificity: 5, matchCount: 20, confidence: 0.9 }],
      title: [{ selector: 'h2.title', specificity: 5, matchCount: 20, confidence: 0.9 }],
      company: [],
      location: [{ selector: 'span.location', specificity: 5, matchCount: 20, confidence: 0.85 }],
      salary: [],
      description: [],
      applyButton: [{ selector: 'button.apply', specificity: 5, matchCount: 1, confidence: 0.9 }],
      paginationNext: [],
      resumeUpload: [{ selector: 'input[type="file"]', specificity: 5, matchCount: 1, confidence: 0.9 }],
    },
    metadata: {
      pageTitle: 'Uber Careers',
      estimatedJobCount: 20,
    },
  };

  test('generates production-grade TypeScript plugin scaffold', () => {
    const artifact = generator.generatePluginScaffold(mockReport);

    assert.equal(artifact.pluginName, 'CareersubercomPlugin');
    assert.equal(artifact.className, 'CareersubercomPlugin');
    assert.ok(artifact.content.includes('export class CareersubercomPlugin'));
    assert.ok(artifact.content.includes('extractJobs'));
    assert.ok(artifact.content.includes('https://careers.uber.com/api/jobs'));
  });

  test('generates workflow JSON definition with infinite scroll step', () => {
    const artifact = generator.generateWorkflowScaffold(mockReport);

    assert.ok(artifact.content.includes('workflow-careers-uber-com'));
    assert.equal(artifact.jsonDefinition.strategy, 'REST_API');

    const steps = artifact.jsonDefinition.steps as Array<{ id: string; action: string }>;
    assert.ok(steps.some((s) => s.id === 'step-infinite-scroll'));
    assert.ok(steps.some((s) => s.id === 'step-resume-upload'));
  });

  test('generates selector map with primary and fallback entries', () => {
    const artifact = generator.generateSelectorMap(mockReport);

    const parsed = JSON.parse(artifact.content);
    assert.equal(parsed.jobCard.primary, '.job-card');
    assert.equal(parsed.title.primary, 'h2.title');
    assert.equal(parsed.resumeUpload.primary, 'input[type="file"]');
  });

  test('generates rich markdown technical audit document', () => {
    const doc = generator.generateMarkdownDoc(mockReport);

    assert.ok(doc.includes('# Discovery Engine Technical Audit: careers.uber.com'));
    assert.ok(doc.includes('**Recommended Strategy:** `REST_API`'));
    assert.ok(doc.includes('Framework: **Next.js**'));
    assert.ok(doc.includes('Anti-Bot Mitigation Profile'));
  });
});
