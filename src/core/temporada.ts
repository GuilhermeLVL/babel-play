import { MOLDURAS_DA_T1, TITULOS_DA_T1 } from './catalogoTemporada';
import type { LinhasDoHistorico } from './learning/historicoDeXp';
import { xpDeEventos } from './learning/xp';
import { CATALOGO_DA_LOJA } from './loja';
import type { PlanoEfetivo } from './planos';
import type { ItemDaLoja } from './tiposDaLoja';

/**
 * A TEMPORADA COM DATAS (recompensas v2, onda 5; spec 8.3) — substitui o Passe "lente do nível".
 *
 * O Passe de 100 casas era a progressão da conta vista por outra janela: não tinha prazo, não tinha
 * conteúdo próprio e, depois do corte do catálogo de emoji (onda 2), voltou a ter casas vazias. A
 * temporada é o oposto nos três pontos:
 *
 *  · TEM DATAS. A Temporada 1 vai de 01/10/2026 a 25/11/2026 — 8 semanas, no dia de Brasília
 *    (UTC−3; o Brasil não tem horário de verão desde 2019). Fora delas não há temporada atual, e a
 *    tela diz quando vem a próxima, sem contagem regressiva para o perfil protegido.
 *  · O XP É O DA CONTA, SÓ QUE DENTRO DA JANELA. Nada novo a ganhar: os mesmos resultados de estudo
 *    (`xpDeEventos`), contados só entre o início e o fim. 30 níveis de 150 XP.
 *  · DUAS TRILHAS, COM CONTEÚDO PRÓPRIO. A grátis tem recompensa em todo nível par — tema, legenda,
 *    cartão, moldura e título da temporada, e Seeds onde não há item. A de assinante tem ITEM em
 *    todo nível e nunca Seeds: Seeds pela assinatura seriam Seeds compráveis, e isso a spec proíbe.
 *
 * SEM COMPRA DE NÍVEL, EM LUGAR NENHUM. O crédito `temporada:<id>:<nível>:<trilha>` é conferido no
 * servidor (XP da janela ≥ nível × 150; na trilha de assinante, a assinatura ativa), e não existe
 * motivo de gasto que avance a trilha (`tests/temporada.test.ts`).
 *
 * MENOS FOMO: o item de uma temporada passada volta à Loja com Seeds 365 dias depois do fim
 * (`precoSeedsDoItem`).
 *
 * Regra deste arquivo: TS puro (o servidor e o espelho da edição estática importam daqui).
 */

export interface Temporada {
  id: string;
  numero: number;
  nome: string;
  /** Primeiro dia, `AAAA-MM-DD`, no dia de Brasília. */
  inicio: string;
  /** Último dia (inclusive), `AAAA-MM-DD`, no dia de Brasília. */
  fim: string;
  niveis: 30;
}

export const TEMPORADAS: readonly Temporada[] = [
  { id: 't1', numero: 1, nome: 'Observatório', inicio: '2026-10-01', fim: '2026-11-25', niveis: 30 },
];

export const NIVEIS_DA_TEMPORADA = 30;
export const XP_POR_NIVEL_DA_TEMPORADA = 150;
export const DIAS_ATE_VOLTAR_NA_LOJA = 365;

const DIA = 86_400_000;
/** O dia da temporada é o de Brasília. Fixo, e não o fuso de quem joga: a temporada é uma só. */
const FUSO_DA_TEMPORADA = '-03:00';

export type Trilha = 'gratis' | 'assinante';
export type RecompensaDaTrilha = ItemDaLoja | { seeds: number };

/** Início (00:00) e fim (23:59:59.999 do último dia), em epoch ms. */
export function limitesDaTemporada(t: Temporada): { inicio: number; fim: number } {
  return {
    inicio: Date.parse(`${t.inicio}T00:00:00${FUSO_DA_TEMPORADA}`),
    fim: Date.parse(`${t.fim}T00:00:00${FUSO_DA_TEMPORADA}`) + DIA - 1,
  };
}

export function temporadaPorId(id: string): Temporada | null {
  return TEMPORADAS.find((t) => t.id === id) ?? null;
}

