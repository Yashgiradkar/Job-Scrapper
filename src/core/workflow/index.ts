/**
 * Workflow Engine — Public API
 *
 * Import this module to get the full engine plus all built-in steps registered.
 * Every import from './steps/*' has a side-effect of calling WorkflowRegistry.register(),
 * so just importing this index is sufficient to make all steps available.
 */

// Core engine components
export { WorkflowContext } from './context.js';
export type { WorkflowContextOptions } from './context.js';

export { WorkflowState } from './state.js';
export type { WorkflowStatus, WorkflowStateSnapshot } from './state.js';

export type { WorkflowStep } from './step.js';
export { BaseWorkflowStep } from './step.js';

export { WorkflowRegistry } from './registry.js';
export type { StepConstructor } from './registry.js';

export { WorkflowExecutor } from './executor.js';
export type { WorkflowResult } from './executor.js';

export { WorkflowFactory, WorkflowBuilder } from './factory.js';
export { WorkflowValidator } from './validator.js';
export { WorkflowLogger } from './logger.js';
export type { WorkflowMetric } from './logger.js';

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
import './steps/set-variable.js';
