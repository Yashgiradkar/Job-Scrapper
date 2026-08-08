import type { Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../infrastructure/logging/logger.js';
import { NotFoundError } from '../domain/errors/app-error.js';

const logger = createLogger('apply-job-session-store');

// 10 minutes session TTL in milliseconds
const SESSION_TTL_MS = 10 * 60 * 1000;

export interface ApplyJobSession {
  id: string;
  page: Page;
  jobUrl: string;
  createdAt: Date;
  status: 'ready_for_review' | 'submitted' | 'failed';
  logs: string[];
  timeoutId: NodeJS.Timeout;
}

export class ApplyJobSessionStore {
  private readonly sessions = new Map<string, ApplyJobSession>();

  createSession(page: Page, jobUrl: string, initialLogs: string[] = []): ApplyJobSession {
    const id = randomUUID();
    
    // Set up auto-cleanup timeout
    const timeoutId = setTimeout(() => {
      void this.expireSession(id);
    }, SESSION_TTL_MS);

    const session: ApplyJobSession = {
      id,
      page,
      jobUrl,
      createdAt: new Date(),
      status: 'ready_for_review',
      logs: initialLogs,
      timeoutId,
    };

    this.sessions.set(id, session);
    logger.info({ sessionId: id, jobUrl }, 'Created application session with 10-minute TTL');
    return session;
  }

  getSession(id: string): ApplyJobSession {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundError('Application session', id);
    }
    return session;
  }

  removeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      clearTimeout(session.timeoutId);
      this.sessions.delete(id);
      logger.debug({ sessionId: id }, 'Removed session from store');
    }
  }

  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      this.removeSession(id);
      try {
        if (!session.page.isClosed()) {
          const context = session.page.context();
          await session.page.close();
          await context.close();
          logger.info({ sessionId: id }, 'Closed browser page and context for session');
        }
      } catch (error) {
        logger.warn({ sessionId: id, err: error }, 'Failed to close page or context on session cleanup');
      }
    }
  }

  private async expireSession(id: string): Promise<void> {
    logger.warn({ sessionId: id }, 'Application session expired due to TTL inactivity');
    await this.closeSession(id);
  }
}

// Export singleton instance
let sharedSessionStore: ApplyJobSessionStore | undefined;

export function getApplyJobSessionStore(): ApplyJobSessionStore {
  if (!sharedSessionStore) {
    sharedSessionStore = new ApplyJobSessionStore();
  }
  return sharedSessionStore;
}
