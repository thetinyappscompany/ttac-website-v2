// Serves /uploads/<name> straight from the GitHub repo, so images added in /admin show without a redeploy.
// (vercel.json rewrites /uploads/* here only when the file is not already part of the deployment.)
import * as github from '../lib/github.js';
import { send, fail } from '../lib/http.js';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };

export default async function handler(req, res) {
  try {
    const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
    const ext = name.split('.').pop();
    if (!/^[a-z0-9-]+\.[a-z0-9]+$/.test(name) || !TYPES[ext]) return send(res, 404, { error: 'Not found.' });
    if (!github.configured()) return send(res, 404, { error: 'Not found.' });
    const bytes = await github.readBinary(`public/uploads/${name}`);
    if (!bytes) return send(res, 404, { error: 'Not found.' });
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[ext]);
    // upload names are unique, so the image never changes
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.end(bytes);
  } catch (err) { fail(res, err); }
}
