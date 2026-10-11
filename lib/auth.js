// Admin sign-in: ADMIN_USERNAME (optional) and ADMIN_PASSWORD. Signing in returns a signed token that lasts 12 hours.
import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 12 * 60 * 60 * 1000;

function secret() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    const err = new Error('The admin password is not set up: add ADMIN_PASSWORD (8 characters or more) in Vercel, then redeploy.');
    err.status = 503;
    throw err;
  }
  return pw;
}

const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkLogin(username, password) {
  const expected = (process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const userOk = !expected || same(String(username || '').trim().toLowerCase(), expected);
  const passOk = same(password, secret());
  return userOk && passOk;
}

export function issueToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function isAuthorised(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, sign(exp));
}
