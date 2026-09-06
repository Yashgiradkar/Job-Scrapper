/**
 * WorkflowExecutor
 *
 * Drives sequential and branching step execution with:
 * - Per-step timeout enforcement
 * - Configurable retry policies with backoff
 * - Reverse rollback on fatal step failures
 * - Automatic checkpointing and resume support
 * - Event emission via WorkflowEventEmitter (Observer Pattern)
 */

import type { WorkflowContext } from './context.js';
import { WorkflowState } from './state.js';
import type { WorkflowStep } from './step.js';
import { WorkflowEventEmitter } from './events.js';
import type { ICheckpointStore } from './checkpoints.js';
import { InMemoryCheckpointStore } from './checkpoints.js';

export interface WorkflowResult {
  runId: string;
  status: 'completed' | 'failed' | 'paused' | 'stopped';
  logs: string[];
  metrics: any[];
  error?: string;
  checkpointsCount: number;
  durationMs: number;
}

export interface WorkflowExecutorOptions {
  events?: WorkflowEventEmitter;
  checkpointStore?: ICheckpointStore;
  autoRollbackOnFailure?: boolean;
}

export class WorkflowExecutor {
  readonly events: WorkflowEventEmitter;
  readonly checkpointStore: ICheckpointStore;
  private readonly autoRollback: boolean;

  constructor(options: WorkflowExecutorOptions = {}) {
    this.events = options.events ?? new WorkflowEventEmitter();
    this.checkpointStore = options.checkpointStore ?? new InMemoryCheckpointStore();
    this.autoRollback = options.autoRollbackOnFailure ?? true;
  }

  async execute(
    context: WorkflowContext,
    steps: WorkflowStep[],
    state: WorkflowState,
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    state.markStarted();

    context.logger.info(
      'Executor',
      `Starting workflow run [${context.runId}] with ${steps.length} total steps (resuming from step index ${state.currentStepIndex})`,
    );

    this.events.emit('workflow:start', {
      runId: context.runId,
      totalSteps: steps.length,
      timestamp: new Date().toISOString(),
    });

    const executedSteps: WorkflowStep[] = [];

    try {
      for (let i = state.currentStepIndex; i < steps.length; i++) {
        const step = steps[i];
        state.currentStepIndex = i;

        // Skip step if already recorded in a checkpoint
        if (state.hasCheckpoint(step.name)) {
          context.logger.info(step.name, `Skipping step [${step.name}] (checkpoint exists)`);
          executedSteps.push(step);
          continue;
        }

        this.events.emit('workflow:step:start', {
          runId: context.runId,
          stepName: step.name,
          stepIndex: i,
          params: step.config,
        });

        context.logger.info(step.name, `Executing step [${step.name}] (index ${i})`);
        const stepStartTime = Date.now();
        let success = false;
        let attempt = 1;
        let lastError: Error | undefined;

        while (!success) {
          try {
            // Apply step timeout
            const timeoutMs = step.timeout();
            await Promise.race([
              step.execute(context),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Step [${step.name}] timed out after ${timeoutMs}ms`)),
                  timeoutMs,
                ),
              ),
            ]);
            success = true;
          } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));

            this.events.emit('workflow:step:retry', {
              runId: context.runId,
              stepName: step.name,
              stepIndex: i,
              attempt,
              error: lastError,
            });

            const wantsRetry = await step.retry(context, lastError, attempt);
            if (wantsRetry) {
              attempt++;
              // Optional backoff delay
              const backoff = (step.config.backoffMs ?? 500) * attempt;
              await new Promise((r) => setTimeout(r, Math.min(backoff, 5000)));
            } else {
              break;
            }
          }
        }

        const stepDurationMs = Date.now() - stepStartTime;

        if (success) {
          context.logger.info(step.name, `Step [${step.name}] succeeded in ${stepDurationMs}ms`);
          context.logger.addMetric({
            stepName: step.name,
            durationMs: stepDurationMs,
            status: 'success',
          });

          this.events.emit('workflow:step:success', {
            runId: context.runId,
            stepName: step.name,
            stepIndex: i,
            durationMs: stepDurationMs,
          });

          // Create and persist checkpoint
          const checkpoint = state.addCheckpoint(
            step.name,
            i,
            context.getAllVariables(),
            context.page?.url?.() ?? undefined,
          );
          await this.checkpointStore.saveCheckpoint(context.runId, checkpoint);
          await this.checkpointStore.saveSnapshot(state.toSnapshot(context.getAllVariables()));

          this.events.emit('workflow:checkpoint', {
            runId: context.runId,
            checkpoint,
          });

          state.addExecutedStep(step.name);
          executedSteps.push(step);
        } else {
          // Failure handling
          const errorMsg = lastError?.message || `Step ${step.name} failed`;
          context.logger.error(step.name, `Step failed after ${attempt} attempts`, lastError);

          context.logger.addMetric({
            stepName: step.name,
            durationMs: stepDurationMs,
            status: 'failed',
            error: errorMsg,
          });

          this.events.emit('workflow:step:fail', {
            runId: context.runId,
            stepName: step.name,
            stepIndex: i,
            durationMs: stepDurationMs,
            error: lastError,
          });

          await context.logger.captureScreenshot(context.page, `fail-${step.name}`);

          if (step.config.continueOnError === true) {
            context.logger.warn(step.name, `continueOnError is enabled; proceeding to next step`);
            continue;
          }

          state.markFailed();
          await this.checkpointStore.saveSnapshot(state.toSnapshot(context.getAllVariables()));

          if (this.autoRollback) {
            await this.rollback(context, executedSteps);
            state.markRolledBack();
          }

          this.events.emit('workflow:fail', {
            runId: context.runId,
            error: errorMsg,
            failedStep: step.name,
          });

          throw lastError || new Error(`Step ${step.name} failed`);
        }
      }

      state.markCompleted();
      const totalDuration = Date.now() - startTime;
      await this.checkpointStore.saveSnapshot(state.toSnapshot(context.getAllVariables()));

      context.logger.info(
        'Executor',
        `Workflow run [${context.runId}] completed successfully in ${totalDuration}ms`,
      );

      this.events.emit('workflow:complete', {
        runId: context.runId,
        durationMs: totalDuration,
        checkpointsCount: state.getCheckpoints().length,
      });

      return {
        runId: context.runId,
        status: 'completed',
        logs: context.logger.getLogs(),
        metrics: context.logger.getMetrics(),
        checkpointsCount: state.getCheckpoints().length,
        durationMs: totalDuration,
      };
    } catch (err: unknown) {
      state.markFailed();
      const totalDuration = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      return {
        runId: context.runId,
        status: 'failed',
        logs: context.logger.getLogs(),
        metrics: context.logger.getMetrics(),
        error: errorMsg,
        checkpointsCount: state.getCheckpoints().length,
        durationMs: totalDuration,
      };
    }
  }

  /**
   * Executes rollback on all executed steps in reverse chronological order.
   */
  async rollback(context: WorkflowContext, executedSteps: WorkflowStep[]): Promise<void> {
    context.logger.info(
      'Executor',
      `Initiating reverse rollback for ${executedSteps.length} executed steps`,
    );

    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];
      try {
        this.events.emit('workflow:step:rollback', {
          runId: context.runId,
          stepName: step.name,
          stepIndex: i,
        });
        await step.rollback(context);
        context.logger.info(step.name, `Rollback succeeded for step [${step.name}]`);
      } catch (err) {
        context.logger.error(step.name, `Rollback failed for step [${step.name}]`, err);
      }
    }
  }
}
