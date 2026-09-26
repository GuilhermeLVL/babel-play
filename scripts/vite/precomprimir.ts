/**
 * PRÉ-COMPRESSÃO DO BUILD E O QUE NÃO VAI PARA PRODUÇÃO (Fase 4 da prontidão).
 *
 * 1. PRÉ-COMPRIME. O `compression` do servidor comprime CADA resposta na hora (brotli qualidade 4,
 *    gzip 6) — inclusive os chunks de `/assets/*`, que nunca mudam. Medido na Fase 4
 *    (fase4-carga.md §4): comprimir o JS e o CSS de uma primeira visita custa CPU do processo único
 *    que também atende a API, numa máquina com 6,25% de um núcleo sustentado. Aqui cada arquivo
 *    compressível ganha um `.br` (brotli 11, o menor possível; 9 acima de `LIMITE_Q11`, onde o 11
 *    custa minutos de build por poucos por cento) e um `.gz` (nível 9). O servidor
 *    (`server/http/estaticos.ts`, `servirPreComprimido`) entrega o irmão pronto quando o navegador
 *    aceita, e o `compression` não mexe em resposta que já tem `Content-Encoding`.
 *
 * 2. TIRA DO `dist` o que é só de desenvolvimento. `public/` é copiado inteiro pelo Vite, e o
 *    protótipo de consistência de design (`public/prototipo-consistencia.html`, da auditoria de
 *    design v4) e o `lucide.min.js` que ele carrega moram lá para abrir no navegador durante o
 *    trabalho — NÃO são do produto. Eles continuam no repositório/na pasta; só não são publicados.
 *    `scripts/perf/orcamento-bundle.mjs` reprova o build se algum voltar a aparecer.
 */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import type { Plugin } from 'vite';

/** Nomes (de arquivo, com `*`) que nunca vão para o `dist`. Espelhados em `slo.json` → `frontend`. */
export const FORA_DO_DIST = ['prototipo-*.html', 'lucide.min.js'];

/** O que vale comprimir: texto e wasm. Imagem, fonte woff2 e modelo `.onnx` já são comprimidos. */
export const COMPRESSIVEL = /\.(js|mjs|css|html|json|svg|wasm|txt|map)$/i;

/** Abaixo disto a compressão não paga o cabeçalho (e o `compression` também não comprime < 1 KB). */
export const MINIMO_BYTES = 1024;

/** Acima disto, brotli 9 em vez de 11 (o wasm de 23 MB levaria minutos no 11). */
export const LIMITE_Q11 = 4 * 1024 * 1024;

export function casaCuringa(padrao: string, nome: string): boolean {
  const re = new RegExp(`^${padrao.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return re.test(nome);
}

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
}

/** Remove o proibido e pré-comprime o resto. Devolve o que fez (o build imprime). */
export function precomprimirDiretorio(dir: string): { removidos: string[]; comprimidos: number; ms: number } {
  const t0 = Date.now();
  const removidos: string[] = [];
  let comprimidos = 0;
  for (const arquivo of listar(dir)) {
    const nome = path.basename(arquivo);
    if (FORA_DO_DIST.some((p) => casaCuringa(p, nome))) {
      rmSync(arquivo);
      removidos.push(path.relative(dir, arquivo));
      continue;
    }
    if (!COMPRESSIVEL.test(nome)) continue;
    const bruto = readFileSync(arquivo);
    if (bruto.length < MINIMO_BYTES) continue;
    const br = brotliCompressSync(bruto, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: bruto.length > LIMITE_Q11 ? 9 : 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: bruto.length,
      },
    });
    const gz = gzipSync(bruto, { level: 9 });
    // Só grava o que de fato encolhe: um irmão maior que o original seria servido à toa.
    if (br.length < bruto.length) writeFileSync(`${arquivo}.br`, br);
    if (gz.length < bruto.length) writeFileSync(`${arquivo}.gz`, gz);
    comprimidos += 1;
  }
  return { removidos, comprimidos, ms: Date.now() - t0 };
}

export function precomprimir(): Plugin {
  let saida = 'dist';
  return {
    name: 'precomprimir',
    apply: 'build',
    configResolved(c) {
      saida = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const r = precomprimirDiretorio(saida);
      console.log(
        `[precomprimir] ${r.comprimidos} arquivo(s) com .br/.gz em ${r.ms} ms` +
          (r.removidos.length ? `; fora do dist: ${r.removidos.join(', ')}` : ''),
      );
    },
  };
}
