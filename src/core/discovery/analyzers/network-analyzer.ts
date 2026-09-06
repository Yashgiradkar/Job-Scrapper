/**
 * Network Traffic Analyzer
 *
 * Intercepts, records, and parses HTTP/HTTPS traffic to automatically classify:
 * - REST API endpoints (job listings, details, search queries)
 * - GraphQL operations (queries, mutations, variables)
 * - XHR vs Fetch distinctions
 * - Cookies (session, tracking, security)
 * - Authentication & CSRF token mechanisms
 */

import type { INetworkAnalyzer } from '../interfaces/network-analyzer.interface.js';
import type {
  NetworkObservation,
  NetworkAnalysisResult,
  RestEndpointDetection,
  GraphQLOperationDetection,
  CookieObservation,
  AuthMechanismDetection,
  HttpMethod,
} from '../types.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('network-analyzer');

// Heuristic keyword sets for job-related API endpoints
const JOB_ENDPOINT_KEYWORDS = [
  'job',
  'jobs',
  'posting',
  'postings',
  'career',
  'careers',
  'position',
  'positions',
  'opening',
  'openings',
  'vacancy',
  'vacancies',
  'requisition',
  'requisitions',
  'search',
  'searchjobs',
];

const DETAIL_ENDPOINT_KEYWORDS = [
  'detail',
  'details',
  'description',
  'apply',
  'requisitionid',
  'jobid',
];

export class NetworkAnalyzer implements INetworkAnalyzer {
  private observations: NetworkObservation[] = [];

  recordObservation(observation: NetworkObservation): void {
    this.observations.push(observation);
  }

  reset(): void {
    this.observations = [];
  }

  analyze(targetUrl: string): NetworkAnalysisResult {
    logger.debug(
      { totalObservations: this.observations.length, targetUrl },
      'Starting network traffic analysis',
    );

    const xhrFetchObs = this.observations.filter(
      (o) => o.isXhrOrFetch || o.resourceType === 'xhr' || o.resourceType === 'fetch',
    );

    const graphQLEndpoints = this.extractGraphQLOperations(xhrFetchObs);
    const restEndpoints = this.extractRestEndpoints(xhrFetchObs, graphQLEndpoints);
    const cookies = this.extractCookies();
    const authMechanisms = this.extractAuthMechanisms();
    const potentialApiBaseUrl = this.inferApiBaseUrl(targetUrl, restEndpoints, graphQLEndpoints);

    return {
      totalRequests: this.observations.length,
      xhrFetchCount: xhrFetchObs.length,
      restEndpoints,
      graphQLEndpoints,
      cookies,
      authMechanisms,
      potentialApiBaseUrl,
    };
  }

  /**
   * Identifies GraphQL operations by parsing request bodies for GraphQL signatures.
   */
  private extractGraphQLOperations(
    observations: NetworkObservation[],
  ): GraphQLOperationDetection[] {
    const detections: GraphQLOperationDetection[] = [];

    for (const obs of observations) {
      if (!obs.postData && !obs.url.includes('graphql')) {
        continue;
      }

      let parsedPayload: Record<string, unknown> | null = null;

      if (obs.postData) {
        try {
          parsedPayload = JSON.parse(obs.postData);
        } catch {
          // Non-JSON POST body; ignore
        }
      }

      const isExplicitGraphQLEndpoint = obs.url.toLowerCase().includes('graphql');
      const hasQueryField =
        parsedPayload &&
        typeof parsedPayload === 'object' &&
        'query' in parsedPayload &&
        typeof parsedPayload.query === 'string';

      if (isExplicitGraphQLEndpoint || hasQueryField) {
        let opType: GraphQLOperationDetection['operationType'] = 'unknown';
        let queryText: string | undefined;
        let operationName: string | undefined;

        if (hasQueryField && parsedPayload) {
          queryText = parsedPayload.query as string;
          operationName =
            (parsedPayload.operationName as string) || this.extractOpNameFromQuery(queryText);
          const trimmed = queryText.trim().toLowerCase();
          if (trimmed.startsWith('mutation')) {
            opType = 'mutation';
          } else if (trimmed.startsWith('subscription')) {
            opType = 'subscription';
          } else {
            opType = 'query';
          }
        }

        let parsedResponse: unknown;
        if (obs.responseBody) {
          try {
            parsedResponse = JSON.parse(obs.responseBody);
          } catch {
            // Response not JSON
          }
        }

        detections.push({
          endpoint: obs.url,
          operationName,
          operationType: opType,
          queryText,
          variables: parsedPayload?.variables as Record<string, unknown> | undefined,
          sampleResponse: parsedResponse,
          confidence: hasQueryField ? 0.95 : 0.7,
        });
      }
    }

    return detections;
  }

