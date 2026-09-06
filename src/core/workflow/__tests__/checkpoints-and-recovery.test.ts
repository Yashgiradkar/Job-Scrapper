/**
 * Unit Tests for Checkpoint Persistence and WorkflowRecoveryManager
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowContext } from '../context.js';
import { InMemoryCheckpointStore } from '../checkpoints.js';
import { WorkflowRecoveryManager } from '../recovery.js';
import { BaseWorkflowStep } from '../step.js';
import { WorkflowState } from '../state.js';
import { WorkflowExecutor } from '../executor.js';

class TraceStep extends BaseWorkflowStep {
  readonly name: string;
  executionCount = 0;

  constructor(name: string) {
    super({ name });
    this.name = name;
  }

  async execute(context: WorkflowContext): Promise<void> {
    this.executionCount++;
    context.setVariable(this.name, this.executionCount);
  }
}

describe('Checkpoints & Workflow Recovery', () => {
  test('persists checkpoints and resumes from exact checkpoint point', async () => {
    const store = new InMemoryCheckpointStore();
    const executor = new WorkflowExecutor({ checkpointStore: store });
    const recovery = new WorkflowRecoveryManager(store, executor);

    const step1 = new TraceStep('Step1');
    const step2 = new TraceStep('Step2');
    const step3 = new TraceStep('Step3');

    const context = new WorkflowContext({
      runId: 'resume-run-1',
      page: {} as any,
      profile: {} as any,
    });

    const state = new WorkflowState('resume-run-1');

    // Execute first two steps
    await executor.execute(context, [step1, step2], state);

    assert.equal(step1.executionCount, 1);
    assert.equal(step2.executionCount, 1);
    assert.equal(step3.executionCount, 0);

    // Verify checkpoints stored
    const checkpoints = await store.getCheckpoints('resume-run-1');
    assert.equal(checkpoints.length, 2);

    // Now simulate resume with all 3 steps
    const resumeContext = new WorkflowContext({
      runId: 'resume-run-1',
      page: {} as any,
      profile: {} as any,
    });

    const resumeResult = await recovery.resume('resume-run-1', resumeContext, [step1, step2, step3]);

    assert.equal(resumeResult.status, 'completed');
    // step1 and step2 were skipped because checkpoints existed!
    assert.equal(step1.executionCount, 1);
    assert.equal(step2.executionCount, 1);
    assert.equal(step3.executionCount, 1); // step3 was executed on resume!
    assert.equal(resumeContext.getVariable('Step3'), 1);
  });

  test('correctly reports canResume() based on snapshot status', async () => {
    const store = new InMemoryCheckpointStore();
    const recovery = new WorkflowRecoveryManager(store);

    assert.equal(await recovery.canResume('non-existent'), false);

    await store.saveSnapshot({
      runId: 'failed-run',
      status: 'failed',
      currentStepIndex: 1,
      variables: {},
      checkpoints: [
        {
          id: 'cp-1',
          stepName: 'Step1',
          stepIndex: 0,
          timestamp: new Date().toISOString(),
          variablesSnapshot: {},
        },
      ],
      executedStepNames: ['Step1'],
    });

    assert.equal(await recovery.canResume('failed-run'), true);
  });
});
