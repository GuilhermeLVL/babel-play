import { CATALOGO_DA_LOJA, type ItemDaLoja, type Raridade } from './loja'
import { CONQUISTAS, type Conquista } from './learning/conquistas'

/**
 * A TABELA DE PREÇOS QUE O SERVIDOR CONSULTA.
 *
 * O DEFEITO QUE ISTO FECHA (auditoria de 01/09). `POST /api/metrics/seeds/gastar` gravava o
 * `amount` e o `reason` que o cliente mandasse, e a POSSE é derivada do razão
 * (`reason LIKE 'loja:%'`). Então `{amount: 1, reason: 'loja:tema-custom'}` entregava o lendário
 * de 600 Seeds por 1 — e o servidor passava a ATESTAR essa posse. O gêmeo,
 * `POST /api/metrics/seeds/creditar`, cunhava até 10.000 Seeds e 10.000 XP por request com um
 * `creditoId` inventado.
 *
 * A regra que passa a valer é a de qualquer economia de jogo séria: **o cliente diz QUAL evento
 * aconteceu; o servidor decide QUANTO vale.** Este módulo é o "quanto".
 *
 * POR QUE NO CORE. O projeto já fazia certo do outro lado: `server/routes/billing.ts` importa
 * `core/creditos.ts` e resolve o preço do pacote a partir do SKU — é por isso que a compra de
 * Créditos nunca teve esse furo. Aqui é o mesmo desenho, aplicado às Seeds.
 *
 * Regra deste arquivo: TS puro. Nada de DOM, nada de localStorage — ele roda no Node.
 */

/* ── Preços que não moram no catálogo de itens ──────────────────────────────────────────────
 * Estavam em `lib/` (bundle do cliente) e por isso eram invisíveis ao servidor. Vêm para cá como
 * FONTE; os módulos de `lib/` passam a reexportar, para nenhuma tela mudar de import. */

/** Croma: barato de propósito — é onde a Seed sobrando vai parar, não uma segunda barreira. */
export const PRECO_DO_CROMA: Record<Raridade, number> = {
  comum: 15, raro: 25, epico: 40, lendario: 60,
}

/** Aprimoramento: três degraus, cada um mais caro que o anterior. */
export const CUSTOS_DE_NIVEL = [50, 110, 220] as const
export const NIVEL_MAXIMO_DE_APRIMORAMENTO = 3

/** Pular a rodada mantendo o combo (economia v2: ≈ metade de um dia ativo). */
export const CUSTO_PULAR_RODADA = 40

/** Os alvos de aprimoramento que existem. Fora desta lista, o servidor não cobra. */
export const ALVOS_DE_APRIMORAMENTO = ['particulas', 'sorte'] as const

/* ── Autorização de um GASTO ────────────────────────────────────────────────────────────────── */

export type GastoAutorizado =
  | { tipo: 'loja'; itemId: string; preco: number }
  | { tipo: 'croma'; itemId: string; matiz: string; preco: number }
  | { tipo: 'aprimoramento'; alvo: string; nivel: number; preco: number }
  | { tipo: 'pular-rodada'; preco: number }

/** Por que um motivo foi recusado — texto curto, para o 400 dizer o que houve. */
export type RecusaDeGasto = { erro: string }

/** Vale para qualquer autorização — de Seeds ou de Créditos. */
export function ehRecusa<T extends object>(r: T | RecusaDeGasto): r is RecusaDeGasto {
  return 'erro' in r
}

const itemPorId = (id: string): ItemDaLoja | undefined => CATALOGO_DA_LOJA.find((i) => i.id === id)

/**
 * Traduz o `reason` de um gasto no que ele autoriza — ou recusa.
 *
 * O formato é FECHADO de propósito. Enquanto `reason` era `z.string().max(40)`, ele era ao mesmo
 * tempo o campo de diagnóstico e o título de propriedade: qualquer string virava posse.
 */
