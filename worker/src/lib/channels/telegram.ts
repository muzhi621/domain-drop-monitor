import type { ChannelSender, NotifyPayload } from './index';
import type { Env } from '../../env';
import type { NotifConfig } from '../../types';

/** Telegram Bot API channel (Token / Chat ID from Secrets). */
export class TelegramChannel implements ChannelSender {
  async send(env: Env, cfg: NotifConfig, payload: NotifyPayload): Promise<void> {
    const token = env.TG_BOT_TOKEN;
    const chatId = (cfg.recipient || env.TG_CHAT_ID || '').trim();
    if (!token || !chatId) {
      throw new Error('Telegram 未配置（缺少 TG_BOT_TOKEN 或 Chat ID）');
    }

    const isDrop = payload.event === 'drop';
    const text = [
      `${isDrop ? '🔔 域名掉落' : '⚠️ 域名预警'}`,
      `域名：${payload.domain}`,
      `状态：${payload.oldStatus ?? '-'} → ${payload.status}`,
      `时间：${new Date(payload.time).toLocaleString('zh-CN')}`,
    ].join('\n');

    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) {
      throw new Error(`Telegram 发送失败 (${resp.status})`);
    }
  }
}
