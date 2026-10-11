// Small helpers so the same handlers run on Vercel and in dev-server.mjs (plain Node http).
export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const e = new Error('Too large'); e.status = 413; throw e; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function fail(res, err) {
  const status = err.status || (err instanceof SyntaxError ? 400 : 500);
  if (status >= 500) console.error(err, err.detail || '');
  send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : err.message });
}
