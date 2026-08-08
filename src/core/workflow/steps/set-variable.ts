import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * SetVariableStep
 * Reads a value from the DOM (text, attribute, URL) and stores it as a context variable.
 *
 * Config:
 *   name        (string, required) – Context variable key to store into.
 *   source      ('text' | 'attribute' | 'url' | 'static') – How to extract the value.
 *   selector    (string) – Required for 'text' and 'attribute'.
 *   attribute   (string) – Required for 'attribute' (e.g. 'href', 'value').
 *   value       (any)   – Required for 'static'.
 */
export class SetVariableStep extends BaseWorkflowStep {
  readonly name = 'SetVariable';

  async execute(context: WorkflowContext): Promise<void> {
    const { name: varName, source = 'static', selector, attribute, value } = this.config;

    if (!varName) throw new Error('SetVariable step: Missing "name" config parameter');

    let extracted: any;

    switch (source) {
      case 'text':
        if (!selector) throw new Error('SetVariable step: "selector" required for source=text');
        extracted = (await context.page.locator(selector).innerText()).trim();
        break;

      case 'attribute':
        if (!selector) throw new Error('SetVariable step: "selector" required for source=attribute');
        if (!attribute) throw new Error('SetVariable step: "attribute" required for source=attribute');
        extracted = await context.page.locator(selector).getAttribute(attribute);
        break;

      case 'url':
        extracted = context.page.url();
        break;

      case 'static':
      default:
        extracted = value;
        break;
    }

    context.setVariable(varName, extracted);
    context.logger.info(this.name, `Set variable "${varName}" = ${JSON.stringify(extracted)}`);
  }
}

WorkflowRegistry.register('SetVariable', SetVariableStep);
