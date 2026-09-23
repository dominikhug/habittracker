import crypto from 'node:crypto';
import { config } from '../config.js';

const AUTHORIZE_URL = `${config.msIdentityBaseUrl}/${config.azureTenant}/oauth2/v2.0/authorize`;
const TOKEN_URL = `${config.msIdentityBaseUrl}/${config.azureTenant}/oauth2/v2.0/token`;
const SCOPE = 'openid profile offline_access Files.ReadWrite.AppFolder';

// Generates a PKCE code_verifier/code_challenge pair for the OAuth authorization code flow.
export function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Random opaque value used as the OAuth `state` param to guard against CSRF on the callback.
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Builds the Microsoft identity platform authorize URL the user's browser is redirected to.
export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: config.azureClientId,
    response_type: 'code',
    redirect_uri: config.azureRedirectUri,
    response_mode: 'query',
    scope: SCOPE,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface CodeExchangeResponse {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  expires_in: number;
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function postToTokenEndpoint(body: URLSearchParams): Promise<Response> {
  return fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

// Redeems the authorization code from the OAuth callback for access/refresh/id tokens.
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CodeExchangeResponse> {
  const body = new URLSearchParams({
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.azureRedirectUri,
    code_verifier: codeVerifier,
  });
  const response = await postToTokenEndpoint(body);
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<CodeExchangeResponse>;
}

export class TokenRefreshError extends Error {
  // errorCode is AAD's machine-readable `error` field (e.g. "invalid_grant",
  // "invalid_client", "invalid_scope") — callers must check THIS, not just `status`,
  // before deciding a refresh token is actually dead: AAD returns 400 for many
  // unrelated problems (bad client secret, misconfigured scope) too.
  constructor(public status: number, public errorCode: string | undefined, message: string) {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

// Exchanges a stored refresh token for a fresh access token (and usually a rotated refresh token).
export async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const body = new URLSearchParams({
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });
  const response = await postToTokenEndpoint(body);
  if (!response.ok) {
    const text = await response.text();
    let errorCode: string | undefined;
    try {
      errorCode = JSON.parse(text).error;
    } catch {
      // Non-JSON error body — leave errorCode undefined, message still carries the text.
    }
    throw new TokenRefreshError(response.status, errorCode, `Token refresh failed: ${response.status} ${text}`);
  }
  return response.json() as Promise<RefreshResponse>;
}

// Signature/issuer/expiry are intentionally not verified here: this function only ever
// decodes an id_token we just received directly from Microsoft's token endpoint over a
// server-to-server HTTPS call (see exchangeCodeForTokens above) — the trust boundary is
// that direct connection, not the token's signature. Never reuse this for a token that
// originates from a client or any other less-trusted source without adding real
// signature/aud/iss/exp verification against Microsoft's JWKS first.
export function decodeIdToken(idToken: string): { oid: string; name: string } {
  const payloadB64 = idToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  return { oid: payload.oid ?? payload.sub, name: payload.name ?? 'Unbekannt' };
}
