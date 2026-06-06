import Database from 'better-sqlite3';

export type StateDatabase = Database.Database;

const migrations = [
  {
    version: 1,
    sql: `
      create table if not exists schema_migrations (
        version integer primary key,
        applied_at integer not null
      );

      create table if not exists sessions (
        id text primary key,
        channel text not null,
        user_id text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table if not exists audit_events (
        id integer primary key autoincrement,
        session_id text not null,
        timestamp integer not null,
        kind text not null,
        tool_name text,
        input_json text,
        permission_decision text,
        permission_reason text
      );
    `,
  },
  {
    version: 2,
    sql: `
      create table if not exists entities (
        id text primary key,
        kind text not null,
        name text not null,
        first_seen_at integer not null,
        last_seen_at integer not null,
        archived_at integer
      );

      create table if not exists entity_attrs (
        entity_id text not null references entities(id),
        attribute text not null,
        value text not null,
        source text not null,
        observed_at integer not null,
        superseded_at integer,
        primary key (entity_id, attribute, source)
      );

      create table if not exists notes (
        id integer primary key autoincrement,
        entity_id text,
        body text not null,
        tags text,
        created_at integer not null,
        obsoleted_at integer
      );

      create virtual table if not exists notes_fts using fts5(body, tags, content='notes');
    `,
  },
  {
    version: 3,
    sql: `
      create table if not exists cost_ledger (
        id integer primary key autoincrement,
        session_id text not null,
        timestamp integer not null,
        provider text not null,
        model text not null,
        tokens_in integer not null,
        tokens_out integer not null,
        cached_tokens_in integer not null,
        cost_usd real not null
      );

      create table if not exists events (
        id integer primary key autoincrement,
        session_id text not null,
        timestamp integer not null,
        actor text not null,
        kind text not null,
        payload text not null
      );
    `,
  },
  {
    version: 4,
    sql: `
      create table if not exists preferences (
        key text primary key,
        value text not null,
        updated_at integer not null
      );
    `,
  },
];

export function createStateDatabase(path: string): StateDatabase {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec('create table if not exists schema_migrations (version integer primary key, applied_at integer not null)');

  const hasMigration = db.prepare('select 1 from schema_migrations where version = ?');
  const recordMigration = db.prepare('insert into schema_migrations (version, applied_at) values (?, ?)');

  for (const migration of migrations) {
    if (!hasMigration.get(migration.version)) {
      db.exec(migration.sql);
      recordMigration.run(migration.version, Date.now());
    }
  }

  return db;
}
