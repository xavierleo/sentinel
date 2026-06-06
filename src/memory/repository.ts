import type { StateDatabase } from '../storage/database.js';
import type { EntityWrite, MemoryEntity, MemoryKind, MemoryNote, MemorySearchResult, NoteWrite } from './types.js';

export interface MemoryRepository {
  upsertEntity: (entity: EntityWrite, observedAt?: number) => void;
  setEntityAttr: (entityId: string, attribute: string, value: string, source: string, observedAt?: number) => void;
  remember: (fact: { entityId: string; attribute: string; value: string; source?: string }) => void;
  getEntity: (entityId: string) => MemoryEntity | undefined;
  addNote: (note: NoteWrite) => number;
  setPreference: (key: string, value: string) => void;
  getPreference: (key: string) => string | undefined;
  summarizePreferences: () => string;
  search: (request: { query: string; kinds?: MemoryKind[]; limit?: number }) => MemorySearchResult[];
  summarizeInventory: (limit?: number) => string;
}

function parseTags(tags: string | null): string[] {
  return tags ? tags.split(',').filter(Boolean) : [];
}

export function createMemoryRepository(db: StateDatabase, options: { now?: () => number } = {}): MemoryRepository {
  const now = options.now ?? Date.now;

  return {
    upsertEntity(entity, observedAt = now()) {
      db.prepare(
        `
          insert into entities (id, kind, name, first_seen_at, last_seen_at)
          values (?, ?, ?, ?, ?)
          on conflict(id) do update set
            kind = excluded.kind,
            name = excluded.name,
            last_seen_at = excluded.last_seen_at,
            archived_at = null
        `,
      ).run(entity.id, entity.kind, entity.name, observedAt, observedAt);
    },

    setEntityAttr(entityId, attribute, value, source, observedAt = now()) {
      db.prepare(
        `
          insert into entity_attrs (entity_id, attribute, value, source, observed_at)
          values (?, ?, ?, ?, ?)
          on conflict(entity_id, attribute, source) do update set
            value = excluded.value,
            observed_at = excluded.observed_at,
            superseded_at = null
        `,
      ).run(entityId, attribute, value, source, observedAt);
    },

    remember(fact) {
      this.setEntityAttr(fact.entityId, fact.attribute, fact.value, fact.source ?? 'agent', now());
    },

    getEntity(entityId) {
      const row = db.prepare('select * from entities where id = ?').get(entityId) as
        | {
            id: string;
            kind: string;
            name: string;
            first_seen_at: number;
            last_seen_at: number;
            archived_at: number | null;
          }
        | undefined;

      if (!row) {
        return undefined;
      }

      const attrs = Object.fromEntries(
        (
          db
            .prepare('select attribute, value from entity_attrs where entity_id = ? and superseded_at is null order by attribute')
            .all(entityId) as { attribute: string; value: string }[]
        ).map((attr) => [attr.attribute, attr.value]),
      );
      const notes = db.prepare('select * from notes where entity_id = ? and obsoleted_at is null order by id').all(entityId) as {
        id: number;
        entity_id: string | null;
        body: string;
        tags: string | null;
        created_at: number;
      }[];

      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        archivedAt: row.archived_at,
        attrs,
        notes: notes.map((note): MemoryNote => ({
          id: note.id,
          entityId: note.entity_id,
          body: note.body,
          tags: parseTags(note.tags),
          createdAt: note.created_at,
        })),
      };
    },

    addNote(note) {
      const tags = note.tags?.join(',') ?? '';
      const result = db
        .prepare('insert into notes (entity_id, body, tags, created_at) values (?, ?, ?, ?)')
        .run(note.entityId ?? null, note.body, tags, now());
      const id = Number(result.lastInsertRowid);
      db.prepare('insert into notes_fts (rowid, body, tags) values (?, ?, ?)').run(id, note.body, tags);
      return id;
    },

    setPreference(key, value) {
      db.prepare(
        `
          insert into preferences (key, value, updated_at)
          values (?, ?, ?)
          on conflict(key) do update set
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      ).run(key, value, now());
    },

    getPreference(key) {
      const row = db.prepare('select value from preferences where key = ?').get(key) as { value: string } | undefined;
      return row?.value;
    },

    summarizePreferences() {
      const rows = db.prepare('select key, value from preferences order by key').all() as { key: string; value: string }[];
      if (rows.length === 0) {
        return 'User preferences: empty';
      }

      return ['User preferences:', ...rows.map((row) => `- ${row.key}: ${row.value}`)].join('\n');
    },

    search(request) {
      const kinds = request.kinds ?? ['inventory', 'notes'];
      const limit = request.limit ?? 10;
      const results: MemorySearchResult[] = [];

      if (kinds.includes('inventory')) {
        const rows = db
          .prepare(
            `
              select distinct entities.id, entities.kind, entities.name
              from entities
              left join entity_attrs on entity_attrs.entity_id = entities.id and entity_attrs.superseded_at is null
              left join notes on notes.entity_id = entities.id and notes.obsoleted_at is null
              where entities.archived_at is null
                and (
                  entities.id like ?
                  or entities.kind like ?
                  or entities.name like ?
                  or entity_attrs.value like ?
                  or notes.body like ?
                  or notes.tags like ?
                )
              order by kind, name
              limit ?
            `,
          )
          .all(
            `%${request.query}%`,
            `%${request.query}%`,
            `%${request.query}%`,
            `%${request.query}%`,
            `%${request.query}%`,
            `%${request.query}%`,
            limit,
          ) as {
          id: string;
          kind: string;
          name: string;
        }[];

        for (const row of rows) {
          results.push({
            kind: 'inventory',
            entityId: row.id,
            title: `${row.kind} ${row.name}`,
            body: row.id,
            score: 1,
          });
        }
      }

      if (kinds.includes('notes') && results.length < limit) {
        const rows = db
          .prepare(
            `
              select notes.id, notes.entity_id, notes.body, notes.tags
              from notes
              where notes.obsoleted_at is null and (notes.body like ? or notes.tags like ?)
              order by notes.id
              limit ?
            `,
          )
          .all(`%${request.query}%`, `%${request.query}%`, limit - results.length) as {
          id: number;
          entity_id: string | null;
          body: string;
          tags: string | null;
        }[];

        for (const row of rows) {
          results.push({
            kind: 'notes',
            entityId: row.entity_id,
            title: `note ${parseTags(row.tags).join(',')}`.trim(),
            body: row.body,
            score: 1,
          });
        }
      }

      return results.slice(0, limit);
    },

    summarizeInventory(limit = 20) {
      const rows = db
        .prepare(
          `
            select id, kind, name
            from entities
            where archived_at is null
            order by kind, name
            limit ?
          `,
        )
        .all(limit) as { id: string; kind: string; name: string }[];

      if (rows.length === 0) {
        return 'Inventory memory: empty';
      }

      return ['Inventory memory:', ...rows.map((row) => `- ${row.kind} ${row.name} (${row.id})`)].join('\n');
    },
  };
}
