export type WorkflowStatus = 'queued' | 'running' | 'completed' | 'failed' | 'stopped';

export interface WorkflowStateSnapshot {
  runId: string;
  status: WorkflowStatus;
  currentStepIndex: number;
  variables: Record<string, any>;
  checkpoints: string[];
  error?: string;
}

export class WorkflowState {
  readonly runId: string;
  status: WorkflowStatus = 'queued';
  currentStepIndex: number = 0;
  private readonly checkpoints = new Set<string>();

  constructor(runId: string) {
    this.runId = runId;
  }

  addCheckpoint(stepName: string): void {
    this.checkpoints.add(stepName);
  }

  hasCheckpoint(stepName: string): boolean {
    return this.checkpoints.has(stepName);
  }

  getCheckpoints(): string[] {
    return Array.from(this.checkpoints);
  }

  toSnapshot(variables: Record<string, any> = {}): WorkflowStateSnapshot {
    return {
      runId: this.runId,
      status: this.status,
      currentStepIndex: this.currentStepIndex,
      variables,
      checkpoints: this.getCheckpoints(),
    };
  }
}
