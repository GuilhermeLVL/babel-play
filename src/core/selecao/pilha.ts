/**
 * AS SAÍDAS DA PILHA (openspec `cartoes`, 5.2): 300 cartões vencidos não viram dívida. A função devolve a que dia cada
 * um passa a vencer, respeitando o limite de revisões por dia (2.1). Pura.
 *
 *  · hoje cabem `restamHoje` (o que o limite do dia ainda deixa), os que mais precisam;
 *  · o resto se espalha pelos próximos dias, `porDia` por dia, no máximo `diasMax` dias; o que passa disso fica no
 *    último dia (nenhum cartão se perde);
 *  · "precisa mais" = lembrança estimada mais baixa agora (`retrievability`); sem estabilidade, o cartão é o mais
 *    urgente; empate: o vencimento mais antigo, depois a ordem de entrada. Os que "aguentam esperar" (lembrança alta)
 *    são os primeiros a ir para frente;
 *  · `soAsQueAguentam` (lembrança estimada mínima, ex.: 0,85): só ESSAS podem ir para frente; as outras ficam hoje, mesmo
 *    acima de `restamHoje` (o limite do dia da Revisão continua cortando a rodada);
 *  · estável: a mesma entrada dá sempre a mesma saída.
 */
import { retrievability } from '../learning/scheduler';

const DIA = 86_400_000;

export interface CartaoDaPilha {
  id: string;
  dueAtMs?: number | null;
  stability?: number | null;
  lastReview?: number | null;
}

export interface PlanoDaPilha {
  /** Os que ficam para hoje (ids, na ordem de urgência). */
  hoje: string[];
  /** Os que mudam de dia: `adiarAte` é o começo do dia de destino (ms). */
  adiar: Array<{ id: string; adiarAte: number; emDias: number }>;
}

const lembranca = (c: CartaoDaPilha, agora: number): number => {
  if (!c.stability || !c.lastReview) return 0;
  return retrievability(Math.max(0, (agora - c.lastReview) / DIA), c.stability);
};

export function planejarSaidaDaPilha(
  vencidos: readonly CartaoDaPilha[],
  o: {
    agora: number;
    inicioDoDia: number;
    restamHoje: number;
    porDia: number;
    diasMax?: number;
    soAsQueAguentam?: number;
  },
): PlanoDaPilha {
  const porDia = Math.max(1, Math.floor(o.porDia));
  const hojeCabem = Math.max(0, Math.floor(o.restamHoje));
  const diasMax = Math.max(1, o.diasMax ?? 14);
  const ordem = vencidos
    .map((c, i) => ({ c, i, r: lembranca(c, o.agora) }))
    .sort((a, b) => a.r - b.r || (a.c.dueAtMs ?? 0) - (b.c.dueAtMs ?? 0) || a.i - b.i);
  const podeIr = (x: { r: number }) => o.soAsQueAguentam === undefined || x.r >= o.soAsQueAguentam;
  const ficam = ordem.filter((x, k) => k < hojeCabem || !podeIr(x));
  const vao = ordem.filter((x, k) => k >= hojeCabem && podeIr(x));
  const hoje = ficam.map((x) => x.c.id);
  const adiar = vao.map((x, k) => {
    const emDias = Math.min(diasMax, 1 + Math.floor(k / porDia));
    return { id: x.c.id, adiarAte: o.inicioDoDia + emDias * DIA, emDias };
  });
  return { hoje, adiar };
}
