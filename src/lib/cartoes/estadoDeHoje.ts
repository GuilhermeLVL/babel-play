/**
 * O ESTADO DA ABA "HOJE" — qual dos cinco desenhos do protótipo vale agora (`CT_HOJES`,
 * `cartoes.js:42`), decidido pelo dado real e não por um seletor.
 *
 *   vazio     sem conta, ou nenhum cartão no baralho;
 *   primeiro  há cartões e nunca houve revisão;
 *   pilha     vence mais do que cabe numa rodada (os dois limites das Opções da revisão);
 *   normal    há o que estudar agora e cabe numa rodada;
 *   feito     nada vence agora.
 *
 * O "teto" da pilha é o tamanho da rodada: os limites de hoje valem por rodada e ficam no navegador
 * (`lib/revisao/preferencias`). O teto por dia, contado na conta, é fatia seguinte.
 */
import type { ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
import { type OpcoesDaRevisao, tamanhoDaRodada } from '../revisao/preferencias';

export type EstadoDeHoje = 'vazio' | 'primeiro' | 'pilha' | 'normal' | 'feito';

export interface Hoje {
  estado: EstadoDeHoje;
  /** Quantos cartões vencem agora (novas, aprendendo e a revisar). */
  vencem: number;
  /** Quantos a rodada de agora leva, com os limites. */
  rodada: number;
}

export function hojeDosCartoes(
  resumo: Pick<ResumoDosCartoes, 'total' | 'revisoesDeSempre' | 'hoje'> | null,
  opcoes: Pick<OpcoesDaRevisao, 'novas' | 'revisoes'>,
): Hoje {
  if (!resumo || resumo.total === 0) return { estado: 'vazio', vencem: 0, rodada: 0 };
  const vencem = resumo.hoje.novas + resumo.hoje.aprendendo + resumo.hoje.revisar;
  const rodada = tamanhoDaRodada(resumo.hoje, opcoes);
  if (resumo.revisoesDeSempre === 0) return { estado: 'primeiro', vencem, rodada };
  if (vencem === 0) return { estado: 'feito', vencem, rodada };
  /* Com um limite em zero ("0 novas") a rodada pode ficar vazia mesmo com cartão vencendo: é pilha,
     e a tela diz quantos esperam em vez de oferecer uma rodada de zero. */
  return { estado: vencem > rodada ? 'pilha' : 'normal', vencem, rodada };
}

/** O dia da semana de cada barra da previsão, a partir de amanhã (`CT_DIAS7`, `cartoes.js:93`). */
export function diasAPartirDeAmanha(inicioDoDia: number, quantos: number): number[] {
  const hoje = new Date(inicioDoDia).getDay();
  return Array.from({ length: quantos }, (_, i) => (hoje + 1 + i) % 7);
}

/**
 * Quando a próxima revisão abre: o primeiro dia da previsão, depois de hoje, que tem cartão.
 * `null` se nada volta nos próximos 30 dias.
 */
export function proximaAbertura(previsao: readonly number[]): { emDias: number; n: number } | null {
  for (let i = 1; i < previsao.length; i++) if (previsao[i] > 0) return { emDias: i, n: previsao[i] };
  return null;
}

/** A porcentagem de lembradas, ou `null` sem revisão no período (zero por cento seria um número falso). */
export function porcentoDeLembradas(l: { total: number; lembradas: number }): number | null {
  return l.total > 0 ? Math.round((l.lembradas / l.total) * 100) : null;
}
