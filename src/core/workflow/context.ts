import type { Page } from 'playwright';
import { WorkflowLogger } from './logger.js';
import type { RawResume } from '../../infrastructure/config/profile-loader.js';

export interface WorkflowContextOptions {
  runId: string;
  page: Page;
  profile: RawResume;
  initialVariables?: Record<string, any>;
}

export class WorkflowContext {
  readonly runId: string;
  readonly page: Page;
  readonly profile: RawResume;
  readonly logger: WorkflowLogger;
  private readonly variables: Map<string, any>;

  constructor(options: WorkflowContextOptions) {
    this.runId = options.runId;
    this.page = options.page;
    this.profile = options.profile;
    this.logger = new WorkflowLogger(options.runId);
    this.variables = new Map<string, any>(Object.entries(options.initialVariables ?? {}));
  }

  getVariable<T>(key: string): T | undefined {
    return this.variables.get(key) as T;
  }

  setVariable(key: string, value: any): void {
    this.variables.set(key, value);
    this.logger.info('Context', `Set variable [${key}] = ${JSON.stringify(value)}`);
  }

  hasVariable(key: string): boolean {
    return this.variables.has(key);
  }

  getAllVariables(): Record<string, any> {
    return Object.fromEntries(this.variables.entries());
  }
}
