import { stageUpload } from '../lib/store.js';
import { isAuthorised } from '../lib/auth.js';
import { send, readBody, fail } from '../lib/http.js';

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    if (!isAuthorised(req)) return send(res, 401, { error: 'Please sign in again.' });
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!TYPES.includes(type)) return send(res, 415, { error: 'Upload a PNG, JPG, WebP, GIF or SVG image.' });
    const name = new URL(req.url, 'http://x').searchParams.get('name') || 'image';
    // Vercel functions accept request bodies up to 4.5 MB; images also go into the repo, so keep them small
    const body = await readBody(req, 2 * 1024 * 1024);
    send(res, 200, await stageUpload(body, name));
  } catch (err) {
    if (err.status === 413) err.message = 'Images must be 2 MB or smaller.';
    fail(res, err);
  }
}
