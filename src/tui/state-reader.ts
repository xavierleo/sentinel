import { defaultConfig } from '../config/defaults.js';
import { createRuntimeSnapshotsRepository } from '../storage/runtime-snapshots-repository.js';
import { createStateDatabase } from '../storage/sqlite.js';
import type { PersistedSnapshotRead } from '../storage/types.js';

export interface SnapshotStateReader {
  readLatestSnapshot: () => PersistedSnapshotRead | undefined;
}

export function createSnapshotStateReader(): SnapshotStateReader {
  return {
    readLatestSnapshot: () => {
      const db = createStateDatabase(defaultConfig.storage.sqlite_path);

      try {
        return createRuntimeSnapshotsRepository(db).readLatestSnapshot();
      } finally {
        db.close();
      }
    },
  };
}
