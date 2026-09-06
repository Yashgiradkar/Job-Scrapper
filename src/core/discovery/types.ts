/**
 * Domain Models and Zod Schemas for the Discovery Engine (Phase -2)
 *
 * Defines contracts, telemetry types, detection signatures, and report artifacts
 * used to reverse-engineer arbitrary web applications and career portals.
 */

import { z } from 'zod';

// ============================================================================
// 1. DISCOVERY OPTIONS & INPUTS
// ============================================================================

export const DiscoveryOptionsSchema = z.object({
  targetUrl: z.string().url(),
  maxScrollAttempts: z.number().int().min(0).max(20).default(5),
  scrollDelayMs: z.number().int().min(100).max(5000).default(800),
  navigationTimeoutMs: z.number().int().min(5000).max(120000).default(30000),
  captureNetworkWindowMs: z.number().int().min(1000).max(60000).default(5000),
  userAgent: z.string().optional(),
  viewport: z.object({
    width: z.number().int().default(1280),
    height: z.number().int().default(800),
  }).default({ width: 1280, height: 800 }),
  checkRss: z.boolean().default(true),
  simulateInteractions: z.boolean().default(true),
  customHeaders: z.record(z.string()).default({}),
});

export type DiscoveryOptions = z.infer<typeof DiscoveryOptionsSchema>;

// ============================================================================
// 2. NETWORK ANALYSIS TYPES
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface NetworkObservation {
  id: string;
  url: string;
  method: HttpMethod;
  resourceType: string;
  status: number;
  statusText: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  postData?: string | null;
  responseBody?: string | null;
  responseSize?: number;
  mimeType: string;
  timing: number; // ms
  isXhrOrFetch: boolean;
}

export interface RestEndpointDetection {
  endpoint: string;
  method: HttpMethod;
  urlPattern: string;
  queryParams: string[];
  samplePayload?: unknown;
  sampleResponse?: unknown;
  isJobListCandidate: boolean;
  isJobDetailCandidate: boolean;
  confidence: number; // 0.0 - 1.0
  authHeaderPresent: boolean;
}

export interface GraphQLOperationDetection {
  endpoint: string;
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription' | 'unknown';
  queryText?: string;
  variables?: Record<string, unknown>;
  sampleResponse?: unknown;
  confidence: number;
}

export interface CookieObservation {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  category: 'session' | 'tracking' | 'security' | 'unknown';
}

export interface AuthMechanismDetection {
  type: 'bearer' | 'basic' | 'cookie' | 'csrf' | 'custom_header' | 'none';
  headerName?: string;
  tokenSample?: string;
  loginUrlDetected?: string;
  requiresAuthentication: boolean;
}

export interface NetworkAnalysisResult {
  totalRequests: number;
  xhrFetchCount: number;
  restEndpoints: RestEndpointDetection[];
  graphQLEndpoints: GraphQLOperationDetection[];
  cookies: CookieObservation[];
  authMechanisms: AuthMechanismDetection[];
  potentialApiBaseUrl?: string;
}

// ============================================================================
// 3. RSS & FEED TYPES
// ============================================================================

export interface RssFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  guid?: string;
}

export interface RssFeedDetection {
  feedUrl: string;
  title?: string;
  description?: string;
  format: 'rss2' | 'atom' | 'json_feed' | 'unknown';
  itemCount: number;
  sampleItems: RssFeedItem[];
  isValid: boolean;
}

// ============================================================================
// 4. DOM & RENDERING ANALYSIS TYPES
// ============================================================================

export interface RenderingDetection {
  renderType: 'SSR' | 'CSR' | 'HYBRID';
  ssrConfidence: number; // 0.0 - 1.0
  csrConfidence: number; // 0.0 - 1.0
  frameworkDetected?: 'Next.js' | 'Nuxt' | 'Remix' | 'Gatsby' | 'Angular' | 'Vue' | 'React' | 'Unknown';
  hydrationScriptFound: boolean;
  initialHtmlContentLength: number;
  hydratedDomContentLength: number;
  domNodeCount: number;
  evidence: string[];
}

