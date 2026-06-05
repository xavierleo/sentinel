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
