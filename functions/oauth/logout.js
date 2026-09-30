// functions/oauth/logout.js
// Revoga a sessao local: exige Origin igual a PUBLIC_BASE_URL, apaga a linha
// da sessao no D1 e expira o cookie. Nao encerra a sessao no Google/GitHub.

import { sha256Hex } from '../_shared/crypto.js';
import { parseCookies, buildExpiredCookie, COOKIE_NAMES } from '../_shared/cookies.js';
import { textResponse, redirectResponse } from '../_shared/http.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  // Origin e obrigatorio e precisa ser exatamente PUBLIC_BASE_URL.
  const origin = request.headers.get('Origin');
  if (!origin || origin !== env.PUBLIC_BASE_URL) {
    return textResponse('Origem invalida', 403);
  }

  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAMES.SESSION];

  if (sessionId) {
    const sessionIdHash = await sha256Hex(sessionId);
    await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(sessionIdHash).run();
  }

  return redirectResponse(env.PUBLIC_BASE_URL, [buildExpiredCookie(COOKIE_NAMES.SESSION)]);
}
