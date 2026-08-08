import fs from 'node:fs';
import path from 'node:path';
import { BaseWorkflowStep } from '../step.js';
import type { WorkflowContext } from '../context.js';
import { WorkflowRegistry } from '../registry.js';

/**
 * UploadFileStep
 * Sets files on an <input type="file"> element.
 *
 * Config:
 *   selector    (string, required) – CSS selector of the file input.
 *   filePath    (string, required) – Absolute or workspace-relative path to the file.
 *               Supports "var:<name>" and "profile:<dot.path>" resolutions.
 *   required    (boolean, optional, default true) – If true, throws when file is missing.
 */
export class UploadFileStep extends BaseWorkflowStep {
  readonly name = 'UploadFile';

  async execute(context: WorkflowContext): Promise<void> {
    const { selector, filePath, required = true } = this.config;

    if (!selector) throw new Error('UploadFile step: Missing "selector" config parameter');
    if (!filePath) throw new Error('UploadFile step: Missing "filePath" config parameter');

    const resolvedPath = this.resolvePath(filePath, context);

    if (!fs.existsSync(resolvedPath)) {
      if (required) {
        throw new Error(`UploadFile step: File not found at "${resolvedPath}"`);
      }
      context.logger.warn(this.name, `File not found at "${resolvedPath}" — skipping (required=false)`);
      return;
    }

    context.logger.info(this.name, `Uploading file "${resolvedPath}" to selector [${selector}]`);
    await context.page.setInputFiles(selector, resolvedPath, { timeout: this.timeout() });
    context.logger.info(this.name, `File uploaded successfully`);
  }

  private resolvePath(filePath: string, context: WorkflowContext): string {
    let resolved = filePath;

    if (filePath.startsWith('var:')) {
      resolved = String(context.getVariable(filePath.slice(4).trim()) ?? '');
    } else if (filePath.startsWith('profile:')) {
      const parts = filePath.slice(8).trim().split('.');
      resolved = String(parts.reduce((acc: any, k) => acc?.[k], context.profile as any) ?? '');
    }

    // Make absolute relative to process.cwd()
    if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(process.cwd(), resolved);
    }

    return resolved;
  }
}

WorkflowRegistry.register('UploadFile', UploadFileStep);
