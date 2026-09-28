// functions/oauth/logout.js
// Encerra a sessao do usuario: apaga a sessao no D1 e limpa o cookie de
// sessao. (A revogacao do access_token do GitHub acontece antes, no
// callback, logo apos a consulta ao /user — nenhum token fica guardado
// no D1 para ser revogado aqui.)

import { sha256Hex } from '../_shared/crypto.js';
import { parseCookies, buildExpiredCookie, COOKIE_NAMES } from '../_shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return new Response('Origem invalida', { status: 403 });
  }

  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAMES.SESSION];

  if (sessionId) {
    const sessionIdHash = await sha256Hex(sessionId);
    await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(sessionIdHash).run();
  }

  const headers = new Headers();
  headers.set('Location', '/');
  headers.append('Set-Cookie', buildExpiredCookie(COOKIE_NAMES.SESSION));

  return new Response(null, { status: 302, headers });
}