export function autorizarGasto(reason: string): GastoAutorizado | RecusaDeGasto {
  if (reason === 'pular-rodada') return { tipo: 'pular-rodada', preco: CUSTO_PULAR_RODADA }

  if (reason.startsWith('loja:')) {
    const itemId = reason.slice(5)
    const item = itemPorId(itemId)
    if (!item) return { erro: `item inexistente: ${itemId}` }
    /* O que só sai de conquista NUNCA entra pela porta da compra. Sem esta linha, um `reason`
       forjado entregava o tema Aurora — que a Loja não vende em lugar nenhum. */
    if (item.exclusivoDe) return { erro: `${itemId} é exclusivo de conquista e não está à venda` }
    if (item.precoSeeds === undefined) return { erro: `${itemId} não tem preço: só destrava por nível` }
    return { tipo: 'loja', itemId, preco: item.precoSeeds }
  }

  if (reason.startsWith('croma:')) {
    const [, itemId, matiz] = reason.split(':')
    if (!itemId || !matiz) return { erro: 'croma malformado' }
    const item = itemPorId(itemId)
    if (!item) return { erro: `item inexistente: ${itemId}` }
    return { tipo: 'croma', itemId, matiz, preco: PRECO_DO_CROMA[item.raridade] }
  }

  // `aprimoramento:<alvo>:<n>` é o razão que a Loja grava; o spendId usa `apr-<alvo>-n<N>`.
  if (reason.startsWith('aprimoramento:')) {
    const [, alvo, n] = reason.split(':')
    const nivel = Number(n)
    if (!ALVOS_DE_APRIMORAMENTO.includes(alvo as never)) return { erro: `aprimoramento inexistente: ${alvo}` }
    if (!Number.isInteger(nivel) || nivel < 1 || nivel > NIVEL_MAXIMO_DE_APRIMORAMENTO) {
      return { erro: `nível de aprimoramento fora da escada: ${n}` }
    }
    return { tipo: 'aprimoramento', alvo, nivel, preco: CUSTOS_DE_NIVEL[nivel - 1] }
  }

  return { erro: `motivo desconhecido: ${reason.slice(0, 24)}` }
}

/* ── Autorização de um gasto de CRÉDITOS (a moeda comprada) ────────────────────────────────── */

export type GastoDeCredito =
  | { tipo: 'premium'; itemId: string; preco: number }

/**
 * O gasto de Créditos tem a MESMA régua do de Seeds, e por um motivo direto: é a moeda que custou
 * dinheiro. Se o preço em Seeds já não podia vir do cliente, o preço em Créditos menos ainda.
 *
 * `premium:<id>` é o único formato porque, por enquanto, o único destino do Crédito é a prateleira
 * paga. Quando houver um segundo, ele entra aqui e não em cada rota.
 */
export function autorizarGastoDeCredito(reason: string): GastoDeCredito | RecusaDeGasto {
  if (!reason.startsWith('premium:')) return { erro: `motivo desconhecido: ${reason.slice(0, 24)}` }
  const itemId = reason.slice('premium:'.length)
  const item = itemPorId(itemId)
  if (!item) return { erro: `item inexistente: ${itemId}` }
  if (item.precoCreditos === undefined) return { erro: `${itemId} não é vendido em Créditos` }
  return { tipo: 'premium', itemId, preco: item.precoCreditos }
}

/* ── Autorização de um CRÉDITO ──────────────────────────────────────────────────────────────── */

/** O `creditoId` que o cliente usa para conquista é `conquista-<id>` (`src/lib/conquistas.ts`). */
export function conquistaDoCreditoId(creditoId: string): Conquista | null {
  if (!creditoId.startsWith('conquista-')) return null
  const id = creditoId.slice('conquista-'.length)
  return CONQUISTAS.find((c) => c.id === id) ?? null
}

/** O cofre do passe: `passe:<temporada>:cofre-d<N>-<K>`, com a quantia vindo da curva. */
export function seedsDoCofreDoPasse(creditoId: string, quantiaPorDecada: readonly number[]): number | null {
  const m = /^passe:[a-z0-9]+:cofre-d(\d{1,2})-\d+$/.exec(creditoId)
  if (!m) return null
  const decada = Number(m[1])
  const q = quantiaPorDecada[decada]
  return typeof q === 'number' && q > 0 ? q : null
}

/**
 * AS CONQUISTAS QUE O SERVIDOR SABE CONFERIR HOJE.
 *
 * Onze das catorze dependem só de `metricas`, do nível ou do número de compras — tudo que
 * `computeProfile` já devolve. As três de fora dependem de estado que só o navegador tem:
 * `colecionador` (eventos raros vistos), `poliglota` (idiomas distintos) e `duelista` (melhor
 * combo por jogo).
 *
 * Para essas três o servidor credita o valor CORRETO da regra sem conferir a condição. A exposição
 * é limitada e mensurável: as catorze conquistas somam 860 Seeds e 930 XP, uma vez cada
 * (idempotente por `creditoId`) — cerca de dez dias de jogo legítimo. Antes desta mudança o mesmo
 * endpoint cunhava 1,2 milhão de Seeds por minuto. Fechá-las de vez exige levar recordes e eventos
 * raros para o servidor, que é trabalho de outra mudança.
 */
export const CONQUISTAS_CONFERIVEIS: ReadonlySet<string> = new Set([
  'primeira-captura', 'ouvinte', 'caderno-cheio', 'revisor', 'sem-erro', 'perfeccionista',
  'maratonista', 'constante', 'cliente', 'nivel-5', 'nivel-10',
])
