// functions/_shared/crypto.js
// Funcoes auxiliares de criptografia usadas no fluxo OAuth (PKCE, state, nonce, hashing).

/**
 * Gera uma string aleatoria segura, codificada em base64url (sem padding),
 * a partir de `byteLength` bytes aleatorios.
 * Usada para gerar `state`, `nonce` e `code_verifier`.
 */
export function generateRandomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Codifica um Uint8Array em base64url (RFC 4648 par. 5): usa '-' e '_' no lugar
 * de '+' e '/', e remove o padding '='.
 */
export function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Calcula o SHA-256 de uma string UTF-8 e retorna o hash em hexadecimal.
 * Usada para hashear cookies/state antes de guardar no D1 (nunca guardamos
 * o valor bruto).
 */
export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Calcula o code_challenge (PKCE, metodo S256) a partir do code_verifier:
 * SHA-256 do verifier, codificado em base64url.
 */
export async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hashBuffer));
}
