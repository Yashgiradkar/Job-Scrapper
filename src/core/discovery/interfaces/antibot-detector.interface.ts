/**
 * Interface for Anti-Bot & Threat Mitigation Detector
 */

import type { NetworkObservation, AntiBotDetectionResult } from '../types.js';

export interface IAntiBotDetector {
  /**
   * Evaluates network observations, cookies, and rendered DOM for bot mitigation signatures.
   */
  detect(
    observations: NetworkObservation[],
    pageHtml: string,
    pageTitle: string,
  ): AntiBotDetectionResult;
}
