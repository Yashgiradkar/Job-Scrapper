/**
 * Plugin & Workflow Scaffold Generator
 *
 * Synthesizes discovery reports into production-ready TypeScript plugins,
 * workflow definitions, selector configurations, and technical documentation.
 */

import type { IScaffoldGenerator } from '../interfaces/scaffold-generator.interface.js';
import type {
  DiscoveryReport,
  PluginScaffoldArtifact,
  WorkflowScaffoldArtifact,
  SelectorMapArtifact,
} from '../types.js';

export class ScaffoldGenerator implements IScaffoldGenerator {
  /**
   * Generates a typed TypeScript plugin scaffold.
   */
  generatePluginScaffold(report: DiscoveryReport): PluginScaffoldArtifact {
    const cleanDomain = report.domain.replace(/[^a-zA-Z0-9]/g, '');
    const pascalName = cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1);
    const className = `${pascalName}Plugin`;
    const fileName = `${report.domain.replace(/\./g, '-')}.plugin.ts`;

    const strategy = report.recommendedStrategy;
    let strategyCode = '';

    if (strategy === 'REST_API') {
      const topRest = report.network.restEndpoints[0];
      strategyCode = `
  /**
   * Discovered REST Strategy: Query job listing API endpoint directly.
   */
  async extractJobs(): Promise<any[]> {
    const response = await axios.get('${topRest?.endpoint ?? report.targetUrl}', {
      headers: {
        'User-Agent': '${report.domain}-Agent/1.0',
        'Accept': 'application/json',
      },
    });
    return response.data;
  }
`;
    } else if (strategy === 'RSS_FEED' && report.rss) {
      strategyCode = `
  /**
   * Discovered RSS Strategy: Parse verified syndication feed.
   */
  async extractJobs(): Promise<any[]> {
    const parser = new RssParser();
    const feed = await parser.parseURL('${report.rss.feedUrl}');
    return feed.items.map((item) => ({
      title: item.title,
      url: item.link,
      postedDate: item.pubDate,
      description: item.contentSnippet,
    }));
  }
`;
    } else {
      const topCard = report.selectors.jobCard[0]?.selector ?? 'div.job-card';
      const topTitle = report.selectors.title[0]?.selector ?? 'h2';
      const topLocation = report.selectors.location[0]?.selector ?? 'span.location';
      const topApply = report.selectors.applyButton[0]?.selector ?? 'button:has-text("Apply")';

      strategyCode = `
  /**
   * Browser Automation Strategy (Playwright ${report.rendering.renderType})
   */
  async extractJobs(page: Page): Promise<any[]> {
    await page.goto('${report.targetUrl}', { waitUntil: 'networkidle' });
    const cards = await page.$$('${topCard}');
    const jobs: any[] = [];

    for (const card of cards) {
      const title = await card.$eval('${topTitle}', (el) => el.textContent?.trim() || '').catch(() => '');
      const location = await card.$eval('${topLocation}', (el) => el.textContent?.trim() || '').catch(() => '');
      jobs.push({ title, location });
    }

    return jobs;
  }

  /**
   * Discovered Apply Workflow Strategy (${report.applyWorkflow.workflowType})
   */
  async apply(page: Page, candidateProfile: any): Promise<boolean> {
    const applyBtn = await page.$('${topApply}');
    if (applyBtn) {
      await applyBtn.click();
    }
    ${
      report.applyWorkflow.resumeUpload.inputSelector
        ? `// Discovered file upload selector
    const resumeInput = await page.$('${report.applyWorkflow.resumeUpload.inputSelector}');
    if (resumeInput && candidateProfile.resumePdfPath) {
      await resumeInput.setInputFiles(candidateProfile.resumePdfPath);
    }`
        : '// No static file upload detected'
    }
    return true;
  }
`;
    }

