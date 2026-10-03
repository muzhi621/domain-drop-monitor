import type { ChannelSender, NotifyPayload } from './index';
import type { Env } from '../../env';
import type { NotifConfig } from '../../types';

/** Email channel via Resend (credentials from Secret RESEND_API_KEY). */
export class EmailChannel implements ChannelSender {
  async send(env: Env, cfg: NotifConfig, payload: NotifyPayload): Promise<void> {
    const to = (cfg.recipient || '').trim();
    const apiKey = env.RESEND_API_KEY;
    if (!to || !apiKey) {
      throw new Error('邮件渠道未配置（缺少收件人或 RESEND_API_KEY）');
    }

    const isDrop = payload.event === 'drop';
    const subject = isDrop ? `【域名掉落】${payload.domain} 可注册` : `【域名预警】${payload.domain} 进入删除流程`;
    const text = [
      `域名：${payload.domain}`,
      `事件：${isDrop ? '可注册（掉落）' : '预警'}`,
      `状态：${payload.oldStatus ?? '-'} → ${payload.status}`,
      `时间：${new Date(payload.time).toLocaleString('zh-CN')}`,
    ].join('\n');

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to,
        subject,
        text,
      }),
    });
    if (!resp.ok) {
      throw new Error(`Resend 发送失败 (${resp.status})`);
    }
  }
}
