// functions/_shared/http.js
// Respostas padronizadas. Todas usam Cache-Control: no-store, como pede o
// enunciado para erros, retornos e respostas de sessao.

export function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function redirectResponse(location, setCookies = []) {
  const headers = new Headers();
  headers.set('Location', location);
  headers.set('Cache-Control', 'no-store');
  for (const cookie of setCookies) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 302, headers });
}
