// Local development server: serves public/ and runs the same api/ handlers Vercel runs.
// Usage: npm run dev   (reads ADMIN_PASSWORD from .env.local)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// run from this folder whatever the starting directory, like Vercel does
process.chdir(path.dirname(fileURLToPath(import.meta.url)));

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 5175;
const PUBLIC = path.resolve('public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain', '.xml': 'application/xml',
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/[^a-z-]/g, '');
      const mod = await import(`./api/${name}.js?t=${Date.now()}`).catch(() => null);
      if (!mod) { res.statusCode = 404; return res.end('Not found'); }
      return await mod.default(req, res);
    }
    // clean URLs, like Vercel: /admin -> admin.html
    let file = path.join(PUBLIC, decodeURIComponent(pathname));
    if (!file.startsWith(PUBLIC)) { res.statusCode = 403; return res.end(); }
    if (pathname.endsWith('/')) file = path.join(file, 'index.html');
    else if (!path.extname(file) && existsSync(file + '.html')) file += '.html';
    if (!(await stat(file).catch(() => null))?.isFile()) {
      res.statusCode = 404; res.setHeader('Content-Type', TYPES['.html']);
      return res.end(await readFile(path.join(PUBLIC, '404.html')));
    }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch (err) {
    console.error(err);
    res.statusCode = 500; res.end('Server error');
  }
}).listen(PORT, () => console.log(`TTAC site on http://localhost:${PORT}  (admin: /admin)`));
