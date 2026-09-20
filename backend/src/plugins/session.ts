import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

export async function registerSession(app: FastifyInstance) {
  await app.register(secureSession, [
    {
      sessionName: 'session',
      cookieName: 'session',
      key: Buffer.from(config.sessionCookieKey, 'hex'),
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 90,
      },
    },
    {
      sessionName: 'oauthTxn',
      cookieName: 'oauth_txn',
      key: Buffer.from(config.oauthTxnCookieKey, 'hex'),
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        path: '/api/auth',
        maxAge: 600,
      },
    },
  ]);
}
