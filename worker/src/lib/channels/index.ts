import type { Channel, NotifConfig } from '../../types';
import type { Env } from '../../env';
import { EmailChannel } from './email';
import { TelegramChannel } from './telegram';
import { PushplusChannel } from './pushplus';
import { WebhookChannel } from './webhook';
import { WecomChannel } from './wecom';

/** Payload delivered to every channel on a drop / warn event. */
export interface NotifyPayload {
  domain: string;
  event: 'drop' | 'warn';
  status: string;
  oldStatus?: string | null;
  time: number;
}

/** Contract implemented by every notification channel. */
export interface ChannelSender {
  send(env: Env, cfg: NotifConfig, payload: NotifyPayload): Promise<void>;
}

/** Channel registry — keyed by channel identifier. */
export const channels: Record<Channel, ChannelSender> = {
  email: new EmailChannel(),
  telegram: new TelegramChannel(),
  pushplus: new PushplusChannel(),
  webhook: new WebhookChannel(),
  wecom: new WecomChannel(),
};