/** A temporada em curso, ou `null` fora das datas. */
export function temporadaAtual(agora: Date): Temporada | null {
  const t = agora.getTime();
  return (
    TEMPORADAS.find((x) => {
      const { inicio, fim } = limitesDaTemporada(x);
      return t >= inicio && t <= fim;
    }) ?? null
  );
}

/** A próxima temporada que ainda não começou, ou `null` (nenhuma anunciada). */
export function proximaTemporada(agora: Date): Temporada | null {
  const t = agora.getTime();
  return (
    [...TEMPORADAS]
      .filter((x) => limitesDaTemporada(x).inicio > t)
      .sort((a, b) => limitesDaTemporada(a).inicio - limitesDaTemporada(b).inicio)[0] ?? null
  );
}

/**
 * O XP de temporada: o XP da conta (`xpDeEventos`, os mesmos pesos) dos eventos com carimbo DENTRO
 * da janela. Recebe as linhas na forma de `historicoDeXp` — o servidor lê do SQLite, a edição
 * estática do IndexedDB, e a conta é uma só.
 */
export function xpDeTemporada(linhas: LinhasDoHistorico, t: Temporada): number {
  const { inicio, fim } = limitesDaTemporada(t);
  const dentro = (em: number) => em >= inicio && em <= fim;
  const sessoes = linhas.sessoes.filter((s) => dentro(s.em));
  const revisoes = linhas.revisoes.filter((r) => dentro(r.em));
  const itens = linhas.itensDeJogo.filter((i) => dentro(i.em));
  return xpDeEventos({
    sessoes: sessoes.length,
    palavrasCapturadas: sessoes.reduce((n, s) => n + s.palavras, 0),
    revisoes: revisoes.length,
    revisoesCertas: revisoes.filter((r) => r.certa).length,
    itensDeJogo: itens.length,
    itensDeJogoCertos: itens.filter((i) => i.certo).length,
  });
}

/** 0 (nenhum nível ainda) a 30. */
export function nivelDaTemporada(xp: number): number {
  return Math.max(0, Math.min(NIVEIS_DA_TEMPORADA, Math.floor(xp / XP_POR_NIVEL_DA_TEMPORADA)));
}

/* ── AS TRILHAS DA TEMPORADA 1 ─────────────────────────────────────────────────────────────────
 *
 * GRÁTIS (os 15 níveis pares): as cinco peças da temporada nos níveis 8, 12, 18, 22 e 30 — o tema
 * Observatório é o marco — e Seeds nos outros dez. As Seeds sobem com o nível e somam 1.050 na
 * trilha inteira: ≈ 7 dias de renda do perfil típico (149,9/dia, `docs/economia-v2.md`) espalhados
 * por 8 semanas. `tests/temporada.test.ts` trava o total.
 *
 * ASSINANTE (os 30 níveis): um título de estrela nos ímpares e uma moldura de constelação nos pares
 * (`catalogoTemporada.ts`), com a raridade subindo; a Moldura Via Láctea é o marco. */
const TRILHA_GRATIS_T1: Readonly<Record<number, string | { seeds: number }>> = {
  2: { seeds: 60 },
  4: { seeds: 70 },
  6: { seeds: 80 },
  8: 'titulo-t1-luneta',
  10: { seeds: 90 },
  12: 'leg-letreiro',
  14: { seeds: 100 },
  16: { seeds: 110 },
  18: 'moldura-t1-orbita',
  20: { seeds: 120 },
  22: 'cartao-constelacao',
  24: { seeds: 130 },
  26: { seeds: 140 },
  28: { seeds: 150 },
  30: 'tema-observatorio',
};

function trilhaDeAssinanteT1(nivel: number): ItemDaLoja | undefined {
  return nivel % 2 ? TITULOS_DA_T1[(nivel - 1) / 2] : MOLDURAS_DA_T1[nivel / 2 - 1];
}

const itemPorId = (id: string) => CATALOGO_DA_LOJA.find((i) => i.id === id);

/**
 * O que a casa `nivel` da trilha entrega: um item, Seeds, ou nada (casa ímpar da grátis). A
 * temporada padrão é a T1 — a única que existe.
 */
