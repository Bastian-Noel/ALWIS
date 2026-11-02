/** Development server for retained native assets; no external application backend. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(fileURLToPath(new URL('../', import.meta.url)));
const engine = resolve(repo, 'build-work/bridge/.native-build/engine/wasm/runtime-dist');
export function createStudioServer() {
  return createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp'); response.setHeader('Cache-Control', 'no-store');
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const special = { '/apps/studio/sql-export.source.txt':'apps/studio/database/sql-export.php', '/': 'apps/studio/index.html', '/service-worker.js': 'apps/studio/service-worker.mjs', '/_pbl/client.js': 'apps/studio/client-bootstrap.js' };
    const base = pathname.startsWith('/engine/') ? engine : repo;
    let relative = pathname.startsWith('/engine/') ? pathname.slice(8) : special[pathname] ?? pathname.slice(1);
    // Serve only application sources, not Git metadata, upstream checkouts or receipts.
    if (base === repo && !special[pathname] && !/^((apps\/studio|packages\/runtime\/src|fixtures\/school)\/)/.test(relative)) { response.writeHead(404).end(); return; }
    const path = resolve(base, relative);
    if (!path.startsWith(base + sep)) { response.writeHead(403).end(); return; }
    try {
      if (!(await stat(path)).isFile()) { response.writeHead(404).end(); return; }
      const mime = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.php': 'text/plain; charset=utf-8', '.sql': 'text/plain; charset=utf-8', '.json': 'application/json' };
      response.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
      if (pathname === '/service-worker.js') response.setHeader('Service-Worker-Allowed', '/');
      response.end(await readFile(path));
    } catch { response.writeHead(404).end(); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PBL_STUDIO_PORT ?? 8080);
  const server = createStudioServer(); server.listen(port, '127.0.0.1', () => console.log('Studio development server listening on port', server.address().port));
}
