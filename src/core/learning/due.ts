import type { VocabCard, SchedulerType } from '../../types';

/**
 * "ESTE CARTÃO ESTÁ VENCIDO?" — a pergunta que a interface fazia errado.
 *
 * O BUG: a tela de exercícios comparava `card.fsrsDueAt === 'hoje'`, mas a camada de dados grava
 * uma data ISO (`new Date(row.dueAt).toISOString()`). A string 'hoje' só era produzida por
 * mutações locais antigas, então **com dados vindos do servidor o contador era sempre 0**: o
 * bloco "AGORA" nunca mostrava cartões vencidos, o filtro "vencidos" não filtrava nada, e a
 * revisão caía sempre no baralho inteiro. O servidor sempre esteve certo — quem mentia era o
 * cliente (`metrics.ts` já faz `dueAt <= now`).
 *
 * Aceita os dois formatos de propósito: ISO (o que o servidor manda) e o legado 'hoje'/'today'
 * (o que mutações locais ainda produzem antes do próximo refetch). Data ausente ou ilegível
 * conta como NÃO vencido — inventar urgência é pior do que omiti-la.
 */

/** Rótulos legados que significavam "vence hoje" antes de a data real existir. */
const LEGADO_HOJE = new Set(['hoje', 'today', 'agora', 'now']);

/** A data de vencimento (ISO ou legado) já passou? */
export function isDueAt(dueAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!dueAt) return false;
  const texto = String(dueAt).trim();
  if (!texto) return false;
  if (LEGADO_HOJE.has(texto.toLowerCase())) return true;
  const ts = Date.parse(texto);
  if (Number.isNaN(ts)) return false; // formato desconhecido: não inventa urgência
  return ts <= now;
}

/** O cartão está no baralho E vencido, pelo agendador em vigor? */
export function isDueNow(card: VocabCard, scheduler: SchedulerType = 'fsrs', now: number = Date.now()): boolean {
  if (!card.inDeck) return false;
  return isDueAt(scheduler === 'fsrs' ? card.fsrsDueAt : card.leitnerDueAt, now);
}

/** Quantos cartões do baralho estão vencidos agora. */
export function countDue(cards: VocabCard[], scheduler: SchedulerType = 'fsrs', now: number = Date.now()): number {
  let n = 0;
  for (const c of cards) if (isDueNow(c, scheduler, now)) n++;
  return n;
}

/**
 * Vencidos primeiro, do MAIS atrasado para o menos — a ordem que o Duelo Relâmpago usa. Quem
 * está vencido há mais tempo é quem está mais perto de ser esquecido, então joga primeiro.
 */
export function byUrgency(cards: VocabCard[], scheduler: SchedulerType = 'fsrs', now: number = Date.now()): VocabCard[] {
  const quando = (c: VocabCard) => {
    const bruto = scheduler === 'fsrs' ? c.fsrsDueAt : c.leitnerDueAt;
    if (bruto && LEGADO_HOJE.has(String(bruto).trim().toLowerCase())) return now;
    const ts = Date.parse(String(bruto ?? ''));
    return Number.isNaN(ts) ? Infinity : ts;
  };
  return cards.filter(c => isDueNow(c, scheduler, now)).sort((a, b) => quando(a) - quando(b));
}
