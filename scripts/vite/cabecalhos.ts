import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

import { CAMINHO_DA_PONTE_DO_VLIBRAS, cspDaPonteDoVLibras, diretivasDeCsp, serializarCsp } from '../../server/http/csp';

/** Onde o modelo começa a parte que NÃO é gerada: as regras de cache. */
const INICIO_DO_CACHE = '/ort-wasm-*';

/**
 * O conteúdo do `dist/_headers`: o cabeçalho de comentários do `base` (`scripts/vite/_headers.base`), a
 * regra `/*` (segurança, isolamento e a CSP bloqueante de `diretivasDeCsp(env)`), o bloco de
 * `/diagnostico-audio.html` sem CSP e as regras de cache do `base`, sem alteração.
 *
 * Os valores do isolamento são os de `server/http/isolamento.ts` (modo completo); a CSP é a MESMA do
 * Express, de `server/http/csp.ts`.
 */
export function gerarHeaders(env: NodeJS.ProcessEnv, base: string): string {
  const i = base.indexOf(INICIO_DO_CACHE);
  if (i < 0) throw new Error(`_headers.base sem a regra ${INICIO_DO_CACHE}`);
  const comentarios = base.slice(0, i);
  const cache = base.slice(i);
  const global = [
    '/*',
    '  Cross-Origin-Opener-Policy: same-origin',
    // Sem COEP quando o piloto VLibras está ativo: o iframe do avatar não o manda (`server/http/isolamento.ts`).
    ...(env.VLIBRAS_ATIVO === '1' ? [] : ['  Cross-Origin-Embedder-Policy: credentialless']),
    '  Document-Isolation-Policy: isolate-and-credentialless',
    '  X-Content-Type-Options: nosniff',
    // O mesmo HSTS que o helmet manda nas respostas da API (o ZAP apontou a ausência nos estáticos, 21/10/2026).
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: microphone=(self), display-capture=(self), camera=(), geolocation=(), payment=(), usb=(), midi=()',
    `  Content-Security-Policy: ${serializarCsp(diretivasDeCsp(env))}`,
  ].join('\n');
  const diagnostico = ['/diagnostico-audio.html', '  ! Content-Security-Policy'].join('\n');
  // A ponte do VLibras tem CSP própria (`!` tira a de `/*`, senão valeriam as duas): ver `server/http/csp.ts`.
  const ponte = [
    CAMINHO_DA_PONTE_DO_VLIBRAS,
    '  ! Content-Security-Policy',
    `  Content-Security-Policy: ${cspDaPonteDoVLibras(env)}`,
  ].join('\n');
  return `${comentarios}${global}\n\n${diagnostico}\n\n${ponte}\n\n${cache}`;
}

/** Grava `dist/_headers` ao fim do build, com a CSP das variáveis do próprio build. */
export function cabecalhosDoDeploy(envDoVite: Record<string, string>): Plugin {
  let saida = 'dist';
  let raiz = process.cwd();
  return {
    name: 'cabecalhos-do-deploy',
    apply: 'build',
    configResolved(c) {
      raiz = c.root;
      saida = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const base = readFileSync(path.join(raiz, 'scripts/vite/_headers.base'), 'utf8');
      mkdirSync(saida, { recursive: true });
      writeFileSync(
        path.join(saida, '_headers'),
        gerarHeaders({ ...process.env, ...envDoVite } as NodeJS.ProcessEnv, base),
      );
    },
  };
}
