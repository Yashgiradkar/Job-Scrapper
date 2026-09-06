/**
 * Checkpoint Management Subsystem
 *
 * Provides repository interfaces and implementations for persisting and restoring
 * workflow execution checkpoints and state snapshots.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { WorkflowCheckpoint, WorkflowStateSnapshot } from './types.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('checkpoint-store');

export interface ICheckpointStore {
  saveCheckpoint(runId: string, checkpoint: WorkflowCheckpoint): Promise<void>;
  getCheckpoints(runId: string): Promise<WorkflowCheckpoint[]>;
  saveSnapshot(snapshot: WorkflowStateSnapshot): Promise<void>;
  getSnapshot(runId: string): Promise<WorkflowStateSnapshot | undefined>;
  deleteSnapshot(runId: string): Promise<void>;
}

export class InMemoryCheckpointStore implements ICheckpointStore {
  private readonly snapshots = new Map<string, WorkflowStateSnapshot>();
  private readonly checkpoints = new Map<string, WorkflowCheckpoint[]>();

  async saveCheckpoint(runId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
    const list = this.checkpoints.get(runId) ?? [];
    list.push(checkpoint);
    this.checkpoints.set(runId, list);
  }

  async getCheckpoints(runId: string): Promise<WorkflowCheckpoint[]> {
    return this.checkpoints.get(runId) ?? [];
  }

  async saveSnapshot(snapshot: WorkflowStateSnapshot): Promise<void> {
    this.snapshots.set(snapshot.runId, JSON.parse(JSON.stringify(snapshot)));
  }

  async getSnapshot(runId: string): Promise<WorkflowStateSnapshot | undefined> {
    const found = this.snapshots.get(runId);
    return found ? JSON.parse(JSON.stringify(found)) : undefined;
  }

  async deleteSnapshot(runId: string): Promise<void> {
    this.snapshots.delete(runId);
    this.checkpoints.delete(runId);
  }
}

export class FileCheckpointStore implements ICheckpointStore {
  private readonly storageDir: string;

  constructor(storageDir: string = '.checkpoints') {
    this.storageDir = storageDir;
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private getFilePath(runId: string): string {
    const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageDir, `${safeRunId}.snapshot.json`);
  }

  async saveCheckpoint(runId: string, checkpoint: WorkflowCheckpoint): Promise<void> {
    const snapshot = (await this.getSnapshot(runId)) ?? {
      runId,
      status: 'running',
      currentStepIndex: checkpoint.stepIndex,
      variables: checkpoint.variablesSnapshot,
      checkpoints: [],
      executedStepNames: [],
    };

    snapshot.checkpoints.push(checkpoint);
    await this.saveSnapshot(snapshot);
  }

  async getCheckpoints(runId: string): Promise<WorkflowCheckpoint[]> {
    const snapshot = await this.getSnapshot(runId);
    return snapshot?.checkpoints ?? [];
  }

  async saveSnapshot(snapshot: WorkflowStateSnapshot): Promise<void> {
    await this.ensureDir();
    const filePath = this.getFilePath(snapshot.runId);
    await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    logger.debug({ runId: snapshot.runId, filePath }, 'Saved workflow snapshot to disk');
  }

  async getSnapshot(runId: string): Promise<WorkflowStateSnapshot | undefined> {
    const filePath = this.getFilePath(runId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as WorkflowStateSnapshot;
    } catch {
      return undefined;
    }
  }

  async deleteSnapshot(runId: string): Promise<void> {
    const filePath = this.getFilePath(runId);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist; ignore
    }
  }
}
