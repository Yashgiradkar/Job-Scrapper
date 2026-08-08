import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * WaitStep
 * Waits for a fixed duration or for a DOM condition to be met.
 *
 * Config:
 *   ms          (number, optional) – Fixed millisecond delay.
 *   selector    (string, optional) – Wait for this element to appear.
 *   state       ('visible' | 'attached' | 'detached' | 'hidden', optional, default 'visible')
 *   navigation  (boolean, optional) – Wait for the page to load.
 */
export class WaitStep extends BaseWorkflowStep {
  readonly name = 'Wait';

  async execute(context: WorkflowContext): Promise<void> {
    const { ms, selector, state = 'visible', navigation } = this.config;

    if (navigation) {
      context.logger.info(this.name, 'Waiting for page navigation (domcontentloaded)');
      await context.page.waitForLoadState('domcontentloaded');
      return;
    }

    if (selector) {
      context.logger.info(this.name, `Waiting for selector [${selector}] state=${state}`);
      await context.page.waitForSelector(selector, { state, timeout: this.timeout() });
      return;
    }

    if (ms) {
      context.logger.info(this.name, `Waiting ${ms}ms`);
      await context.page.waitForTimeout(ms);
      return;
    }

    throw new Error('Wait step: Must provide one of "ms", "selector", or "navigation"');
  }
}

WorkflowRegistry.register('Wait', WaitStep);
