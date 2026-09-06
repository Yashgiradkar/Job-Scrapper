/**
 * Unit Tests for WorkflowBuilder, WorkflowValidator, and WorkflowEngine Facade
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowBuilder } from '../builder.js';
import { WorkflowValidator } from '../validator.js';
import { WorkflowEngine } from '../engine.js';
import { WorkflowContext } from '../context.js';
import { BaseWorkflowStep } from '../step.js';
import { WorkflowRegistry } from '../registry.js';

class EngineTestStep extends BaseWorkflowStep {
  readonly name: string;

  constructor(config: Record<string, any> = {}) {
    super(config);
    this.name = config.name ?? 'EngineTestStep';
  }

  async execute(context: WorkflowContext): Promise<void> {
    context.setVariable('executed', true);
  }
}

WorkflowRegistry.register('engine-test-action', EngineTestStep);

describe('WorkflowBuilder, Validator & Engine', () => {
  test('WorkflowBuilder constructs valid steps and JSON definition', () => {
    const builder = new WorkflowBuilder('wf-builder-test')
      .name('Builder Test Workflow')
      .describe('Demonstration workflow definition')
      .step('TestStep', 'engine-test-action', { foo: 'bar' }, { timeoutMs: 15000, checkpoint: true });

    const json = builder.toJSON();
    assert.equal(json.workflowId, 'wf-builder-test');
    assert.equal(json.name, 'Builder Test Workflow');
    assert.equal(json.steps.length, 1);
    assert.equal(json.steps[0].action, 'engine-test-action');
    assert.equal(json.steps[0].checkpoint, true);

    const steps = builder.build();
    assert.equal(steps.length, 1);
    assert.equal(steps[0].name, 'TestStep');
  });

  test('WorkflowValidator flags unregistered actions in workflow definitions', () => {
    const invalidDefinition = {
      version: '1.0.0',
      workflowId: 'wf-invalid',
      steps: [
        {
          name: 'InvalidStep',
          action: 'completely-non-existent-action',
          params: {},
        },
      ],
      errorHandling: {
        onTimeout: 'abort',
        onFailure: 'rollback',
      },
    };

    const validation = WorkflowValidator.validate(invalidDefinition);
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((e) => e.includes('not registered in WorkflowRegistry')));
  });

  test('WorkflowEngine runs validated workflow definition end-to-end', async () => {
    const engine = new WorkflowEngine();
    const context = new WorkflowContext({
      runId: 'engine-run-1',
      page: {} as any,
      profile: {} as any,
    });

    const definition = {
      version: '1.0.0',
      workflowId: 'wf-engine-run',
      steps: [
        {
          name: 'StepOne',
          action: 'engine-test-action',
          params: {},
        },
      ],
      errorHandling: {
        onTimeout: 'abort' as const,
        onFailure: 'rollback' as const,
      },
    };

    const result = await engine.run(definition, context);

    assert.equal(result.status, 'completed');
    assert.equal(context.getVariable('executed'), true);
  });
});
