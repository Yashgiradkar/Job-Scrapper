import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

export class OpenPageStep extends BaseWorkflowStep {
  readonly name = 'OpenPage';

  async execute(context: WorkflowContext): Promise<void> {
    const url = this.config.url;
    if (!url) {
      throw new Error('OpenPage step: Missing "url" config parameter');
    }

    context.logger.info(this.name, `Navigating to: ${url}`);
    
    // Resolve dynamic variables if url contains {{key}}
    let resolvedUrl = url;
    const match = url.match(/\{\{([^}]+)\}\}/);
    if (match) {
      const varName = match[1].trim();
      if (context.hasVariable(varName)) {
        resolvedUrl = url.replace(`{{${varName}}}`, String(context.getVariable(varName)));
      }
    }

    await context.page.goto(resolvedUrl, { waitUntil: this.config.waitUntil ?? 'domcontentloaded' });
    context.logger.info(this.name, `Successfully navigated to: ${context.page.url()}`);
  }

  override async validate(context: WorkflowContext): Promise<boolean> {
    // Validate that page loaded successfully
    const readyState = await context.page.evaluate(() => document.readyState);
    return readyState === 'complete' || readyState === 'interactive';
  }
}

WorkflowRegistry.register('OpenPage', OpenPageStep);
