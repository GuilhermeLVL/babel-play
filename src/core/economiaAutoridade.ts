import { type Conquista,CONQUISTAS } from './learning/conquistas'
import { CATALOGO_DA_LOJA, type ItemDaLoja, type Raridade } from './loja'
import { type SlotDoPasse,slotsDoPasse } from './passe'

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

  /* A FAMÍLIA DE DROP NÃO SE RESOLVE AQUI, e a recusa é explícita para não ser confundida com um
     id inventado. Esta função traduz id -> valor, e o valor de um drop depende do ITEM SORTEADO —
     que não está no id e nem poderia estar: se estivesse, o cliente escolheria o item ao escolher
     o `creditoId`, que é exatamente o furo que o desenho do drop existe para fechar. Quem credita
     um drop é `valorDoDrop(creditoId, itemId)`, chamada pela rota DEPOIS de o servidor sortear. */
  if (roundIdDoDrop(creditoId)) {
    return { erro: 'crédito de drop não se resolve pelo id: o item é sorteado pelo servidor' }
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

/* ── DROP: o cosmético que cai no fim da rodada ─────────────────────────────────────────────── */

/**
 * O CANAL DE DROP, e por que ele NÃO é uma quinta porta da Loja.
 *
 * A versão que existia no ramo de trabalho (`src/lib/drops.ts`) estava errada de três jeitos, e os
 * três são o mesmo erro: o cliente decidindo. (1) chamava `creditarSeeds({creditoId, amount,
 * reason})` — `amount` e `reason` já tinham SAÍDO do contrato justamente porque eram a cunhagem de
 * moeda pelo corpo do pedido; (2) o `creditoId` era `drop-partida-bau-${Date.now()}`, e o relógio
 * dentro do id destrói a única idempotência que existe aqui, que é POR `creditoId` (índice único
 * em `seed_credits`) — cada montagem da tela viraria um baú novo; (3) `drop-partida-bau-*` não
 * casava nenhuma família de `valorDoCredito`, então levava 400 de qualquer maneira.
 *
 * O DESENHO QUE VALE:
 *
 * · `ItemDaLoja` não tem campo `canal`. As quatro portas de obtenção (nível, Seeds, conquista,
 *   Créditos) são DERIVADAS dos campos que o item já tem. Um campo `canal: 'drop'` faria o item
 *   existir num quinto lugar e obrigaria toda régua a crescer um caso. Então o drop não é uma
 *   porta: ele SORTEIA entre itens que já têm porta. Uma régua só continua valendo.
 *
 * · `creditoId` = `drop:<roundId>`. Um drop por RODADA. A rodada é um fato gravado
 *   (`exercise_results.round_id`, via `POST /api/exercises/rodada`), com dono e com carimbo de
 *   tempo: ancorar o baú nela é o que impede tanto o baú repetido quanto o baú sem partida.
 *
 * · QUEM SORTEIA É O SERVIDOR. Se o cliente escolhesse o item, escolheria o lendário — é a mesma
 *   lição do `amount` que a auditoria de 01/09 cobrou. O cliente diz "terminei a rodada R"; o
 *   servidor diz o que caiu.
 */

/**
 * AS SEEDS QUE ACOMPANHAM O DROP.
 *
 * Cinco, que é exatamente `PESOS_SEEDS.rodadaPerfeita` — o maior bônus POR RODADA que a economia
 * já tinha. O número não é estético: ele fixa o teto do que o drop pode fazer com a moeda. Uma
 * rodada perfeita de 20 itens rende 25 Seeds (20 acertos + 5 da rodada limpa); o drop soma no
 * máximo mais 5, ou seja +20% no melhor caso, e nunca mais do que jogar sem errar já paga.
 *
 * A RECOMPENSA DE VERDADE É O ITEM, e ela é grande: um comum vale 40-60 Seeds de catálogo, um raro
 * 100-140. Pôr Seeds altas aqui somaria uma segunda renda por rodada em cima de um prêmio que já
 * vale de 8 a 28 rodadas perfeitas — e a economia v2 foi calibrada para o lendário sair em ≈ 1
 * semana de uso diário. Cinco é o valor que faz o baú parecer um bônus sem reescrever essa
 * calibragem. Zero também fecharia a conta, mas deixaria a linha do ledger sem nada além do razão.
 */
export const SEEDS_DO_DROP = 5

/**
 * O PESO DE CADA RARIDADE NO SORTEIO.
 *
 * Só comum e raro entram (ver `itensSorteaveisNoDrop`), e a proporção é 3 para 1. Épico e lendário
 * ficam de fora porque são o TOPO da escada de preço (200-260 e 380-600 Seeds): entregá-los de
 * graça no fim de uma rodada apagaria o motivo de poupar, que é a única mecânica de longo prazo
 * que esta economia tem. O drop existe para dar um empurrão, não para substituir a Loja.
 */
export const PESOS_DO_DROP: Readonly<Record<'comum' | 'raro', number>> = { comum: 75, raro: 25 }

/**
 * `drop:<roundId>` -> roundId, ou null se o crédito não for desta família.
 *
 * Recusa `roundId` com `:` porque o dois-pontos é o separador que todas as outras famílias usam, e
 * um roundId com `:` tornaria `drop:a:b` ambíguo. O gerador real não produz isso (`Play.tsx`:
 * `${gameId}-${Date.now()}-${aleatorio}`), então a regra não custa nada e fecha a ambiguidade
 * antes de ela existir.
 */
export function roundIdDoDrop(creditoId: string): string | null {
  if (!creditoId.startsWith('drop:')) return null
  const roundId = creditoId.slice('drop:'.length)
  if (!roundId || roundId.includes(':')) return null
  return roundId
}

/**
 * O item pode cair num baú? Quatro perguntas, todas respondidas por campos que o item JÁ tem —
 * nenhuma delas precisa de um `canal` novo no catálogo.
 *
 *  1. `exclusivoDe` fora. Conquista não se sorteia: o que separa o tema Aurora de qualquer outro
 *     lendário é EXATAMENTE ter sido conquistado. Um baú que o entrega apaga a conquista inteira.
 *  2. `precoCreditos` fora. Créditos é a moeda que custou dinheiro; sortear de graça o que outra
 *     pessoa pagou é o furo mais caro que este arquivo pode abrir.
 *  3. Só comum e raro (ver `PESOS_DO_DROP`).
 *  4. `precoSeeds` obrigatório. ESTA É A LINHA QUE NÃO ESTAVA NO DESENHO ORIGINAL e que foi
 *     acrescentada aqui: sem ela o baú sorteia `fonte-padrao`, `pos-topo`, `cur-padrao`, `ras-off`
 *     e `pack-classico` — itens de nível 1 e sem preço, que TODA pessoa já tem desde o primeiro
 *     minuto e que a posse (derivada de compras) nunca vai listar como possuídos. O baú entregaria
 *     o nada, repetidamente, e ainda gastaria a rodada. "Ter porta", aqui, quer dizer ter a porta
 *     das Seeds: só é prêmio o que custaria alguma coisa.
 */
function ehSorteavelNoDrop(item: ItemDaLoja): boolean {
  if (item.exclusivoDe) return false
  if (item.precoCreditos !== undefined) return false
  if (item.raridade !== 'comum' && item.raridade !== 'raro') return false
  return item.precoSeeds !== undefined
}

/**
 * Os itens que um drop pode entregar AGORA: os sorteáveis menos o que a pessoa já tem.
 *
 * `jaPossui` vem do razão dos eventos (`seed_spends.reason LIKE 'loja:%'` mais
 * `seed_credits.reason LIKE 'drop:%'`), nunca do navegador — é a mesma fonte de onde
 * `itensComprados` já deriva a posse. Item repetido não é prêmio: sem esta subtração, quem já
 * comprou tudo o que é comum abriria baús de duplicata sem nunca saber por quê.
 *
 * A ordem é a do catálogo, que é estável — é o que torna `sortearItemDoDrop` reprodutível dado o
 * mesmo float.
 */
export function itensSorteaveisNoDrop(jaPossui: ReadonlySet<string>): ItemDaLoja[] {
  return CATALOGO_DA_LOJA.filter((i) => ehSorteavelNoDrop(i) && !jaPossui.has(i.id))
}

/**
 * O SORTEIO, puro e determinístico: mesmo float, mesma lista, mesmo item.
 *
 * O float entra por parâmetro em vez de sair de um `Math.random()` aqui dentro por um motivo de
 * teste: uma função que sorteia sozinha só pode ser verificada por amostragem, e o que se quer
 * provar é a REGRA (o corte em 75%, qual item sai de cada faixa), não uma média.
 *
 * DUAS ETAPAS, e não uma roleta item a item. A roleta simples (peso do item = peso da raridade)
 * faria a chance de um raro depender de QUANTOS raros ainda faltam: com 20 comuns e 10 raros o
 * raro sairia em ~14% das vezes, e essa porcentagem mudaria sozinha à medida que a coleção enche —
 * a pessoa veria a taxa variar sem nenhuma regra ter mudado. Aqui o corte é sempre 75/25: primeiro
 * a faixa, depois um item uniforme dentro dela. Faixa vazia devolve toda a probabilidade à outra,
 * que é o comportamento óbvio para quem já colecionou metade.
 */
export function sortearItemDoDrop(sorteio: number, elegiveis: ItemDaLoja[]): ItemDaLoja | null {
  const comuns = elegiveis.filter((i) => i.raridade === 'comum')
  const raros = elegiveis.filter((i) => i.raridade === 'raro')
  if (!comuns.length && !raros.length) return null

  /* Float defeituoso (NaN, negativo, >= 1) vira 0 em vez de derrubar a rota: um baú é bônus, e um
     bônus não pode ser capaz de transformar o fim de rodada em erro. */
  const f = Number.isFinite(sorteio) ? Math.min(0.999999999, Math.max(0, sorteio)) : 0

  const pesoComum = comuns.length ? PESOS_DO_DROP.comum : 0
  const pesoRaro = raros.length ? PESOS_DO_DROP.raro : 0
  const corte = pesoComum / (pesoComum + pesoRaro)

  const balde = f < corte ? comuns : raros
  const dentro = f < corte
    ? (corte > 0 ? f / corte : 0)
    : (corte < 1 ? (f - corte) / (1 - corte) : 0)

  return balde[Math.min(balde.length - 1, Math.floor(dentro * balde.length))]
}

/**
 * O CRÉDITO DE UM DROP JÁ SORTEADO — a régua que a rota atravessa antes de gravar.
 *
 * Sem esta função a rota gravaria o `reason` que tivesse em mãos, e `drop:<itemId>` é a coluna de
 * onde a posse é derivada: seria o furo de 01/09 outra vez, agora pela porta do baú. Por isso ela
 * confere DUAS coisas — que o item existe no catálogo e que ele seria sorteável — mesmo sabendo
 * que quem chama acabou de sortear de uma lista que já passou por `itensSorteaveisNoDrop`. A
 * conferência dupla custa uma busca em array e é o que impede a próxima rota, escrita por outra
 * pessoa daqui a seis meses, de entregar `tema-custom` num baú.
 *
 * O que NÃO se confere aqui é a POSSE: esta função não sabe quem é a pessoa. Quem subtrai o que já
 * se tem é `itensSorteaveisNoDrop`, com o conjunto lido do banco.
 */
export function valorDoDrop(creditoId: string, itemId: string): CreditoAutorizado | RecusaDeGasto {
  if (!roundIdDoDrop(creditoId)) return { erro: `crédito de drop malformado: ${creditoId.slice(0, 40)}` }
  const item = itemPorId(itemId)
  if (!item) return { erro: `item inexistente: ${itemId}` }
  if (!ehSorteavelNoDrop(item)) return { erro: `${itemId} não sai em drop` }
  return { creditoId, seeds: SEEDS_DO_DROP, xp: 0, reason: `drop:${itemId}`, nivelMinimo: 0 }
}
