import { checkLogin, issueToken } from '../lib/auth.js';
import { send, readBody, fail } from '../lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Use POST.' });
    const { username, password } = JSON.parse((await readBody(req, 4096)).toString() || '{}');
    // a short pause makes guessing slow
    await new Promise((r) => setTimeout(r, 400));
    if (!checkLogin(username, password || '')) return send(res, 401, { error: 'Wrong admin ID or password.' });
    send(res, 200, { token: issueToken() });
  } catch (err) { fail(res, err); }
}
