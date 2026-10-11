/**
 * "PRATICAR DE OUTRO JEITO" — o contrato de quem abre a folha (`window.ctPraticar`, `cartoes4.js:460-463`).
 *
 * Quem chama (a aba Hoje, um baralho, a seleção de Palavras, o fim da sessão) entrega um RECORTE e
 * navega: `onChangeView('study', { praticar: recorte })`. A revisão abre com a folha das práticas sobre
 * esse recorte; cada prática roda só sobre os cartões dele.
 */
export interface RecorteDaPratica {
  /** De onde veio o pedido: só registro e texto, não muda a regra. */
  origem: 'hoje' | 'baralho' | 'selecao' | 'escaparam' | 'sessao';
  /** O nome do recorte na folha: "As 4 que escaparam", "Reunião de produto". */
  rotulo: string;
  /** Os ids dos cartões. Ausente = a revisão resolve: os da sessão (`sessionId`) ou os que vencem agora. */
  ids?: string[];
  /** Um baralho de sessão: os cartões nascidos dela. */
  sessionId?: string;
}

/** O que `onChangeView('study', data)` entende de `data.praticar`: só um recorte bem formado passa. */
export function lerRecorteDaPratica(bruto: unknown): RecorteDaPratica | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined;
  const r = bruto as Partial<RecorteDaPratica>;
  if (typeof r.rotulo !== 'string' || !r.rotulo.trim()) return undefined;
  const origens = ['hoje', 'baralho', 'selecao', 'escaparam', 'sessao'] as const;
  return {
    origem: origens.includes(r.origem as (typeof origens)[number]) ? (r.origem as RecorteDaPratica['origem']) : 'hoje',
    rotulo: r.rotulo.trim(),
    ids: Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === 'string' && !!x).slice(0, 500) : undefined,
    sessionId: typeof r.sessionId === 'string' && r.sessionId ? r.sessionId : undefined,
  };
}

/**
 * O QUE CADA PRÁTICA GRAVA, dito no selo (`cxSelo`, `cartoes4.js:414`) e cumprido pelo código:
 *  · Falar, Ouvir e escrever e Completar são RECORDAR: no fim da prática cada cartão recebe uma nota
 *    (Bom se lembrou, Errei se não), pelo mesmo `POST /api/vocab/:id/review` da revisão, com
 *    `origem: 'pratica:<tipo>'`. Prática interrompida não grava nada.
 *  · Jogo rápido é RECONHECER: a rodada abre no Jogar com `semAgenda`, e nesse modo o Jogar não manda
 *    nota nenhuma ao agendador (o resultado do jogo e o XP dele continuam valendo).
 */
export const PRATICA_CONTA_COMO_REVISAO = { falar: true, ditado: true, completar: true, jogo: false } as const;

/** O recorte que o Jogar recebe do "Jogo rápido" (`onChangeView('play', { recorte })`). */
export interface RecorteDoJogar {
  /** As palavras dos cartões (o `item_ref` dos jogos de palavra). */
  palavras: string[];
  /** A rodada não manda nota ao agendador ("não mexe na sua agenda"). */
  semAgenda: boolean;
  rotulo: string;
}

export function lerRecorteDoJogar(bruto: unknown): RecorteDoJogar | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const r = bruto as Partial<RecorteDoJogar>;
  const palavras = Array.isArray(r.palavras) ? r.palavras.filter((x): x is string => typeof x === 'string' && !!x) : [];
  if (!palavras.length) return null;
  return { palavras: palavras.slice(0, 500), semAgenda: r.semAgenda === true, rotulo: String(r.rotulo ?? '') };
}
