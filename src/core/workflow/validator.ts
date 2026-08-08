import { z } from 'zod';
import { WorkflowRegistry } from './registry.js';

export const stepSchema = z.object({
  step: z.string().min(1),
  config: z.record(z.any()).default({}),
});

export const workflowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(stepSchema),
});

export class WorkflowValidator {
  static validate(json: unknown): { success: true; data: z.infer<typeof workflowSchema> } | { success: false; errors: string[] } {
    const parsed = workflowSchema.safeParse(json);
    
    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
      return { success: false, errors };
    }

    const workflowData = parsed.data;
    const errors: string[] = [];
    
    // Check if every step is registered in WorkflowRegistry
    workflowData.steps.forEach((s, index) => {
      if (!WorkflowRegistry.has(s.step)) {
        errors.push(`steps.${index}.step: Step '${s.step}' is not registered in the WorkflowRegistry`);
      }
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: workflowData };
  }
}
