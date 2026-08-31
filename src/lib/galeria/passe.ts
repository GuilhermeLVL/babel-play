import { CATALOGO_DA_LOJA, type ItemDaLoja } from '../loja'

/**
 * O PASSE DE TEMPORADA — 100 níveis por cima da MESMA economia (spec personalizar-v4).
 *
 * A REGRA QUE NÃO MUDA NADA: a década N do passe é o nível N do app. Todo slot da década N
 * destrava quando `nivel >= N` — exatamente o gate que `estadoDoItem` já aplica hoje. O passe é
 * uma LENTE de 100 posições sobre a progressão existente, não um segundo sistema de desbloqueio:
 * nenhum item fica mais cedo nem mais tarde do que ficava.
 *
 * O marcador "você está aqui" anda DENTRO da década pela fração de XP do nível — motivacional,
 * como nos passes de jogo: `passeNivel = (nivel-1)*10 + floor(pct/10)`.
 *
 * CONTEÚDO ANTES DE MOEDA (feedback do dono, 31/08: "o passe parecia fraco — muita moedinha").
 * Os ~60 itens reais do catálogo preenchem os slots primeiro, na própria década do seu nível;
 * só as sobras viram Seeds — e Seeds de slot são CRÉDITO REAL, idempotente por slot
 * (`creditoId = passe:t1:slot-<n>`, o mesmo desenho de `seed_credits` da economia v2).
 *
 * A fileira Premium do protótipo NÃO entra ainda: moeda comprada exige o inventário server-side
 * (spec economia-de-creditos). Aqui só existe a trilha Grátis — desenhada para ganhar a irmã.
 */

export const TEMPORADA_ATUAL = 't1'

export type SlotDoPasse =
  | { tipo: 'item'; slot: number; decada: number; item: ItemDaLoja }
  | { tipo: 'seeds'; slot: number; decada: number; quantidade: number; creditoId: string }

/** Seeds da sobra crescem com a década — o fim da trilha paga melhor, como manda o gênero. */
const SEEDS_POR_DECADA = [0, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50]

/**
 * Os 100 slots, determinísticos a partir do catálogo: itens da década na ordem do catálogo
 * (que é a ordem editorial da loja), sobras viram Seeds. Exclusivos de conquista ficam FORA —
 * o passe não vende nem antecipa o que só o feito abre.
 */
export function slotsDoPasse(): SlotDoPasse[] {
  const porDecada = new Map<number, ItemDaLoja[]>()
  for (const i of CATALOGO_DA_LOJA) {
    if (i.exclusivoDe) continue
    const d = Math.min(10, Math.max(1, i.nivel))
    porDecada.set(d, [...(porDecada.get(d) ?? []), i])
  }
  const slots: SlotDoPasse[] = []
  for (let d = 1; d <= 10; d++) {
    const itens = porDecada.get(d) ?? []
    for (let pos = 0; pos < 10; pos++) {
      const slot = (d - 1) * 10 + pos + 1
      const item = itens[pos]
      if (item) slots.push({ tipo: 'item', slot, decada: d, item })
      else slots.push({ tipo: 'seeds', slot, decada: d, quantidade: SEEDS_POR_DECADA[d], creditoId: `passe:${TEMPORADA_ATUAL}:slot-${slot}` })
    }
    // Década com MAIS de 10 itens: os excedentes entram como slots extras da mesma década —
    // melhor uma década "cheia" do que um item real fora do passe.
    for (let pos = 10; pos < itens.length; pos++) {
      slots.push({ tipo: 'item', slot: (d - 1) * 10 + 10, decada: d, item: itens[pos] })
    }
  }
  return slots
}

/** O marcador do passe (1..100) a partir do nível e da fração de XP do nível atual. */
export function passeNivel(nivel: number, pctDoNivel: number): number {
  const n = Math.max(1, Math.min(10, nivel))
  return Math.min(100, (n - 1) * 10 + Math.min(9, Math.max(0, Math.floor(pctDoNivel / 10))) + 1)
}

/** Slot destravado = a REGRA DE HOJE: o nível do app alcançou a década. */
export function slotDestravado(s: SlotDoPasse, nivel: number): boolean {
  return nivel >= s.decada
}

/* ── FILEIRA PREMIUM (decisão do dono, 31/08: as DUAS fileiras aparecem desde já) ──
 *
 * O conteúdo premium é DADO, não venda: a compra do passe depende da moeda comprada existir no
 * servidor (spec economia-de-creditos), então a fileira renderiza trancada com a coroa e sem
 * nenhum botão de compra — o desenho aprovado, com a economia honesta.
 *
 * A matemática do "passe que se paga": os slots de Créditos somam MAIS do que o preço planejado
 * (950) — quem completa recompra o próximo, o modelo Fortnite que o dono pediu. */
export type SlotPremium =
  | { tipo: 'creditos'; slot: number; decada: number; quantidade: number }
  | { tipo: 'variante'; slot: number; decada: number; nome: string; raridade: 'lendario' }

const CREDITOS_POR_DECADA = [0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18]

export function premiumDoNivel(lv: number): SlotPremium {
  const d = Math.min(10, Math.ceil(lv / 10))
  if (lv % 10 === 0) return { tipo: 'variante', slot: lv, decada: d, nome: `Variante Dourada ${d}`, raridade: 'lendario' }
  return { tipo: 'creditos', slot: lv, decada: d, quantidade: CREDITOS_POR_DECADA[d] }
}

/** Quanto a fileira Premium devolve em Créditos — precisa ser > o preço do passe. */
export function totalPremiumEmCreditos(): number {
  let total = 0
  for (let lv = 1; lv <= 100; lv++) {
    const s = premiumDoNivel(lv)
    if (s.tipo === 'creditos') total += s.quantidade
  }
  return total
}
