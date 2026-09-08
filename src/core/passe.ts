import { CATALOGO_DA_LOJA, type ItemDaLoja } from './loja'

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
 * MORA NO CORE desde 01/09 (mudança credito-com-destino): o SERVIDOR precisa da curva premium
 * para creditar os Créditos de cada casa. Enquanto ela vivia só no bundle do cliente, a promessa
 * de "1.134 Créditos ao longo da trilha" não tinha como ser cumprida por ninguém.
 */

export const TEMPORADA_ATUAL = 't1'

export type SlotDoPasse =
  | { tipo: 'item'; slot: number; decada: number; item: ItemDaLoja }
  | { tipo: 'seeds'; slot: number; decada: number; quantidade: number; creditoId: string }

/**
 * NENHUMA CASA VAZIA (mudança economia-legivel-e-moedas, 31/08).
 *
 * A versão anterior punha um Cofre por década e deixava o resto vazio, com o argumento de que a
 * década inteira destrava junta — verdadeiro sobre o gate e irrelevante para quem joga: eram 33
 * casas vazias, 29 delas na segunda metade, e **8 dos 10 marcos ★ mostrando uma estrela dourada
 * sobre o nada**. O catálogo ganhou 25 itens nas décadas 6-10 (`loja.ts`) e agora toda casa
 * entrega algo nomeável.
 *
 * DUAS REGRAS DE ARRUMAÇÃO, e as duas existem por causa da leitura da tela:
 *  1. O MARCO É O MAIS RARO. A última casa da dezena recebe o item de maior raridade da década —
 *     a estrela do trilho passa a coroar o que a década inteira prometia.
 *  2. O COFRE PREENCHE O QUE SOBRA. O número de cofres é DERIVADO (10 − itens), então nunca há
 *     vaga: década com 8 itens ganha 2 cofres, com 9 ganha 1, com 11 não ganha nenhum e empilha
 *     o excedente. Mudar o catálogo não pode reabrir buraco — o teste prende isso.
 */
const RARIDADE_ORDEM = { comum: 0, raro: 1, epico: 2, lendario: 3 } as const

/** Seeds de UM cofre da década. */
const SEEDS_POR_COFRE = [0, 30, 60, 0, 50, 70, 95, 105, 120, 135, 172]

/**
 * QUANTOS COFRES CADA DÉCADA TEM — desenhado, e não mais sobra de divisão.
 *
 * Até 08/09 o número de cofres era `10 - itens da década`: o cofre preenchia o que sobrasse.
 * Lido como arrumacão de tela, faz sentido; lido como ECONOMIA, quer dizer que **a quantidade de
 * Seeds que a temporada paga era um efeito colateral de quantos cosméticos o catálogo tinha**.
 *
 * A onda 3 provou o estrago com números: 24 itens novos entraram no catálogo, as décadas
 * encheram, e o total da temporada caiu de **1.554 para 235 Seeds** — 85% da moeda da trilha
 * evaporou porque a Loja ganhou produto. Ninguém tomou essa decisão; ela aconteceu. E teria
 * acontecido de novo, no mesmo silêncio, a cada item futuro.
 *
 * Os números abaixo são exatamente os que a divisão antiga produzia com o catálogo de antes da
 * onda — nada mudou de valor para quem joga. O que mudou é que agora está ESCRITO: mexer na
 * moeda da temporada passa a exigir editar esta linha, que é o único jeito de a mudança ser uma
 * decisão. `tests/passe.test.ts` trava o total.
 *
 * Índice = década (o 0 não é usado), igual a `SEEDS_POR_COFRE`.
 */
const COFRES_POR_DECADA = [0, 0, 1, 0, 2, 2, 2, 2, 2, 2, 2]

/**
 * Os slots, determinísticos a partir do catálogo. Exclusivos de conquista ficam FORA — o passe
 * não vende nem antecipa o que só o feito abre.
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
    const todos = porDecada.get(d) ?? []
    const base = (d - 1) * 10
    // Ordem de raridade decide SÓ quem fica com o marco; o resto mantém a ordem editorial do
    // catálogo, que é o que dá coerência de tema dentro da década.
    const maisRaro = [...todos].sort((a, b) => RARIDADE_ORDEM[b.raridade] - RARIDADE_ORDEM[a.raridade])[0]
    const demais = todos.filter((i) => i !== maisRaro)

    /* O COFRE É RESERVADO, e os itens preenchem o resto — o inverso de antes. Os cofres ficam no
       fim da década, logo antes do marco: a década abre mostrando o que ela entrega de nomeavel e
       fecha com a moeda, que é o desenho que a auditoria de 31/08 pediu ("conteúdo antes de
       moeda") e que a divisão antiga cumpria por acaso. */
    const cofres = SEEDS_POR_COFRE[d] > 0 ? COFRES_POR_DECADA[d] : 0
    const quantia = SEEDS_POR_COFRE[d]
    let usados = 0
    let cursor = 0

    for (let pos = 0; pos < 9; pos++) {
      const slot = base + pos + 1
      const cofresQueFaltam = cofres - usados
      // O cofre entra quando as vagas que sobram são exatamente os cofres que faltam, ou quando
      // acabaram os itens. Assim ele nunca rouba a vaga de um item que caberia antes dele.
      const vagaDeCofre = cofresQueFaltam > 0 && (9 - pos <= cofresQueFaltam || cursor >= demais.length)
      if (!vagaDeCofre && cursor < demais.length) {
        slots.push({ tipo: 'item', slot, decada: d, item: demais[cursor++] })
      } else if (cofresQueFaltam > 0) {
        usados++
        // creditoId por POSIÇÃO: mais de um cofre por década, cada um creditado uma vez só.
        slots.push({ tipo: 'seeds', slot, decada: d, quantidade: quantia, creditoId: `passe:${TEMPORADA_ATUAL}:cofre-d${d}-${usados}` })
      } else if (cursor < demais.length) {
        slots.push({ tipo: 'item', slot, decada: d, item: demais[cursor++] })
      }
    }

    // A casa 10 é o MARCO: sempre o item mais raro da década.
    if (maisRaro) slots.push({ tipo: 'item', slot: base + 10, decada: d, item: maisRaro })

    // Década com mais itens que vagas: o excedente divide a coluna do marco em vez de ficar fora.
    for (let pos = cursor; pos < demais.length; pos++) {
      slots.push({ tipo: 'item', slot: base + 10, decada: d, item: demais[pos] })
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
