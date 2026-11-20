/// <reference types="vite/client" />

import { demonstracaoDeAnuncios } from '../../../lib/anuncios/pedido';
import { provedorDeAnuncios, registrarProvedorDeAnuncios } from '../../../lib/anuncios/provedor';

/**
 * LIGA O PROVEDOR DE DEMONSTRAÇÃO, SE ELE FOI PEDIDO — em desenvolvimento e no build de demonstração (R38).
 *
 * Pedido = `demonstracaoDeAnuncios()` (`lib/anuncios/pedido.ts`): no build com
 * `VITE_ANUNCIOS_DEMONSTRACAO=1` (só o Environment `staging` a define), sempre; num servidor de
 * desenvolvimento, com `localStorage['babel.px.anunciosDeProva'] === '1'`. Sem pedido não acontece nada:
 * nenhum módulo é carregado.
 *
 * A condição é LITERAL e num ternário, de propósito: no build sem a variável o Vite troca
 * `import.meta.env.DEV` por `false` e `import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO` por `undefined`, sobra só o
 * ramo vazio, e o `import()` do provedor (com o CSS dos espaços e as marcas de exemplo) nem entra no pacote
 * (`scripts/anuncios/conferir-demonstracao.mjs` confere o `dist`). A demonstração não é uma porta dos fundos:
 * ela não existe em produção.
 *
 * Devolve se o provedor de demonstração ficou registrado. Não troca um provedor que já esteja lá.
 */
export const ligarDemonstracaoDeAnuncios: () => Promise<boolean> =
  import.meta.env.DEV || import.meta.env.VITE_ANUNCIOS_DEMONSTRACAO === '1'
    ? async () => {
        if (!demonstracaoDeAnuncios()) return false;
        if (provedorDeAnuncios()) return provedorDeAnuncios()?.id === 'demonstracao';
        const { PROVEDOR_DE_DEMONSTRACAO } = await import('./provedor');
        if (!provedorDeAnuncios()) registrarProvedorDeAnuncios(PROVEDOR_DE_DEMONSTRACAO);
        return provedorDeAnuncios() === PROVEDOR_DE_DEMONSTRACAO;
      }
    : async () => false;
