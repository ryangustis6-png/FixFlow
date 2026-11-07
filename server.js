// Local dev server: serves public/ and the same API the Vercel functions expose.
import http from 'node:http';
import fs from 'node:fs/promises';
import {handle} from './lib/api.js';

const TYPES = {html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png'};
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 4_500_000) { res.writeHead(413); return res.end(); } }
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400); return res.end('{"error":"Invalid JSON"}'); }
    const [status, data] = await handle(url.pathname.slice(5), req.method, {body, query: Object.fromEntries(url.searchParams)});
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); return res.end(JSON.stringify(data));
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[a-z0-9._-]+$/i.test(file)) { res.writeHead(404); return res.end('Not found'); }
  try { const data = await fs.readFile(new URL('./public/' + file, import.meta.url));
    res.writeHead(200, {'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream'}); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT) || 4300, () => console.log(`FixFlow: http://localhost:${process.env.PORT || 4300}  (tenant)  /owner.html  (owner)`));
