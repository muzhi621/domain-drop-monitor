import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatch, sendTest } from '../src/lib/notifier';
import { channels } from '../src/lib/channels';
import type { Env } from '../src/env';
import type { NotifConfig, NotifyPayload } from '../src/types';

vi.mock('../src/lib/db', () => ({
  getNotifConfigs: vi.fn(),
  getNotifConfig: vi.fn(),
}));

import { getNotifConfigs, getNotifConfig } from '../src/lib/db';

const env = {
  DB: {} as any,
  ADMIN_PASSWORD: '',
  SESSION_SECRET: '',
  RESEND_API_KEY: '',
  TG_BOT_TOKEN: '',
  TG_CHAT_ID: '',
  PUSHPLUS_TOKEN: '',
  NOTIF_WEBHOOK_URL: '',
  WECOM_WEBHOOK_URL: '',
  WHOIS_API_BASE: '',
  WHOIS_API_KEY: '',
} as unknown as Env;

const payload: NotifyPayload = {
  domain: 'a.com',
  event: 'drop',
  status: 'available',
  oldStatus: 'pendingDelete',
  time: Date.now(),
};

const webhookCfg: NotifConfig = {
  id: 1, channel: 'webhook', enabled: true, recipient: 'http://hook', suppress_interval_minutes: 0, updated_at: 0,
};
const tgCfg: NotifConfig = {
  id: 2, channel: 'telegram', enabled: true, recipient: 'chat', suppress_interval_minutes: 0, updated_at: 0,
};
const disabledCfg: NotifConfig = { ...webhookCfg, id: 3, enabled: false };

describe('notifier: dispatch', () => {
  let webhookSpy: ReturnType<typeof vi.spyOn>;
  let telegramSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    webhookSpy = vi.spyOn(channels.webhook, 'send').mockResolvedValue(undefined);
    telegramSpy = vi.spyOn(channels.telegram, 'send').mockResolvedValue(undefined);
    vi.mocked(getNotifConfigs).mockReset();
    vi.mocked(getNotifConfig).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends to every enabled channel and counts them', async () => {
    vi.mocked(getNotifConfigs).mockResolvedValue([webhookCfg, tgCfg]);
    const res = await dispatch(env, payload);
    expect(res.sent).toBe(true);
    expect(res.channelCount).toBe(2);
    expect(webhookSpy).toHaveBeenCalledTimes(1);
    expect(telegramSpy).toHaveBeenCalledTimes(1);
  });

  it('skips disabled channels and reports no-enabled when none are enabled', async () => {
    vi.mocked(getNotifConfigs).mockResolvedValue([disabledCfg]);
    const res = await dispatch(env, payload);
    expect(res.sent).toBe(false);
    expect(res.channelCount).toBe(0);
    expect(res.errors).toContain('未启用任何通知渠道');
    expect(webhookSpy).not.toHaveBeenCalled();
  });

  it('records per-channel errors but keeps sent=true if one succeeds', async () => {
    vi.mocked(getNotifConfigs).mockResolvedValue([webhookCfg, tgCfg]);
    telegramSpy.mockRejectedValue(new Error('boom'));
    const res = await dispatch(env, payload);
    expect(res.sent).toBe(true);
    expect(res.errors).toHaveLength(1);
  });

  it('sendTest returns 未知渠道 when the channel config is missing', async () => {
    vi.mocked(getNotifConfig).mockResolvedValue(null);
    const res = await sendTest(env, 'webhook');
    expect(res.sent).toBe(false);
    expect(res.errors[0]).toBe('未知渠道');
  });
});
