#!/usr/bin/env node
/**
 * SERVIDOR ESTÁTICO que imita o Cloudflare Pages para a e2e da edição estática.
 *
 *   node tests/e2e-estatica/_servidor-estatico.mjs [porta]   (padrão 4175, serve `dist/`)
 *
 * O que ele faz igual ao Pages, e é o que importa para o teste:
 *  - serve os arquivos de `dist/` como estão (nenhum servidor Node, nenhuma rota `/api`);
 *  - FALLBACK DE SPA: caminho que não é arquivo devolve o `index.html` com 200 — inclusive
 *    `/api/qualquer-coisa`. É exatamente o comportamento que quebrava a build antiga (JSON
 *    esperado, HTML recebido), e o teste confere que o app nem chega a pedir;
 *  - aplica os cabeçalhos globais de `dist/_headers` (COOP/COEP): sem eles o teste não veria o
 *    que o Pages entrega.
 * Não é um servidor de produção: sem compressão, sem cache condicional.
 *
 * `DIST_ESTATICA=<pasta>` serve outro `dist/` (a bancada de desempenho mede a build de ANTES, de
 * outra worktree, ao lado da de agora — cada uma na sua porta).
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = process.env.DIST_ESTATICA
  ? resolve(process.env.DIST_ESTATICA)
  : join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
const PORTA = Number(process.argv[2] || process.env.PORTA_ESTATICA || 4175);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/** Só o bloco `/*` de `_headers` — o que vale para toda resposta. */
function cabecalhosGlobais() {
  const arq = join(RAIZ, '_headers');
  if (!existsSync(arq)) return {};
  const fora = {};
  let noBloco = false;
  for (const linha of readFileSync(arq, 'utf8').split(/\r?\n/)) {
    if (!linha.trim() || linha.trim().startsWith('#')) continue;
    if (!/^\s/.test(linha)) {
      noBloco = linha.trim() === '/*';
      continue;
    }
    if (noBloco) {
      const i = linha.indexOf(':');
      if (i > 0) fora[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
    }
  }
  return fora;
}

const GLOBAIS = cabecalhosGlobais();

function arquivoDe(caminhoDaUrl) {
  const limpo = normalize(decodeURIComponent(caminhoDaUrl)).replace(/^([/\\])+/, '');
  const alvo = join(RAIZ, limpo);
  if (!alvo.startsWith(RAIZ + sep) && alvo !== RAIZ) return null;
  if (existsSync(alvo) && statSync(alvo).isFile()) return alvo;
  const comIndex = join(alvo, 'index.html');
  if (existsSync(comIndex)) return comIndex;
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://local');
  const arquivo = arquivoDe(url.pathname) ?? join(RAIZ, 'index.html');
  res.writeHead(200, { ...GLOBAIS, 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  createReadStream(arquivo).pipe(res);
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`edição estática em http://127.0.0.1:${PORTA} (pid ${process.pid})`);
});
