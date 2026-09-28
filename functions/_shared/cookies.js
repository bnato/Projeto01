// functions/_shared/cookies.js
// Funcoes auxiliares para ler e montar cookies HttpOnly/Secure usados no fluxo OAuth.

const OAUTH_TX_COOKIE_NAME = '__Host-oauth-tx';
const SESSION_COOKIE_NAME = '__Host-session';

const OAUTH_TX_MAX_AGE_SECONDS = 600; // 10 minutos
const SESSION_MAX_AGE_SECONDS = 28800; // 8 horas

/**
 * Le o cabecalho Cookie de uma Request e retorna um objeto { nome: valor }.
 */
export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [rawName, ...rawValue] = pair.trim().split('=');
    if (!rawName) return;
    cookies[rawName] = decodeURIComponent(rawValue.join('='));
  });
  return cookies;
}

/**
 * Monta o valor do cabecalho Set-Cookie para o cookie de transacao OAuth
 * (curta duracao, guarda o state e o code_verifier durante o login).
 */
export function buildOauthTxCookie(value) {
  return buildSetCookie(OAUTH_TX_COOKIE_NAME, value, {
    maxAge: OAUTH_TX_MAX_AGE_SECONDS,
    sameSite: 'Lax',
  });
}

/**
 * Monta o valor do cabecalho Set-Cookie para o cookie de sessao
 * (usado apos o login concluido).
 */
export function buildSessionCookie(value) {
  return buildSetCookie(SESSION_COOKIE_NAME, value, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    sameSite: 'Strict',
  });
}

/**
 * Monta um Set-Cookie que expira imediatamente, para apagar um cookie
 * (usado no logout e para limpar o cookie de transacao apos o callback).
 */
export function buildExpiredCookie(name) {
  return buildSetCookie(name, '', { maxAge: 0, sameSite: 'Strict' });
}

function buildSetCookie(name, value, options) {
  const maxAge = options.maxAge;
  const sameSite = options.sameSite;
  return [
    name + '=' + encodeURIComponent(value),
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=' + sameSite,
    'Max-Age=' + maxAge,
  ].join('; ');
}

export const COOKIE_NAMES = {
  OAUTH_TX: OAUTH_TX_COOKIE_NAME,
  SESSION: SESSION_COOKIE_NAME,
};
