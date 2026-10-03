import type { Env } from '../env';
import type { Channel } from '../types';
import { getNotifConfig, getNotifConfigs } from './db';
import { channels, type NotifyPayload } from './channels';

export { type NotifyPayload } from './channels';

export interface DispatchResult {
  sent: boolean;
  channelCount: number;
  errors: string[];
}

/**
 * Dispatch a drop / warn event to every enabled notification channel.
 * Per-domain suppression is handled by the scheduler (via domains.last_notify_at).
 */
export async function dispatch(env: Env, payload: NotifyPayload): Promise<DispatchResult> {
  const configs = await getNotifConfigs(env.DB);
  const enabled = configs.filter((c) => c.enabled);

  if (enabled.length === 0) {
    return { sent: false, channelCount: 0, errors: ['未启用任何通知渠道'] };
  }

  const errors: string[] = [];
  let sent = false;
  for (const cfg of enabled) {
    const ch = channels[cfg.channel];
    if (!ch) continue;
    try {
      await ch.send(env, cfg, payload);
      sent = true;
    } catch (e) {
      errors.push(`${cfg.channel}: ${(e as Error).message}`);
    }
  }
  return { sent, channelCount: enabled.length, errors };
}

/**
 * Send a test notification to a single channel (uses cfg.recipient if provided,
 * falling back to the configured recipient / Secret).
 */
export async function sendTest(env: Env, channel: Channel, recipient?: string): Promise<DispatchResult> {
  const cfg = await getNotifConfig(env.DB, channel);
  if (!cfg) return { sent: false, channelCount: 0, errors: ['未知渠道'] };

  const ch = channels[channel];
  if (!ch) return { sent: false, channelCount: 0, errors: ['未知渠道'] };

  const testCfg = { ...cfg, recipient: recipient || cfg.recipient };
  const payload: NotifyPayload = {
    domain: 'example.com',
    event: 'drop',
    status: 'available',
    oldStatus: 'pendingDelete',
    time: Date.now(),
  };

  try {
    await ch.send(env, testCfg, payload);
    return { sent: true, channelCount: 1, errors: [] };
  } catch (e) {
    return { sent: false, channelCount: 0, errors: [`${channel}: ${(e as Error).message}`] };
  }
}
