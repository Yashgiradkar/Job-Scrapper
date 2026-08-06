import { createLogger } from '../logging/logger.js';

const logger = createLogger('reliable-executor');

export interface ReliableOptions {
  maxRetries?: number;
  backoffDelayMs?: number;
  backoffFactor?: number;
  timeoutMs?: number;
  rateLimitIntervalMs?: number;
}

// Simple Circuit Breaker Implementation
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface Circuit {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
}

class CircuitBreaker {
  private circuits = new Map<string, Circuit>();
  private readonly threshold = 3; // trip after 3 consecutive failures
  private readonly cooldownMs = 30_000; // 30 seconds cooldown

  check(domain: string): void {
    const circuit = this.getCircuit(domain);
    if (circuit.state === CircuitState.OPEN) {
      const elapsed = Date.now() - circuit.lastFailureTime;
      if (elapsed > this.cooldownMs) {
        circuit.state = CircuitState.HALF_OPEN;
        logger.warn({ domain }, 'Circuit breaker transitioned to HALF_OPEN; testing domain connectivity');
      } else {
        throw new Error(`Circuit breaker is OPEN for domain '${domain}'. Cooldown remaining: ${Math.round((this.cooldownMs - elapsed) / 1000)}s`);
      }
    }
  }

  recordSuccess(domain: string): void {
    const circuit = this.getCircuit(domain);
    circuit.failures = 0;
    if (circuit.state !== CircuitState.CLOSED) {
      circuit.state = CircuitState.CLOSED;
      logger.info({ domain }, 'Circuit breaker transitioned to CLOSED (success recorded)');
    }
  }

  recordFailure(domain: string): void {
    const circuit = this.getCircuit(domain);
    circuit.failures += 1;
    circuit.lastFailureTime = Date.now();

    if (circuit.failures >= this.threshold) {
      circuit.state = CircuitState.OPEN;
      logger.error(
        { domain, failures: circuit.failures },
        'Circuit breaker transitioned to OPEN due to consecutive failures',
      );
    }
  }

  private getCircuit(domain: string): Circuit {
    if (!this.circuits.has(domain)) {
      this.circuits.set(domain, {
        state: CircuitState.CLOSED,
        failures: 0,
        lastFailureTime: 0,
      });
    }
    return this.circuits.get(domain)!;
  }
}

const globalCircuitBreaker = new CircuitBreaker();

// Simple Domain Rate Limiter Implementation
class RateLimiter {
  private lastExecution = new Map<string, number>();

  async limit(domain: string, intervalMs: number): Promise<void> {
    const last = this.lastExecution.get(domain) || 0;
    const elapsed = Date.now() - last;
    if (elapsed < intervalMs) {
      const wait = intervalMs - elapsed;
      logger.debug({ domain, waitMs: wait }, 'Rate limiter active, delaying request');
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastExecution.set(domain, Date.now());
  }
}

const globalRateLimiter = new RateLimiter();

export class ReliableExecutor {
  static async execute<T>(
    domain: string,
    operation: () => Promise<T>,
    options: ReliableOptions = {},
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    const backoffDelayMs = options.backoffDelayMs ?? 1000;
    const backoffFactor = options.backoffFactor ?? 2;
    const timeoutMs = options.timeoutMs ?? 45_000;
    const rateLimitIntervalMs = options.rateLimitIntervalMs ?? 1500;

    // 1. Check Circuit Breaker
    globalCircuitBreaker.check(domain);

    // 2. Apply Rate Limiting
    await globalRateLimiter.limit(domain, rateLimitIntervalMs);

    // Track Metrics
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    logger.info(
      { domain, maxRetries, timeoutMs, startMemoryMb: Math.round(startMemory / 1024 / 1024) },
      'Executing scraping operation with reliability policies',
    );

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        // 3. Timeout Handling combined with Exponential Retry
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);

        // Record Success in Circuit Breaker
        globalCircuitBreaker.recordSuccess(domain);

        // 4. Log Scrape Duration and Memory Metrics
        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed;
        const durationMs = endTime - startTime;
        const memoryDiff = endMemory - startMemory;

        let datasetSize = 0;
        if (Array.isArray(result)) {
          datasetSize = result.length;
        }

        logger.info(
          {
            domain,
            durationMs,
            datasetSize,
            memoryUsedMb: Math.round(endMemory / 1024 / 1024),
            memoryDiffMb: Math.round(memoryDiff / 1024 / 1024),
          },
          'Reliable execution completed successfully',
        );

        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        logger.warn(
          { domain, attempt, error: errorMsg },
          'Operation failed, checking retry policies',
        );

        if (attempt > maxRetries) {
          // Record failure in Circuit Breaker if all retries are exhausted
          globalCircuitBreaker.recordFailure(domain);
          throw error;
        }

        // Exponential backoff delay
        const backoff = backoffDelayMs * Math.pow(backoffFactor, attempt - 1);
        logger.info({ domain, backoffMs: backoff, nextAttempt: attempt + 1 }, 'Delaying next retry');
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
}
