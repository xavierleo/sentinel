import type { StateDatabase } from '../storage/database.js';
import type { SessionMessageRead, SessionMessageWrite, SessionStepRead, SessionStepWrite, SessionWrite } from './types.js';

export interface SessionRepository {
  ensureSession: (session: SessionWrite) => void;
  appendMessage: (message: SessionMessageWrite) => number;
  readMessages: (sessionId: string) => SessionMessageRead[];
  markStepStarted: (step: SessionStepWrite) => number;
  markStepCompleted: (step: SessionStepWrite & { completedAt?: number }) => void;
  recoverInFlightSessions: (options: { failedAt: number }) => { sessionId: string; stepId: string }[];
  readInFlightSteps: () => SessionStepRead[];
  readFailedSteps: () => SessionStepRead[];
}

function mapStep(row: {
  id: number;
  session_id: string;
  step_id: string;
  status: 'in_flight' | 'completed' | 'failed';
  started_at: number;
  completed_at: number | null;
  failed_at: number | null;
}): SessionStepRead {
  return {
    id: row.id,
    sessionId: row.session_id,
    stepId: row.step_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  };
}

export function createSessionRepository(db: StateDatabase, options: { now?: () => number } = {}): SessionRepository {
  const now = options.now ?? Date.now;

  return {
    ensureSession(session) {
      const timestamp = now();
      db.prepare(
        `
          insert into sessions (id, channel, user_id, created_at, updated_at)
          values (?, ?, ?, ?, ?)
          on conflict(id) do update set
            channel = excluded.channel,
            user_id = excluded.user_id,
            updated_at = excluded.updated_at
        `,
      ).run(session.id, session.channel, session.userId, timestamp, timestamp);
    },

    appendMessage(message) {
      const result = db
        .prepare('insert into session_messages (session_id, role, content, created_at) values (?, ?, ?, ?)')
        .run(message.sessionId, message.role, message.content, now());
      db.prepare('update sessions set updated_at = ? where id = ?').run(now(), message.sessionId);
      return Number(result.lastInsertRowid);
    },

    readMessages(sessionId) {
      return (
        db.prepare('select * from session_messages where session_id = ? order by id').all(sessionId) as {
          id: number;
          session_id: string;
          role: SessionMessageRead['role'];
          content: string;
          created_at: number;
        }[]
      ).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        role: row.role,
        content: row.content,
        createdAt: row.created_at,
      }));
    },

    markStepStarted(step) {
      const result = db
        .prepare('insert into session_steps (session_id, step_id, status, started_at) values (?, ?, ?, ?)')
        .run(step.sessionId, step.stepId, 'in_flight', now());
      return Number(result.lastInsertRowid);
    },

    markStepCompleted(step) {
      db.prepare(
        `
          update session_steps
          set status = 'completed', completed_at = ?
          where session_id = ? and step_id = ? and status = 'in_flight'
        `,
      ).run(step.completedAt ?? now(), step.sessionId, step.stepId);
    },

    recoverInFlightSessions(options) {
      const inFlight = this.readInFlightSteps();
      db.prepare("update session_steps set status = 'failed', failed_at = ? where status = 'in_flight'").run(options.failedAt);
      return inFlight.map((step) => ({ sessionId: step.sessionId, stepId: step.stepId }));
    },

    readInFlightSteps() {
      return (db.prepare("select * from session_steps where status = 'in_flight' order by id").all() as any[]).map(mapStep);
    },

    readFailedSteps() {
      return (db.prepare("select * from session_steps where status = 'failed' order by id").all() as any[]).map(mapStep);
    },
  };
}
