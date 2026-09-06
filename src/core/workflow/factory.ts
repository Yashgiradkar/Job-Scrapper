/**
 * WorkflowFactory
 *
 * Instantiates executable WorkflowStep instances from JSON configurations or definitions.
 */

import { WorkflowRegistry } from './registry.js';
import type { WorkflowStep } from './step.js';
import { WorkflowValidator } from './validator.js';

export class WorkflowFactory {
  /**
   * Instantiates steps from a full workflow definition JSON.
   */
  static create(json: unknown): WorkflowStep[] {
    const validationResult = WorkflowValidator.validate(json);

    if (!validationResult.isValid) {
      throw new Error(`Failed to parse workflow: ${validationResult.errors.join('; ')}`);
    }

    const data = validationResult.data;
    const rawSteps = data.steps as Array<Record<string, any>>;
    return this.fromJSON(rawSteps);
  }

  /**
   * Instantiates an array of WorkflowStep instances from an array of step config objects.
   * Supports both modern `{ action, params, ... }` and legacy `{ step, config }` formats.
   */
  static fromJSON(stepConfigs: Array<Record<string, any>>): WorkflowStep[] {
    return stepConfigs.map((s, index) => {
      const actionName = s.action || s.step;
      if (!actionName) {
        throw new Error(`Step at index ${index} missing required 'action' or 'step' identifier`);
      }

      const StepClass = WorkflowRegistry.get(actionName);
      if (!StepClass) {
        throw new Error(`Step class not found in WorkflowRegistry for action: '${actionName}'`);
      }

      // Merge params, config, and top-level step configuration
      const mergedConfig = {
        name: s.name,
        ...(s.params || s.config || {}),
        timeoutMs: s.timeoutMs,
        retryPolicy: s.retryPolicy,
        checkpoint: s.checkpoint,
        continueOnError: s.continueOnError,
      };

      return new StepClass(mergedConfig);
    });
  }
}
