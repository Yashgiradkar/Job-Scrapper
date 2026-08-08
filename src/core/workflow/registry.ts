import type { WorkflowStep } from './step.js';

export type StepConstructor = new (config: Record<string, any>) => WorkflowStep;

export class WorkflowRegistry {
  private static readonly steps = new Map<string, StepConstructor>();

  static register(name: string, stepClass: StepConstructor): void {
    this.steps.set(name, stepClass);
  }

  static get(name: string): StepConstructor | undefined {
    return this.steps.get(name);
  }

  static has(name: string): boolean {
    return this.steps.has(name);
  }

  static getRegisteredNames(): string[] {
    return Array.from(this.steps.keys());
  }
}
