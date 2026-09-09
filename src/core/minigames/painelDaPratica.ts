import type { EstadoDoJogo } from './estadoDosJogos';
import { ROTULO_DO_MOTIVO } from './estadoDosJogos';
import { MINIGAMES } from './types';

/**
 * O PAINEL DA PRÁTICA — como os nove jogos se dividem antes de a tela desenhar qualquer coisa.
 *
 * POR QUE ISTO EXISTE. As cartas bloqueadas eram nove retângulos cinzentos sem dizer o que
 * faltava, misturados com as que abrem: a tela parecia quebrada quando o que faltava era material.
 * Aqui o que abre e o que não abre viram dois grupos, e todo bloqueado carrega o porquê.
 *
 * A REGRA É PURA E TESTÁVEL de propósito — dentro de um componente de 3.300 linhas não haveria
 * como travá-la.
 *
 * Houve também um `sugerirRodada`, que propunha UMA rodada no topo da tela (a "ficha"). O dono
 * pediu a ficha de volta para fora depois de vê-la no app; a regra saiu junto, em vez de ficar
 * como código sem consumidor. O histórico tem o desenho inteiro, se ele voltar a fazer sentido.
 */

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
