import { Hono } from 'hono';
import type { Env } from './env';
import { requireAuth } from './middleware/auth';
import authRoutes from './routes/auth';
import domainsRoutes from './routes/domains';
import historyRoutes from './routes/history';
import notificationsRoutes from './routes/notifications';
import statsRoutes from './routes/stats';

/**
 * Assemble the Hono application:
 *  - /health            public health probe
 *  - /api/auth/*        public auth endpoints
 *  - /api/* (rest)      protected by requireAuth
 */
export function createApp(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/health', (c) => c.text('ok', 200));

  // Public auth routes.
  app.route('/api/auth', authRoutes);

  // Protected API group.
  const api = new Hono<{ Bindings: Env }>();
  api.use('*', requireAuth);
  api.route('/domains', domainsRoutes);
  api.route('/history', historyRoutes);
  api.route('/notifications', notificationsRoutes);
  api.route('/stats', statsRoutes);
  app.route('/api', api);

  // Fallback for unknown API paths.
  app.all('/api/*', (c) => c.json({ code: 404, data: null, message: 'Not Found' }, 404));

  return app;
}
