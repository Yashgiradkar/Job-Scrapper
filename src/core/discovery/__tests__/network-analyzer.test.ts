/**
 * Unit Tests for NetworkAnalyzer
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NetworkAnalyzer } from '../analyzers/network-analyzer.js';
import type { NetworkObservation } from '../types.js';

describe('NetworkAnalyzer', () => {
  test('classifies REST job listing endpoints with query parameters', () => {
    const analyzer = new NetworkAnalyzer();

    const sampleObs: NetworkObservation = {
      id: 'obs-1',
      url: 'https://careers.example.com/api/v1/jobs?department=engineering&page=1',
      method: 'GET',
      resourceType: 'fetch',
      status: 200,
      statusText: 'OK',
      requestHeaders: {
        authorization: 'Bearer sample-token-12345',
        accept: 'application/json',
      },
      responseHeaders: {
        'content-type': 'application/json',
      },
      responseBody: JSON.stringify({
        total: 2,
        jobs: [
          { title: 'Senior Software Engineer', department: 'Engineering', location: 'Remote' },
          { title: 'DevOps Architect', department: 'Infrastructure', location: 'New York' },
        ],
      }),
      mimeType: 'application/json',
      timing: 120,
      isXhrOrFetch: true,
    };

    analyzer.recordObservation(sampleObs);
    const result = analyzer.analyze('https://careers.example.com');

    assert.equal(result.totalRequests, 1);
    assert.equal(result.xhrFetchCount, 1);
    assert.equal(result.restEndpoints.length, 1);

    const rest = result.restEndpoints[0];
    assert.equal(rest.method, 'GET');
    assert.equal(rest.isJobListCandidate, true);
    assert.ok(rest.confidence >= 0.8, `Expected confidence >= 0.8, got ${rest.confidence}`);
    assert.deepEqual(rest.queryParams, ['department', 'page']);
    assert.equal(rest.authHeaderPresent, true);

    assert.equal(result.authMechanisms.length, 1);
    assert.equal(result.authMechanisms[0].type, 'bearer');
  });

  test('classifies GraphQL query operations', () => {
    const analyzer = new NetworkAnalyzer();

    const gqlObs: NetworkObservation = {
      id: 'obs-gql',
      url: 'https://company.com/graphql',
      method: 'POST',
      resourceType: 'xhr',
      status: 200,
      statusText: 'OK',
      requestHeaders: { 'content-type': 'application/json' },
      responseHeaders: { 'content-type': 'application/json' },
      postData: JSON.stringify({
        operationName: 'GetJobOpenings',
        query: 'query GetJobOpenings($loc: String) { openings(location: $loc) { id title } }',
        variables: { loc: 'Remote' },
      }),
      responseBody: JSON.stringify({
        data: { openings: [{ id: '1', title: 'Fullstack Engineer' }] },
      }),
      mimeType: 'application/json',
      timing: 180,
      isXhrOrFetch: true,
    };

    analyzer.recordObservation(gqlObs);
    const result = analyzer.analyze('https://company.com');

    assert.equal(result.graphQLEndpoints.length, 1);
    const gql = result.graphQLEndpoints[0];
    assert.equal(gql.operationName, 'GetJobOpenings');
    assert.equal(gql.operationType, 'query');
    assert.ok(gql.confidence >= 0.9);
  });

  test('categorizes session, security, and tracking cookies', () => {
    const analyzer = new NetworkAnalyzer();

    const obs: NetworkObservation = {
      id: 'obs-cookie',
      url: 'https://careers.example.com',
      method: 'GET',
      resourceType: 'document',
      status: 200,
      statusText: 'OK',
      requestHeaders: {},
      responseHeaders: {
        'set-cookie': 'session_id=xyz789; HttpOnly; Secure\ncf_clearance=bottoken123\n_ga=GA1.2.345',
      },
      mimeType: 'text/html',
      timing: 200,
      isXhrOrFetch: false,
    };

    analyzer.recordObservation(obs);
    const result = analyzer.analyze('https://careers.example.com');

    const sessionCookie = result.cookies.find((c) => c.name === 'session_id');
    const cfCookie = result.cookies.find((c) => c.name === 'cf_clearance');
    const gaCookie = result.cookies.find((c) => c.name === '_ga');

    assert.ok(sessionCookie);
    assert.equal(sessionCookie?.category, 'session');
    assert.equal(sessionCookie?.httpOnly, true);

    assert.ok(cfCookie);
    assert.equal(cfCookie?.category, 'security');

    assert.ok(gaCookie);
    assert.equal(gaCookie?.category, 'tracking');
  });
});
