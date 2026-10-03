import { Hono } from 'hono';
import type { Env } from '../env';
import { buildCookie, MAX_AGE_SECONDS, parseCookie, signSession, verifySession } from '../lib/auth';
import { fail, json, ok } from '../lib/response';

const auth = new Hono<{ Bindings: Env }>();

/** POST /api/auth/login — verify admin password, set signed session cookie. */
auth.post('/login', async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const password = body.password ?? '';
  if (!password || password !== c.env.ADMIN_PASSWORD) {
    return json(fail(401, '口令错误'), 401);
  }
  const token = await signSession(c.env);
  const secure = new URL(c.req.url).protocol === 'https:';
  return new Response(JSON.stringify(ok(null, '登录成功')), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Set-Cookie': buildCookie(token, MAX_AGE_SECONDS, secure),
    },
  });
});

/** POST /api/auth/logout — clear the session cookie. */
auth.post('/logout', async (c) => {
  const secure = new URL(c.req.url).protocol === 'https:';
  return new Response(JSON.stringify(ok(null, '已登出')), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Set-Cookie': buildCookie('', 0, secure),
    },
  });
});

/** GET /api/auth/me — public check of current auth state. */
auth.get('/me', async (c) => {
  const token = parseCookie(c.req.header('Cookie') ?? '', 'dm_session');
  const authed = await verifySession(c.env, token);
  return json(ok({ authed }));
});

export default auth;
