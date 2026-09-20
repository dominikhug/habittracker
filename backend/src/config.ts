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
  // Overridable so tests can point these at a local mock server instead of the real
  // Microsoft Graph API / identity platform.
  graphBaseUrl: (process.env.GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0').replace(/\/$/, ''),
  msIdentityBaseUrl: (process.env.MS_IDENTITY_BASE_URL || 'https://login.microsoftonline.com').replace(/\/$/, ''),
};
