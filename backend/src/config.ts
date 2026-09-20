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
};
