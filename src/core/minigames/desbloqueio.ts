import { MINIGAMES } from './types';
import type { EstadoDoJogo } from './estadoDosJogos';

/**
 * A PORTA DE SAÍDA DE UM JOGO BLOQUEADO.
 *
 * O DEFEITO. A carta bloqueada já dizia a causa com número honesto — "faltam 2 · precisa de 4 ·
 * você tem 2 do português". O que ela nunca disse foi **o que fazer com isso**. Quem lia aquilo
 * ficava com um diagnóstico e nenhuma alavanca: o material existia, muitas vezes a um clique de
 * distância (no outro idioma, na outra fonte, na pilha de descartados), e a tela não contava.
 * Nove cartas cinza sem saída é exatamente a queixa de "os jogos ficam cinza e não tem explicação".
 *
 * A REGRA: **uma ação por carta, a mais barata que resolve**. Não é uma lista de sugestões — é a
 * próxima coisa a fazer. A ordem abaixo vai do conserto de um clique ao de um minuto:
 *
 *  1. `trocar-idioma`      — já existe material pronto em outro idioma
 *  2. `trocar-fonte`       — a outra ponta do binário (gravações ↔ trilha) tem o bastante
 *  3. `revisar-descartes`  — a triagem barrou cartões e a curadoria deixa resolver
 *  4. `gravar`             — não há material; o único caminho é criar
 *
 * Essa escada é a dos jogos de PALAVRA. Jogo de frase tem a sua, curta e separada
 * (`escolher-gravacao` → `gravar`), pelo motivo explicado no corpo da função.
 *
 * NÃO EXISTE `marcar-idioma`, e a ausência é deliberada. O plano previa uma ação que abrisse uma
 * tela de marcação para os cartões `idioma-incerto`; essa tela não existe — a curadoria lista o
 * grupo e o único conserto que ela oferece é arquivar (`CuradoriaBaralho` só edita tradução).
 * Um botão "Marcar o idioma de 3" que abrisse uma tela sem esse campo seria um botão que mente,
 * e é justamente o que este módulo existe para não fazer. Esses cartões caem em
 * `revisar-descartes`, que é para onde a ação levaria de qualquer jeito.
 *
 * E **`null` para `sem-voz` e `audio-carregando`**: não existe ação. Oferecer uma seria um botão
 * que mente — o mesmo defeito que o `Segmentado` veio corrigir. `audio-carregando` se resolve
 * sozinho em segundos; `sem-voz` é uma limitação do navegador, não uma escolha do usuário.
 *
 * Puro de propósito: é regra de produto, testável em Node, longe da árvore de 2.000 linhas onde
 * ela teria nascido como mais uma condicional no meio do JSX.
 */

export type AcaoDeDesbloqueio =
  | 'trocar-idioma'
  | 'trocar-fonte'
  | 'revisar-descartes'
  | 'escolher-gravacao'
  | 'gravar';

export interface Desbloqueio {
  acao: AcaoDeDesbloqueio;
  /** O texto do botão. Curto e no imperativo — é uma ação, não um aviso. */
  rotulo: string;
  /** Para `trocar-idioma`: o idioma que tem material. Quem abre a sala já chega na linha certa. */
  lang?: string;
  /** Para `trocar-fonte`: para onde ir. */
  paraFonte?: 'gravacoes' | 'trilha';
}

export interface ContextoDeDesbloqueio {
  /** Onde a prática está agora — decide qual é "a outra ponta" do binário. */
  fonteId: 'baralho' | 'sessao' | 'trilha';
  /** Idiomas com material JOGÁVEL, sem o idioma atual. Vem de `idiomasDisponiveis`. */
  outrosIdiomas: ReadonlyArray<{ lang: string; jogaveis: number }>;
  /** Quantos itens jogáveis a outra ponta do binário tem. `0` quando ela não existe. */
  naOutraFonte: number;
  /** Total barrado pela triagem, por qualquer motivo. */
  descartados: number;
  /** Quantas gravações o usuário tem. Zero muda "escolher" em "gravar". */
  gravacoes: number;
  /** Como escrever o nome de um idioma. Injetado porque a tradução dos nomes mora em `src/lib`. */
  nomeDoIdioma?: (lang: string) => string;
}

/**
 * A ação para um jogo bloqueado, ou `null` quando não existe ação honesta.
 *
 * Devolve `null` também para jogo liberado: quem chama itera a grade inteira e não deve precisar
 * repetir o `if (ok)` — a regra de "quando cabe uma porta" vive aqui.
 */
export function comoDesbloquear(estado: EstadoDoJogo, ctx: ContextoDeDesbloqueio): Desbloqueio | null {
  if (estado.ok) return null;

  // Sem ação possível — e dizer isso é mais honesto que inventar um botão.
  if (estado.motivo === 'sem-voz' || estado.motivo === 'audio-carregando') return null;

  const nome = ctx.nomeDoIdioma ?? ((l: string) => l);
  const precisa = MINIGAMES[estado.id].minItems;

  /**
   * JOGO DE FRASE TEM UMA ESCADA SÓ, e ela não passa por idioma nem por descartes.
   *
   * As frases vêm da GRAVAÇÃO em uso, não do baralho — é a mesma distinção que
   * `estadoDosJogos` documenta ("`frases` não é função da fonte escolhida"). Medido ao vivo: em
   * português, o Caça-conectores bloqueado por falta de legenda recebia "Jogar em inglês",
   * porque a regra genérica comparava com a contagem de PALAVRAS do outro idioma. Trocar de
   * idioma não põe legenda em gravação nenhuma — o botão levaria para outra tela igualmente
   * bloqueada, que é precisamente o defeito que este módulo existe para não cometer.
   *
   * Dentro de uma sessão não há o que escolher (a fonte é fixa), então ali o caminho é gravar.
   */
  if (estado.fonte === 'falas') {
    return ctx.fonteId !== 'sessao' && ctx.gravacoes > 0
      ? { acao: 'escolher-gravacao', rotulo: 'Escolher uma gravação' }
      : { acao: 'gravar', rotulo: 'Gravar uma conversa' };
  }

  // 1. O conserto de um clique: o material já existe, só está em outro idioma.
  const melhorIdioma = [...ctx.outrosIdiomas]
    .filter(i => i.jogaveis >= precisa)
    .sort((a, b) => b.jogaveis - a.jogaveis)[0];
  if (melhorIdioma) {
    return { acao: 'trocar-idioma', lang: melhorIdioma.lang, rotulo: `Jogar em ${nome(melhorIdioma.lang)}` };
  }

  // 2. A outra ponta do binário. Da trilha para as gravações e vice-versa.
  if (ctx.naOutraFonte >= precisa) {
    const paraFonte = ctx.fonteId === 'trilha' ? 'gravacoes' : 'trilha';
    return {
      acao: 'trocar-fonte',
      paraFonte,
      rotulo: paraFonte === 'trilha' ? 'Jogar com a trilha' : 'Jogar com minhas gravações',
    };
  }

  // 3. A pilha de descartados, que a curadoria explica um a um e deixa resolver.
  if (ctx.descartados > 0) {
    return { acao: 'revisar-descartes', rotulo: `Revisar ${ctx.descartados} descartadas` };
  }

  // 4. Não há material em lugar nenhum. O caminho é criar.
  return { acao: 'gravar', rotulo: 'Gravar uma conversa' };
}
