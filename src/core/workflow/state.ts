/**
 * WorkflowState
 *
 * Tracks execution status, checkpoints, timing, and creates immutable snapshots.
 */

import { randomUUID } from 'node:crypto';
import type {
  WorkflowStatus,
  WorkflowStateSnapshot,
  WorkflowCheckpoint,
} from './types.js';

export class WorkflowState {
  readonly runId: string;
  workflowId?: string;
  status: WorkflowStatus = 'queued';
  currentStepIndex: number = 0;
  startedAt?: string;
  completedAt?: string;

  private readonly checkpoints: WorkflowCheckpoint[] = [];
  private readonly executedSteps: string[] = [];

  constructor(runId: string, workflowId?: string) {
    this.runId = runId;
    this.workflowId = workflowId;
  }

  markStarted(): void {
    this.status = 'running';
    this.startedAt = new Date().toISOString();
  }

  markCompleted(): void {
    this.status = 'completed';
    this.completedAt = new Date().toISOString();
  }

  markFailed(): void {
    this.status = 'failed';
    this.completedAt = new Date().toISOString();
  }

  markRolledBack(): void {
    this.status = 'rolled_back';
    this.completedAt = new Date().toISOString();
  }

  markPaused(): void {
    this.status = 'paused';
  }

  addExecutedStep(stepName: string): void {
    this.executedSteps.push(stepName);
  }

  addCheckpoint(
    stepName: string,
    stepIndex: number,
    variablesSnapshot: Record<string, unknown> = {},
    pageUrl?: string,
  ): WorkflowCheckpoint {
    const checkpoint: WorkflowCheckpoint = {
      id: randomUUID(),
      stepName,
      stepIndex,
      timestamp: new Date().toISOString(),
      variablesSnapshot: { ...variablesSnapshot },
      pageUrl,
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  hasCheckpoint(stepName: string): boolean {
    return this.checkpoints.some((cp) => cp.stepName === stepName);
  }

  getCheckpoint(stepName: string): WorkflowCheckpoint | undefined {
    return this.checkpoints.find((cp) => cp.stepName === stepName);
  }

  getLatestCheckpoint(): WorkflowCheckpoint | undefined {
    return this.checkpoints[this.checkpoints.length - 1];
  }

  getCheckpoints(): WorkflowCheckpoint[] {
    return [...this.checkpoints];
  }

  toSnapshot(variables: Record<string, unknown> = {}): WorkflowStateSnapshot {
    const durationMs = this.startedAt
      ? (this.completedAt ? new Date(this.completedAt).getTime() : Date.now()) -
        new Date(this.startedAt).getTime()
      : 0;

    return {
      runId: this.runId,
      workflowId: this.workflowId,
      status: this.status,
      currentStepIndex: this.currentStepIndex,
      variables,
      checkpoints: this.getCheckpoints(),
      executedStepNames: [...this.executedSteps],
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      durationMs,
    };
  }

  static fromSnapshot(snapshot: WorkflowStateSnapshot): WorkflowState {
    const state = new WorkflowState(snapshot.runId, snapshot.workflowId);
    state.status = snapshot.status;
    state.currentStepIndex = snapshot.currentStepIndex;
    state.startedAt = snapshot.startedAt;
    state.completedAt = snapshot.completedAt;

    for (const cp of snapshot.checkpoints) {
      state.checkpoints.push(cp);
    }
    for (const step of snapshot.executedStepNames) {
      state.executedSteps.push(step);
    }
    return state;
  }
}
