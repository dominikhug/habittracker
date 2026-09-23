import type { FastifyRequest } from 'fastify';
import { refreshTokens, TokenRefreshError } from './oauth.js';

// No valid session/refresh token — caller should respond with HTTP 401.
export class UnauthenticatedError extends Error {}

// Mints a fresh Microsoft Graph access token from the refresh token stored in the
// session cookie. Microsoft frequently rotates the refresh token on every redemption —
// the new one MUST be written back to the session on every call, or the next request
// carries a dead refresh token and auth breaks silently a few hours/days later.
export async function getGraphAccessToken(request: FastifyRequest): Promise<string> {
  const refreshToken = request.session.get('rt');
  if (!refreshToken) {
    throw new UnauthenticatedError();
  }

  try {
    const tokens = await refreshTokens(refreshToken);
    request.session.set('rt', tokens.refresh_token ?? refreshToken);
    return tokens.access_token;
  } catch (err) {
    if (err instanceof TokenRefreshError && err.errorCode === 'invalid_grant') {
      // Refresh token expired/revoked — expected, not a bug. Any other 400 (bad client
      // secret, misconfigured scope, ...) is a real problem and should surface as one,
      // not silently log the user out.
      request.session.delete();
      throw new UnauthenticatedError();
    }
    throw err;
  }
}
