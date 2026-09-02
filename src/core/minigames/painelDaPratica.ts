import type { MinigameId } from './types';
import { MINIGAMES } from './types';
import type { EstadoDoJogo } from './estadoDosJogos';
import { ROTULO_DO_MOTIVO } from './estadoDosJogos';

/**
 * O PAINEL DA PRÁTICA — as duas decisões que a tela precisa tomar antes de desenhar qualquer coisa:
 * (1) o que propor agora, e (2) como agrupar os nove jogos.
 *
 * POR QUE ISTO EXISTE. A tela de hoje mostra nove cartas iguais e deixa a escolha inteira com quem
 * chegou — contados no código: 53 controles e 64 contadores competindo pela mesma atenção. Quem
 * abre "Praticar" quase sempre quer uma coisa só ("praticar agora"), e estava pagando o preço de
 * uma decisão que o app tinha informação de sobra para propor. As cartas bloqueadas eram piores:
 * nove retângulos cinzentos sem dizer o que faltava.
 *
 * A REGRA É PURA E TESTÁVEL de propósito. A sugestão é a primeira coisa que a pessoa lê na tela;
 * se ela mentir ("revisar 2.225") o resto da tela perde credibilidade junto. Aqui dá para travar
 * cada frase com um teste, o que dentro de um componente de 3.300 linhas não daria.
 */

/**
 * Para que cada jogo serve MELHOR, no vocabulário de quem joga — não no de quem programou.
 *
 * `volume`: quantas palavras diferentes a rodada toca por minuto (alto = bom para desafogar fila
 * de revisão). `producao`: o quanto exige produzir a palavra em vez de reconhecê-la (alto = fixa
 * melhor material novo, e cansa mais). Os valores saem dos contratos em `MINIGAMES` — Duelo tem
 * rodada curta por item, Termo consome 7 palavras numa escada longa — e existem para a sugestão
 * poder justificar a escolha em português, não para virar mais um número na tela.
 */
const PERFIL: Record<MinigameId, { volume: number; producao: number; frase: string }> = {
  blitz:      { volume: 5, producao: 1, frase: 'é o que mais palavras cobre por minuto' },
  memory:     { volume: 3, producao: 2, frase: 'fixa o par palavra e significado' },
  termo:      { volume: 2, producao: 5, frase: 'faz você escrever a palavra de cabeça' },
  wordsearch: { volume: 3, producao: 3, frase: 'treina reconhecer a forma escrita' },
  escuta:     { volume: 3, producao: 2, frase: 'treina o ouvido com a sua própria gravação' },
  ditado:     { volume: 2, producao: 5, frase: 'junta ouvido e escrita' },
  karaoke:    { volume: 2, producao: 4, frase: 'trabalha a pronúncia em voz alta' },
  scramble:   { volume: 2, producao: 4, frase: 'treina a ordem das palavras na frase' },
  conectores: { volume: 2, producao: 3, frase: 'mostra como as ideias se ligam' },
};

export type MomentoDaPratica = 'revisao' | 'aprender' | 'vazio';

export interface SugestaoDaRodada {
  /** `null` quando nenhum jogo abre — a tela mostra o caminho de saída, não um botão morto. */
  jogo: MinigameId | null;
  momento: MomentoDaPratica;
  /** Quantas palavras a proposta trata: as vencidas, ou o acervo do recorte. */
  quantas: number;
  /**
   * A justificativa SEM o nome do jogo ("é o que mais palavras cobre por minuto").
   *
   * O nome fica de fora porque ele não é único: a tabela da UI (`views/play/jogos.tsx`) tem um
   * título por perfil de idade — "Ache os pares" para criança, "Memória: palavra e tradução" para
   * quem já sabe. O núcleo não escolhe qual; entrega a razão, e a tela compõe a frase com o nome
   * que aquela pessoa vê.
   */
  justificativa: string;
}

export interface EntradaDaSugestao {
  /** Estado de cada jogo NESTE recorte (a mesma fonte que as cartas usam). */
  estados: readonly EstadoDoJogo[];
  /** Itens do recorte que estão pedindo revisão agora. */
  vencidas: number;
  /** Tamanho do recorte inteiro. */
  acervo: number;
}

