export async function onRequestGet(context) {
  const env = context.env;

  let dbStatus = 'unknown';
  try {
    await env.DB.prepare('SELECT 1').first();
    dbStatus = 'ok';
  } catch (error) {
    dbStatus = 'error: ' + error.message;
  }

  return new Response(
    JSON.stringify({ status: 'ok', db: dbStatus, time: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
