/**
 * Domain Types, Schemas, and Event Definitions for the Workflow Engine (Phase -1)
 */

import { z } from 'zod';

// ============================================================================
// 1. WORKFLOW STEP DEFINITION SCHEMAS
// ============================================================================

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0).max(10).default(3),
  backoffMs: z.number().int().min(0).max(60000).default(1000),
  exponential: z.boolean().default(true),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const StepConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  action: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().min(100).max(300000).optional(),
  retryPolicy: RetryPolicySchema.optional(),
  checkpoint: z.boolean().default(false),
  continueOnError: z.boolean().default(false),
});

export type StepConfig = z.infer<typeof StepConfigSchema>;

export const WorkflowDefinitionSchema = z.object({
  version: z.string().default('1.0.0'),
  workflowId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  strategy: z.enum(['REST_API', 'GRAPHQL', 'RSS_FEED', 'PLAYWRIGHT_SSR', 'PLAYWRIGHT_CSR', 'MANUAL']).optional(),
  targetDomain: z.string().optional(),
  steps: z.array(StepConfigSchema).min(1),
  errorHandling: z.object({
    onTimeout: z.enum(['abort', 'retry', 'skip']).default('abort'),
    onFailure: z.enum(['rollback', 'continue', 'fail']).default('rollback'),
  }).default({ onTimeout: 'abort', onFailure: 'rollback' }),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// ============================================================================
// 2. CHECKPOINT & STATE TYPES
// ============================================================================

export interface WorkflowCheckpoint {
  id: string;
  stepName: string;
  stepIndex: number;
  timestamp: string;
  variablesSnapshot: Record<string, unknown>;
  pageUrl?: string;
  metadata?: Record<string, unknown>;
}

export type WorkflowStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'resuming'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface WorkflowStateSnapshot {
  runId: string;
  workflowId?: string;
  status: WorkflowStatus;
  currentStepIndex: number;
  variables: Record<string, unknown>;
  checkpoints: WorkflowCheckpoint[];
  executedStepNames: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

// ============================================================================
// 3. WORKFLOW EVENTS MAP
// ============================================================================

export interface StepExecutionEventPayload {
  runId: string;
  stepName: string;
  stepIndex: number;
  attempt?: number;
  durationMs?: number;
  error?: Error;
  params?: Record<string, unknown>;
}

export interface WorkflowEventMap {
  'workflow:start': { runId: string; totalSteps: number; timestamp: string };
  'workflow:step:start': StepExecutionEventPayload;
  'workflow:step:success': StepExecutionEventPayload;
  'workflow:step:retry': StepExecutionEventPayload;
  'workflow:step:fail': StepExecutionEventPayload;
  'workflow:step:rollback': StepExecutionEventPayload;
  'workflow:checkpoint': { runId: string; checkpoint: WorkflowCheckpoint };
  'workflow:pause': { runId: string; stepIndex: number; reason?: string };
  'workflow:resume': { runId: string; fromStepIndex: number };
  'workflow:complete': { runId: string; durationMs: number; checkpointsCount: number };
  'workflow:fail': { runId: string; error: string; failedStep: string };
}
