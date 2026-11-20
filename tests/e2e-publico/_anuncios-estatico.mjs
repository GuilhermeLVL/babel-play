/**
 * O WORKER DE ANÚNCIOS DE MENTIRA PARA O E2E (`bancada-anuncios.e2e.ts`, Task 6 do estado 3).
 *
 * Gera a página de anúncios com o MESMO build do Worker `frasy-anuncios` (`construir()` de
 * `scripts/anuncios/build.mjs`) numa pasta temporária, SEM código da rede e com `APP_URL` = a origem do app
 * do e2e, e a serve como o Worker só de assets serviria: os três arquivos com os cabeçalhos do `_headers`
 * gerado (sem COOP/COEP/DIP, CSP própria com `frame-ancestors` só do app, `nosniff`), e 404 em todo o resto.
 *
 *   APP_URL=http://localhost:3127 PORTA_ANUNCIOS_E2E=3128 node tests/e2e-publico/_anuncios-estatico.mjs
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { construir } from '../../scripts/anuncios/build.mjs';

const PORTA = Number(process.env.PORTA_ANUNCIOS_E2E || 3128);
const destino = construir(
  { APP_URL: process.env.APP_URL, VITE_ANUNCIOS_REDE_CONTA: '' },
  mkdtempSync(join(tmpdir(), 'anuncios-e2e-')),
);

/* O `_headers` tem uma regra só (`/*`): as linhas indentadas são os cabeçalhos dela. */
const cabecalhos = readFileSync(join(destino, '_headers'), 'utf8')
  .split('\n')
  .filter((l) => /^\s+\S/.test(l))
  .map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });

const TIPOS = { '/espaco.html': 'text/html', '/config.js': 'text/javascript', '/espaco.js': 'text/javascript' };

createServer((req, res) => {
  const caminho = new URL(req.url ?? '/', 'http://x').pathname;
  for (const [nome, valor] of cabecalhos) res.setHeader(nome, valor);
  const tipo = TIPOS[caminho];
  if (!tipo || req.method !== 'GET') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': tipo }).end(readFileSync(join(destino, caminho.slice(1))));
}).listen(PORTA, '127.0.0.1', () => console.log(`anuncios-e2e: http://127.0.0.1:${PORTA} (${destino})`));
