/**
 * Unit Tests for WorkflowEventEmitter
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecutor } from '../executor.js';
import { WorkflowContext } from '../context.js';
import { WorkflowState } from '../state.js';
import { BaseWorkflowStep } from '../step.js';

class EventTrackStep extends BaseWorkflowStep {
  readonly name = 'EventTrackStep';
  async execute(context: WorkflowContext): Promise<void> {
    context.setVariable('done', true);
  }
}

describe('Workflow Events', () => {
  test('dispatches start, step:start, step:success, checkpoint, and complete events', async () => {
    const executor = new WorkflowExecutor();
    const state = new WorkflowState('event-test-run');
    const context = new WorkflowContext({
      runId: 'event-test-run',
      page: {} as any,
      profile: {} as any,
    });

    const eventsFired: string[] = [];

    executor.events.on('workflow:start', () => eventsFired.push('workflow:start'));
    executor.events.on('workflow:step:start', (p) => eventsFired.push(`step:start:${p.stepName}`));
    executor.events.on('workflow:step:success', (p) => eventsFired.push(`step:success:${p.stepName}`));
    executor.events.on('workflow:checkpoint', () => eventsFired.push('checkpoint'));
    executor.events.on('workflow:complete', () => eventsFired.push('workflow:complete'));

    const step = new EventTrackStep();
    await executor.execute(context, [step], state);

    assert.ok(eventsFired.includes('workflow:start'));
    assert.ok(eventsFired.includes('step:start:EventTrackStep'));
    assert.ok(eventsFired.includes('step:success:EventTrackStep'));
    assert.ok(eventsFired.includes('checkpoint'));
    assert.ok(eventsFired.includes('workflow:complete'));
  });
});
