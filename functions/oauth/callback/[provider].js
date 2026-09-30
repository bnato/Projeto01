// functions/oauth/callback/[provider].js
// Recebe o retorno do provedor, valida a transacao (cookie + state), troca o
// code usando PKCE e o Client Secret, confirma a identidade e so entao cria a
// sessao opaca (apenas o resumo do identificador vai para o D1).

import { getProvider, getRedirectUri } from '../../_shared/provider.js';
import { generateRandomToken, sha256Hex } from '../../_shared/crypto.js';
import { parseCookies, buildSessionCookie, buildExpiredCookie, COOKIE_NAMES } from '../../_shared/cookies.js';
import { verifyGoogleIdToken } from '../../_shared/oidc.js';
import { textResponse, redirectResponse } from '../../_shared/http.js';

const SESSION_TTL_SECONDS = 28800;

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const providerName = params.provider;
  const provider = getProvider(providerName, env);

  if (!provider) {
    return textResponse('Not found', 404);
  }

  // 1. Recusa error ou ausencia de code/state.
  const url = new URL(request.url);
  if (url.searchParams.get('error')) {
    return textResponse('Login cancelado ou negado pelo provedor', 400);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return textResponse('Parametros invalidos no callback', 400);
  }

  // 2. Exige o cookie temporario.
  const cookies = parseCookies(request);
  const txId = cookies[COOKIE_NAMES.OAUTH_TX];
  if (!txId) {
    return textResponse('Sessao de login expirada ou ausente', 400);
  }

  // 3. Localiza a transacao pelo resumo do cookie.
  const idHash = await sha256Hex(txId);
  const tx = await env.DB.prepare(
    `SELECT * FROM oauth_transactions WHERE id_hash = ?`
  ).bind(idHash).first();

  // 5. Transacao de uso unico: apagada antes de concluir o fluxo.
  await env.DB.prepare(`DELETE FROM oauth_transactions WHERE id_hash = ?`).bind(idHash).run();

  const now = Math.floor(Date.now() / 1000);
  if (!tx || tx.expires_at <= now) {
    return textResponse('Transacao OAuth invalida ou expirada', 400);
  }

  if (tx.provider !== providerName) {
    return textResponse('Provedor da transacao nao confere', 400);
  }

  // 4. Compara o resumo do state com o valor guardado no D1.
  const stateHash = await sha256Hex(state);
  if (stateHash !== tx.state_hash) {
    return textResponse('Parametro state invalido', 400);
  }

  const redirectUri = getRedirectUri(env, providerName);

  // 6 e 7. Troca o code e confirma a identidade conforme o provedor.
  let identity;
  try {
    identity = providerName === 'google'
      ? await confirmGoogleIdentity(provider, code, redirectUri, tx)
      : await confirmGithubIdentity(provider, code, redirectUri, tx);
  } catch (error) {
    // Nao registra nem devolve detalhes (tokens, corpo da troca etc.).
    return textResponse('Nao foi possivel confirmar a identidade', 400);
  }

  // 8. Cria a sessao opaca somente depois da confirmacao completa.
  const sessionId = generateRandomToken();
  const sessionIdHash = await sha256Hex(sessionId);
  const expiresAt = now + SESSION_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO sessions (id_hash, issuer, subject, email, display_name, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionIdHash,
    identity.issuer,
    identity.subject,
    identity.email,
    identity.displayName,
    expiresAt,
    now
  ).run();

  // 9 e 10. Limpa o cookie temporario e volta para PUBLIC_BASE_URL.
  return redirectResponse(env.PUBLIC_BASE_URL, [
    buildSessionCookie(sessionId),
    buildExpiredCookie(COOKIE_NAMES.OAUTH_TX),
  ]);
}

async function confirmGoogleIdentity(provider, code, redirectUri, tx) {
  const tokenResponse = await fetch(provider.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: tx.code_verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Falha na troca do code (Google)');
  }

  const tokenData = await tokenResponse.json();

  const payload = await verifyGoogleIdToken(tokenData.id_token, {
    clientId: provider.clientId,
    issuer: provider.issuer,
    discoveryUrl: provider.discoveryUrl,
    expectedNonce: tx.nonce,
  });

  return {
    issuer: provider.issuer,
    subject: payload.sub,
    email: payload.email || null,
    displayName: payload.name || null,
  };
}

async function confirmGithubIdentity(provider, code, redirectUri, tx) {
  const tokenResponse = await fetch(provider.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: tx.code_verifier,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Falha na troca do code (GitHub)');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const tokenType = String(tokenData.token_type || '').toLowerCase();
  if (!accessToken || tokenType !== 'bearer') {
    throw new Error('Resposta do GitHub sem access_token Bearer');
  }

  // O access_token serve apenas para esta consulta ao /user.
  const userResponse = await fetch(provider.userEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': provider.apiVersion,
      'User-Agent': 'Projeto01-OAuth-Lab',
    },
  });

  // Revoga a autorizacao concedida a OAuth App (e todos os tokens dela)
  // antes de criar a sessao. Exige 204.
  const credentials = btoa(`${provider.clientId}:${provider.clientSecret}`);
  const revokeResponse = await fetch(provider.revokeEndpoint(provider.clientId), {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': provider.apiVersion,
      'User-Agent': 'Projeto01-OAuth-Lab',
    },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (revokeResponse.status !== 204) {
    throw new Error('Revogacao da autorizacao do GitHub nao retornou 204');
  }

  if (userResponse.status !== 200) {
    throw new Error('Falha ao consultar /user no GitHub');
  }

  const userData = await userResponse.json();
  if (!Number.isInteger(userData.id)) {
    throw new Error('Resposta do /user sem id inteiro');
  }

  return {
    issuer: 'https://github.com',
    subject: String(userData.id),
    email: userData.email || null,
    displayName: userData.name || userData.login || null,
  };
}
