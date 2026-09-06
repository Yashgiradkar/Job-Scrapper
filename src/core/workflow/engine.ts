/**
 * WorkflowEngine (Facade)
 *
 * Top-level orchestrator unifying workflow building, validation, execution,
 * event subscription, checkpointing, and failure recovery.
 */

import type { WorkflowContext } from './context.js';
import { WorkflowState } from './state.js';
import type { WorkflowStep } from './step.js';
import { WorkflowExecutor, type WorkflowResult } from './executor.js';
import { WorkflowEventEmitter } from './events.js';
import { WorkflowFactory } from './factory.js';
import { WorkflowValidator } from './validator.js';
import { WorkflowBuilder } from './builder.js';
import {
  type ICheckpointStore,
  InMemoryCheckpointStore,
} from './checkpoints.js';
import { WorkflowRecoveryManager } from './recovery.js';
import type { WorkflowDefinition, WorkflowStateSnapshot } from './types.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('workflow-engine');

export interface WorkflowEngineOptions {
  checkpointStore?: ICheckpointStore;
  autoRollback?: boolean;
}

export class WorkflowEngine {
  readonly events: WorkflowEventEmitter;
  readonly checkpointStore: ICheckpointStore;
  private readonly executor: WorkflowExecutor;
  private readonly recoveryManager: WorkflowRecoveryManager;

  constructor(options: WorkflowEngineOptions = {}) {
    this.events = new WorkflowEventEmitter();
    this.checkpointStore = options.checkpointStore ?? new InMemoryCheckpointStore();
    this.executor = new WorkflowExecutor({
      events: this.events,
      checkpointStore: this.checkpointStore,
      autoRollbackOnFailure: options.autoRollback ?? true,
    });
    this.recoveryManager = new WorkflowRecoveryManager(this.checkpointStore, this.executor);
  }

  /**
   * Creates a fluent builder instance for defining workflows programmatically.
   */
  createBuilder(workflowId?: string): WorkflowBuilder {
    return new WorkflowBuilder(workflowId);
  }

  /**
   * Executes a workflow definition (JSON object, array of steps, or raw definition).
   */
  async run(
    definitionOrSteps: WorkflowDefinition | WorkflowStep[] | Array<Record<string, unknown>>,
    context: WorkflowContext,
    workflowId?: string,
  ): Promise<WorkflowResult> {
    let steps: WorkflowStep[];

    if (Array.isArray(definitionOrSteps)) {
      if (definitionOrSteps.length > 0 && 'execute' in definitionOrSteps[0]) {
        steps = definitionOrSteps as WorkflowStep[];
      } else {
        steps = WorkflowFactory.fromJSON(definitionOrSteps as any);
      }
    } else {
      // Validate definition schema first
      const validation = WorkflowValidator.validate(definitionOrSteps);
      if (!validation.isValid) {
        throw new Error(
          `Invalid workflow definition: ${validation.errors.join('; ')}`,
        );
      }
      steps = WorkflowFactory.fromJSON(definitionOrSteps.steps);
      workflowId = workflowId ?? definitionOrSteps.workflowId;
    }

    const state = new WorkflowState(context.runId, workflowId);
    logger.info({ runId: context.runId, workflowId, stepCount: steps.length }, 'Dispatching workflow execution');

    return this.executor.execute(context, steps, state);
  }

  /**
   * Resumes an interrupted, paused, or failed workflow run from its latest checkpoint.
   */
  async resume(
    runId: string,
    context: WorkflowContext,
    steps: WorkflowStep[],
  ): Promise<WorkflowResult> {
    return this.recoveryManager.resume(runId, context, steps);
  }

  /**
   * Checks whether a run is eligible for resumption.
   */
  async canResume(runId: string): Promise<boolean> {
    return this.recoveryManager.canResume(runId);
  }

  /**
   * Inspects a saved snapshot for a specific run.
   */
  async inspect(runId: string): Promise<WorkflowStateSnapshot | undefined> {
    return this.recoveryManager.inspect(runId);
  }
}
