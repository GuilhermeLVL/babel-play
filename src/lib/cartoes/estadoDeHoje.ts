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
 * COM UM CONTEÚDO ESCOLHIDO na ficha (`fila`): a fila é a da fonte. "vazio" e "primeiro" continuam
 * sendo da conta (não há cartão; nunca houve revisão). Se nada vence NA FONTE mas vence em outro lugar,
 * o estado é "normal" com zero: a tela diz "Nada vence aqui hoje" (`cartoes.js:356`) em vez de comemorar
 * um dia que ainda tem o que estudar.
 *
 * O "teto" da pilha é o tamanho da rodada: os limites de hoje valem por rodada e ficam no navegador
 * (`lib/revisao/preferencias`). O teto por dia, contado na conta, é fatia seguinte.
 */
import type { ContagemDeFila, ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
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
  /** A fila do conteúdo escolhido; sem ela, a da conta inteira. */
  fila: ContagemDeFila | null = null,
): Hoje {
  if (!resumo || resumo.total === 0) return { estado: 'vazio', vencem: 0, rodada: 0 };
  const aqui = fila ?? resumo.hoje;
  const vencem = aqui.novas + aqui.aprendendo + aqui.revisar;
  const rodada = tamanhoDaRodada(aqui, opcoes);
  if (resumo.revisoesDeSempre === 0) return { estado: 'primeiro', vencem, rodada };
  if (vencem === 0) {
    const naConta = resumo.hoje.novas + resumo.hoje.aprendendo + resumo.hoje.revisar;
    return { estado: naConta > 0 ? 'normal' : 'feito', vencem, rodada };
  }
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

/**
 * Os últimos sete dias, o último é hoje (`ctSemana`, `cartoes.js:214-220`): o dia da semana e se houve
 * revisão nele. Vem do calendário do resumo (revisões por dia). O app não tem congelamento de sequência:
 * dia sem revisão é dia sem revisão.
 */
export function semanaDeEstudo(
  calendario: readonly number[],
  inicioDoDia: number,
): Array<{ dia: number; estado: 'feito' | 'fora' | 'hoje' }> {
  const hoje = new Date(inicioDoDia).getDay();
  const ultimos = calendario.slice(-7);
  return ultimos.map((n, i) => {
    const atras = ultimos.length - 1 - i;
    return { dia: (((hoje - atras) % 7) + 7) % 7, estado: n > 0 ? 'feito' : atras === 0 ? 'hoje' : 'fora' };
  });
}

/**
 * "Como fica a semana" com um teto por dia (`CT_SAIDAS_DA_PILHA`, `cartoes.js:281-289`): os sete dias a
 * partir de amanhã. Cada dia leva o que sobrou de ontem mais o que a previsão traz, até o teto; o resto
 * passa para o dia seguinte. Não conta o que volta dentro da própria semana por ter sido revisado.
 */
export function semanaComTeto(previsao: readonly number[], teto: number): number[] {
  const limite = Math.max(1, teto);
  let sobra = Math.max(0, (previsao[0] ?? 0) - limite);
  return Array.from({ length: 7 }, (_, i) => {
    const pedem = sobra + (previsao[i + 1] ?? 0);
    const leva = Math.min(limite, pedem);
    sobra = pedem - leva;
    return leva;
  });
}
