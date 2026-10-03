import type { ChannelSender, NotifyPayload } from './index';
import type { Env } from '../../env';
import type { NotifConfig } from '../../types';

/** PushPlus (WeChat) channel — credentials from Secret PUSHPLUS_TOKEN. */
export class PushplusChannel implements ChannelSender {
  async send(env: Env, _cfg: NotifConfig, payload: NotifyPayload): Promise<void> {
    const token = env.PUSHPLUS_TOKEN;
    if (!token) {
      throw new Error('PushPlus 未配置（缺少 PUSHPLUS_TOKEN）');
    }

    const isDrop = payload.event === 'drop';
    const title = isDrop ? `域名掉落：${payload.domain}` : `域名预警：${payload.domain}`;
    const content = [
      `域名：${payload.domain}`,
      `事件：${isDrop ? '可注册（掉落）' : '预警'}`,
      `状态：${payload.oldStatus ?? '-'} → ${payload.status}`,
      `时间：${new Date(payload.time).toLocaleString('zh-CN')}`,
    ].join('<br>');

    const resp = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        title,
        content,
        channel: 'wechat',
        template: 'html',
      }),
    });
    if (!resp.ok) {
      throw new Error(`PushPlus 发送失败 (${resp.status})`);
    }
  }
}
