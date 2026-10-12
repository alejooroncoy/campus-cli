// Local outage fixture. Serves the built app; never contacts the real API.
// Toggle with POST /__e2e/disconnect or /__e2e/reconnect, then reload the browser.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.env.CAMPUS_OFFLINE_E2E_PORT ?? 4329);
let disconnected = false;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  if (req.method === 'POST' && ['/__e2e/disconnect', '/__e2e/reconnect'].includes(path)) {
    disconnected = path.endsWith('/disconnect');
    res.end(disconnected ? 'disconnected' : 'connected');
    return;
  }
  if (disconnected) { req.socket.destroy(); return; }
  if (path.startsWith('/api/')) {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Offline E2E: no real account or API' }));
    return;
  }
  try {
    const route = /^\/app\/profes\/c\/[0-9a-f-]{36}\/$/i.test(path) ? '/app/profes/' : path;
    let file = resolve(root, `.${decodeURIComponent(route)}`);
    if (!file.startsWith(root + sep)) throw Error('invalid path');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Offline E2E: http://127.0.0.1:${port}/app/profes/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
