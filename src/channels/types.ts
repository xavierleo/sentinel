import type { CliConfirmationRequest } from '../cli.js';
import type { CliConfirmationDecision } from '../cli.js';

export interface InboundRunContext {
  channel: 'cli' | 'telegram';
  userId: string;
  sessionId: string;
  confirmTool?: (request: CliConfirmationRequest) => Promise<CliConfirmationDecision>;
}

export type ChannelRunner = (message: string, context: InboundRunContext) => Promise<string>;

export interface ChannelConfirmationContext {
  chatId: number;
  userId: number;
  reply: (text: string, options?: unknown) => Promise<unknown>;
}

export interface Channel {
  registerHandlers: () => void;
  requestConfirmation: (request: CliConfirmationRequest, context: ChannelConfirmationContext) => Promise<CliConfirmationDecision>;
  start?: () => Promise<void>;
  stop?: () => Promise<void>;
}
