import crypto from 'node:crypto';
import { config } from '../config.js';

const AUTHORIZE_URL = `${config.msIdentityBaseUrl}/${config.azureTenant}/oauth2/v2.0/authorize`;
const TOKEN_URL = `${config.msIdentityBaseUrl}/${config.azureTenant}/oauth2/v2.0/token`;
// Login only: the app keeps its own data, so it needs no Microsoft API access.
const SCOPE = 'openid profile';

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
  id_token: string;
}

// Redeems the authorization code from the OAuth callback for tokens (only the id_token is used).
export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<CodeExchangeResponse> {
  const body = new URLSearchParams({
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.azureRedirectUri,
    code_verifier: codeVerifier,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }
  return response.json() as Promise<CodeExchangeResponse>;
}

// Signature/issuer/expiry are intentionally not verified here: this function only ever
// decodes an id_token we just received directly from Microsoft's token endpoint over a
// server-to-server HTTPS call (see exchangeCodeForTokens above) — the trust boundary is
// that direct connection, not the token's signature. Never reuse this for a token that
// originates from a client or any other less-trusted source without adding real
// signature/aud/iss/exp verification against Microsoft's JWKS first.
export function decodeIdToken(idToken: string): { tid: string; oid: string; name: string } {
  const payloadB64 = idToken.split('.')[1];
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  return { tid: payload.tid, oid: payload.oid ?? payload.sub, name: payload.name ?? 'Unbekannt' };
}
