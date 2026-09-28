export function getGoogleProvider(env) {
  return {
    name: 'google',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: 'https://accounts.google.com',
    scope: 'openid email profile',
  };
}

export function getGithubProvider(env) {
  return {
    name: 'github',
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userEndpoint: 'https://api.github.com/user',
    revokeEndpoint: (clientId) => `https://api.github.com/applications/${clientId}/grant`,
    scope: 'read:user',
  };
}

export function getProvider(name, env) {
  if (name === 'google') return getGoogleProvider(env);
  if (name === 'github') return getGithubProvider(env);
  return null;
}

export function getRedirectUri(env, providerName) {
  return `${env.PUBLIC_BASE_URL}/oauth/callback/${providerName}`;
}