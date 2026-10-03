import { Hono } from 'hono';
import type { Env } from '../env';
import type { Channel } from '../types';
import { getNotifConfigs, upsertNotifConfig } from '../lib/db';
import { sendTest } from '../lib/notifier';
import { fail, json, ok } from '../lib/response';

const notifications = new Hono<{ Bindings: Env }>();

const VALID_CHANNELS: Channel[] = ['email', 'telegram', 'pushplus', 'webhook', 'wecom'];

/** GET /api/notifications — list all channel configs. */
notifications.get('/', async (c) => {
  const configs = await getNotifConfigs(c.env.DB);
  return json(ok(configs));
});

/** PUT /api/notifications/:channel — update a channel config. */
notifications.put('/:channel', async (c) => {
  const channel = c.req.param('channel') as Channel;
  if (!VALID_CHANNELS.includes(channel)) {
    return json(fail(404, '未知渠道'), 404);
  }
  const body = await c.req
    .json<{ enabled?: boolean; recipient?: string; suppress_interval_minutes?: number }>()
    .catch(
      () => ({}) as { enabled?: boolean; recipient?: string; suppress_interval_minutes?: number },
    );

  if (
    body.suppress_interval_minutes != null &&
    (typeof body.suppress_interval_minutes !== 'number' || body.suppress_interval_minutes < 0)
  ) {
    return json(fail(422, '抑制间隔不合法'), 422);
  }

  try {
    const updated = await upsertNotifConfig(c.env.DB, channel, {
      enabled: body.enabled,
      recipient: body.recipient,
      suppress_interval_minutes: body.suppress_interval_minutes,
    });
    return json(ok(updated));
  } catch (e) {
    return json(fail(500, (e as Error).message), 500);
  }
});

/** POST /api/notifications/test — send a test message to a channel. */
notifications.post('/test', async (c) => {
  const body = await c.req
    .json<{ channel?: Channel; recipient?: string }>()
    .catch(() => ({}) as { channel?: Channel; recipient?: string });
  const channel = body.channel;
  if (!channel || !VALID_CHANNELS.includes(channel)) {
    return json(fail(422, '请指定有效渠道'), 422);
  }
  const res = await sendTest(c.env, channel, body.recipient);
  if (res.sent) {
    return json(ok(null, '测试消息已发送'));
  }
  return json(fail(500, res.errors.join('; ') || '发送失败'), 500);
});

export default notifications;
