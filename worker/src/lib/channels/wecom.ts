import type { ChannelSender, NotifyPayload } from './index';
import type { Env } from '../../env';
import type { NotifConfig } from '../../types';

/** WeCom (企业微信) robot channel — Markdown POST (URL from cfg.recipient or Secret). */
export class WecomChannel implements ChannelSender {
  async send(env: Env, cfg: NotifConfig, payload: NotifyPayload): Promise<void> {
    const url = (cfg.recipient || env.WECOM_WEBHOOK_URL || '').trim();
    if (!url) {
      throw new Error('企业微信未配置（缺少 Webhook URL）');
    }

    const isDrop = payload.event === 'drop';
    const content = [
      `${isDrop ? '🔔 域名掉落' : '⚠️ 域名预警'}`,
      `> 域名：**${payload.domain}**`,
      `> 状态：${payload.oldStatus ?? '-'} → ${payload.status}`,
      `> 时间：${new Date(payload.time).toLocaleString('zh-CN')}`,
    ].join('\n');

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
    });
    if (!resp.ok) {
      throw new Error(`企业微信发送失败 (${resp.status})`);
    }
  }
}
