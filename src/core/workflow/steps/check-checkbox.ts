import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * CheckCheckboxStep
 * Sets an <input type="checkbox"> to the desired checked state.
 *
 * Config:
 *   selector  (string, required)  – CSS selector of the checkbox.
 *   checked   (boolean, optional, default true) – Desired state.
 */
export class CheckCheckboxStep extends BaseWorkflowStep {
  readonly name = 'CheckCheckbox';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, checked = true } = this.config;

    if (!selector) throw new Error('CheckCheckbox step: Missing "selector" config parameter');

    context.logger.info(this.name, `Setting checkbox [${selector}] to checked=${checked}`);

    const isCurrentlyChecked = await context.page.isChecked(selector);
    if (isCurrentlyChecked !== checked) {
      await context.page.click(selector, { timeout: this.timeout() });
    }

    const finalState = await context.page.isChecked(selector);
    if (finalState !== checked) {
      throw new Error(`CheckCheckbox: Could not set [${selector}] to checked=${checked}`);
    }

    context.logger.info(this.name, `Checkbox [${selector}] is now checked=${finalState}`);
  }
}

WorkflowRegistry.register('CheckCheckbox', CheckCheckboxStep);
