import type { FastifyInstance } from 'fastify';
import { buildAuthorizeUrl, decodeIdToken, exchangeCodeForTokens, generatePkce, generateState } from './oauth.js';

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/auth/login', async (request, reply) => {
    const state = generateState();
    const { codeVerifier, codeChallenge } = generatePkce();
    request.oauthTxn.set('state', state);
    request.oauthTxn.set('codeVerifier', codeVerifier);
    return reply.redirect(buildAuthorizeUrl(state, codeChallenge));
  });

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
      if (!tokens.refresh_token) {
        request.log.error('Microsoft token response contained no refresh_token (offline_access not granted?)');
        return reply.code(500).send({ error: 'no_refresh_token' });
      }
      const { oid, name } = decodeIdToken(tokens.id_token);

      request.log.info({ refreshTokenLength: tokens.refresh_token.length }, 'Microsoft refresh token length');

      request.session.set('uid', oid);
      request.session.set('name', name);
      request.session.set('rt', tokens.refresh_token);
      request.oauthTxn.delete();

      return reply.redirect('/');
    }
  );

  app.get('/api/me', async (request, reply) => {
    const uid = request.session.get('uid');
    const name = request.session.get('name');
    if (!uid) {
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    return { uid, name };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete();
    return reply.code(204).send();
  });
}
