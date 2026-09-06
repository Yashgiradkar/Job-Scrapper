/**
 * Typed Event Emitter for Workflow Engine (Observer Pattern)
 */

import { EventEmitter } from 'node:events';
import type { WorkflowEventMap } from './types.js';

export type WorkflowEventListener<K extends keyof WorkflowEventMap> = (
  payload: WorkflowEventMap[K],
) => void | Promise<void>;

export class WorkflowEventEmitter {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof WorkflowEventMap>(event: K, listener: WorkflowEventListener<K>): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<K extends keyof WorkflowEventMap>(event: K, listener: WorkflowEventListener<K>): this {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<K extends keyof WorkflowEventMap>(event: K, listener: WorkflowEventListener<K>): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<K extends keyof WorkflowEventMap>(event: K, payload: WorkflowEventMap[K]): boolean {
    return this.emitter.emit(event, payload);
  }

  removeAllListeners(event?: keyof WorkflowEventMap): this {
    this.emitter.removeAllListeners(event);
    return this;
  }
}
