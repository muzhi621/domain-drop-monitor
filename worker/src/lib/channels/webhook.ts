import type { ChannelSender, NotifyPayload } from './index';
import type { Env } from '../../env';
import type { NotifConfig } from '../../types';

/** Generic Webhook channel — JSON POST (URL from cfg.recipient or Secret). */
export class WebhookChannel implements ChannelSender {
  async send(env: Env, cfg: NotifConfig, payload: NotifyPayload): Promise<void> {
    const url = (cfg.recipient || env.NOTIF_WEBHOOK_URL || '').trim();
    if (!url) {
      throw new Error('Webhook 未配置（缺少 URL）');
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event: payload.event,
        domain: payload.domain,
        oldStatus: payload.oldStatus ?? null,
        status: payload.status,
        time: payload.time,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Webhook 发送失败 (${resp.status})`);
    }
  }
}