export interface SelectorCandidate {
  selector: string;
  specificity: number;
  matchCount: number;
  sampleText?: string;
  confidence: number; // 0.0 - 1.0
}

export interface SelectorHierarchy {
  container: SelectorCandidate[];
  jobCard: SelectorCandidate[];
  title: SelectorCandidate[];
  company: SelectorCandidate[];
  location: SelectorCandidate[];
  salary: SelectorCandidate[];
  description: SelectorCandidate[];
  applyButton: SelectorCandidate[];
  paginationNext: SelectorCandidate[];
  resumeUpload: SelectorCandidate[];
}

export interface PaginationDetection {
  type: 'numbered' | 'next_prev' | 'infinite_scroll' | 'load_more' | 'none';
  nextButtonSelector?: string;
  loadMoreSelector?: string;
  pageParamName?: string;
  infiniteScrollDetected: boolean;
  domGrowthOnScroll: boolean;
  newItemsLoadedOnScroll: number;
}

export interface ResumeUploadDetection {
  inputSelector?: string;
  dropzoneSelector?: string;
  acceptAttribute?: string;
  maxFileSizeMb?: number;
  isMultiple: boolean;
  supportedExtensions: string[];
  confidence: number;
}

export interface ApplyWorkflowDetection {
  workflowType: 'easy_apply_modal' | 'multi_step_form' | 'single_page_form' | 'external_redirect' | 'mailto' | 'unknown';
  applyButtonSelector?: string;
  externalRedirectUrl?: string;
  formStepCount?: number;
  detectedFields: Array<{
    fieldName: string;
    fieldType: 'text' | 'email' | 'phone' | 'file' | 'textarea' | 'select' | 'checkbox' | 'radio';
    selector: string;
    isRequired: boolean;
  }>;
  resumeUpload: ResumeUploadDetection;
}

// ============================================================================
// 5. ANTI-BOT DETECTION TYPES
// ============================================================================

export type BotProtectionProvider =
  | 'cloudflare'
  | 'datadome'
  | 'perimeterx'
  | 'akamai'
  | 'aws_waf'
  | 'imperva_incapsula'
  | 'recaptcha'
  | 'hcaptcha'
  | 'turnstile'
  | 'none';

export interface AntiBotDetectionResult {
  detected: boolean;
  provider: BotProtectionProvider;
  confidence: number; // 0.0 - 1.0
  signaturesFound: string[];
  challengeType?: 'js_challenge' | 'captcha' | 'rate_limit_block' | 'fingerprint' | 'none';
  bypassRecommendations: string[];
}

// ============================================================================
// 6. DISCOVERY REPORT & ARTIFACTS
// ============================================================================

export interface DiscoveryReport {
  id: string;
  targetUrl: string;
  domain: string;
  discoveredAt: string;
  durationMs: number;
  recommendedStrategy: 'REST_API' | 'GRAPHQL' | 'RSS_FEED' | 'PLAYWRIGHT_SSR' | 'PLAYWRIGHT_CSR' | 'MANUAL';
  confidenceScore: number;
  network: NetworkAnalysisResult;
  rendering: RenderingDetection;
  rss?: RssFeedDetection;
  pagination: PaginationDetection;
  applyWorkflow: ApplyWorkflowDetection;
  antiBot: AntiBotDetectionResult;
  selectors: SelectorHierarchy;
  metadata: {
    pageTitle: string;
    metaDescription?: string;
    canonicalUrl?: string;
    estimatedJobCount?: number;
  };
}

export interface PluginScaffoldArtifact {
  pluginName: string;
  className: string;
  fileName: string;
  content: string;
}

export interface WorkflowScaffoldArtifact {
  workflowName: string;
  fileName: string;
  content: string;
  jsonDefinition: Record<string, unknown>;
}

export interface SelectorMapArtifact {
  domain: string;
  fileName: string;
  content: string;
}

export interface DiscoveryResult {
  report: DiscoveryReport;
  artifacts: {
    pluginScaffold: PluginScaffoldArtifact;
    workflowScaffold: WorkflowScaffoldArtifact;
    selectorMap: SelectorMapArtifact;
    markdownDoc: string;
  };
}
