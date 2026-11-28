/**
 * O SELETOR ÚNICO DA REVISÃO (openspec `modelo-do-aluno-e-dados`, 3.1 e 3.2): quais cartões entram na rodada, em que
 * ordem e quantos. Puro: sem React, sem rede, sem relógio nem sorte escondidos (`agora` e `embaralhar` entram de fora).
 *
 * A conta é A MESMA que `startReviewSession` (`Study.tsx`) fazia no navegador, linha a linha; o teste de
 * caracterização (`tests/selecao-revisao.test.ts`) mantém uma cópia da conta antiga e compara as duas. O que é NOVO
 * (estudo livre, `nadaVence`) só existe quando quem chama pede.
 */
import type { SchedulerType, VocabCard } from '../../types';
import { isDueNow } from '../learning/due';

/** O que o seletor lê do cartão (um `VocabCard` serve). */
export type CartaoDaRevisao = Pick<VocabCard, 'id' | 'inDeck' | 'fsrsState' | 'fsrsDueAt' | 'leitnerDueAt'> & {
  dueAtMs?: number | null;
};

export interface PedidoDaRevisao<C = CartaoDaRevisao> {
  agora: number;
  scheduler: SchedulerType;
  /** Os dois limites das opções (por rodada, quando não há contador do dia). */
  novasPorDia: number;
  revisoesPorDia: number;
  /** O que ainda cabe HOJE segundo o servidor (cartões 2.1); `null` sem conta ou sem rede. */
  restam: { novas: number; revisoes: number } | null;
  ordem: 'vencidas' | 'misturar';
  /** "Só 10 agora": as primeiras da fila. */
  limite?: number;
  /** "Mais N novas": só palavras nunca vistas, sem adiantar revisão. */
  soNovas?: boolean;
  /** Embaralha uma cópia (só usado na ordem "misturar"). */
  embaralhar: (lista: C[]) => C[];
  /**
   * NOVO (flag `estudo_revisao_v2`): sem nada vencido, NÃO cai no baralho inteiro como se fosse agenda. A rodada vem
   * vazia com `nadaVence` e a tela oferece o "Estudo livre", que é escolha explícita e não mexe na agenda.
   */
  semFallbackDoBaralho?: boolean;
}

export interface RodadaDaRevisao<C> {
  fila: C[];
  /** Havia o que estudar hoje, mas o limite do dia já foi: a tela diz isso em vez de abrir rodada escondida. */
  limiteDoDia: boolean;
  /** Sem nada vencido (e sem o fallback do baralho): quem chama oferece o estudo livre. */
  nadaVence: boolean;
}

/** O embaralhar de sempre da Revisão (o mesmo `sort` com sorte que ela usava). */
export const embaralharAoAcaso = <T>(lista: T[]): T[] => lista.slice().sort(() => Math.random() - 0.5);

/** Monta a rodada de revisão. */
export function selecionarRevisao<C extends CartaoDaRevisao>(
  ativos: readonly C[],
  p: PedidoDaRevisao<C>,
): RodadaDaRevisao<C> {
  const noBaralho = ativos.filter((c) => c.inDeck);
  if (p.soNovas) {
    const nuncaVistas = noBaralho.filter((c) => c.fsrsState === 'New').slice(0, p.limite ?? p.novasPorDia);
    return { fila: nuncaVistas, limiteDoDia: false, nadaVence: false };
  }
  const due = noBaralho.filter((c) => isDueNow(c as unknown as VocabCard, p.scheduler, p.agora));
  if (due.length === 0 && p.semFallbackDoBaralho) return { fila: [], limiteDoDia: false, nadaVence: true };
  const base = due.length > 0 ? due : noBaralho;
  const limiteDeNovas = p.restam ? p.restam.novas : p.novasPorDia;
  const limiteDeRevisoes = p.restam ? p.restam.revisoes : p.revisoesPorDia;
  const novas = base.filter((c) => c.fsrsState === 'New').slice(0, limiteDeNovas);
  const revisoes = base.filter((c) => c.fsrsState !== 'New').slice(0, limiteDeRevisoes);
  let fila =
    p.ordem === 'misturar'
      ? p.embaralhar([...revisoes, ...novas])
      : [...revisoes.sort((a, b) => (a.dueAtMs ?? 0) - (b.dueAtMs ?? 0)), ...novas];
  if (!fila.length) {
    /* Venceu algo, mas o limite de HOJE já foi: não abre rodada escondida (nem estuda "o baralho todo"). */
    const cabiaSemOLimiteDoDia =
      due.some((c) => (c.fsrsState === 'New' ? p.novasPorDia > 0 : true)) && !!p.restam && due.length > 0;
    if (cabiaSemOLimiteDoDia) return { fila: [], limiteDoDia: true, nadaVence: false };
    fila = base.slice(0, Math.max(1, p.revisoesPorDia));
  }
  if (p.limite) fila = fila.slice(0, p.limite);
  return { fila, limiteDoDia: false, nadaVence: false };
}

/** Quantos cartões o estudo livre leva por rodada, quando ninguém pede outro número. */
export const LIMITE_DO_ESTUDO_LIVRE = 20;

/**
 * O ESTUDO LIVRE (cartões 2.6): estuda o que a pessoa escolher fora da agenda. Vem do baralho ativo, sem as nunca
 * vistas (essas são "novas"), as que vencem mais cedo primeiro. NÃO decide nota: quem chama marca a rodada como
 * prática, que não grava nota nem mexe em data de vencimento.
 */
export function selecionarEstudoLivre<C extends CartaoDaRevisao>(
  ativos: readonly C[],
  limite: number = LIMITE_DO_ESTUDO_LIVRE,
): C[] {
  return ativos
    .filter((c) => c.inDeck && c.fsrsState !== 'New')
    .slice()
    .sort((a, b) => (a.dueAtMs ?? Infinity) - (b.dueAtMs ?? Infinity))
    .slice(0, Math.max(1, limite));
}
