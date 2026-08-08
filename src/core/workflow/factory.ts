import { WorkflowRegistry } from './registry.js';
import type { WorkflowStep } from './step.js';
import { WorkflowValidator } from './validator.js';

export class WorkflowFactory {
  static create(json: unknown): WorkflowStep[] {
    const validationResult = WorkflowValidator.validate(json);
    
    if (!validationResult.success) {
      throw new Error(`Failed to parse workflow: ${validationResult.errors.join('; ')}`);
    }

    const { steps } = validationResult.data;
    
    return steps.map((s) => {
      const StepClass = WorkflowRegistry.get(s.step);
      if (!StepClass) {
        throw new Error(`Step class not found for: ${s.step}`);
      }
      return new StepClass(s.config);
    });
  }
}

export class WorkflowBuilder {
  private readonly steps: WorkflowStep[] = [];

  addStep(step: WorkflowStep): this {
    this.steps.push(step);
    return this;
  }

  build(): WorkflowStep[] {
    return [...this.steps];
  }
}
