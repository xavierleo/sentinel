import Database from 'better-sqlite3';
import { applyStorageSchema } from './schema.js';

export function createStateDatabase(path: string): InstanceType<typeof Database> {
  const db = new Database(path);
  applyStorageSchema(db);
  return db;
}
