import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * ScreenshotStep
 * Captures a screenshot and stores the URL in a context variable.
 *
 * Config:
 *   label     (string, optional) – Human-readable step label for the filename.
 *   storeIn   (string, optional) – Context variable name to store the screenshot path.
 */
export class ScreenshotStep extends BaseWorkflowStep {
  readonly name = 'Screenshot';

  async execute(context: WorkflowContext): Promise<void> {
    const { label = 'step', storeIn } = this.config;
    const url = await context.logger.captureScreenshot(context.page, label);

    if (storeIn && url) {
      context.setVariable(storeIn, url);
    }

    context.logger.info(this.name, `Screenshot taken: ${url}`);
  }
}

WorkflowRegistry.register('Screenshot', ScreenshotStep);
