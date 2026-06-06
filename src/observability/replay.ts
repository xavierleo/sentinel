import type { StateDatabase } from '../storage/database.js';

export type ReplayActor = 'user' | 'agent' | 'scheduler';

export interface ReplayEventWrite {
  sessionId: string;
  actor: ReplayActor;
  kind: string;
  payload: unknown;
}

export interface ReplayEventRead extends ReplayEventWrite {
  id: number;
  timestamp: number;
}

export function createReplayRepository(db: StateDatabase, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const insert = db.prepare('insert into events (session_id, timestamp, actor, kind, payload) values (?, ?, ?, ?, ?)');

  return {
    recordEvent(event: ReplayEventWrite): number {
      const result = insert.run(event.sessionId, now(), event.actor, event.kind, JSON.stringify(event.payload));
      return Number(result.lastInsertRowid);
    },

    readSession(sessionId: string): ReplayEventRead[] {
      return (
        db.prepare('select * from events where session_id = ? order by id').all(sessionId) as {
          id: number;
          session_id: string;
          timestamp: number;
          actor: ReplayActor;
          kind: string;
          payload: string;
        }[]
      ).map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        timestamp: row.timestamp,
        actor: row.actor,
        kind: row.kind,
        payload: JSON.parse(row.payload) as unknown,
      }));
    },
  };
}
