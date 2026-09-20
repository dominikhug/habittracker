import Fastify from 'fastify';
import { authRoutes } from './auth/routes.js';
import { registerSession } from './plugins/session.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerSession(app);
  await app.register(authRoutes);

  app.get('/healthz', async () => {
    return { status: 'ok' };
  });

  return app;
}
