export type MemoryKind = 'inventory' | 'notes' | 'episodic';

export interface EntityWrite {
  id: string;
  kind: string;
  name: string;
}

export interface NoteWrite {
  body: string;
  tags?: string[];
  entityId?: string;
}

export interface MemoryNote {
  id: number;
  entityId: string | null;
  body: string;
  tags: string[];
  createdAt: number;
}

export interface MemoryEntity {
  id: string;
  kind: string;
  name: string;
  firstSeenAt: number;
  lastSeenAt: number;
  archivedAt: number | null;
  attrs: Record<string, string>;
  notes: MemoryNote[];
}

export interface MemorySearchResult {
  kind: MemoryKind;
  entityId: string | null;
  title: string;
  body: string;
  score: number;
}
