import type { PermissionDecision } from '../permissions/types.js';
import type { StateDatabase } from './database.js';

export interface ToolAuditAttempt {
  sessionId: string;
  toolName: string;
  input: unknown;
  permissionDecision: PermissionDecision;
  permissionReason: string;
}

export interface AuditEventRead {
  id: number;
  sessionId: string;
  timestamp: number;
  kind: 'tool_call';
  toolName: string;
  input: unknown;
  permissionDecision: PermissionDecision;
  permissionReason: string;
}

export interface AuditSink {
  recordToolAttempt: (event: ToolAuditAttempt) => void;
}

export function createAuditRepository(db: StateDatabase, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const insert = db.prepare(`
    insert into audit_events (
      session_id,
      timestamp,
      kind,
      tool_name,
      input_json,
      permission_decision,
      permission_reason
    ) values (?, ?, 'tool_call', ?, ?, ?, ?)
  `);
  const list = db.prepare('select * from audit_events order by id desc limit ?');

  return {
    recordToolAttempt(event: ToolAuditAttempt): number {
      const result = insert.run(
        event.sessionId,
        now(),
        event.toolName,
        JSON.stringify(event.input),
        event.permissionDecision,
        event.permissionReason,
      );
      return Number(result.lastInsertRowid);
    },

    listEvents(options: { limit?: number } = {}): AuditEventRead[] {
      return list.all(options.limit ?? 50).reverse().map((row) => {
        const event = row as {
          id: number;
          session_id: string;
          timestamp: number;
          tool_name: string;
          input_json: string;
          permission_decision: PermissionDecision;
          permission_reason: string;
        };

        return {
          id: event.id,
          sessionId: event.session_id,
          timestamp: event.timestamp,
          kind: 'tool_call',
          toolName: event.tool_name,
          input: JSON.parse(event.input_json) as unknown,
          permissionDecision: event.permission_decision,
          permissionReason: event.permission_reason,
        };
      });
    },
  };
}
