import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * SelectRadioStep
 * Selects a radio button from a group by matching the associated label text.
 *
 * Config:
 *   selector    (string, required) – CSS selector for the group container or individual radio.
 *   labelMatch  (string, optional) – Text to find in the nearest label (fuzzy, case-insensitive).
 *   value       (string, optional) – The "value" attribute of the radio to select directly.
 *
 * Either labelMatch or value must be supplied.
 */
export class SelectRadioStep extends BaseWorkflowStep {
  readonly name = 'SelectRadio';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, labelMatch, value } = this.config;

    if (!selector) throw new Error('SelectRadio step: Missing "selector" config parameter');
    if (!labelMatch && !value) throw new Error('SelectRadio step: Provide "labelMatch" or "value"');

    context.logger.info(this.name, `Selecting radio [${selector}] labelMatch="${labelMatch}" value="${value}"`);

    if (value) {
      // Direct value match
      await context.page.click(`${selector}[value="${value}"]`, { timeout: this.timeout() });
    } else {
      // Locate by label text
      const clicked = await context.page.evaluate(
        ({ sel, label }: { sel: string; label: string }) => {
          const radios = Array.from(document.querySelectorAll<HTMLInputElement>(sel));
          for (const radio of radios) {
            let labelText = '';
            if (radio.id) {
              const lbl = document.querySelector<HTMLLabelElement>(`label[for="${radio.id}"]`);
              if (lbl) labelText = lbl.textContent?.trim() ?? '';
            }
            if (!labelText) {
              const parent = radio.closest('label');
              if (parent) labelText = parent.textContent?.trim() ?? '';
            }
            if (labelText.toLowerCase().includes(label.toLowerCase())) {
              radio.click();
              return true;
            }
          }
          return false;
        },
        { sel: selector, label: labelMatch }
      );

      if (!clicked) {
        throw new Error(`SelectRadio: No radio button matched label "${labelMatch}" in ${selector}`);
      }
    }

    context.logger.info(this.name, `Radio [${selector}] selected successfully`);
  }
}

WorkflowRegistry.register('SelectRadio', SelectRadioStep);
