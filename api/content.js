import { readContent, publish, usingGitHub } from '../lib/store.js';
import { isAuthorised } from '../lib/auth.js';
import { send, readBody, fail } from '../lib/http.js';

const SECTIONS = ['site', 'apps', 'about', 'team', 'build', 'contact'];
const RESERVED = ['about', 'team', 'how-we-build', 'contact'];

function validate(c) {
  if (!c || typeof c !== 'object') return 'Content must be an object.';
  for (const s of SECTIONS) if (!(s in c)) return `Missing section: ${s}.`;
  if (!Array.isArray(c.apps)) return 'apps must be a list.';
  const ids = new Set();
  for (const a of c.apps) {
    if (!a.name || !a.id) return 'Every app needs a name and a link name.';
    if (!/^[a-z0-9-]+$/.test(a.id)) return `Link name "${a.id}" can only use a-z, 0-9 and dashes.`;
    if (RESERVED.includes(a.id)) return `Link name "${a.id}" is used by the dock. Pick another.`;
    if (ids.has(a.id)) return `Two apps share the link name "${a.id}".`;
    ids.add(a.id);
  }
  return null;
}

// GET: the site's content, read live from GitHub (or public/content.json locally).
//   Visitors get a copy Vercel's edge keeps for 30 seconds; the admin panel asks with ?fresh=1.
// PUT: publish. One commit with content.json and any images uploaded since the last publish.
//   No redeploy is needed: the next GET reads the new commit.
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const fresh = new URL(req.url, 'http://x').searchParams.has('fresh');
      return send(res, 200, await readContent(), {
        'X-Storage': usingGitHub() ? 'github' : 'local',
        ...(fresh
          ? { 'Cache-Control': 'no-store' }
          : { 'Cache-Control': 'no-cache', 'Vercel-CDN-Cache-Control': 'max-age=30, stale-while-revalidate=300' }),
      });
    }
    if (req.method === 'PUT') {
      if (!isAuthorised(req)) return send(res, 401, { error: 'Please sign in again.' });
      const { content, uploads } = JSON.parse((await readBody(req, 1_000_000)).toString());
      const problem = validate(content);
      if (problem) return send(res, 400, { error: problem });
      const { commit } = await publish(content, Array.isArray(uploads) ? uploads : []);
      return send(res, 200, { ok: true, commit, storage: usingGitHub() ? 'github' : 'local' });
    }
    send(res, 405, { error: 'Use GET or PUT.' });
  } catch (err) { fail(res, err); }
}