  /**
   * Identifies REST endpoints and flags those returning job data collections or details.
   */
  private extractRestEndpoints(
    observations: NetworkObservation[],
    graphqlDetections: GraphQLOperationDetection[],
  ): RestEndpointDetection[] {
    const detections: RestEndpointDetection[] = [];
    const graphqlUrls = new Set(graphqlDetections.map((g) => g.endpoint));

    for (const obs of observations) {
      if (graphqlUrls.has(obs.url)) {
        continue;
      }

      // Ignore common static asset telemetry or tracking domains
      if (this.isStaticOrTelemetry(obs.url)) {
        continue;
      }

      try {
        const parsedUrl = new URL(obs.url);
        const pathLower = parsedUrl.pathname.toLowerCase();
        const queryParams = Array.from(parsedUrl.searchParams.keys());

        let isJobList = false;
        let isJobDetail = false;
        let confidence = 0.2;

        // Check path keywords
        const containsJobKeyword = JOB_ENDPOINT_KEYWORDS.some((kw) => pathLower.includes(kw));
        const containsDetailKeyword = DETAIL_ENDPOINT_KEYWORDS.some((kw) => pathLower.includes(kw));

        if (containsJobKeyword) {
          confidence += 0.4;
          if (containsDetailKeyword) {
            isJobDetail = true;
          } else {
            isJobList = true;
          }
        }

        // Check if response body is JSON and contains array of job-like structures
        let sampleResponse: unknown;
        if (obs.responseBody && obs.status >= 200 && obs.status < 300) {
          try {
            sampleResponse = JSON.parse(obs.responseBody);
            const { isJobData, isCollection } = this.inspectResponseBodyForJobs(sampleResponse);
            if (isJobData) {
              confidence = Math.min(1.0, confidence + 0.4);
              if (isCollection) {
                isJobList = true;
              } else {
                isJobDetail = true;
              }
            }
          } catch {
            // Not valid JSON
          }
        }

        const authHeaderPresent =
          Boolean(obs.requestHeaders['authorization']) ||
          Boolean(obs.requestHeaders['x-api-key']) ||
          Boolean(obs.requestHeaders['x-csrf-token']);

        if (confidence >= 0.5) {
          detections.push({
            endpoint: obs.url,
            method: obs.method as HttpMethod,
            urlPattern: `${parsedUrl.origin}${parsedUrl.pathname}`,
            queryParams,
            samplePayload: obs.postData ? this.safeJsonParse(obs.postData) : undefined,
            sampleResponse,
            isJobListCandidate: isJobList,
            isJobDetailCandidate: isJobDetail,
            confidence: Math.round(confidence * 100) / 100,
            authHeaderPresent,
          });
        }
      } catch {
        // Malformed URL; skip
      }
    }

    // Sort by confidence descending
    return detections.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Inspects parsed response bodies for presence of job-related keys.
   */
  private inspectResponseBodyForJobs(data: unknown): { isJobData: boolean; isCollection: boolean } {
    if (!data || typeof data !== 'object') {
      return { isJobData: false, isCollection: false };
    }

    const jobIndicatorKeys = ['jobtitle', 'title', 'requisition', 'position', 'department', 'location', 'posteddate', 'reqid'];
    const serialized = JSON.stringify(data).toLowerCase();

    let matchedKeywords = 0;
    for (const key of jobIndicatorKeys) {
      if (serialized.includes(`"${key}"`)) {
        matchedKeywords++;
      }
    }

    const isJobData = matchedKeywords >= 2;
    const isCollection = Array.isArray(data) || (typeof data === 'object' && ('jobs' in data || 'postings' in data || 'data' in data || 'results' in data));

    return { isJobData, isCollection };
  }

  /**
   * Extracts unique cookies from request and response headers.
   */
  private extractCookies(): CookieObservation[] {
    const cookieMap = new Map<string, CookieObservation>();

    for (const obs of this.observations) {
      // Parse Set-Cookie response headers
      const setCookieHeader = obs.responseHeaders['set-cookie'];
      if (setCookieHeader) {
        const rawCookies = setCookieHeader.split('\n');
        for (const raw of rawCookies) {
          const parts = raw.split(';').map((p) => p.trim());
          const [first] = parts;
          if (first) {
            const eqIdx = first.indexOf('=');
            if (eqIdx !== -1) {
              const name = first.substring(0, eqIdx);
              const value = first.substring(eqIdx + 1);
              const category = this.categorizeCookie(name);

              cookieMap.set(name, {
                name,
                value,
                httpOnly: raw.toLowerCase().includes('httponly'),
                secure: raw.toLowerCase().includes('secure'),
                category,
              });
            }
          }
        }
      }

      // Parse Cookie request headers
      const reqCookieHeader = obs.requestHeaders['cookie'];
      if (reqCookieHeader) {
        const pairs = reqCookieHeader.split(';').map((p) => p.trim());
        for (const pair of pairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx !== -1) {
            const name = pair.substring(0, eqIdx);
            const value = pair.substring(eqIdx + 1);
            if (!cookieMap.has(name)) {
              cookieMap.set(name, {
                name,
                value,
                category: this.categorizeCookie(name),
              });
            }
          }
        }
      }
    }

    return Array.from(cookieMap.values());
  }

