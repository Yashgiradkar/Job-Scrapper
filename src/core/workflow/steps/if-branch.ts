import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';
import { WorkflowFactory } from '../factory.js';
import { WorkflowExecutor } from '../executor.js';
import { WorkflowState } from '../state.js';
import { randomUUID } from 'node:crypto';

/**
 * IfBranchStep
 * Conditional branching: executes "then" steps or "else" steps based on a condition.
 *
 * Config:
 *   condition   ('elementExists' | 'elementVisible' | 'variableEquals' | 'urlContains')
 *   selector    (string) – Used with elementExists / elementVisible.
 *   variable    (string) – Context variable name. Used with variableEquals.
 *   equals      (any)   – Value to compare against. Used with variableEquals.
 *   contains    (string) – Substring. Used with urlContains.
 *   then        (WorkflowStep[]) – Steps to execute if condition is true.
 *   else        (WorkflowStep[]) – Steps to execute if condition is false (optional).
 */
export class IfBranchStep extends BaseWorkflowStep {
  readonly name = 'If';

  async execute(context: WorkflowContext): Promise<void> {
    const conditionMet = await this.evaluateCondition(context);
    context.logger.info(this.name, `Condition evaluated to: ${conditionMet}`);

    const rawBranch: unknown[] | undefined = conditionMet
      ? (this.config.thenSteps || this.config.then)
      : (this.config.elseSteps || this.config.else);

    if (!rawBranch || rawBranch.length === 0) {
      context.logger.info(this.name, `No steps defined for branch (${conditionMet ? 'then' : 'else'}), skipping`);
      return;
    }

    const branchSteps = WorkflowFactory.fromJSON(rawBranch as Array<Record<string, any>>);
    const branchState = new WorkflowState(randomUUID());
    const executor = new WorkflowExecutor();
    const result = await executor.execute(context, branchSteps, branchState);

    if (result.status === 'failed') {
      throw new Error(`If-branch execution failed: ${result.error}`);
    }
  }

  private async evaluateCondition(context: WorkflowContext): Promise<boolean> {
    const { condition, selector, variable, equals, contains } = this.config;

    if (typeof condition === 'object' && condition !== null) {
      if (condition.variableEquals) {
        return context.getVariable(condition.variableEquals.key) === condition.variableEquals.value;
      }
      if (condition.elementExists) {
        return (await context.page.locator(condition.elementExists).count()) > 0;
      }
      if (condition.elementVisible) {
        return context.page.locator(condition.elementVisible).isVisible();
      }
      if (condition.urlContains) {
        return context.page.url().includes(condition.urlContains);
      }
    }

    switch (condition) {
      case 'elementExists':
        return (await context.page.locator(selector).count()) > 0;

      case 'elementVisible':
        return context.page.locator(selector).isVisible();

      case 'variableEquals':
        return context.getVariable(variable) === equals;

      case 'urlContains':
        return context.page.url().includes(contains);

      default:
        throw new Error(`IfBranch step: Unknown condition "${JSON.stringify(condition)}"`);
    }
  }
}

export const IfStep = IfBranchStep;

WorkflowRegistry.register('If', IfBranchStep);
WorkflowRegistry.register('if', IfBranchStep);
WorkflowRegistry.register('IfStep', IfBranchStep);
WorkflowRegistry.register('IfBranch', IfBranchStep);