    const content = `/**
 * Auto-Generated Plugin for ${report.domain}
 * Discovered at: ${report.discoveredAt}
 * Recommended Strategy: ${report.recommendedStrategy} (Confidence: ${Math.round(report.confidenceScore * 100)}%)
 */

import { type Page } from 'playwright';
import axios from 'axios';
import RssParser from 'rss-parser';

export class ${className} {
  readonly id = '${report.domain}';
  readonly name = '${pascalName} Job Integration';
  readonly targetUrl = '${report.targetUrl}';
  readonly renderType = '${report.rendering.renderType}';
  readonly antiBotProtected = ${report.antiBot.detected};
  readonly antiBotProvider = '${report.antiBot.provider}';

${strategyCode}
}
`;

    return {
      pluginName: `${pascalName}Plugin`,
      className,
      fileName,
      content,
    };
  }

  /**
   * Generates a platform workflow definition JSON.
   */
  generateWorkflowScaffold(report: DiscoveryReport): WorkflowScaffoldArtifact {
    const workflowName = `workflow-${report.domain.replace(/\./g, '-')}`;
    const fileName = `${workflowName}.json`;

    interface WorkflowStepDefinition {
      id: string;
      name: string;
      action: string;
      params: Record<string, unknown>;
      retryPolicy?: Record<string, unknown>;
    }

    const steps: WorkflowStepDefinition[] = [
      {
        id: 'step-initialize',
        name: 'Initialize Discovery Context',
        action: 'context.initialize',
        params: {
          targetUrl: report.targetUrl,
          domain: report.domain,
          antiBotDetected: report.antiBot.detected,
          antiBotProvider: report.antiBot.provider,
        },
      },
      {
        id: 'step-navigate',
        name: 'Navigate to Career Page',
        action: 'browser.navigate',
        params: {
          url: report.targetUrl,
          waitUntil: report.rendering.renderType === 'CSR' ? 'networkidle' : 'domcontentloaded',
          timeoutMs: 30000,
        },
        retryPolicy: {
          maxRetries: 3,
          backoffMs: 2000,
        },
      },
      {
        id: 'step-extract',
        name: 'Extract Job Collection',
        action: report.recommendedStrategy === 'REST_API' ? 'api.fetch' : 'dom.extractCards',
        params: {
          containerSelector: report.selectors.container[0]?.selector,
          cardSelector: report.selectors.jobCard[0]?.selector,
          titleSelector: report.selectors.title[0]?.selector,
          locationSelector: report.selectors.location[0]?.selector,
          salarySelector: report.selectors.salary[0]?.selector,
        },
      },
    ];

    if (report.pagination.type === 'infinite_scroll') {
      steps.push({
        id: 'step-infinite-scroll',
        name: 'Trigger Infinite Scroll',
        action: 'browser.scrollDown',
        params: {
          maxScrolls: 5,
          delayBetweenScrollsMs: 800,
        },
      });
    } else if (report.pagination.type === 'next_prev' && report.pagination.nextButtonSelector) {
      steps.push({
        id: 'step-pagination-next',
        name: 'Click Next Page',
        action: 'browser.click',
        params: {
          selector: report.pagination.nextButtonSelector,
        },
      });
    }

    if (report.applyWorkflow.resumeUpload.inputSelector) {
      steps.push({
        id: 'step-resume-upload',
        name: 'Upload Candidate Resume',
        action: 'form.uploadFile',
        params: {
          selector: report.applyWorkflow.resumeUpload.inputSelector,
          allowedExtensions: report.applyWorkflow.resumeUpload.supportedExtensions,
        },
      });
    }

    const jsonDefinition = {
      version: '1.0.0',
      workflowId: workflowName,
      strategy: report.recommendedStrategy,
      targetDomain: report.domain,
      steps,
      errorHandling: {
        onTimeout: 'abort',
        onAntiBotChallenge: report.antiBot.detected ? 'escalateToResidentialProxy' : 'fail',
      },
    };

    return {
      workflowName,
      fileName,
      content: JSON.stringify(jsonDefinition, null, 2),
      jsonDefinition,
    };
  }

  /**
   * Generates a selector map artifact.
   */
  generateSelectorMap(report: DiscoveryReport): SelectorMapArtifact {
    const fileName = `${report.domain.replace(/\./g, '-')}.selectors.json`;

    const selectorMap: Record<string, { primary: string; fallbacks: string[] }> = {};

    const categories: Array<keyof DiscoveryReport['selectors']> = [
      'container',
      'jobCard',
      'title',
      'company',
      'location',
      'salary',
      'description',
      'applyButton',
      'paginationNext',
      'resumeUpload',
    ];

    for (const cat of categories) {
      const candidates = report.selectors[cat] || [];
      const primary = candidates[0]?.selector || '';
      const fallbacks = candidates.slice(1).map((c) => c.selector);
      selectorMap[cat] = { primary, fallbacks };
    }

    return {
      domain: report.domain,
      fileName,
      content: JSON.stringify(selectorMap, null, 2),
    };
  }

  /**
   * Generates a markdown technical documentation report.
   */
  generateMarkdownDoc(report: DiscoveryReport): string {
    return `# Discovery Engine Technical Audit: ${report.domain}

**Target URL:** [${report.targetUrl}](${report.targetUrl})  
**Discovered At:** ${report.discoveredAt}  
**Recommended Strategy:** \`${report.recommendedStrategy}\` (Confidence: **${Math.round(report.confidenceScore * 100)}%**)  
**Audit Duration:** ${report.durationMs}ms  

---

## 1. Executive Summary

| Category | Finding | Details |
| :--- | :--- | :--- |
| **Rendering Paradigm** | \`${report.rendering.renderType}\` | Framework: **${report.rendering.frameworkDetected ?? 'Unknown'}** |
| **Syndication Feed** | ${report.rss ? '✅ Found' : '❌ None'} | ${report.rss ? `Format: ${report.rss.format} (${report.rss.itemCount} items)` : 'No RSS/Atom feed detected'} |
| **REST Endpoints** | ${report.network.restEndpoints.length} Candidates | ${report.network.restEndpoints[0]?.urlPattern ?? 'N/A'} |
| **GraphQL Operations** | ${report.network.graphQLEndpoints.length} Operations | ${report.network.graphQLEndpoints[0]?.endpoint ?? 'N/A'} |
| **Anti-Bot Protection** | ${report.antiBot.detected ? `⚠️ **${report.antiBot.provider.toUpperCase()}**` : '✅ None Detected'} | Confidence: ${Math.round(report.antiBot.confidence * 100)}% |
| **Pagination Strategy** | \`${report.pagination.type}\` | Infinite Scroll: **${report.pagination.infiniteScrollDetected ? 'YES' : 'NO'}** |
| **Apply Workflow** | \`${report.applyWorkflow.workflowType}\` | Resume Upload: **${report.applyWorkflow.resumeUpload.inputSelector ? 'YES' : 'NO'}** |

---

## 2. Rendering & Framework Analysis

- **Initial HTML Length:** ${report.rendering.initialHtmlContentLength} bytes
- **Hydrated DOM Length:** ${report.rendering.hydratedDomContentLength} bytes
- **Live DOM Node Count:** ${report.rendering.domNodeCount}
- **SSR Confidence:** ${report.rendering.ssrConfidence * 100}%
- **CSR Confidence:** ${report.rendering.csrConfidence * 100}%
- **Evidence Gathered:**
${report.rendering.evidence.map((e) => `  - ${e}`).join('\n')}

---

## 3. Network & API Telemetry

### REST API Candidates
${
  report.network.restEndpoints.length > 0
    ? report.network.restEndpoints
        .slice(0, 5)
        .map(
          (r) =>
            `- **[${r.method}]** \`${r.endpoint}\`  
  *Confidence:* ${r.confidence * 100}% | *Auth Header:* ${r.authHeaderPresent ? 'Yes' : 'No'} | *Params:* \`${r.queryParams.join(', ') || 'none'}\``,
        )
        .join('\n')
    : '_No dedicated REST job endpoints detected._'
}

