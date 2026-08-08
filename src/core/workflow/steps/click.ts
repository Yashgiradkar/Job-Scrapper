import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * ClickStep
 * Clicks a DOM element resolved by the given CSS selector.
 *
 * Config:
 *   selector   (string, required) – CSS selector to click.
 *   waitFor    (string, optional) – CSS selector to wait for after click ('navigation' | CSS selector).
 *   force      (boolean, optional) – Force click even if element not actionable.
 */
export class ClickStep extends BaseWorkflowStep {
  readonly name = 'Click';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, waitFor, force = false } = this.config;

    if (!selector) {
      throw new Error('Click step: Missing "selector" config parameter');
    }

    context.logger.info(this.name, `Clicking element: ${selector}`);
    await context.page.click(selector, { force, timeout: this.timeout() });

    if (waitFor === 'navigation') {
      await context.page.waitForLoadState('domcontentloaded');
    } else if (typeof waitFor === 'string') {
      await context.page.waitForSelector(waitFor, { timeout: this.timeout() });
    }

    context.logger.info(this.name, `Click successful on: ${selector}`);
  }
}

WorkflowRegistry.register('Click', ClickStep);
