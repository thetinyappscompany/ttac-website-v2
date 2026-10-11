// Reads and commits files in the website's GitHub repository using the REST API.
// Needs GITHUB_TOKEN (fine-grained, Contents: read and write, this repo only) and GITHUB_REPO ("owner/name").
const API = 'https://api.github.com';
const RAW = 'application/vnd.github.raw+json';

function env() {
  return {
    token: process.env.GITHUB_TOKEN,
    repo: process.env.GITHUB_REPO,
    branch: process.env.GITHUB_BRANCH || 'main',
    // set when the site lives in a subfolder of the repo, e.g. "Website"
    dir: (process.env.GITHUB_SITE_DIR || '').replace(/^\/+|\/+$/g, ''),
  };
}

export const configured = () => Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
const full = (p) => (env().dir ? `${env().dir}/${p}` : p);

async function call(method, url, body, accept) {
  const { token, repo } = env();
  const res = await fetch(`${API}/repos/${repo}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'ttac-website-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    const err = new Error(
      [401, 403, 404].includes(res.status)
        ? `GitHub refused the request (${res.status}). Check that GITHUB_TOKEN can read and write contents of ${repo}.`
        : `GitHub error ${res.status}.`);
    err.status = 502;
    err.githubStatus = res.status;
    err.detail = detail;
    throw err;
  }
  return accept === RAW ? res.text() : res.json();
}

const branchPath = () => env().branch.split('/').map(encodeURIComponent).join('/');

const contentsUrl = (path) =>
  `/contents/${full(path).split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(env().branch)}`;

export function readFile(path) {
  return call('GET', contentsUrl(path), null, RAW);
}

// Raw bytes of a file (for images). Returns null when the file does not exist.
export async function readBinary(path) {
  const { token } = env();
  const res = await fetch(`${API}/repos/${env().repo}${contentsUrl(path)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ttac-website-admin' },
  });
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error(`GitHub error ${res.status}.`); e.status = 502; throw e; }
  return Buffer.from(await res.arrayBuffer());
}

// Stores bytes in the repo without committing them yet. Returns the blob SHA.
export async function createBlob(buffer) {
  const res = await call('POST', '/git/blobs', { content: buffer.toString('base64'), encoding: 'base64' });
  return res.sha;
}

// One commit for everything: files are { path, content } (text) or { path, sha } (a blob made earlier).
export async function commit(files, message) {
  for (let attempt = 0; ; attempt++) {
    const ref = await call('GET', `/git/ref/heads/${branchPath()}`);
    const head = ref.object.sha;
    const parent = await call('GET', `/git/commits/${head}`);
    const tree = await call('POST', '/git/trees', {
      base_tree: parent.tree.sha,
      tree: files.map((f) => ({ path: full(f.path), mode: '100644', type: 'blob', ...(f.sha ? { sha: f.sha } : { content: f.content }) })),
    });
    const created = await call('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
    try {
      await call('PATCH', `/git/refs/heads/${branchPath()}`, { sha: created.sha });
      return created.sha;
    } catch (err) {
      // someone pushed in between: rebuild on top of the new head once
      if (err.githubStatus !== 422 || attempt > 0) throw err;
    }
  }
}
