import type { ReplayEventRead, ReplayEventWrite } from './replay.js';

export interface ReplayRepositoryLike {
  readSession: (sessionId: string) => ReplayEventRead[];
  recordEvent: (event: ReplayEventWrite) => number;
}

export interface ReplayTurnResult {
  userMessage: string;
  originalText?: string;
  replayText: string;
}

export interface ReplayRunResult {
  sourceSessionId: string;
  replaySessionId: string;
  turns: ReplayTurnResult[];
}

function messageText(event: ReplayEventRead): string | undefined {
  if (!event.payload || typeof event.payload !== 'object' || !('text' in event.payload)) {
    return undefined;
  }

  const text = (event.payload as { text: unknown }).text;
  return typeof text === 'string' ? text : undefined;
}

export async function replaySession(options: {
  sourceSessionId: string;
  replaySessionId: string;
  replay: ReplayRepositoryLike;
  runTurn: (message: string) => Promise<string>;
}): Promise<ReplayRunResult> {
  const events = options.replay.readSession(options.sourceSessionId);
  const turns: ReplayTurnResult[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.actor !== 'user' || event.kind !== 'message') {
      continue;
    }

    const userMessage = messageText(event);
    if (!userMessage) {
      continue;
    }

    const originalText = events.slice(index + 1).find((candidate) => candidate.actor === 'agent')?.payload;
    const replayText = await options.runTurn(userMessage);
    const turn = {
      userMessage,
      originalText:
        originalText && typeof originalText === 'object' && 'text' in originalText
          ? String((originalText as { text: unknown }).text)
          : undefined,
      replayText,
    };
    turns.push(turn);
    options.replay.recordEvent({
      sessionId: options.replaySessionId,
      actor: 'scheduler',
      kind: 'replay_turn',
      payload: {
        sourceSessionId: options.sourceSessionId,
        ...turn,
      },
    });
  }

  return {
    sourceSessionId: options.sourceSessionId,
    replaySessionId: options.replaySessionId,
    turns,
  };
}
