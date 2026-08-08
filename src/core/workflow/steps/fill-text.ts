import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * FillTextStep
 * Fills an <input> or <textarea> with a value resolved from config,
 * a context variable reference (prefixed with "var:"), or the candidate profile.
 *
 * Config:
 *   selector  (string, required) – CSS selector.
 *   value     (string, required) – Static value, "var:<variableName>", or "profile:<dot.path>".
 *   clear     (boolean, optional, default true) – Clear field before filling.
 */
export class FillTextStep extends BaseWorkflowStep {
  readonly name = 'FillText';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, value, clear = true } = this.config;

    if (!selector) throw new Error('FillText step: Missing "selector" config parameter');
    if (value === undefined) throw new Error('FillText step: Missing "value" config parameter');

    const resolvedValue = this.resolveValue(value, context);

    context.logger.info(this.name, `Filling [${selector}] with value`);
    
    if (clear) {
      await context.page.fill(selector, '');
    }

    await context.page.fill(selector, resolvedValue, { timeout: this.timeout() });
    context.logger.info(this.name, `Field [${selector}] filled successfully`);
  }

  private resolveValue(value: string, context: WorkflowContext): string {
    // Variable reference: "var:myVariable"
    if (typeof value === 'string' && value.startsWith('var:')) {
      const varName = value.slice(4).trim();
      const resolved = context.getVariable<string>(varName);
      if (resolved === undefined) {
        context.logger.warn(this.name, `Variable "${varName}" not found in context; using empty string`);
        return '';
      }
      return String(resolved);
    }

    // Profile reference: "profile:personal_information.email"
    if (typeof value === 'string' && value.startsWith('profile:')) {
      const dotPath = value.slice(8).trim();
      const resolved = this.getNestedValue(context.profile as any, dotPath);
      if (resolved === undefined) {
        context.logger.warn(this.name, `Profile path "${dotPath}" not found; using empty string`);
        return '';
      }
      return String(resolved);
    }

    return String(value);
  }

  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }
}

WorkflowRegistry.register('FillText', FillTextStep);
