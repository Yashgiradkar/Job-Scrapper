/**
 * WorkflowValidator
 *
 * Validates workflow JSON definitions against Zod schemas and verifies that
 * all referenced step actions are registered in the WorkflowRegistry.
 */

import { z } from 'zod';
import { WorkflowRegistry } from './registry.js';
import { WorkflowDefinitionSchema, StepConfigSchema } from './types.js';

// Legacy schema compatibility
const legacyStepSchema = z.object({
  step: z.string().min(1),
  config: z.record(z.any()).default({}),
});

const legacyWorkflowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(legacyStepSchema),
});

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  data?: any;
}

export class WorkflowValidator {
  static validate(json: unknown): ValidationResult {
    const errors: string[] = [];

    // Try modern schema first
    const modernParsed = WorkflowDefinitionSchema.safeParse(json);
    if (modernParsed.success) {
      const data = modernParsed.data;
      data.steps.forEach((s, index) => {
        if (!WorkflowRegistry.has(s.action)) {
          errors.push(`steps[${index}]: Action '${s.action}' is not registered in WorkflowRegistry`);
        }
      });

      return {
        isValid: errors.length === 0,
        errors,
        data,
      };
    }

    // Try legacy schema
    const legacyParsed = legacyWorkflowSchema.safeParse(json);
    if (legacyParsed.success) {
      const data = legacyParsed.data;
      data.steps.forEach((s, index) => {
        if (!WorkflowRegistry.has(s.step)) {
          errors.push(`steps[${index}]: Action '${s.step}' is not registered in WorkflowRegistry`);
        }
      });

      return {
        isValid: errors.length === 0,
        errors,
        data,
      };
    }

    // If both failed, combine errors from modern schema validation
    return {
      isValid: false,
      errors: modernParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  static validateStep(stepJson: unknown): ValidationResult {
    const parsed = StepConfigSchema.safeParse(stepJson);
    if (!parsed.success) {
      return {
        isValid: false,
        errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    }

    if (!WorkflowRegistry.has(parsed.data.action)) {
      return {
        isValid: false,
        errors: [`Action '${parsed.data.action}' is not registered in WorkflowRegistry`],
      };
    }

    return { isValid: true, errors: [], data: parsed.data };
  }
}
