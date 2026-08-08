import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * SelectDropdownStep
 * Selects an option in a native <select> element.
 *
 * Config:
 *   selector  (string, required)  – CSS selector of the <select>.
 *   value     (string, required)  – Static value, "var:<name>", or "profile:<dot.path>".
 *   matchBy   ('value' | 'label' | 'index', optional, default 'label') – How to match the option.
 */
export class SelectDropdownStep extends BaseWorkflowStep {
  readonly name = 'SelectDropdown';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, value, matchBy = 'label' } = this.config;

    if (!selector) throw new Error('SelectDropdown step: Missing "selector" config parameter');
    if (value === undefined) throw new Error('SelectDropdown step: Missing "value" config parameter');

    const resolvedValue = this.resolveValue(value, context);
    context.logger.info(this.name, `Selecting dropdown [${selector}] matchBy=${matchBy} value="${resolvedValue}"`);

    if (matchBy === 'value') {
      await context.page.selectOption(selector, { value: resolvedValue }, { timeout: this.timeout() });
    } else if (matchBy === 'index') {
      await context.page.selectOption(selector, { index: Number(resolvedValue) }, { timeout: this.timeout() });
    } else {
      // label — fuzzy match: prefer exact, fallback to case-insensitive includes
      const matched = await context.page.evaluate(
        ({ sel, label }: { sel: string; label: string }) => {
          const select = document.querySelector<HTMLSelectElement>(sel);
          if (!select) return null;
          const options = Array.from(select.options);
          const exact = options.find((o) => o.text.trim() === label);
          if (exact) return exact.value;
          const fuzzy = options.find((o) =>
            o.text.trim().toLowerCase().includes(label.toLowerCase())
          );
          return fuzzy ? fuzzy.value : null;
        },
        { sel: selector, label: resolvedValue }
      );

      if (!matched) {
        throw new Error(`SelectDropdown: No matching option for label "${resolvedValue}" in ${selector}`);
      }
      await context.page.selectOption(selector, { value: matched }, { timeout: this.timeout() });
    }

    context.logger.info(this.name, `Dropdown [${selector}] selected successfully`);
  }

  private resolveValue(value: string, context: WorkflowContext): string {
    if (value.startsWith('var:')) {
      return String(context.getVariable(value.slice(4).trim()) ?? '');
    }
    if (value.startsWith('profile:')) {
      const parts = value.slice(8).trim().split('.');
      return String(parts.reduce((acc: any, k) => acc?.[k], context.profile as any) ?? '');
    }
    return String(value);
  }
}

WorkflowRegistry.register('SelectDropdown', SelectDropdownStep);
