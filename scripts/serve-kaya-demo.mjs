import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const routes = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/demo.css', ['demo.css', 'text/css']], ['/demo.js', ['demo.js', 'text/javascript']],
  ['/no-form.html', ['no-form.html', 'text/html']],
]);
export function createDemoServer() {
  return createServer(async (request, response) => {
    const route = routes.get(new URL(request.url, 'http://localhost').pathname);
    if (!route || request.method !== 'GET') { response.writeHead(404).end('Not found'); return; }
    try {
      const content = await readFile(new URL(`../demo/${route[0]}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': `${route[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; form-action 'none'; object-src 'none'; base-uri 'none'" }).end(content);
    } catch { response.writeHead(500).end('Demo file unavailable'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createDemoServer();
  server.on('error', (error) => { console.error(`Could not start demo: ${error.message}`); process.exitCode = 1; });
  server.listen(4173, '127.0.0.1', () => console.log('Kaya Mode practice form: http://localhost:4173 — press Ctrl+C to stop.'));
}
