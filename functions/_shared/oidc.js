// functions/_shared/oidc.js
// Validacao do id_token OIDC do Google (RS256) usando o JWKS publicado pelo provedor.

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

async function fetchSigningKey(jwksUri, kid) {
  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error('Falha ao buscar JWKS do provedor');
  }
  const jwks = await response.json();
  const jwk = jwks.keys.find((key) => key.kid === kid);
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
  const clientId = options.clientId;
  const issuer = options.issuer;
  const jwksUri = options.jwksUri;
  const expectedNonce = options.expectedNonce;

  const decoded = decodeJwt(idToken);
  const header = decoded.header;
  const payload = decoded.payload;
  const signature = decoded.signature;
  const signingInput = decoded.signingInput;

  if (header.alg !== 'RS256') {
    throw new Error('Algoritmo de assinatura inesperado');
  }

  const jwk = await fetchSigningKey(jwksUri, header.kid);
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

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== issuer) {
    throw new Error('Issuer (iss) do id_token nao confere');
  }
  if (payload.aud !== clientId) {
    throw new Error('Audience (aud) do id_token nao confere');
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    throw new Error('id_token expirado');
  }
  if (payload.nonce !== expectedNonce) {
    throw new Error('nonce do id_token nao confere');
  }

  return payload;
}
