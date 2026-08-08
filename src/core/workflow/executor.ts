import type { WorkflowContext } from './context.js';
import { WorkflowState } from './state.js';
import type { WorkflowStep } from './step.js';

export interface WorkflowResult {
  runId: string;
  status: 'completed' | 'failed' | 'stopped';
  logs: string[];
  metrics: any[];
  error?: string;
}

export class WorkflowExecutor {
  async execute(
    context: WorkflowContext,
    steps: WorkflowStep[],
    state: WorkflowState
  ): Promise<WorkflowResult> {
    state.status = 'running';
    context.logger.info('Executor', `Starting workflow execution with ${steps.length} steps`);

    const executedSteps: WorkflowStep[] = [];

    try {
      for (let i = state.currentStepIndex; i < steps.length; i++) {
        const step = steps[i];
        state.currentStepIndex = i;

        if (state.hasCheckpoint(step.name)) {
          context.logger.info(step.name, `Skipping step (checkpoint already exists)`);
          executedSteps.push(step);
          continue;
        }

        context.logger.info(step.name, `Starting step execution`);
        const startTime = Date.now();
        let success = false;
        let attempt = 1;
        let lastError: Error | undefined;

        while (!success) {
          try {
            // Apply step timeout
            await Promise.race([
              step.execute(context),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error(`Step execution timed out after ${step.timeout()}ms`)),
                  step.timeout()
                )
              ),
            ]);
            success = true;
          } catch (err: any) {
            lastError = err;
            const wantsRetry = await step.retry(context, err, attempt);
            if (wantsRetry) {
              attempt++;
            } else {
              break;
            }
          }
        }

        const durationMs = Date.now() - startTime;

        if (success) {
          context.logger.info(step.name, `Step completed successfully in ${durationMs}ms`);
          context.logger.addMetric({
            stepName: step.name,
            durationMs,
            status: 'success',
          });
          state.addCheckpoint(step.name);
          executedSteps.push(step);
        } else {
          // Failure recovery: rollback and fail
          context.logger.error(
            step.name,
            `Step failed after ${attempt} attempts in ${durationMs}ms`,
            lastError
          );
          context.logger.addMetric({
            stepName: step.name,
            durationMs,
            status: 'failed',
            error: lastError?.message,
          });
          
          await context.logger.captureScreenshot(context.page, `fail-${step.name}`);
          
          state.status = 'failed';
          await this.rollback(context, executedSteps);
          throw lastError || new Error(`Step ${step.name} failed`);
        }
      }

      state.status = 'completed';
      context.logger.info('Executor', 'Workflow execution completed successfully');
      
      return {
        runId: context.runId,
        status: 'completed',
        logs: context.logger.getLogs(),
        metrics: context.logger.getMetrics(),
      };
    } catch (err: any) {
      state.status = 'failed';
      return {
        runId: context.runId,
        status: 'failed',
        logs: context.logger.getLogs(),
        metrics: context.logger.getMetrics(),
        error: err.message || 'Unknown workflow execution error',
      };
    }
  }

  private async rollback(context: WorkflowContext, executedSteps: WorkflowStep[]): Promise<void> {
    context.logger.info('Executor', `Initiating rollback for ${executedSteps.length} steps in reverse order`);
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const step = executedSteps[i];
      try {
        await step.rollback(context);
      } catch (err) {
        context.logger.error(step.name, 'Rollback failed', err);
      }
    }
  }
}
