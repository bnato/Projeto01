// functions/oauth/logout.js
// Encerra a sessao do usuario: apaga a sessao no D1, revoga o access_token
// no GitHub (quando aplicavel) e limpa o cookie de sessao.

import { getProvider } from '../_shared/provider.js';
import { sha256Hex } from '../_shared/crypto.js';
import { parseCookies, buildExpiredCookie, COOKIE_NAMES } from '../_shared/cookies.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const cookies = parseCookies(request);
  const sessionId = cookies[COOKIE_NAMES.SESSION];

  if (sessionId) {
    const sessionIdHash = await sha256Hex(sessionId);
    const session = await env.DB.prepare(
      `SELECT issuer, github_access_token FROM sessions WHERE id_hash = ?`
    ).bind(sessionIdHash).first();

    if (session && session.issuer === 'https://github.com' && session.github_access_token) {
      const githubProvider = getProvider('github', env);
      const credentials = btoa(`${githubProvider.clientId}:${githubProvider.clientSecret}`);

      try {
        await fetch(githubProvider.revokeEndpoint(githubProvider.clientId), {
          method: 'DELETE',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Projeto01-OAuth-Lab',
            Accept: 'application/vnd.github+json',
          },
          body: JSON.stringify({ access_token: session.github_access_token }),
        });
      } catch (error) {
        // Nao bloqueia o logout local caso a revogacao no GitHub falhe.
      }
    }

    await env.DB.prepare(`DELETE FROM sessions WHERE id_hash = ?`).bind(sessionIdHash).run();
  }

  const headers = new Headers();
  headers.set('Location', '/');
  headers.append('Set-Cookie', buildExpiredCookie(COOKIE_NAMES.SESSION));

  return new Response(null, { status: 302, headers });
}