  private categorizeCookie(name: string): CookieObservation['category'] {
    const lower = name.toLowerCase();
    if (lower.includes('sess') || lower.includes('token') || lower.includes('auth') || lower.includes('jwt')) {
      return 'session';
    }
    if (lower.includes('cf_') || lower.includes('csrf') || lower.includes('xsrf') || lower.includes('px') || lower.includes('datadome')) {
      return 'security';
    }
    if (lower.includes('ga') || lower.includes('gid') || lower.includes('track') || lower.includes('analytics')) {
      return 'tracking';
    }
    return 'unknown';
  }

  /**
   * Extracts authentication methods observed in requests.
   */
  private extractAuthMechanisms(): AuthMechanismDetection[] {
    const mechanisms: AuthMechanismDetection[] = [];
    const seenTypes = new Set<string>();

    for (const obs of this.observations) {
      const authHeader = obs.requestHeaders['authorization'];
      if (authHeader && !seenTypes.has('bearer') && authHeader.toLowerCase().startsWith('bearer ')) {
        seenTypes.add('bearer');
        mechanisms.push({
          type: 'bearer',
          headerName: 'Authorization',
          tokenSample: `${authHeader.substring(0, 15)}...`,
          requiresAuthentication: true,
        });
      }

      const apiKeyHeader = Object.keys(obs.requestHeaders).find((k) =>
        k.toLowerCase().includes('api-key') || k.toLowerCase() === 'x-api-key',
      );
      if (apiKeyHeader && !seenTypes.has('custom_header')) {
        seenTypes.add('custom_header');
        mechanisms.push({
          type: 'custom_header',
          headerName: apiKeyHeader,
          requiresAuthentication: true,
        });
      }

      const csrfHeader = Object.keys(obs.requestHeaders).find(
        (k) => k.toLowerCase().includes('csrf') || k.toLowerCase().includes('xsrf'),
      );
      if (csrfHeader && !seenTypes.has('csrf')) {
        seenTypes.add('csrf');
        mechanisms.push({
          type: 'csrf',
          headerName: csrfHeader,
          requiresAuthentication: false,
        });
      }
    }

    if (mechanisms.length === 0) {
      mechanisms.push({
        type: 'none',
        requiresAuthentication: false,
      });
    }

    return mechanisms;
  }

  private inferApiBaseUrl(
    targetUrl: string,
    restEndpoints: RestEndpointDetection[],
    graphqlEndpoints: GraphQLOperationDetection[],
  ): string | undefined {
    if (restEndpoints.length > 0) {
      try {
        const topUrl = new URL(restEndpoints[0].endpoint);
        return topUrl.origin;
      } catch {
        // Fallback
      }
    }
    if (graphqlEndpoints.length > 0) {
      try {
        const gqlUrl = new URL(graphqlEndpoints[0].endpoint);
        return gqlUrl.origin;
      } catch {
        // Fallback
      }
    }
    try {
      const target = new URL(targetUrl);
      return target.origin;
    } catch {
      return undefined;
    }
  }

  private extractOpNameFromQuery(query: string): string | undefined {
    const match = query.match(/(?:query|mutation)\s+([A-Za-z0-9_]+)/);
    return match ? match[1] : undefined;
  }

  private isStaticOrTelemetry(url: string): boolean {
    const lower = url.toLowerCase();
    return (
      lower.includes('google-analytics') ||
      lower.includes('doubleclick') ||
      lower.includes('hotjar') ||
      lower.includes('segment.io') ||
      lower.includes('sentry.io') ||
      lower.includes('datadog') ||
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.svg') ||
      lower.endsWith('.css') ||
      lower.endsWith('.woff') ||
      lower.endsWith('.woff2')
    );
  }

  private safeJsonParse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}
