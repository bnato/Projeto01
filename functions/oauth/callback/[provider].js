// functions/oauth/callback/[provider].js
// Recebe o redirect do provedor OAuth, valida state/PKCE/id_token, troca o
// code por tokens e cria a sessao do usuario (apenas hash do id no D1).

import { getProvider, getRedirectUri } from '../../_shared/provider.js';
import { generateRandomToken, sha256Hex } from '../../_shared/crypto.js';
import { parseCookies, buildSessionCookie, buildExpiredCookie, COOKIE_NAMES } from '../../_shared/cookies.js';
import { verifyGoogleIdToken } from '../../_shared/oidc.js';

const SESSION_TTL_SECONDS = 28800;

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const providerName = params.provider;
  const provider = getProvider(providerName, env);

  if (!provider) {
    return new Response('Provedor OAuth invalido', { status: 400 });
  }

  const url = new URL(request.url);
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    return new Response('Login cancelado ou negado pelo provedor: ' + errorParam, { status: 400 });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return new Response('Parametros invalidos no callback', { status: 400 });
  }

  const cookies = parseCookies(request);
  const txId = cookies[COOKIE_NAMES.OAUTH_TX];
  if (!txId) {
    return new Response('Sessao de login expirada ou ausente', { status: 400 });
  }

  const idHash = await sha256Hex(txId);
  const tx = await env.DB.prepare(
    `SELECT * FROM oauth_transactions WHERE id_hash = ?`
  ).bind(idHash).first();

  // Transacao e de uso unico: remove logo em seguida, exista ou nao.
  await env.DB.prepare(`DELETE FROM oauth_transactions WHERE id_hash = ?`).bind(idHash).run();

  const now = Math.floor(Date.now() / 1000);
  if (!tx || tx.expires_at < now) {
    return new Response('Transacao OAuth invalida ou expirada', { status: 400 });
  }

  if (tx.provider !== providerName) {
    return new Response('Provedor da transacao nao confere', { status: 400 });
  }

  const stateHash = await sha256Hex(state);
  if (stateHash !== tx.state_hash) {
    return new Response('Parametro state invalido', { status: 400 });
  }

  const redirectUri = getRedirectUri(env, providerName);

  let issuer;
  let subject;
  let email = null;
  let displayName = null;

  if (providerName === 'google') {
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
      return new Response('Falha ao trocar o code por tokens (Google)', { status: 502 });
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.id_token) {
      return new Response('Resposta do Google sem id_token', { status: 502 });
    }

    const payload = await verifyGoogleIdToken(tokenData.id_token, {
      clientId: provider.clientId,
      issuer: provider.issuer,
      jwksUri: provider.jwksUri,
      expectedNonce: tx.nonce,
    });

    issuer = payload.iss;
    subject = payload.sub;
    email = payload.email || null;
    displayName = payload.name || null;
  } else if (providerName === 'github') {
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
      }),
    });

    if (!tokenResponse.ok) {
      return new Response('Falha ao trocar o code por tokens (GitHub)', { status: 502 });
    }

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return new Response('Resposta do GitHub sem access_token', { status: 502 });
    }

    const userResponse = await fetch(provider.userEndpoint, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'Projeto01-OAuth-Lab',
        Accept: 'application/vnd.github+json',
      },
    });

    if (!userResponse.ok) {
      return new Response('Falha ao buscar dados do usuario (GitHub)', { status: 502 });
    }

    const userData = await userResponse.json();
    issuer = 'https://github.com';
    subject = String(userData.id);
    email = userData.email || null;
    displayName = userData.name || userData.login || null;
  } else {
    return new Response('Provedor OAuth invalido', { status: 400 });
  }

  const sessionId = generateRandomToken();
  const sessionIdHash = await sha256Hex(sessionId);
  const expiresAt = now + SESSION_TTL_SECONDS;

  await env.DB.prepare(
    `INSERT INTO sessions (id_hash, issuer, subject, email, display_name, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(sessionIdHash, issuer, subject, email, displayName, expiresAt, now).run();

  const headers = new Headers();
  headers.set('Location', '/');
  headers.append('Set-Cookie', buildSessionCookie(sessionId));
  headers.append('Set-Cookie', buildExpiredCookie(COOKIE_NAMES.OAUTH_TX));

  return new Response(null, { status: 302, headers });
}
