/// <reference types="vite/client" />

import { demonstracaoDeAnuncios } from '../../../lib/anuncios/pedido';
import { provedorDeAnuncios, registrarProvedorDeAnuncios } from '../../../lib/anuncios/provedor';

/**
 * LIGA O PROVEDOR DE DEMONSTRAÇÃO, SE ELE FOI PEDIDO — só em desenvolvimento.
 *
 * Pedido = `localStorage['babel.px.anunciosDeProva'] === '1'` num servidor de desenvolvimento
 * (`demonstracaoDeAnuncios()`). Sem a chave não acontece nada: nenhum módulo é carregado.
 *
 * `import.meta.env.DEV` LITERAL e num ternário, de propósito: no build de produção o Vite troca por
 * `false`, sobra só o ramo vazio, e o `import()` do provedor (com o CSS dos espaços e as marcas de
 * exemplo) nem entra no pacote. A demonstração não é uma porta dos fundos: ela não existe em produção.
 *
 * Devolve se o provedor de demonstração ficou registrado. Não troca um provedor que já esteja lá.
 */
export const ligarDemonstracaoDeAnuncios: () => Promise<boolean> = import.meta.env.DEV
  ? async () => {
      if (!demonstracaoDeAnuncios()) return false;
      if (provedorDeAnuncios()) return provedorDeAnuncios()?.id === 'demonstracao';
      const { PROVEDOR_DE_DEMONSTRACAO } = await import('./provedor');
      if (!provedorDeAnuncios()) registrarProvedorDeAnuncios(PROVEDOR_DE_DEMONSTRACAO);
      return provedorDeAnuncios() === PROVEDOR_DE_DEMONSTRACAO;
    }
  : async () => false;
