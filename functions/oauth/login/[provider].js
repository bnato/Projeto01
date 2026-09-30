// functions/oauth/login/[provider].js
// Inicia o fluxo OAuth (Google ou GitHub): gera state/nonce/PKCE, grava a
// transacao no D1 (apenas resumos) e redireciona para o provedor.

import { getProvider, getRedirectUri } from '../../_shared/provider.js';
import { generateRandomToken, generateCodeChallenge, sha256Hex } from '../../_shared/crypto.js';
import { buildOauthTxCookie } from '../../_shared/cookies.js';
import { textResponse, redirectResponse } from '../../_shared/http.js';

const TX_TTL_SECONDS = 600;

export async function onRequestGet(context) {
  const { env, params } = context;
  const providerName = params.provider;
  const provider = getProvider(providerName, env);

  // Qualquer provedor diferente de google/github: 404 sem detalhes internos.
  if (!provider) {
    return textResponse('Not found', 404);
  }

  const txId = generateRandomToken();
  const idHash = await sha256Hex(txId);

  const state = generateRandomToken();
  const stateHash = await sha256Hex(state);

  const codeVerifier = generateRandomToken();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // nonce so existe no fluxo OIDC do Google.
  const nonce = provider.usesNonce ? generateRandomToken() : null;

  const expiresAt = Math.floor(Date.now() / 1000) + TX_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO oauth_transactions (id_hash, provider, state_hash, nonce, code_verifier, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(idHash, providerName, stateHash, nonce, codeVerifier, expiresAt).run();

  // Parametros comuns aos dois provedores (inclui PKCE S256).
  const authUrl = new URL(provider.authorizationEndpoint);
  authUrl.searchParams.set('client_id', provider.clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri(env, providerName));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Somente no Google: scope e nonce. No GitHub os dois sao omitidos.
  if (provider.scope) {
    authUrl.searchParams.set('scope', provider.scope);
  }
  if (nonce) {
    authUrl.searchParams.set('nonce', nonce);
  }

  return redirectResponse(authUrl.toString(), [buildOauthTxCookie(txId)]);
}
