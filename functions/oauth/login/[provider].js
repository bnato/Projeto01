// functions/oauth/login/[provider].js
// Inicia o fluxo OAuth (Google ou GitHub): gera state/nonce/PKCE, grava a
// transacao no D1 (apenas hashes) e redireciona para o provedor.

import { getProvider, getRedirectUri } from '../../_shared/provider.js';
import { generateRandomToken, generateCodeChallenge, sha256Hex } from '../../_shared/crypto.js';
import { buildOauthTxCookie } from '../../_shared/cookies.js';

const TX_TTL_SECONDS = 600;

export async function onRequestGet(context) {
  const { env, params } = context;
  const providerName = params.provider;
  const provider = getProvider(providerName, env);

  if (!provider) {
    return new Response('Provedor OAuth invalido', { status: 400 });
  }

  const txId = generateRandomToken();
  const idHash = await sha256Hex(txId);

  const state = generateRandomToken();
  const stateHash = await sha256Hex(state);

  const codeVerifier = generateRandomToken();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const isGoogle = providerName === 'google';
  const nonce = isGoogle ? generateRandomToken() : null;

  const expiresAt = Math.floor(Date.now() / 1000) + TX_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO oauth_transactions (id_hash, provider, state_hash, nonce, code_verifier, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(idHash, providerName, stateHash, nonce, codeVerifier, expiresAt).run();

  const authUrl = new URL(provider.authorizationEndpoint);
  authUrl.searchParams.set('client_id', provider.clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri(env, providerName));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', provider.scope);
  authUrl.searchParams.set('state', state);

  if (isGoogle) {
    authUrl.searchParams.set('nonce', nonce);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
  }

  const headers = new Headers();
  headers.set('Location', authUrl.toString());
  headers.append('Set-Cookie', buildOauthTxCookie(txId));

  return new Response(null, { status: 302, headers });
}
