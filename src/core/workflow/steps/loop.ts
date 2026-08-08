import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';
import { WorkflowFactory } from '../factory.js';
import { WorkflowExecutor } from '../executor.js';
import { WorkflowState } from '../state.js';
import { randomUUID } from 'node:crypto';

/**
 * LoopStep
 * Repeatedly executes "steps" until a break condition is met.
 *
 * Config:
 *   maxIterations  (number, optional, default 20) – Safety ceiling to prevent infinite loops.
 *   breakCondition ('elementMissing' | 'urlContains' | 'variableEquals') – When to stop.
 *   selector       (string) – Used with elementMissing.
 *   contains       (string) – Used with urlContains.
 *   variable       (string) – Context variable name. Used with variableEquals.
 *   equals         (any)   – Value to compare. Used with variableEquals.
 *   steps          (array, required) – Steps to execute per iteration.
 */
export class LoopStep extends BaseWorkflowStep {
  readonly name = 'Loop';

  async execute(context: WorkflowContext): Promise<void> {
    const { maxIterations = 20, steps: loopSteps = [] } = this.config;

    if (!loopSteps.length) {
      context.logger.warn(this.name, 'No steps provided in loop, skipping');
      return;
    }

    const parsedSteps = WorkflowFactory.create({ name: 'loop-body', steps: loopSteps });
    const executor = new WorkflowExecutor();

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      context.logger.info(this.name, `Loop iteration ${iteration}/${maxIterations}`);

      if (await this.shouldBreak(context, iteration)) {
        context.logger.info(this.name, `Break condition met at iteration ${iteration}, exiting loop`);
        break;
      }

      const iterState = new WorkflowState(randomUUID());
      const result = await executor.execute(context, parsedSteps, iterState);

      if (result.status === 'failed') {
        throw new Error(`Loop iteration ${iteration} failed: ${result.error}`);
      }

      if (iteration === maxIterations) {
        context.logger.warn(this.name, `Reached maxIterations (${maxIterations}), exiting loop`);
      }
    }
  }

  private async shouldBreak(context: WorkflowContext, _iteration: number): Promise<boolean> {
    const { breakCondition, selector, contains, variable, equals } = this.config;

    if (!breakCondition) return false;

    switch (breakCondition) {
      case 'elementMissing':
        return (await context.page.locator(selector).count()) === 0;

      case 'urlContains':
        return context.page.url().includes(contains);

      case 'variableEquals':
        return context.getVariable(variable) === equals;

      default:
        throw new Error(`Loop step: Unknown breakCondition "${breakCondition}"`);
    }
  }
}

WorkflowRegistry.register('Loop', LoopStep);
