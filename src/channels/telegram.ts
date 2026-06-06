import { Bot, InlineKeyboard } from 'grammy';
import type { CliConfirmationRequest } from '../cli.js';
import type { Channel, ChannelConfirmationContext, ChannelRunner } from './types.js';

interface TelegramBotLike {
  on: (event: 'message:text', handler: (ctx: TelegramMessageContext) => Promise<void>) => void;
  callbackQuery: (pattern: RegExp, handler: (ctx: TelegramCallbackContext) => Promise<void>) => void;
  start: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

interface TelegramMessageContext {
  from?: { id: number };
  chat?: { id: number };
  message?: { text?: string };
  reply: (text: string, options?: unknown) => Promise<unknown>;
}

interface TelegramCallbackContext {
  from?: { id: number };
  callbackQuery?: { data?: string };
  answerCallbackQuery: () => Promise<unknown>;
  editMessageText: (text: string) => Promise<unknown>;
}

export interface TelegramChannelOptions {
  bot: TelegramBotLike;
  authorizedUserId: number;
  runAgent: ChannelRunner;
}

interface PendingConfirmation {
  userId: number;
  resolve: (approved: boolean) => void;
}

function buildConfirmationText(request: CliConfirmationRequest): string {
  return [`Confirm tool call`, `Tool: ${request.toolName}`, `Input: ${JSON.stringify(request.input)}`, `Reason: ${request.reason}`].join('\n');
}

function buildInlineKeyboard(id: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('Approve', `sentinel_confirm:approve:${id}`)
    .text('Deny', `sentinel_confirm:deny:${id}`);
}

export function createTelegramChannel(options: TelegramChannelOptions): Channel {
  const pending = new Map<number, PendingConfirmation>();
  let nextConfirmationId = 1;

  async function handleText(ctx: TelegramMessageContext): Promise<void> {
    if (ctx.from?.id !== options.authorizedUserId) {
      return;
    }

    const text = ctx.message?.text?.trim();
    const chatId = ctx.chat?.id;
    if (!text || chatId === undefined) {
      return;
    }

    const response = await options.runAgent(text, {
      channel: 'telegram',
      userId: String(ctx.from.id),
      sessionId: `telegram:${ctx.from.id}:${chatId}`,
      confirmTool: (request) =>
        thisChannel.requestConfirmation(request, {
          chatId,
          userId: ctx.from?.id ?? options.authorizedUserId,
          reply: ctx.reply,
        }),
    });
    await ctx.reply(response);
  }

  async function handleConfirmationCallback(ctx: TelegramCallbackContext): Promise<void> {
    if (ctx.from?.id !== options.authorizedUserId) {
      return;
    }

    const match = /^sentinel_confirm:(approve|deny):(\d+)$/.exec(ctx.callbackQuery?.data ?? '');
    if (!match) {
      return;
    }

    const id = Number(match[2]);
    const confirmation = pending.get(id);
    if (!confirmation || confirmation.userId !== ctx.from.id) {
      await ctx.answerCallbackQuery();
      return;
    }

    pending.delete(id);
    const approved = match[1] === 'approve';
    confirmation.resolve(approved);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(approved ? 'Approved.' : 'Denied.');
  }

  const thisChannel: Channel = {
    registerHandlers() {
      options.bot.on('message:text', handleText);
      options.bot.callbackQuery(/^sentinel_confirm:(approve|deny):\d+$/, handleConfirmationCallback);
    },

    requestConfirmation(request: CliConfirmationRequest, context: ChannelConfirmationContext): Promise<boolean> {
      const id = nextConfirmationId;
      nextConfirmationId += 1;

      const result = new Promise<boolean>((resolve) => {
        pending.set(id, { userId: context.userId, resolve });
      });

      void context.reply(buildConfirmationText(request), {
        reply_markup: buildInlineKeyboard(id),
      });

      return result;
    },

    async start() {
      await options.bot.start();
    },

    async stop() {
      await options.bot.stop?.();
    },
  };

  return thisChannel;
}

export function createGrammyTelegramChannel(options: {
  token: string | undefined;
  authorizedUserId: number | undefined;
  runAgent: ChannelRunner;
}): Channel {
  if (!options.token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }

  if (options.authorizedUserId === undefined || Number.isNaN(options.authorizedUserId)) {
    throw new Error('TELEGRAM_USER_ID is required');
  }

  const channel = createTelegramChannel({
    bot: new Bot(options.token) as unknown as TelegramBotLike,
    authorizedUserId: options.authorizedUserId,
    runAgent: options.runAgent,
  });
  channel.registerHandlers();
  return channel;
}
