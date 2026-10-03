import { createMiddleware } from 'hono/factory';
import type { Env } from '../env';
import { parseCookie, verifySession } from '../lib/auth';
import { fail, json } from '../lib/response';

/**
 * Auth guard middleware: requires a valid signed `dm_session` cookie.
 * Returns 401 when missing/invalid/expired.
 */
export const requireAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const token = parseCookie(c.req.header('Cookie') ?? '', 'dm_session');
  const valid = await verifySession(c.env, token);
  if (!valid) {
    return json(fail(401, '未登录或会话已过期'), 401);
  }
  await next();
});
