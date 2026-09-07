import { CATALOGO_DA_LOJA, type ItemDaLoja, type Raridade } from './loja'
import { CONQUISTAS, type Conquista } from './learning/conquistas'
import { slotsDoPasse, type SlotDoPasse } from './passe'

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

/**
 * O QUE UM `creditoId` VALE — a metade que faltava da autoridade.
 *
 * O GASTO já era decidido aqui desde 01/09 (`autorizarGasto`); o CRÉDITO só conhecia uma família,
 * a de conquista. As outras — os cofres do passe — chegavam ao servidor e levavam 400 "crédito
 * desconhecido" (`server/routes/metrics.ts`), com dois efeitos medidos na auditoria de 07/09:
 * a tela do passe repetia o pedido a cada montagem e nunca marcava o baú, e as 36 linhas
 * `passe:t1:*` que existiam no banco tinham entrado ANTES do endurecimento, com o valor que o
 * cliente mandou (10 a 172 Seeds, 2.472 no total).
 *
 * `seedsDoCofreDoPasse` foi escrita para isto e nunca teve chamador. Ela também pedia a curva
 * (`quantiaPorDecada`) por parâmetro, o que reabria a mesma porta pelo lado de dentro: quem
 * chamasse com outra curva creditava outro valor. Aqui a curva não se passa — ela se LÊ, de
 * `slotsDoPasse()`, que é a mesma função que desenha o trilho na tela. Um cofre vale o que a tela
 * mostra porque é literalmente o mesmo número.
 */

/** O que um crédito autorizado entrega, e o que ele exige para valer. */
export interface CreditoAutorizado {
  creditoId: string
  seeds: number
  xp: number
  /** O que vai para `seed_credits.reason` — a coluna de onde a posse é derivada. */
  reason: string
  /** Nível do app exigido. 0 = sem exigência (a conquista traz a sua própria condição). */
  nivelMinimo: number
  /** Presente só na família de conquista: quem confere a condição precisa dela. */
  conquista?: Conquista
}

/* Índice dos cofres por `creditoId`, montado uma vez. `slotsDoPasse()` percorre o catálogo
   inteiro e é determinística — chamá-la a cada crédito seria trabalho repetido para o mesmo
   resultado. */
let cofresPorId: Map<string, Extract<SlotDoPasse, { tipo: 'seeds' }>> | null = null
function cofreDoPasse(creditoId: string) {
  if (!cofresPorId) {
    cofresPorId = new Map()
    for (const s of slotsDoPasse()) if (s.tipo === 'seeds') cofresPorId.set(s.creditoId, s)
  }
  return cofresPorId.get(creditoId)
}

/**
 * O VALOR DE UM CRÉDITO, decidido pela regra — nunca pelo corpo do pedido.
 *
 * Devolve a recusa em vez de lançar, pelo mesmo motivo de `autorizarGasto`: quem chama precisa
 * responder 400 com um motivo legível, e não engolir uma exceção.
 *
 * A conferência de NÍVEL fica com o chamador (é ele que sabe o nível: o servidor calcula de
 * `computeProfile`, o modo sem conta de `economiaDeMetricas`). O que esta função garante é que
 * ninguém precise adivinhar QUAL nível exigir.
 */
export function valorDoCredito(creditoId: string): CreditoAutorizado | RecusaDeGasto {
  const conquista = conquistaDoCreditoId(creditoId)
  if (conquista) {
    return {
      creditoId,
      seeds: conquista.recompensa.seeds,
      xp: conquista.recompensa.xp,
      reason: `conquista:${conquista.id}`,
      nivelMinimo: 0,
      conquista,
    }
  }

  const cofre = cofreDoPasse(creditoId)
  if (cofre) {
    /* A década N do passe é o nível N do app (`slotDestravado`). Sem esta linha, o crédito do
       cofre da década 10 sairia no nível 1 — e ele vale 172 Seeds. */
    return { creditoId, seeds: cofre.quantidade, xp: 0, reason: `passe:${creditoId.split(':')[1]}`, nivelMinimo: cofre.decada }
  }

  return { erro: `crédito desconhecido: ${creditoId.slice(0, 40)}` }
}

/**
 * AS CONQUISTAS QUE O SERVIDOR SABE CONFERIR.
 *
 * Treze das catorze dependem só de `metricas`, do nível, dos recordes ou do número de compras —
 * tudo que o servidor mede. `poliglota` e `duelista` entraram nesta lista em 07/09, quando
 * `computeProfile` passou a emitir `idiomas` e `exercise_results` passou a guardar o combo da
 * rodada; até então elas não podiam ser conferidas porque o dado não existia no banco, e não
 * porque a condição fosse subjetiva.
 *
 * A que sobra é `colecionador`, que conta eventos raros vistos — estado que só o navegador tem.
 * Para ela o servidor credita o valor CORRETO da regra sem conferir a condição. A exposição é de
 * 100 Seeds e 120 XP, uma vez (idempotente por `creditoId`); antes desta família de mudanças o
 * mesmo endpoint cunhava 1,2 milhão de Seeds por minuto.
 */
export const CONQUISTAS_CONFERIVEIS: ReadonlySet<string> = new Set([
  'primeira-captura', 'ouvinte', 'caderno-cheio', 'revisor', 'sem-erro', 'perfeccionista',
  'maratonista', 'constante', 'cliente', 'nivel-5', 'nivel-10', 'poliglota', 'duelista',
])
