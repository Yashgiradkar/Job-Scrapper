/**
 * Interface for Network Traffic Analyzer (ISP & DIP compliance)
 */

import type { NetworkObservation, NetworkAnalysisResult } from '../types.js';

export interface INetworkAnalyzer {
  /**
   * Records a raw network observation from page hooks.
   */
  recordObservation(observation: NetworkObservation): void;

  /**
   * Analyzes all recorded observations and extracts classified REST endpoints,
   * GraphQL operations, auth mechanisms, and cookies.
   */
  analyze(targetUrl: string): NetworkAnalysisResult;

  /**
   * Clears in-memory observations.
   */
  reset(): void;
}
