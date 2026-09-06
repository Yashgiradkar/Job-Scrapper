/**
 * Unit Tests for DomAnalyzer
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DomAnalyzer } from '../analyzers/dom-analyzer.js';

describe('DomAnalyzer', () => {
  const analyzer = new DomAnalyzer();

  test('detects SSR with Next.js framework hydration marker', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>Engineering Jobs</title></head>
        <body>
          <div id="__next">
            <h1>Careers at TechCorp</h1>
            <div class="job-list">
              <div class="job-card"><h3>Frontend Engineer</h3><p>Remote</p></div>
              <div class="job-card"><h3>Backend Engineer</h3><p>London</p></div>
            </div>
          </div>
          <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
        </body>
      </html>
    `;

    const result = analyzer.detectRendering(rawHtml, rawHtml);

    assert.equal(result.frameworkDetected, 'Next.js');
    assert.equal(result.hydrationScriptFound, true);
    assert.ok(result.evidence.some((e) => e.includes('Next.js')));
  });

  test('detects CSR when initial HTML is a bare shell and live DOM contains content', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>App</title></head>
        <body>
          <div id="root"></div>
          <script src="/bundle.js"></script>
        </body>
      </html>
    `;

    const hydratedHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>App</title></head>
        <body>
          <div id="root">
            <main>
              <div class="jobs">
                ${'<div class="job-item">Position</div>'.repeat(50)}
              </div>
            </main>
          </div>
        </body>
      </html>
    `;

    const result = analyzer.detectRendering(rawHtml, hydratedHtml);

    assert.equal(result.renderType, 'CSR');
    assert.ok(result.csrConfidence >= 0.85);
  });

  test('detects resume upload input and supported extensions in apply forms', async () => {
    const formHtml = `
      <form id="job-application-form">
        <input type="text" name="full_name" placeholder="Full Name" required />
        <input type="email" name="email_address" placeholder="Email" required />
        <input type="tel" name="phone_number" placeholder="Phone" />
        <input type="file" id="resume_upload" name="resume" accept=".pdf,.doc,.docx" />
        <a href="https://boards.greenhouse.io/acme/jobs/12345" class="apply-redirect">Apply on Greenhouse</a>
      </form>
    `;

    // Test with dummy page mock
    const dummyPage = {} as any;
    const result = await analyzer.detectApplyWorkflow(dummyPage, formHtml);

    assert.equal(result.workflowType, 'external_redirect');
    assert.equal(result.externalRedirectUrl, 'https://boards.greenhouse.io/acme/jobs/12345');
    assert.equal(result.resumeUpload.inputSelector, 'input#resume_upload');
    assert.deepEqual(result.resumeUpload.supportedExtensions, ['.pdf', '.doc', '.docx']);
    assert.equal(result.detectedFields.length, 4);

    const emailField = result.detectedFields.find((f) => f.fieldName === 'email_address');
    assert.ok(emailField);
    assert.equal(emailField?.fieldType, 'email');
    assert.equal(emailField?.isRequired, true);
  });
});
