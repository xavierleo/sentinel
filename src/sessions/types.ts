export interface SessionWrite {
  id: string;
  channel: string;
  userId: string;
}

export interface SessionMessageWrite {
  sessionId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface SessionMessageRead extends SessionMessageWrite {
  id: number;
  createdAt: number;
}

export interface SessionStepWrite {
  sessionId: string;
  stepId: string;
}

export interface SessionStepRead extends SessionStepWrite {
  id: number;
  status: 'in_flight' | 'completed' | 'failed';
  startedAt: number;
  completedAt: number | null;
  failedAt: number | null;
}
