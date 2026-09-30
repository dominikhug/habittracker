function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  azureClientId: requireEnv('AZURE_CLIENT_ID'),
  azureClientSecret: requireEnv('AZURE_CLIENT_SECRET'),
  azureTenant: process.env.AZURE_TENANT || 'common',
  azureRedirectUri: requireEnv('AZURE_REDIRECT_URI'),
  sessionCookieKey: requireEnv('SESSION_COOKIE_KEY'),
  oauthTxnCookieKey: requireEnv('OAUTH_TXN_COOKIE_KEY'),
  isProd: process.env.NODE_ENV === 'production',
  // Directory holding one JSON file per user (on Railway: the volume's mount path).
  // Deliberately required: a default would silently write to the container's ephemeral
  // disk in production, and every redeploy would wipe all users' data.
  dataDir: requireEnv('DATA_DIR'),
  // Overridable so tests can point this at a local mock server instead of the real
  // Microsoft identity platform.
  msIdentityBaseUrl: (process.env.MS_IDENTITY_BASE_URL || 'https://login.microsoftonline.com').replace(/\/$/, ''),
  // In production (M7) the backend serves the built SPA itself, so a relative "/"
  // redirect after login is correct. In local dev the SPA runs on Vite's own port
  // (5173) instead — set FRONTEND_URL there so the post-login redirect lands on it
  // instead of 404ing against the backend's own (API-only) routes.
  frontendUrl: (process.env.FRONTEND_URL || '').replace(/\/$/, ''),
};
