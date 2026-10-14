export async function onRequestGet({ request, env }) {
  const nome = new URL(request.url).searchParams.get('aluno');
  const r = await env.DB.prepare('SELECT * FROM notas WHERE aluno = ?').bind(nome).all();
  return Response.json(r.results);
}
