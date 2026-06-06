import { describe, expect, it, vi } from 'vitest';
import { createTelegramChannel } from '../src/channels/telegram.js';

function createHarness() {
  const handlers = new Map<string, (ctx: any) => Promise<void> | void>();
  const bot = {
    on: vi.fn((event: string, handler: (ctx: any) => Promise<void> | void) => {
      handlers.set(event, handler);
    }),
    callbackQuery: vi.fn((pattern: RegExp, handler: (ctx: any) => Promise<void> | void) => {
      handlers.set(`callback:${pattern.source}`, handler);
    }),
    start: vi.fn(),
    stop: vi.fn(),
  };

  return { bot, handlers };
}

describe('telegram channel', () => {
  it('drops messages from unauthorized Telegram users', async () => {
    const harness = createHarness();
    const runAgent = vi.fn();
    const channel = createTelegramChannel({
      bot: harness.bot as any,
      authorizedUserId: 42,
      runAgent,
    });

    channel.registerHandlers();
    await harness.handlers.get('message:text')?.({
      from: { id: 7 },
      chat: { id: 99 },
      message: { text: 'status?' },
      reply: vi.fn(),
    });

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('runs authorized text messages and replies with the agent response', async () => {
    const harness = createHarness();
    const reply = vi.fn();
    const runAgent = vi.fn().mockResolvedValue('all systems quiet');
    const channel = createTelegramChannel({
      bot: harness.bot as any,
      authorizedUserId: 42,
      runAgent,
    });

    channel.registerHandlers();
    await harness.handlers.get('message:text')?.({
      from: { id: 42 },
      chat: { id: 99 },
      message: { text: 'status?' },
      reply,
    });

    expect(runAgent).toHaveBeenCalledWith('status?', expect.objectContaining({ channel: 'telegram', userId: '42', sessionId: 'telegram:42:99' }));
    expect(reply).toHaveBeenCalledWith('all systems quiet');
  });

  it('sends confirmation prompts with approve and deny buttons', async () => {
    const harness = createHarness();
    const reply = vi.fn();
    const channel = createTelegramChannel({
      bot: harness.bot as any,
      authorizedUserId: 42,
      runAgent: vi.fn(),
    });
    channel.registerHandlers();

    const resultPromise = channel.requestConfirmation(
      {
        toolName: 'container_action',
        input: { name: 'sonarr', action: 'restart', dry_run: false },
        reason: 'no permission rule matched',
      },
      { chatId: 99, userId: 42, reply },
    );

    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining('container_action'),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: [
            [
              expect.objectContaining({ text: 'Approve' }),
              expect.objectContaining({ text: 'Deny' }),
            ],
          ],
        }),
      }),
    );

    const callbackHandler = [...harness.handlers.entries()].find(([key]) => key.startsWith('callback:'))?.[1];
    await callbackHandler?.({
      from: { id: 42 },
      callbackQuery: { data: 'sentinel_confirm:approve:1' },
      answerCallbackQuery: vi.fn(),
      editMessageText: vi.fn(),
    });

    await expect(resultPromise).resolves.toBe(true);
  });
});
