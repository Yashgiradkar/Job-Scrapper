/**
 * Unit Tests for Conditional (If) and Loop Workflow Steps
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowContext } from '../context.js';
import { IfStep } from '../steps/if-branch.js';
import { LoopStep } from '../steps/loop.js';
import { WorkflowRegistry } from '../registry.js';
import { BaseWorkflowStep } from '../step.js';

class RecordStep extends BaseWorkflowStep {
  readonly name = 'RecordStep';
  async execute(context: WorkflowContext): Promise<void> {
    const list = context.getVariable<string[]>('history') ?? [];
    list.push(this.config.tag ?? 'recorded');
    context.setVariable('history', list);
  }
}

WorkflowRegistry.register('record-step', RecordStep);

describe('Conditional & Loop Steps', () => {
  test('IfStep executes thenBranch when variableEquals condition matches', async () => {
    const context = new WorkflowContext({
      runId: 'cond-1',
      page: {} as any,
      profile: {} as any,
      initialVariables: { userRole: 'admin', history: [] },
    });

    const ifStep = new IfStep({
      condition: {
        variableEquals: { key: 'userRole', value: 'admin' },
      },
      thenSteps: [{ action: 'record-step', params: { tag: 'admin_action' } }],
      elseSteps: [{ action: 'record-step', params: { tag: 'user_action' } }],
    });

    await ifStep.execute(context);

    const history = context.getVariable<string[]>('history');
    assert.deepEqual(history, ['admin_action']);
  });

  test('IfStep executes elseBranch when condition does not match', async () => {
    const context = new WorkflowContext({
      runId: 'cond-2',
      page: {} as any,
      profile: {} as any,
      initialVariables: { userRole: 'guest', history: [] },
    });

    const ifStep = new IfStep({
      condition: {
        variableEquals: { key: 'userRole', value: 'admin' },
      },
      thenSteps: [{ action: 'record-step', params: { tag: 'admin_action' } }],
      elseSteps: [{ action: 'record-step', params: { tag: 'guest_action' } }],
    });

    await ifStep.execute(context);

    const history = context.getVariable<string[]>('history');
    assert.deepEqual(history, ['guest_action']);
  });

  test('LoopStep iterates through variable items and executes sub-steps', async () => {
    const context = new WorkflowContext({
      runId: 'loop-1',
      page: {} as any,
      profile: {} as any,
      initialVariables: {
        skills: ['TypeScript', 'Playwright', 'PostgreSQL'],
        history: [],
      },
    });

    const loopStep = new LoopStep({
      itemsVariable: 'skills',
      steps: [{ action: 'record-step', params: { tag: 'processed_skill' } }],
    });

    await loopStep.execute(context);

    const history = context.getVariable<string[]>('history');
    assert.equal(history?.length, 3);
  });
});
