/**
 * Unit Tests for ParallelStep execution, concurrency, and rollback
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowContext } from '../context.js';
import { ParallelStep } from '../steps/parallel.js';
import { BaseWorkflowStep } from '../step.js';
import { WorkflowRegistry } from '../registry.js';

class AsyncWorkerStep extends BaseWorkflowStep {
  readonly name = 'AsyncWorkerStep';
  static executedCount = 0;
  static rolledBackCount = 0;

  async execute(context: WorkflowContext): Promise<void> {
    const delay = this.config.delayMs ?? 20;
    await new Promise((r) => setTimeout(r, delay));

    if (this.config.shouldFail) {
      throw new Error(`Worker intentional failure: ${this.config.id}`);
    }

    AsyncWorkerStep.executedCount++;
    const completed = context.getVariable<string[]>('completed') ?? [];
    completed.push(this.config.id);
    context.setVariable('completed', completed);
  }

  override async rollback(_context: WorkflowContext): Promise<void> {
    AsyncWorkerStep.rolledBackCount++;
  }
}

WorkflowRegistry.register('async-worker', AsyncWorkerStep);

describe('ParallelStep', () => {
  test('executes multiple sub-steps concurrently', async () => {
    AsyncWorkerStep.executedCount = 0;
    AsyncWorkerStep.rolledBackCount = 0;

    const context = new WorkflowContext({
      runId: 'par-1',
      page: {} as any,
      profile: {} as any,
      initialVariables: { completed: [] },
    });

    const parallel = new ParallelStep({
      name: 'ConcurrentFetch',
      maxConcurrency: 3,
      steps: [
        { action: 'async-worker', params: { id: 'task-1', delayMs: 15 } },
        { action: 'async-worker', params: { id: 'task-2', delayMs: 10 } },
        { action: 'async-worker', params: { id: 'task-3', delayMs: 5 } },
      ],
    });

    await parallel.execute(context);

    const completed = context.getVariable<string[]>('completed');
    assert.equal(completed?.length, 3);
    assert.ok(completed?.includes('task-1'));
    assert.ok(completed?.includes('task-2'));
    assert.ok(completed?.includes('task-3'));
  });

  test('triggers rollback when a parallel sub-step fails', async () => {
    AsyncWorkerStep.executedCount = 0;
    AsyncWorkerStep.rolledBackCount = 0;

    const context = new WorkflowContext({
      runId: 'par-fail',
      page: {} as any,
      profile: {} as any,
      initialVariables: { completed: [] },
    });

    const parallel = new ParallelStep({
      name: 'FailingParallel',
      steps: [
        { action: 'async-worker', params: { id: 'task-ok', delayMs: 5 } },
        { action: 'async-worker', params: { id: 'task-bad', delayMs: 10, shouldFail: true } },
      ],
    });

    await assert.rejects(
      async () => {
        await parallel.execute(context);
      },
      /Worker intentional failure: task-bad/,
    );

    assert.ok(AsyncWorkerStep.rolledBackCount >= 1);
  });
});
