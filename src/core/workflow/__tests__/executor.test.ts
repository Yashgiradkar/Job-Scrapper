/**
 * Unit Tests for WorkflowExecutor: sequential execution, timeout, retry, rollback, checkpoints
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecutor } from '../executor.js';
import { WorkflowContext } from '../context.js';
import { WorkflowState } from '../state.js';
import { BaseWorkflowStep } from '../step.js';
import { InMemoryCheckpointStore } from '../checkpoints.js';

// Test mock steps
class MockSuccessStep extends BaseWorkflowStep {
  readonly name: string;
  executed = false;
  rolledBack = false;

  constructor(name: string = 'MockSuccess') {
    super({ name });
    this.name = name;
  }

  async execute(context: WorkflowContext): Promise<void> {
    this.executed = true;
    context.setVariable(`${this.name}_done`, true);
  }

  override async rollback(_context: WorkflowContext): Promise<void> {
    this.rolledBack = true;
  }
}

class MockFailingStep extends BaseWorkflowStep {
  readonly name = 'MockFailing';
  attempts = 0;

  constructor(private readonly maxFails: number = 999) {
    super();
  }

  async execute(_context: WorkflowContext): Promise<void> {
    this.attempts++;
    if (this.attempts <= this.maxFails) {
      throw new Error(`Intentional error on attempt ${this.attempts}`);
    }
  }

  override async retry(_context: WorkflowContext, _error: Error, attempt: number): Promise<boolean> {
    return attempt < 3;
  }
}

class MockTimeoutStep extends BaseWorkflowStep {
  readonly name = 'MockTimeout';

  override timeout(): number {
    return 50; // 50ms timeout
  }

  async execute(_context: WorkflowContext): Promise<void> {
    await new Promise((r) => setTimeout(r, 200)); // sleep 200ms
  }
}

describe('WorkflowExecutor', () => {
  const dummyContext = new WorkflowContext({
    runId: 'test-run-1',
    page: {} as any,
    profile: {} as any,
  });

  test('executes sequential steps and records checkpoints', async () => {
    const store = new InMemoryCheckpointStore();
    const executor = new WorkflowExecutor({ checkpointStore: store });
    const state = new WorkflowState('test-run-1');

    const step1 = new MockSuccessStep('Step1');
    const step2 = new MockSuccessStep('Step2');

    const result = await executor.execute(dummyContext, [step1, step2], state);

    assert.equal(result.status, 'completed');
    assert.equal(step1.executed, true);
    assert.equal(step2.executed, true);
    assert.equal(dummyContext.getVariable('Step1_done'), true);
    assert.equal(dummyContext.getVariable('Step2_done'), true);
    assert.equal(result.checkpointsCount, 2);

    const savedCheckpoints = await store.getCheckpoints('test-run-1');
    assert.equal(savedCheckpoints.length, 2);
  });

  test('retries failing steps up to retry limit then triggers reverse rollback', async () => {
    const executor = new WorkflowExecutor({ autoRollbackOnFailure: true });
    const state = new WorkflowState('test-run-fail');

    const step1 = new MockSuccessStep('Step1');
    const failingStep = new MockFailingStep(10); // fails always

    const result = await executor.execute(dummyContext, [step1, failingStep], state);

    assert.equal(result.status, 'failed');
    assert.ok(failingStep.attempts >= 3, `Expected at least 3 attempts, got ${failingStep.attempts}`);
    assert.equal(step1.rolledBack, true); // Reverse rollback was called on step1!
  });

  test('enforces per-step timeout', async () => {
    const executor = new WorkflowExecutor();
    const state = new WorkflowState('test-run-timeout');

    const timeoutStep = new MockTimeoutStep();
    const result = await executor.execute(dummyContext, [timeoutStep], state);

    assert.equal(result.status, 'failed');
    assert.ok(result.error?.includes('timed out after 50ms'));
  });
});
