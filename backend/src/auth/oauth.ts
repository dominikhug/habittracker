import crypto from 'node:crypto';
import { config } from '../config.js';

const AUTHORIZE_URL = `https://login.microsoftonline.com/${config.azureTenant}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${config.azureTenant}/oauth2/v2.0/token`;
const SCOPE = 'openid profile offline_access Files.ReadWrite.AppFolder';

export function generatePkce() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

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

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.azureRedirectUri,
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<TokenResponse>;
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
