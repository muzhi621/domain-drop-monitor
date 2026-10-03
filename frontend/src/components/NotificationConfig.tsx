import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../api/client';
import type { Channel, NotifConfig } from '../api/client';

const CHANNEL_META: Record<Channel, { label: string; desc: string; recipientLabel: string }> = {
  email: { label: '邮件 (Resend)', desc: '通过 Resend 发送，凭据 RESEND_API_KEY', recipientLabel: '收件人邮箱' },
  telegram: { label: 'Telegram', desc: 'Bot Token / Chat ID 来自 Secrets', recipientLabel: 'Chat ID（可选，留空用 TG_CHAT_ID）' },
  pushplus: { label: 'PushPlus (微信)', desc: 'PUSHPLUS_TOKEN 来自 Secrets', recipientLabel: '接收人（可选）' },
  webhook: { label: 'Webhook', desc: '通用 JSON POST', recipientLabel: 'Webhook URL（可选，留空用 NOTIF_WEBHOOK_URL）' },
  wecom: { label: '企业微信', desc: '机器人 Webhook', recipientLabel: 'Webhook URL（可选，留空用 WECOM_WEBHOOK_URL）' },
};

export default function NotificationConfig() {
  const [configs, setConfigs] = useState<NotifConfig[]>([]);
  const [draft, setDraft] = useState<Record<string, { enabled: boolean; recipient: string; suppress: number }>>({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    apiGet<NotifConfig[]>('/notifications')
      .then((r) => {
        setConfigs(r.data ?? []);
        const d: Record<string, { enabled: boolean; recipient: string; suppress: number }> = {};
        for (const c of r.data ?? []) {
          d[c.channel] = { enabled: c.enabled, recipient: c.recipient, suppress: c.suppress_interval_minutes };
        }
        setDraft(d);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (channel: Channel) => {
    setMsg('');
    setError('');
    const d = draft[channel];
    if (!d) return;
    try {
      await apiPut<NotifConfig>(`/notifications/${channel}`, {
        enabled: d.enabled,
        recipient: d.recipient,
        suppress_interval_minutes: d.suppress,
      });
      setMsg(`${CHANNEL_META[channel].label} 已保存`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const test = async (channel: Channel) => {
    setMsg('');
    setError('');
    const d = draft[channel];
    try {
      const r = await apiPost<null>('/notifications/test', { channel, recipient: d?.recipient });
      if (r.code === 0) setMsg(`${CHANNEL_META[channel].label} 测试消息已发送`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">通知配置</h1>

      {msg && <div className="text-green-600 text-sm">{msg}</div>}
      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="text-sm text-gray-500">
        凭据（API Key / Token / Webhook URL）全部来自 Cloudflare Secrets，不会存储到数据库。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {configs.map((c) => {
          const d = draft[c.channel] ?? { enabled: c.enabled, recipient: c.recipient, suppress: c.suppress_interval_minutes };
          const meta = CHANNEL_META[c.channel];
          return (
            <div key={c.channel} className="bg-white rounded shadow p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{meta.label}</div>
                  <div className="text-xs text-gray-400">{meta.desc}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => setDraft({ ...draft, [c.channel]: { ...d, enabled: e.target.checked } })}
                  />
                  启用
                </label>
              </div>

              <div>
                <label className="text-xs text-gray-500">{meta.recipientLabel}</label>
                <input
                  value={d.recipient}
                  onChange={(e) => setDraft({ ...draft, [c.channel]: { ...d, recipient: e.target.value } })}
                  className="w-full border rounded px-2 py-1 text-sm"
                  placeholder={meta.recipientLabel}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">抑制间隔（分钟，同域名在该时间内不重复通知）</label>
                <input
                  type="number"
                  min={0}
                  value={d.suppress}
                  onChange={(e) => setDraft({ ...draft, [c.channel]: { ...d, suppress: Number(e.target.value) } })}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => save(c.channel)}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
                >
                  保存
                </button>
                <button
                  onClick={() => test(c.channel)}
                  className="border px-3 py-1.5 rounded text-sm hover:bg-gray-100"
                >
                  测试发送
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
