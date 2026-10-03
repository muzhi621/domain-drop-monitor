import type { Env } from './env';
import { createApp } from './app';
import { runDueChecks } from './lib/scheduler';

/**
 * Worker entry point.
 *  - fetch:    serves the Hono REST API (+ auth). No D1 session table.
 *  - scheduled: triggered by the 1-minute Cron to batch-check due domains.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = createApp();
    return app.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDueChecks(env));
  },
};