export function recompensaDaTrilha(nivel: number, trilha: Trilha, temporadaId = 't1'): RecompensaDaTrilha | null {
  if (temporadaId !== 't1' || !Number.isInteger(nivel) || nivel < 1 || nivel > NIVEIS_DA_TEMPORADA) return null;
  if (trilha === 'assinante') return trilhaDeAssinanteT1(nivel) ?? null;
  const casa = TRILHA_GRATIS_T1[nivel];
  if (casa === undefined) return null;
  return typeof casa === 'string' ? (itemPorId(casa) ?? null) : casa;
}

/** Quanto a trilha grátis paga em Seeds, somada — o número que o teste trava. */
export function totalDeSeedsDaTrilhaGratis(temporadaId = 't1'): number {
  let total = 0;
  for (let n = 1; n <= NIVEIS_DA_TEMPORADA; n++) {
    const r = recompensaDaTrilha(n, 'gratis', temporadaId);
    if (r && 'seeds' in r) total += r.seeds;
  }
  return total;
}

/* ── O CRÉDITO ─────────────────────────────────────────────────────────────────────────────── */

export function creditoDaTemporada(temporadaId: string, nivel: number, trilha: Trilha): string {
  return `temporada:${temporadaId}:${nivel}:${trilha}`;
}

/** `temporada:<id>:<nível>:<trilha>` → as partes, ou `null` (temporada inexistente, nível fora de 1..30). */
export function lerCreditoDaTemporada(
  creditoId: string,
): { temporada: Temporada; nivel: number; trilha: Trilha } | null {
  const m = /^temporada:([a-z0-9]+):([1-9]\d?):(gratis|assinante)$/.exec(creditoId);
  if (!m) return null;
  const temporada = temporadaPorId(m[1]);
  const nivel = Number(m[2]);
  if (!temporada || nivel > temporada.niveis) return null;
  return { temporada, nivel, trilha: m[3] as Trilha };
}

/**
 * Os créditos que a pessoa pode pedir e ainda não tem: a grátis até o nível alcançado e, para
 * assinante, a de assinante também. O servidor confere tudo de novo antes de gravar.
 */
export function creditosDaTemporadaDevidos(
  t: Temporada,
  nivel: number,
  assinante: boolean,
  creditados: ReadonlySet<string>,
): string[] {
  const devidos: string[] = [];
  for (let n = 1; n <= Math.min(nivel, t.niveis); n++) {
    for (const trilha of assinante ? (['gratis', 'assinante'] as const) : (['gratis'] as const)) {
      const id = creditoDaTemporada(t.id, n, trilha);
      if (recompensaDaTrilha(n, trilha, t.id) && !creditados.has(id)) devidos.push(id);
    }
  }
  return devidos;
}

/** O item que um crédito de temporada entrega (ou `null` quando a casa paga Seeds). */
export function itemDoCreditoDaTemporada(creditoId: string): ItemDaLoja | null {
  const c = lerCreditoDaTemporada(creditoId);
  if (!c) return null;
  const r = recompensaDaTrilha(c.nivel, c.trilha, c.temporada.id);
  return r && 'id' in r ? r : null;
}

/**
 * Assinante, para a temporada, é quem tem um plano PAGO concedido pelo servidor. `selfhost` não é
 * assinatura (não há cobrança), e `convidado`/`free` não pagam.
 */
export function ehAssinanteDaTemporada(plano: PlanoEfetivo): boolean {
  return plano === 'essencial' || plano === 'pro';
}

/* ── A VOLTA À LOJA ────────────────────────────────────────────────────────────────────────── */

/**
 * O preço em Seeds de um item AGORA. Item comum: o do catálogo. Item de temporada: nenhum até 365
 * dias depois do fim da temporada dele; daí em diante, `precoSeedsDepois`. A autoridade do gasto
 * (`autorizarGasto`) e a tela usam esta mesma função.
 */
export function precoSeedsDoItem(item: ItemDaLoja, agora: number): number | undefined {
  if (!item.origemTemporada) return item.precoSeeds;
  const t = temporadaPorId(item.origemTemporada.temporada);
  if (!t) return undefined;
  const volta = limitesDaTemporada(t).fim + DIAS_ATE_VOLTAR_NA_LOJA * DIA;
  return agora > volta ? item.origemTemporada.precoSeedsDepois : undefined;
}
