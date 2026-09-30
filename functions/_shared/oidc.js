// functions/_shared/oidc.js
// Validacao do id_token OIDC do Google (RS256) sem bibliotecas externas:
// documento de descoberta -> JWKS -> chave pelo kid -> assinatura -> claims.

const CLOCK_SKEW_SECONDS = 300;

function base64UrlDecodeToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlDecodeToString(value) {
  return new TextDecoder().decode(base64UrlDecodeToBytes(value));
}

function decodeJwt(idToken) {
  if (typeof idToken !== 'string') {
    throw new Error('id_token ausente');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('id_token mal formado');
  }
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecodeToString(headerB64));
  const payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  const signature = base64UrlDecodeToBytes(signatureB64);
  const signingInput = `${headerB64}.${payloadB64}`;
  return { header, payload, signature, signingInput };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Falha ao consultar ' + url);
  }
  return response.json();
}

async function fetchSigningKey(discoveryUrl, expectedIssuer, kid) {
  // 1. Documento de descoberta OIDC do emissor esperado.
  const discovery = await fetchJson(discoveryUrl);
  if (discovery.issuer !== expectedIssuer) {
    throw new Error('Documento de descoberta de outro emissor');
  }

  // 2. Conjunto de chaves indicado por jwks_uri.
  const jwks = await fetchJson(discovery.jwks_uri);
  const jwk = (jwks.keys || []).find((key) => key.kid === kid && key.kty === 'RSA');
  if (!jwk) {
    throw new Error('Chave publica (kid) nao encontrada no JWKS');
  }
  return jwk;
}

async function importRsaPublicKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

export async function verifyGoogleIdToken(idToken, options) {
  const { clientId, issuer, discoveryUrl, expectedNonce } = options;

  const { header, payload, signature, signingInput } = decodeJwt(idToken);

  if (header.alg !== 'RS256') {
    throw new Error('Algoritmo de assinatura inesperado');
  }
  if (!header.kid) {
    throw new Error('Cabecalho sem kid');
  }

  const jwk = await fetchSigningKey(discoveryUrl, issuer, header.kid);
  const publicKey = await importRsaPublicKey(jwk);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    new TextEncoder().encode(signingInput)
  );
  if (!valid) {
    throw new Error('Assinatura do id_token invalida');
  }

  // Validacao semantica: iss, aud, exp, iat e nonce antes de usar sub/nome/e-mail.
  const now = Math.floor(Date.now() / 1000);

  // O Google documenta os dois formatos de iss.
  const acceptedIssuers = [issuer, issuer.replace('https://', '')];
  if (!acceptedIssuers.includes(payload.iss)) {
    throw new Error('Issuer (iss) do id_token nao confere');
  }

  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(clientId)
    : payload.aud === clientId;
  if (!audOk) {
    throw new Error('Audience (aud) do id_token nao confere');
  }

  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('id_token expirado');
  }

  if (typeof payload.iat !== 'number' || payload.iat > now + CLOCK_SKEW_SECONDS) {
    throw new Error('iat do id_token invalido');
  }

  if (!expectedNonce || payload.nonce !== expectedNonce) {
    throw new Error('nonce do id_token nao confere');
  }

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new Error('id_token sem sub');
  }

  return payload;
}
