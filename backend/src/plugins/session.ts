import secureSession from '@fastify/secure-session';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';

// Registers the two secure-session cookies: the long-lived login session and the
// short-lived transient cookie used to carry OAuth state/PKCE across the redirect.
export async function registerSession(app: FastifyInstance) {
  await app.register(secureSession, [
    {
      sessionName: 'session',
      cookieName: 'session',
      key: Buffer.from(config.sessionCookieKey, 'hex'),
      // Idle timeout, checked against a timestamp inside the cookie (the library default
      // is 24h). requireAuth renews that timestamp on every API request, so a session only
      // expires after 90 days WITHOUT use — same as the cookie's maxAge below.
      expiry: 60 * 60 * 24 * 90,
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
