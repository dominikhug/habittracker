import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    uid: string;
  }
}

// Fastify preHandler hook: replies 401 unless the session cookie carries a user id.
// Attaches it to request.uid for downstream handlers.
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const uid = request.session.get('uid');
  if (!uid) {
    return reply.code(401).send({ error: 'unauthenticated' });
  }
  // Renews the session's expiry timestamp (see plugins/session.ts), so active users
  // are never logged out. Without it the session dies a fixed time after login.
  request.session.touch();
  request.uid = uid;
}
