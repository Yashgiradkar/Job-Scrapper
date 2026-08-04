import { randomUUID } from 'node:crypto';
import type { JobMatchRequest, JobMatchRunResult, JobMatchService } from './job-match-service.js';
import { NotFoundError } from '../domain/errors/app-error.js';

export type MatchRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'stopped';

export interface MatchRunSnapshot {
  id: string;
  status: MatchRunStatus;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  result?: JobMatchRunResult;
  logs: string[];
}

interface InternalRun extends MatchRunSnapshot {
  abortController: AbortController;
}

export class JobMatchRunManager {
  private readonly runs = new Map<string, InternalRun>();

  constructor(private readonly jobMatchService: JobMatchService) {}

  start(request: JobMatchRequest): MatchRunSnapshot {
    const run: InternalRun = {
      id: randomUUID(),
      status: 'queued',
      createdAt: new Date(),
      logs: [],
      abortController: new AbortController(),
    };

    this.runs.set(run.id, run);
    void this.execute(run, request);
    return toSnapshot(run);
  }

  get(id: string): MatchRunSnapshot {
    const run = this.runs.get(id);

    if (!run) {
      throw new NotFoundError('Match run', id);
    }

    return toSnapshot(run);
  }

  stop(id: string): MatchRunSnapshot {
    const run = this.runs.get(id);

    if (!run) {
      throw new NotFoundError('Match run', id);
    }

    if (run.status === 'queued' || run.status === 'running') {
      run.status = 'stopped';
      run.finishedAt = new Date();
      run.logs.push(`${new Date().toISOString()} Stop requested`);
      run.abortController.abort();
    }

    return toSnapshot(run);
  }

  private async execute(run: InternalRun, request: JobMatchRequest): Promise<void> {
    run.status = 'running';
    run.startedAt = new Date();

    try {
      const result = await this.jobMatchService.run(request, run.abortController.signal);
      run.result = result;
      run.logs = result.logs;
      run.status = run.abortController.signal.aborted ? 'stopped' : 'completed';
      run.finishedAt = result.finishedAt;
    } catch (error) {
      run.status = 'failed';
      run.finishedAt = new Date();
      run.error = error instanceof Error ? error.message : 'Unknown match run error';
      run.logs.push(`${new Date().toISOString()} ${run.error}`);
    }
  }
}

function toSnapshot(run: InternalRun): MatchRunSnapshot {
  return {
    id: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: run.error,
    result: run.result,
    logs: run.result?.logs ?? run.logs,
  };
}
