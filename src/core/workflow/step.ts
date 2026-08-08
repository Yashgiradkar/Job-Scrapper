import type { WorkflowContext } from './context.js';

export interface WorkflowStep {
  name: string;
  config: Record<string, any>;
  execute(context: WorkflowContext): Promise<void>;
  rollback(context: WorkflowContext): Promise<void>;
  validate(context: WorkflowContext): Promise<boolean>;
  retry(context: WorkflowContext, error: Error, attempt: number): Promise<boolean>;
  timeout(): number;
}

export abstract class BaseWorkflowStep implements WorkflowStep {
  abstract readonly name: string;
  readonly config: Record<string, any>;

  constructor(config: Record<string, any> = {}) {
    this.config = config;
  }

  abstract execute(context: WorkflowContext): Promise<void>;

  async rollback(_context: WorkflowContext): Promise<void> {
    // Default: no-op rollback. Override in subclasses to undo step actions.
  }

  async validate(_context: WorkflowContext): Promise<boolean> {
    // Default validation: true
    return true;
  }

  async retry(context: WorkflowContext, error: Error, attempt: number): Promise<boolean> {
    // Default retry policy: retry up to 3 times for operational errors
    if (attempt <= 3) {
      context.logger.warn(this.name, `Retrying step (attempt ${attempt}/3) due to error: ${error.message}`);
      return true;
    }
    return false;
  }

  timeout(): number {
    // Default step timeout: 30 seconds
    return this.config.timeoutMs ?? 30000;
  }
}
