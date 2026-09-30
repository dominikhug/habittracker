import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { buildAuthorizeUrl, decodeIdToken, exchangeCodeForTokens, generatePkce, generateState } from './oauth.js';

// Registers the Microsoft login flow (/login, /callback) and session endpoints (/me, /logout).
export async function authRoutes(app: FastifyInstance) {
  // Starts the OAuth flow: stashes PKCE/state in the transient oauth_txn cookie, then
  // redirects to Microsoft's login page.
  app.get('/api/auth/login', async (request, reply) => {
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePkce();
    request.oauthTxn.set('state', state);
    request.oauthTxn.set('codeVerifier', codeVerifier);
    return reply.redirect(buildAuthorizeUrl(state, codeChallenge));
  });

  // Microsoft redirects here after login: validates state/PKCE, exchanges the code for
  // tokens, and starts the user's session.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/callback',
    async (request, reply) => {
      const { code, state, error } = request.query;
      if (error) {
        return reply.code(400).send({ error });
      }

      const expectedState = request.oauthTxn.get('state');
      const codeVerifier = request.oauthTxn.get('codeVerifier');
      if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
        return reply.code(400).send({ error: 'invalid_state' });
      }

      const tokens = await exchangeCodeForTokens(code, codeVerifier);
      const { tid, oid, name } = decodeIdToken(tokens.id_token);

      // tid + oid together is Microsoft's recommended unique user key across tenants.
      // It also names the user's data file (see store/fileStore.ts).
      request.session.set('uid', `${tid}.${oid}`);
      request.session.set('name', name);
      request.oauthTxn.delete();

      return reply.redirect(config.frontendUrl ? `${config.frontendUrl}/` : '/');
    }
  );

  // Returns the current session's user, or 401 if not logged in.
  app.get('/api/me', async (request, reply) => {
    const uid = request.session.get('uid');
    const name = request.session.get('name');
    if (!uid) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    return { uid, name };
  });

  // Clears the session cookie, logging the user out.
  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete();
    return reply.code(204).send();
  });
}
