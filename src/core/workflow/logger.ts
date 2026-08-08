import path from 'node:path';
import fs from 'node:fs';
import type { Page } from 'playwright';
import { createLogger } from '../../infrastructure/logging/logger.js';

const baseLogger = createLogger('workflow-engine');

export interface WorkflowMetric {
  stepName: string;
  durationMs: number;
  status: 'success' | 'failed';
  error?: string;
}

export class WorkflowLogger {
  private readonly logs: string[] = [];
  private readonly metrics: WorkflowMetric[] = [];
  private readonly runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  info(stepName: string, message: string, meta?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [INFO] [${stepName}]: ${message}`;
    this.logs.push(formatted);
    baseLogger.info({ runId: this.runId, stepName, ...meta }, message);
  }

  warn(stepName: string, message: string, meta?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [WARN] [${stepName}]: ${message}`;
    this.logs.push(formatted);
    baseLogger.warn({ runId: this.runId, stepName, ...meta }, message);
  }

  error(stepName: string, message: string, error?: any, meta?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const errMessage = error instanceof Error ? error.message : String(error);
    const formatted = `[${timestamp}] [ERROR] [${stepName}]: ${message} - Error: ${errMessage}`;
    this.logs.push(formatted);
    baseLogger.error({ runId: this.runId, stepName, err: error, ...meta }, message);
  }

  async captureScreenshot(page: Page, stepName: string): Promise<string | undefined> {
    try {
      const publicDir = path.resolve(process.cwd(), 'public', 'screenshots');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      
      const filename = `wf-${this.runId}-${stepName}-${Date.now()}.png`;
      const screenshotPath = path.join(publicDir, filename);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      
      const relativeUrl = `/screenshots/${filename}`;
      this.info(stepName, `Captured screenshot successfully at: ${relativeUrl}`);
      return relativeUrl;
    } catch (err) {
      this.error(stepName, 'Failed to capture step screenshot', err);
      return undefined;
    }
  }

  addMetric(metric: WorkflowMetric): void {
    this.metrics.push(metric);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  getMetrics(): WorkflowMetric[] {
    return [...this.metrics];
  }
}
