/**
 * Fluent WorkflowBuilder
 *
 * Provides a type-safe, chainable builder for constructing workflow steps,
 * branches, loops, and parallel executions.
 */

import type { WorkflowStep } from './step.js';
import { WorkflowFactory } from './factory.js';
import type { WorkflowDefinition, StepConfig } from './types.js';

export class WorkflowBuilder {
  private readonly workflowId: string;
  private workflowName?: string;
  private description?: string;
  private readonly stepConfigs: StepConfig[] = [];

  constructor(workflowId: string = `wf-${Date.now()}`) {
    this.workflowId = workflowId;
  }

  name(name: string): this {
    this.workflowName = name;
    return this;
  }

  describe(desc: string): this {
    this.description = desc;
    return this;
  }

  step(
    name: string,
    action: string,
    params: Record<string, unknown> = {},
    options: {
      timeoutMs?: number;
      retryPolicy?: { maxRetries: number; backoffMs: number; exponential?: boolean };
      checkpoint?: boolean;
      continueOnError?: boolean;
    } = {},
  ): this {
    this.stepConfigs.push({
      name,
      action,
      params,
      timeoutMs: options.timeoutMs,
      retryPolicy: options.retryPolicy ? { ...options.retryPolicy, exponential: options.retryPolicy.exponential ?? true } : undefined,
      checkpoint: options.checkpoint ?? false,
      continueOnError: options.continueOnError ?? false,
    });
    return this;
  }

  openPage(url: string, options: { waitUntil?: string; timeoutMs?: number } = {}): this {
    return this.step('OpenPage', 'open-page', { url, ...options });
  }

  click(selector: string, options: { waitForNavigation?: boolean; timeoutMs?: number } = {}): this {
    return this.step(`Click(${selector})`, 'click', { selector, ...options });
  }

  fillText(selector: string, text: string, options: { delayMs?: number } = {}): this {
    return this.step(`FillText(${selector})`, 'fill-text', { selector, text, ...options });
  }

  selectDropdown(selector: string, value: string): this {
    return this.step(`SelectDropdown(${selector})`, 'select-dropdown', { selector, value });
  }

  checkCheckbox(selector: string): this {
    return this.step(`CheckCheckbox(${selector})`, 'check-checkbox', { selector });
  }

  selectRadio(selector: string): this {
    return this.step(`SelectRadio(${selector})`, 'select-radio', { selector });
  }

  uploadFile(selector: string, filePath?: string): this {
    return this.step(`UploadFile(${selector})`, 'upload-file', { selector, filePath });
  }

  scroll(direction: 'up' | 'down' = 'down', distance: number = 800): this {
    return this.step(`Scroll(${direction})`, 'scroll', { direction, distance });
  }

  wait(delayMsOrSelector: number | string): this {
    if (typeof delayMsOrSelector === 'number') {
      return this.step(`Wait(${delayMsOrSelector}ms)`, 'wait', { delayMs: delayMsOrSelector });
    }
    return this.step(`WaitForSelector(${delayMsOrSelector})`, 'wait', { selector: delayMsOrSelector });
  }

  screenshot(name: string): this {
    return this.step(`Screenshot(${name})`, 'screenshot', { name });
  }

  setVariable(key: string, value: unknown): this {
    return this.step(`SetVariable(${key})`, 'set-variable', { key, value });
  }

  checkpoint(name: string): this {
    return this.step(name, 'wait', { delayMs: 0 }, { checkpoint: true });
  }

  if(
    condition: { elementExists?: string; variableEquals?: { key: string; value: unknown }; urlContains?: string },
    thenBuilder: (builder: WorkflowBuilder) => void,
    elseBuilder?: (builder: WorkflowBuilder) => void,
  ): this {
    const thenB = new WorkflowBuilder();
    thenBuilder(thenB);

    const params: Record<string, unknown> = {
      condition,
      thenSteps: thenB.toStepConfigs(),
    };

    if (elseBuilder) {
      const elseB = new WorkflowBuilder();
      elseBuilder(elseB);
      params.elseSteps = elseB.toStepConfigs();
    }

    return this.step('IfCondition', 'if', params);
  }

  loop(
    config: {
      itemsVariable?: string;
      maxIterations?: number;
      untilElementExists?: string;
      itemAlias?: string;
    },
    loopBuilder: (builder: WorkflowBuilder) => void,
  ): this {
    const loopB = new WorkflowBuilder();
    loopBuilder(loopB);

    return this.step('Loop', 'loop', {
      ...config,
      steps: loopB.toStepConfigs(),
    });
  }

  parallel(
    subBuilders: Array<(builder: WorkflowBuilder) => void>,
    options: { maxConcurrency?: number; failFast?: boolean } = {},
  ): this {
    const parallelSteps = subBuilders.map((fn) => {
      const b = new WorkflowBuilder();
      fn(b);
      return b.toStepConfigs();
    }).flat();

    return this.step('Parallel', 'parallel', {
      steps: parallelSteps,
      maxConcurrency: options.maxConcurrency ?? 5,
      failFast: options.failFast ?? true,
    });
  }

  toStepConfigs(): StepConfig[] {
    return [...this.stepConfigs];
  }

  toJSON(): WorkflowDefinition {
    return {
      version: '1.0.0',
      workflowId: this.workflowId,
      name: this.workflowName,
      description: this.description,
      steps: this.toStepConfigs(),
      errorHandling: {
        onTimeout: 'abort',
        onFailure: 'rollback',
      },
    };
  }

  build(): WorkflowStep[] {
    return WorkflowFactory.fromJSON(this.stepConfigs);
  }
}
