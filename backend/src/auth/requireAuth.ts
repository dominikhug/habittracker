import type { FastifyReply, FastifyRequest } from 'fastify';
import { getGraphAccessToken, UnauthenticatedError } from './graphToken.js';

declare module 'fastify' {
  interface FastifyRequest {
    graphAccessToken: string;
  }
}

// Fastify preHandler hook: resolves a fresh Graph access token for the request or replies
// 401. Attaches the token to request.graphAccessToken for downstream handlers.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    request.graphAccessToken = await getGraphAccessToken(request);
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    throw err;
  }
}
