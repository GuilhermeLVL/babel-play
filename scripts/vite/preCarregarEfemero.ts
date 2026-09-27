/**
 * A EDIÇÃO ESTÁTICA BAIXA O SERVIDOR EM MEMÓRIA JUNTO COM A ENTRADA (auditoria de performance do
 * frontend, 26/09/2026).
 *
 * O servidor em memória (`src/data/efemero/servidor.ts`) saiu do chunk de entrada: quem tem conta
 * (ou roda self-host) nunca o usa. Mas na edição estática TODA chamada de dados passa por ele — lá,
 * sair da entrada criava uma cascata (entrada → React monta → primeira chamada → `import()` → baixa
 * o chunk) medida em +300 ms de LCP na Início (CPU 4×). Este plugin põe o chunk dele (e o que ele
 * importa) como `<link rel="modulepreload">` no `index.html` SÓ no build da edição estática: o
 * download corre em paralelo com o da entrada, e o `import()` do funil encontra o módulo pronto.
 */
import type { Plugin } from 'vite';

/** O que o plugin precisa ler de um chunk do Rollup. */
interface ChunkMinimo {
  type: 'chunk' | 'asset';
  fileName: string;
  facadeModuleId?: string | null;
  imports?: string[];
}

/** O chunk cujo módulo de fachada termina em `sufixo`, mais os chunks que ele importa. Pura. */
export function arquivosDoModulo(bundle: Record<string, ChunkMinimo>, sufixo: string): string[] {
  const alvo = Object.values(bundle).find(
    (c) => c.type === 'chunk' && (c.facadeModuleId ?? '').replace(/\\/g, '/').endsWith(sufixo),
  );
  if (!alvo) return [];
  const vistos = new Set<string>();
  const fila = [alvo.fileName];
  while (fila.length) {
    const f = fila.shift()!;
    if (vistos.has(f)) continue;
    vistos.add(f);
    const c = bundle[f];
    if (c?.type === 'chunk') fila.push(...(c.imports ?? []));
  }
  return [...vistos];
}

/** As `<link rel="modulepreload">` que faltam no HTML (a entrada e o vendor já estão lá). Pura. */
export function linksQueFaltam(html: string, arquivos: string[], base: string): string[] {
  return arquivos.map((f) => `${base}${f}`).filter((href) => !html.includes(`"${href}"`));
}

export function preCarregarEfemeroNaEdicaoEstatica(ativo: boolean): Plugin {
  let base = '/';
  return {
    name: 'pre-carregar-efemero-na-edicao-estatica',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ativo || !ctx.bundle) return html;
        const arquivos = arquivosDoModulo(ctx.bundle as Record<string, ChunkMinimo>, 'src/data/efemero/servidor.ts');
        return linksQueFaltam(html, arquivos, base).map((href) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}
