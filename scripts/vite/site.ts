import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

import { gerarSite, opcoesDoAmbiente } from '../site/gerar';
import { caminhoDaFonte } from '../site/layout';

/** A fonte do site público: a Archivo variável (latin) do `@fontsource-variable`, já dependência do app. */
const PACOTE_DA_FONTE = '@fontsource-variable/archivo';
const ARQUIVO_DA_FONTE = 'files/archivo-latin-wght-normal.woff2';

/**
 * O SITE PÚBLICO NO BUILD (`scripts/site/gerar.ts`): grava as páginas estáticas, o sitemap, o robots, o
 * manifesto e (com `ADSENSE_PUB_ID`) o `ads.txt` em `dist/`, e copia a fonte com a versão no nome. Antes
 * do `precomprimir` na lista de plugins. A edição estática (`VITE_EDICAO_ESTATICA=1`, Pages) é só o app:
 * não gera nada.
 */
export function siteDoBuild(envDoVite: Record<string, string>): Plugin {
  let saida = 'dist';
  let raiz = process.cwd();
  return {
    name: 'site-publico',
    apply: 'build',
    configResolved(c) {
      raiz = c.root;
      saida = path.resolve(c.root, c.build.outDir);
    },
    closeBundle() {
      const env = { ...process.env, ...envDoVite };
      if (env.VITE_EDICAO_ESTATICA === '1') return;
      const pastaDaFonte = path.join(raiz, 'node_modules', PACOTE_DA_FONTE);
      const versao = (JSON.parse(readFileSync(path.join(pastaDaFonte, 'package.json'), 'utf8')) as { version: string })
        .version;
      if (!env.SITE_FLAGS_DE_VENDA?.trim()) {
        /* `::warning::` vira anotação no GitHub Actions; fora dele, só a linha. */
        console.warn(
          `${process.env.GITHUB_ACTIONS ? '::warning::' : ''}[site-publico] SITE_FLAGS_DE_VENDA vazia: /planos sai com a venda fechada ` +
            '(Grátis + Premium). Se a produção vende outros planos, defina a var do Environment com as flags ligadas no banco.',
        );
      }
      const { opcoes, ignorados } = opcoesDoAmbiente(env, path.join(raiz, 'content', 'guias'), versao);
      for (const [relativo, conteudo] of gerarSite(opcoes)) {
        const destino = path.join(saida, relativo);
        mkdirSync(path.dirname(destino), { recursive: true });
        writeFileSync(destino, conteudo);
      }
      const fonte = path.join(saida, caminhoDaFonte(versao));
      mkdirSync(path.dirname(fonte), { recursive: true });
      copyFileSync(path.join(pastaDaFonte, ARQUIVO_DA_FONTE), fonte);
      console.log(
        `[site-publico] ${opcoes.guias.length} guia(s) publicado(s), ${ignorados.length} fora (rascunho ou sem frontmatter); ` +
          `URL ${opcoes.urlDoSite}; ads.txt ${opcoes.adsensePubId ? 'sim' : 'não'}`,
      );
    },
  };
}