### GraphQL Operations
${
  report.network.graphQLEndpoints.length > 0
    ? report.network.graphQLEndpoints
        .map(
          (g) =>
            `- **Endpoint:** \`${g.endpoint}\`  
  *Type:* \`${g.operationType}\` | *Operation Name:* \`${g.operationName ?? 'anonymous'}\``,
        )
        .join('\n')
    : '_No GraphQL operations detected._'
}

### Cookies Observed
- Total Cookies: **${report.network.cookies.length}**
${report.network.cookies.slice(0, 8).map((c) => `- \`${c.name}\` (Category: *${c.category}*)`).join('\n')}

---

## 4. Anti-Bot Mitigation Profile

- **Detected:** ${report.antiBot.detected ? 'YES' : 'NO'}
- **Provider:** \`${report.antiBot.provider}\`
- **Challenge Type:** \`${report.antiBot.challengeType}\`
- **Signatures Found:**
${report.antiBot.signaturesFound.map((s) => `  - \`${s}\``).join('\n')}
- **Bypass Recommendations:**
${report.antiBot.bypassRecommendations.map((r) => `  - ${r}`).join('\n')}

---

## 5. Selectors & DOM Mapping

| Field | Primary Selector | Candidate Count | Sample Text |
| :--- | :--- | :--- | :--- |
| **Container** | \`${report.selectors.container[0]?.selector ?? 'N/A'}\` | ${report.selectors.container.length} | - |
| **Job Card** | \`${report.selectors.jobCard[0]?.selector ?? 'N/A'}\` | ${report.selectors.jobCard.length} | - |
| **Title** | \`${report.selectors.title[0]?.selector ?? 'N/A'}\` | ${report.selectors.title.length} | "${report.selectors.title[0]?.sampleText ?? ''}" |
| **Company** | \`${report.selectors.company[0]?.selector ?? 'N/A'}\` | ${report.selectors.company.length} | "${report.selectors.company[0]?.sampleText ?? ''}" |
| **Location** | \`${report.selectors.location[0]?.selector ?? 'N/A'}\` | ${report.selectors.location.length} | "${report.selectors.location[0]?.sampleText ?? ''}" |
| **Salary** | \`${report.selectors.salary[0]?.selector ?? 'N/A'}\` | ${report.selectors.salary.length} | "${report.selectors.salary[0]?.sampleText ?? ''}" |
| **Apply CTA** | \`${report.selectors.applyButton[0]?.selector ?? 'N/A'}\` | ${report.selectors.applyButton.length} | "${report.selectors.applyButton[0]?.sampleText ?? ''}" |
| **Resume Upload** | \`${report.selectors.resumeUpload[0]?.selector ?? 'N/A'}\` | ${report.selectors.resumeUpload.length} | - |

---

## 6. Apply Workflow & Form Fields

- **Workflow Model:** \`${report.applyWorkflow.workflowType}\`
- **External Redirect:** ${report.applyWorkflow.externalRedirectUrl ? `\`${report.applyWorkflow.externalRedirectUrl}\`` : 'None (In-page / Native)'}
- **Resume File Input:** \`${report.applyWorkflow.resumeUpload.inputSelector ?? 'None'}\`
- **Supported File Types:** \`${report.applyWorkflow.resumeUpload.supportedExtensions.join(', ') || 'N/A'}\`
- **Detected Form Fields:**
${
  report.applyWorkflow.detectedFields.length > 0
    ? report.applyWorkflow.detectedFields
        .map((f) => `- **${f.fieldName}** (\`${f.fieldType}\`): \`${f.selector}\` (Required: ${f.isRequired ? 'Yes' : 'No'})`)
        .join('\n')
    : '_No direct form fields detected on landing page._'
}
`;
  }
}
