import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { authRoutes } from './auth/routes.js';
import { habitsRoutes } from './habits/routes.js';
import { registerSession } from './plugins/session.js';
import { config } from './config.js';

// Assembles the Fastify app: session handling, auth/habits routes, health check, and
// (in production) static serving of the built SPA.
export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerSession(app);
  await app.register(authRoutes);
  await app.register(habitsRoutes);

  app.get('/healthz', async () => {
    return { status: 'ok' };
  });

  // Production only: the backend serves the built SPA itself (single-service
  // architecture, see README "Architektur"). In dev, Vite's own server + proxy
  // handles this instead, so frontend/dist may not even exist there.
  if (config.isProd) {
    const frontendDist = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

    // @fastify/static only logs a warning (not a throw) when root is missing, which
    // would otherwise let a broken build "succeed" and silently 404 on every page.
    if (!existsSync(frontendDist)) {
      throw new Error(`frontend/dist not found at ${frontendDist} — run the build first`);
    }

    await app.register(fastifyStatic, { root: frontendDist });

    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
