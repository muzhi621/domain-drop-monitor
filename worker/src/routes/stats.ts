import { Hono } from 'hono';
import type { Env } from '../env';
import { getStats } from '../lib/db';
import { json, ok } from '../lib/response';

const stats = new Hono<{ Bindings: Env }>();

/** GET /api/stats — dashboard aggregates. */
stats.get('/', async (c) => {
  const data = await getStats(c.env.DB);
  return json(ok(data));
});

export default stats;
