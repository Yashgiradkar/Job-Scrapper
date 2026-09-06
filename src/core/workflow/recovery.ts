/**
 * Workflow Recovery & Resume Subsystem
 *
 * Reconstructs workflow state from persisted checkpoints, restores context variables,
 * and drives resumption of interrupted, paused, or failed runs.
 */

import type { WorkflowContext } from './context.js';
import { WorkflowState } from './state.js';
import type { WorkflowStep } from './step.js';
import { WorkflowExecutor, type WorkflowResult } from './executor.js';
import type { ICheckpointStore } from './checkpoints.js';
import { InMemoryCheckpointStore } from './checkpoints.js';
import type { WorkflowStateSnapshot } from './types.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('workflow-recovery');

export class WorkflowRecoveryManager {
  private readonly checkpointStore: ICheckpointStore;
  private readonly executor: WorkflowExecutor;

  constructor(checkpointStore?: ICheckpointStore, executor?: WorkflowExecutor) {
    this.checkpointStore = checkpointStore ?? new InMemoryCheckpointStore();
    this.executor = executor ?? new WorkflowExecutor({ checkpointStore: this.checkpointStore });
  }

  /**
   * Evaluates whether a given workflow run can be resumed.
   */
  async canResume(runId: string): Promise<boolean> {
    const snapshot = await this.checkpointStore.getSnapshot(runId);
    if (!snapshot) return false;

    // Resumable if failed or paused and has checkpoints
    const isInterrupted = snapshot.status === 'failed' || snapshot.status === 'paused';
    return isInterrupted && snapshot.checkpoints.length > 0;
  }

  /**
   * Inspects a saved workflow snapshot.
   */
  async inspect(runId: string): Promise<WorkflowStateSnapshot | undefined> {
    return this.checkpointStore.getSnapshot(runId);
  }

  /**
   * Resumes workflow execution from the last saved checkpoint.
   */
  async resume(
    runId: string,
    context: WorkflowContext,
    steps: WorkflowStep[],
  ): Promise<WorkflowResult> {
    const snapshot = await this.checkpointStore.getSnapshot(runId);
    if (!snapshot) {
      throw new Error(`Cannot resume workflow [${runId}]: snapshot not found in checkpoint store`);
    }

    logger.info(
      { runId, status: snapshot.status, checkpointCount: snapshot.checkpoints.length },
      'Reconstructing workflow state from checkpoint snapshot',
    );

    // Rehydrate state from snapshot
    const state = WorkflowState.fromSnapshot(snapshot);
    state.status = 'resuming';

    // Restore saved variables into context
    if (snapshot.variables) {
      for (const [key, value] of Object.entries(snapshot.variables)) {
        context.setVariable(key, value);
      }
    }

    // Determine the resume step index: step immediately following the latest checkpoint
    const latestCheckpoint = state.getLatestCheckpoint();
    if (latestCheckpoint) {
      state.currentStepIndex = latestCheckpoint.stepIndex + 1;
      logger.info(
        { latestCheckpoint: latestCheckpoint.stepName, resumeIndex: state.currentStepIndex },
        'Resuming workflow after latest checkpoint',
      );
    }

    this.executor.events.emit('workflow:resume', {
      runId,
      fromStepIndex: state.currentStepIndex,
    });

    // Execute remaining steps
    return this.executor.execute(context, steps, state);
  }
}
