import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * ScrollStep
 * Scrolls the page or a specific element.
 *
 * Config:
 *   direction   ('down' | 'up' | 'bottom' | 'top', optional, default 'down')
 *   pixels      (number, optional, default 500) – pixels to scroll per call.
 *   selector    (string, optional) – if provided, scroll within this element.
 *   intoView    (string, optional) – CSS selector of element to scroll into view.
 */
export class ScrollStep extends BaseWorkflowStep {
  readonly name = 'Scroll';

  async execute(context: WorkflowContext): Promise<void> {
    const { direction = 'down', pixels = 500, selector, intoView } = this.config;

    if (intoView) {
      context.logger.info(this.name, `Scrolling element "${intoView}" into view`);
      await context.page.locator(intoView).scrollIntoViewIfNeeded({ timeout: this.timeout() });
      return;
    }

    if (selector) {
      context.logger.info(this.name, `Scrolling within element [${selector}] direction=${direction} pixels=${pixels}`);
      const dy = direction === 'down' ? pixels : direction === 'up' ? -pixels : 0;
      await context.page.evaluate(
        ({ sel, delta }: { sel: string; delta: number }) => {
          const el = document.querySelector(sel);
          if (el) el.scrollBy(0, delta);
        },
        { sel: selector, delta: dy }
      );
      return;
    }

    context.logger.info(this.name, `Scrolling page direction=${direction} pixels=${pixels}`);

    switch (direction) {
      case 'top':
        await context.page.evaluate(() => window.scrollTo(0, 0));
        break;
      case 'bottom':
        await context.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        break;
      case 'up':
        await context.page.evaluate((p: number) => window.scrollBy(0, -p), pixels);
        break;
      default:
        await context.page.evaluate((p: number) => window.scrollBy(0, p), pixels);
    }
  }
}

WorkflowRegistry.register('Scroll', ScrollStep);
