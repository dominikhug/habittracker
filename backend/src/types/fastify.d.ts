import '@fastify/secure-session';

declare module '@fastify/secure-session' {
  interface SessionData {
    // "session" cookie (long-lived)
    uid?: string;
    name?: string;
    rt?: string;
    // "oauthTxn" cookie (short-lived) — shares the same Session<SessionData> type
    state?: string;
    codeVerifier?: string;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    oauthTxn: FastifyRequest['session'];
  }
}
