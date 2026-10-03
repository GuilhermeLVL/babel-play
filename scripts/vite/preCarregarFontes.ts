/**
 * PRELOAD DAS DUAS FONTES QUE PINTAM O PRIMEIRO TEXTO.
 *
 * As fontes agora são arquivos do próprio site (`/assets/inter-latin-wght-normal-<hash>.woff2`). O
 * navegador só descobre uma fonte depois de ler o CSS e achar texto que a usa; um
 * `<link rel="preload" as="font">` no `index.html` faz o download começar junto com o do CSS e do JS.
 * Só as duas do primeiro texto, no subset latin: Inter (corpo) e Archivo (títulos) — ambas variáveis,
 * um arquivo cobre todos os pesos. O nome com hash só existe depois do build, por isso é um plugin.
 * `crossorigin` é obrigatório em preload de fonte (mesmo na mesma origem), senão o navegador baixa duas vezes.
 */
import type { Plugin } from 'vite';

interface ItemDoBundle {
  type: 'chunk' | 'asset';
  fileName: string;
}

const CRITICAS = [/^assets\/inter-latin-wght-normal-[\w-]+\.woff2$/, /^assets\/archivo-latin-wght-normal-[\w-]+\.woff2$/];

/** Os arquivos de fonte críticos presentes no bundle, na ordem de CRITICAS. Pura, para o teste. */
export function fontesCriticas(bundle: Record<string, ItemDoBundle>): string[] {
  const nomes = Object.values(bundle)
    .filter((i) => i.type === 'asset')
    .map((i) => i.fileName);
  return CRITICAS.flatMap((re) => nomes.filter((n) => re.test(n)));
}

export function preCarregarFontes(): Plugin {
  let base = '/';
  return {
    name: 'pre-carregar-fontes-criticas',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        return fontesCriticas(ctx.bundle as Record<string, ItemDoBundle>).map((f) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: `${base}${f}` },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}
