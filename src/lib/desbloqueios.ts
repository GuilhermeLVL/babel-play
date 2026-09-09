/**
 * DESBLOQUEIOS POR NÍVEL — aparência como recompensa.
 *
 * Decisão do dono (2026-08-27): "travar quase tudo". Temas, posições extras do menu, a fonte
 * Arcade e o estúdio de cores viram prêmios da progressão de XP (o nível vem de
 * `deriveProgress`). Duas regras que NÃO se negociam:
 *
 *   1. PERFIS (kids/pro/sênior) nunca travam: são acessibilidade, não cosmético.
 *   2. Escolha JÁ SALVA nunca é rebaixada: quem chegou usando o tema X continua no tema X
 *      (o cadeado vale para TROCAR para algo ainda não conquistado, nunca para expulsar).
 */

import type { TipoDesbloqueavel } from '@core';

import { liberadoTudo } from './liberacaoDev';
import { CATALOGO_DA_LOJA, estadoPorAlvo } from './loja';

// O tipo mudou para `core/loja.ts` (o catálogo é quem o consome); a REGRA de nível continua aqui.
export type { TipoDesbloqueavel };

/**
 * O NÍVEL VEM DO CATÁLOGO, não de uma segunda tabela.
 *
 * Havia aqui um `CATALOGO` próprio com o nível de cada tema, posição e do estúdio — os MESMOS
 * itens que `src/core/loja.ts` já descreve, com o mesmo número escrito de novo. Os dois
 * concordavam por coincidência, e nada os prendia: mudar o preço ou o nível de um tema na Loja
 * deixava o seletor de aparência com o valor antigo (auditoria de 2026-09-07, achado A10).
 */

/* A LIBERAÇÃO DE DESENVOLVIMENTO (`liberadoTudo`, `ativarLiberacaoTotal`) mudou para
   `lib/liberacaoDev.ts`, e `nivelNecessario` mudou para `lib/loja.ts`, em 08/09.
   
   Não foi arrumação: as duas mudanças quebram um CICLO de importação. Este arquivo importava o
   catálogo de `loja.ts` enquanto `loja.ts` importava estas duas funções daqui, e dois módulos que
   só carregam se o outro já tiver carregado funcionam por ordem de avaliação do bundler — o que é
   a definição de uma falha que aparece quando alguém mexe em outra coisa.
   
   `nivelNecessario` foi para onde o dado dela está (o catálogo); a liberação foi para um módulo
   que não importa nada. Os dois lados passam a depender dele, e ele não depende de ninguém. */
export { ativarLiberacaoTotal,liberadoTudo } from './liberacaoDev';
export { nivelNecessario } from './loja';

/**
 * `escolhaAtual`: o que a pessoa JÁ usa — nunca é rebaixado (regra 2).
 */
/**
 * UMA RÉGUA SÓ (achado A10).
 *
 * Esta função decidia por conta própria — nível, mais um mapa local de exclusivos de conquista — e
 * não sabia nada de compra com Seeds nem de posse premium. Quem comprasse o tema Linear por 60
 * Seeds no nível 1 continuava vendo o cadeado aqui: pagou e não pôde equipar.
 *
 * Agora ela delega a `estadoPorAlvo`, que é a MESMA função que a Loja, o Inventário, o Passe e o
 * `equiparItem` usam. O saldo entra como zero de propósito: quem pergunta "está desbloqueado?"
 * quer saber se PODE USAR agora, não se poderia comprar — "compravel" é resposta da Loja, e aqui
 * seria um cadeado disfarçado de permissão.
 */
export function desbloqueado(nivel: number, tipo: TipoDesbloqueavel, id: string, escolhaAtual?: string): boolean {
  if (liberadoTudo()) return true;
  return estadoPorAlvo(tipo, id, nivel, 0, escolhaAtual).estado === 'equipavel';
}

export interface Recompensa { tipo: TipoDesbloqueavel; id: string }

/**
 * O que o nível `n` libera (para o toast de "subiu de nível") — lido do catálogo.
 *
 * Vinha da tabela local, que só conhecia tema, posição e estúdio: subir de nível liberava um
 * cursor ou um pacote de partículas e o toast não dizia nada. Agora o toast fala de tudo que o
 * nível abre, porque pergunta a quem sabe.
 */
export function recompensasDoNivel(n: number): Recompensa[] {
  const TIPOS_DE_APARENCIA: TipoDesbloqueavel[] = ['tema', 'fonte', 'posicao', 'estudio'];
  return CATALOGO_DA_LOJA
    .filter((i) => i.nivel === n && !i.exclusivoDe && TIPOS_DE_APARENCIA.includes(i.tipo as TipoDesbloqueavel))
    .map((i) => ({ tipo: i.tipo as TipoDesbloqueavel, id: i.alvo }));
}

/** Rótulo humano das recompensas (para o toast). */
export function rotuloDaRecompensa(r: Recompensa): string {
  if (r.tipo === 'fonte') return 'fonte Arcade (pixel)';
  if (r.tipo === 'estudio') return 'estúdio de cores e layout';
  if (r.tipo === 'posicao') return r.id === 'right' ? 'menu à direita' : 'menu embaixo';
  const nomes: Record<string, string> = { linear: 'tema Linear Indigo', vercel: 'tema Vercel Geist', mochi: 'tema Mochi Parchment', notion: 'tema Notion Charcoal', premium: 'tema Instrument Premium', custom: 'tema Customizado' };
  return nomes[r.id] ?? r.id;
}
