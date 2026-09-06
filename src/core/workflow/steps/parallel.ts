/**
 * ParallelStep
 *
 * Executes multiple sub-steps or workflow branches concurrently.
 * Supports configurable concurrency limits, fail-fast policies, and reverse rollback.
 */

import { BaseWorkflowStep, type WorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';
import { WorkflowFactory } from '../factory.js';

export interface ParallelStepConfig {
  name?: string;
  steps: Array<{ action: string; params: Record<string, unknown> }>;
  maxConcurrency?: number;
  failFast?: boolean;
  timeoutMs?: number;
}

export class ParallelStep extends BaseWorkflowStep {
  readonly name: string;
  private readonly subSteps: WorkflowStep[] = [];
  private readonly maxConcurrency: number;
  private readonly failFast: boolean;
  private readonly executedSubSteps: WorkflowStep[] = [];

  constructor(config: Record<string, any>) {
    super(config);
    this.name = config.name ?? 'ParallelStep';
    this.maxConcurrency = config.maxConcurrency ?? 5;
    this.failFast = config.failFast ?? true;

    if (Array.isArray(config.steps)) {
      this.subSteps = WorkflowFactory.fromJSON(config.steps);
    }
  }

  async execute(context: WorkflowContext): Promise<void> {
    context.logger.info(
      this.name,
      `Executing ${this.subSteps.length} sub-steps in parallel (concurrency: ${this.maxConcurrency}, failFast: ${this.failFast})`,
    );

    if (this.subSteps.length === 0) {
      return;
    }

    const queue = [...this.subSteps];
    const inFlight: Promise<void>[] = [];
    const errors: Error[] = [];

    while (queue.length > 0 || inFlight.length > 0) {
      if (errors.length > 0 && this.failFast) {
        break;
      }

      while (queue.length > 0 && inFlight.length < this.maxConcurrency) {
        const step = queue.shift()!;
        const promise = (async () => {
          try {
            await step.execute(context);
            this.executedSubSteps.push(step);
          } catch (err: unknown) {
            const errorObj = err instanceof Error ? err : new Error(String(err));
            errors.push(errorObj);
            context.logger.error(this.name, `Parallel sub-step ${step.name} failed`, errorObj);
            if (this.failFast) {
              throw errorObj;
            }
          }
        })();

        inFlight.push(promise);
      }

      if (inFlight.length > 0) {
        try {
          await Promise.race(inFlight);
        } catch {
          if (this.failFast) {
            break;
          }
        }
        // Remove settled promises
        for (let i = inFlight.length - 1; i >= 0; i--) {
          // Check if resolved or rejected by inspecting status or filtering
        }
        // Drain completed promises
        await Promise.allSettled(inFlight);
        inFlight.length = 0;
      }
    }

    if (errors.length > 0) {
      await this.rollback(context);
      throw new Error(
        `Parallel step ${this.name} failed with ${errors.length} errors: ${errors.map((e) => e.message).join('; ')}`,
      );
    }

    context.logger.info(this.name, `All ${this.subSteps.length} parallel sub-steps completed successfully`);
  }

  override async rollback(context: WorkflowContext): Promise<void> {
    context.logger.info(
      this.name,
      `Rolling back ${this.executedSubSteps.length} executed parallel sub-steps in reverse order`,
    );
    for (let i = this.executedSubSteps.length - 1; i >= 0; i--) {
      const step = this.executedSubSteps[i];
      try {
        await step.rollback(context);
      } catch (err) {
        context.logger.error(this.name, `Rollback failed for sub-step ${step.name}`, err);
      }
    }
  }
}

// Self-register in WorkflowRegistry
WorkflowRegistry.register('parallel', ParallelStep);
