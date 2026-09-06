/**
 * Workflow Engine (Phase -1) — Public API
 *
 * Imports and exports all core engine components, builders, validators,
 * state managers, checkpoint stores, event emitters, and registers built-in steps.
 */

// Domain Types and Contracts
export * from './types.js';

// Core engine components
export { WorkflowContext } from './context.js';
export type { WorkflowContextOptions } from './context.js';

export { WorkflowState } from './state.js';

export type { WorkflowStep } from './step.js';
export { BaseWorkflowStep } from './step.js';

export { WorkflowRegistry } from './registry.js';
export type { StepConstructor } from './registry.js';

export { WorkflowExecutor } from './executor.js';
export type { WorkflowResult, WorkflowExecutorOptions } from './executor.js';

export { WorkflowFactory } from './factory.js';
export { WorkflowBuilder } from './builder.js';
export { WorkflowValidator } from './validator.js';
export { WorkflowLogger } from './logger.js';
export type { WorkflowMetric } from './logger.js';

// Events Subsystem
export { WorkflowEventEmitter } from './events.js';
export type { WorkflowEventListener } from './events.js';

// Checkpoints & Recovery
export {
  type ICheckpointStore,
  InMemoryCheckpointStore,
  FileCheckpointStore,
} from './checkpoints.js';
export { WorkflowRecoveryManager } from './recovery.js';

// Top-level Engine Facade
export { WorkflowEngine, type WorkflowEngineOptions } from './engine.js';

// Register all built-in reusable steps (side-effect imports)
import './steps/open-page.js';
import './steps/click.js';
import './steps/fill-text.js';
import './steps/select-dropdown.js';
import './steps/check-checkbox.js';
import './steps/select-radio.js';
import './steps/upload-file.js';
import './steps/scroll.js';
import './steps/wait.js';
import './steps/screenshot.js';
import './steps/if-branch.js';
import './steps/loop.js';
import './steps/parallel.js';
import './steps/set-variable.js';
