// Where the site's content and uploaded images live.
// With GITHUB_TOKEN and GITHUB_REPO set (on Vercel): committed to the GitHub repo, and Vercel redeploys.
// Without them (on a PC): written straight into public/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as github from './github.js';

const CONTENT = 'public/content.json';
const UPLOADS = 'public/uploads';

export const usingGitHub = github.configured;

export async function readContent() {
  const text = github.configured()
    ? await github.readFile(CONTENT)
    : await readFile(path.join(process.cwd(), CONTENT), 'utf8');
  return JSON.parse(text);
}

// Uploads are held until the next publish, so one publish makes one commit (and one Vercel deploy).
export async function stageUpload(buffer, filename) {
  const safe = filename.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  const name = `${Date.now().toString(36)}-${safe}`;
  const url = `/uploads/${name}`;
  if (github.configured()) return { url, sha: await github.createBlob(buffer) };
  await mkdir(path.join(process.cwd(), UPLOADS), { recursive: true });
  await writeFile(path.join(process.cwd(), UPLOADS, name), buffer);
  return { url, sha: null };
}

export async function publish(content, uploads = []) {
  const json = JSON.stringify(content, null, 2) + '\n';
  if (!github.configured()) {
    await writeFile(path.join(process.cwd(), CONTENT), json, 'utf8');
    return { commit: null };
  }
  // only commit images the content still uses
  const images = uploads.filter((u) =>
    u && /^\/uploads\/[a-z0-9.-]+$/.test(u.url) && /^[0-9a-f]{40}$/.test(u.sha) && json.includes(`"${u.url}"`));
  const commit = await github.commit(
    [{ path: CONTENT, content: json }, ...images.map((u) => ({ path: `public${u.url}`, sha: u.sha }))],
    'Update website content from /admin');
  return { commit };
}
