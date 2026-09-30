// functions/_shared/provider.js
// Configuracao fixa de cada provedor. Nenhum segredo fica aqui: Client IDs e
// Client Secrets vem de context.env (variaveis e segredos do Pages).

export function getGoogleProvider(env) {
  return {
    name: 'google',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    issuer: 'https://accounts.google.com',
    discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
    scope: 'openid email profile',
    usesNonce: true,
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
    apiVersion: '2026-03-10',
    // O enunciado pede para omitir scope e nonce no GitHub.
    scope: null,
    usesNonce: false,
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
