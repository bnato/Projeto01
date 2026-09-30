// functions/api/me.js
// Devolve o perfil minimo do usuario logado com base no cookie de sessao.

import { parseCookies, COOKIE_NAMES } from '../_shared/cookies.js';
import { sha256Hex } from '../_shared/crypto.js';
import { jsonResponse } from '../_shared/http.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAMES.SESSION];

  if (!sessionId) {
    return jsonResponse({ authenticated: false }, 401);
  }

  const sessionIdHash = await sha256Hex(sessionId);
  const session = await env.DB.prepare(
    `SELECT issuer, email, display_name, expires_at FROM sessions WHERE id_hash = ?`
  ).bind(sessionIdHash).first();

  const now = Math.floor(Date.now() / 1000);
  if (!session || session.expires_at <= now) {
    return jsonResponse({ authenticated: false }, 401);
  }

  return jsonResponse({
    authenticated: true,
    issuer: session.issuer,
    email: session.email,
    displayName: session.display_name,
  });
}
// functions/api/me.js
// Devolve os dados do usuario logado com base no cookie de sessao.

import { parseCookies, COOKIE_NAMES } from '../_shared/cookies.js';
import { sha256Hex } from '../_shared/crypto.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAMES.SESSION];

  if (!sessionId) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionIdHash = await sha256Hex(sessionId);
  const session = await env.DB.prepare(
    `SELECT issuer, subject, email, display_name, expires_at FROM sessions WHERE id_hash = ?`
  ).bind(sessionIdHash).first();

  const now = Math.floor(Date.now() / 1000);
  if (!session || session.expires_at < now) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      issuer: session.issuer,
      email: session.email,
      displayName: session.display_name,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
