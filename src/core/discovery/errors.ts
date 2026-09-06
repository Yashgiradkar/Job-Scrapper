/**
 * Custom Error Hierarchy for Discovery Engine
 */

export class DiscoveryEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly targetUrl: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class NavigationTimeoutError extends DiscoveryEngineError {
  constructor(targetUrl: string, timeoutMs: number) {
    super(
      `Navigation to ${targetUrl} timed out after ${timeoutMs}ms`,
      'NAVIGATION_TIMEOUT',
      targetUrl,
      { timeoutMs },
    );
  }
}

export class AntiBotBlockedError extends DiscoveryEngineError {
  constructor(targetUrl: string, provider: string, details?: Record<string, unknown>) {
    super(
      `Access to ${targetUrl} was blocked by anti-bot protection (${provider})`,
      'ANTI_BOT_BLOCKED',
      targetUrl,
      { provider, ...details },
    );
  }
}

export class AnalysisParsingError extends DiscoveryEngineError {
  constructor(targetUrl: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Failed to analyze DOM or network for ${targetUrl}: ${reason}`,
      'ANALYSIS_PARSING_FAILED',
      targetUrl,
      { reason, ...details },
    );
  }
}

export class ScaffoldGenerationError extends DiscoveryEngineError {
  constructor(targetUrl: string, reason: string) {
    super(
      `Failed to generate scaffold for ${targetUrl}: ${reason}`,
      'SCAFFOLD_GENERATION_FAILED',
      targetUrl,
      { reason },
    );
  }
}