/**
 * O que propor agora.
 *
 * DUAS SITUAÇÕES, e a diferença entre elas é o que a tela mais errava: com fila de revisão, o
 * trabalho é DESAFOGAR (ganha quem cobre mais palavras por minuto); sem fila, o trabalho é
 * APRENDER (ganha quem faz produzir a palavra, que fixa melhor). Propor "revisar" sobre material
 * nunca visto foi exatamente o defeito medido no acervo importado.
 *
 * O empate é resolvido pelo tamanho da rodada e, por fim, pela ordem da tabela `MINIGAMES` —
 * determinístico, porque uma sugestão que muda a cada render não é uma sugestão.
 */
export function sugerirRodada(e: EntradaDaSugestao): SugestaoDaRodada {
  const abertos = e.estados.filter((s) => s.ok);
  if (abertos.length === 0) {
    return { jogo: null, momento: 'vazio', quantas: e.acervo, justificativa: '' };
  }

  const temFila = e.vencidas > 0 && abertos.some((s) => e.vencidas >= MINIGAMES[s.id].minItems);
  const momento: MomentoDaPratica = temFila ? 'revisao' : 'aprender';
  const peso = (s: EstadoDoJogo) => (momento === 'revisao' ? PERFIL[s.id].volume : PERFIL[s.id].producao);

  const melhor = [...abertos].sort((a, b) =>
    peso(b) - peso(a) ||
    (b.tamanhoDaRodada ?? b.disponiveis) - (a.tamanhoDaRodada ?? a.disponiveis) ||
    a.id.localeCompare(b.id),
  )[0];

  return {
    jogo: melhor.id,
    momento,
    quantas: momento === 'revisao' ? e.vencidas : e.acervo,
    justificativa: PERFIL[melhor.id].frase,
  };
}

export interface JogoAgrupado {
  estado: EstadoDoJogo;
  /** Título curto do impedimento, pronto para a carta. */
  titulo: string;
  /** O que a pessoa pode fazer a respeito. */
  conserto: string;
}

export interface JogosAgrupados {
  prontos: EstadoDoJogo[];
  presos: JogoAgrupado[];
}

/**
 * Os nove jogos em dois grupos, cada um ordenado pelo que ajuda a decidir.
 *
 * PRONTOS primeiro, do que rende mais para o que rende menos neste recorte. PRESOS depois, do mais
 * perto de abrir para o mais longe — quem está a duas palavras de jogar merece aparecer antes de
 * quem precisa de uma gravação inteira. Cada preso carrega o PORQUÊ; carta bloqueada sem motivo é
 * o que fazia a tela parecer quebrada quando na verdade faltava material.
 */
export function agruparJogos(estados: readonly EstadoDoJogo[]): JogosAgrupados {
  const prontos = estados.filter((s) => s.ok)
    .sort((a, b) => (b.tamanhoDaRodada ?? b.disponiveis) - (a.tamanhoDaRodada ?? a.disponiveis) || a.id.localeCompare(b.id));

  const presos = estados.filter((s) => !s.ok)
    .sort((a, b) => (a.faltam || Infinity) - (b.faltam || Infinity) || a.id.localeCompare(b.id))
    .map((estado) => {
      const rotulo = estado.motivo ? ROTULO_DO_MOTIVO[estado.motivo] : null;
      if (rotulo) return { estado, titulo: rotulo.titulo, conserto: rotulo.conserto };
      const min = MINIGAMES[estado.id].minItems;
      return {
        estado,
        titulo: `faltam ${estado.faltam}`,
        conserto: estado.disponiveis > 0
          ? `este recorte tem ${estado.disponiveis} ${estado.disponiveis === 1 ? 'palavra pronta' : 'palavras prontas'} para este jogo, e ele precisa de ${min}`
          : `nenhuma palavra deste recorte serve a este jogo, que precisa de ${min}`,
      };
    });

  return { prontos, presos };
}
