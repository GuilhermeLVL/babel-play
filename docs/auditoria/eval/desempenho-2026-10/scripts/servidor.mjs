// Servidor estatico da medida: como tests/e2e-estatica/_servidor-estatico.mjs (fallback de SPA e o bloco
// `/*` do _headers), mais o que o Pages faz e ele nao: entrega o `.br` que o build ja gravou e o
// Cache-Control de /assets. Sem isso a rede simulada (4G) pagaria o arquivo sem compressao.
// uso: node servidor.mjs <pasta dist> <porta>
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
const RAIZ = resolve(process.argv[2]);
const PORTA = Number(process.argv[3]);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const GLOBAIS = {};
{
  let noBloco = false;
  for (const linha of readFileSync(join(RAIZ, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) { noBloco = linha.trim() === '/*'; continue; }
    if (noBloco) { const i = linha.indexOf(':'); if (i > 0) GLOBAIS[linha.slice(0, i).trim()] = linha.slice(i + 1).trim(); }
  }
}
function arquivoDe(caminho) {
  const limpo = normalize(decodeURIComponent(caminho)).replace(/^([/\\])+/, '');
  const alvo = join(RAIZ, limpo);
  if (!alvo.startsWith(RAIZ + sep) && alvo !== RAIZ) return null;
  if (existsSync(alvo) && statSync(alvo).isFile()) return alvo;
  return null;
}
createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  const arquivo = arquivoDe(url.pathname) ?? join(RAIZ, 'index.html');
  const cab = { ...GLOBAIS, 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' };
  if (url.pathname.startsWith('/assets/')) cab['Cache-Control'] = 'public, max-age=31536000, immutable';
  let corpo = arquivo;
  if (/\bbr\b/.test(String(req.headers['accept-encoding'] || '')) && existsSync(arquivo + '.br')) {
    corpo = arquivo + '.br';
    cab['Content-Encoding'] = 'br';
    cab.Vary = 'Accept-Encoding';
  }
  cab['Content-Length'] = statSync(corpo).size;
  res.writeHead(200, cab);
  if (req.method === 'HEAD') return res.end();
  createReadStream(corpo).pipe(res);
}).listen(PORTA, '127.0.0.1', () => console.log(`servindo ${RAIZ} em http://127.0.0.1:${PORTA} (pid ${process.pid})`));
