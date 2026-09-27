/** Rota de métricas (montada em `/api/metrics`). */
import { type Request, type Response, Router } from 'express'

import {
  autorizarGasto,
  BAUS_POR_DIA,
  CHANCES_DO_BAU,
  CONQUISTAS_CONFERIVEIS,
  decidirBau,
  ehRecusa,
  ESTRELAS_PARA_O_BAU,
  itensSorteaveisNoDrop,
  progressoNoServidor,
  proximoRaroGarantidoEm,
  raridadeDoBau,
  rodadaRendeBau,
  roundIdDoDrop,
  situacaoDoBau,
  valorDoCredito,
  valorDoDrop,
  valorDoRepetido,
} from '../../src/core/economiaAutoridade'
import type { ContextoDeConquistas } from '../../src/core/learning/conquistas'
import {
  acertosNoDia,
  diaLocal,
  diaNoFuso,
  fusoOuPadrao,
  META_DIARIA_ACERTOS,
  metaDoDiaCumprida,
  sequencias,
} from '../../src/core/learning/economia'
import { maestriaPorJogo, nivelDeMaestria } from '../../src/core/maestria'
import { reembolsosDevidos } from '../../src/core/reembolso'
import { ehAssinanteDaTemporada, nivelDaTemporada, proximaTemporada, temporadaAtual, xpDeTemporada } from '../../src/core/temporada'
import { economiaRepo } from '../db/repositories/economia'
import { exerciseResultsRepo } from '../db/repositories/exerciseResults'
import { computeProfile, computeXpHistory, linhasDoHistoricoDeXp } from '../db/repositories/metrics'
import { economiaDoUsuario } from '../db/repositories/metrics'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import { getPlanForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'
import {
  metricsProfileQuerySchema,
  metricsXpQuerySchema,
  parseOr400,
  presencaSchema,
  seedCreditSchema,
  seedSpendSchema,
} from '../validation'

export const metricsRouter = Router()

/**
 * PERFIL DE MÉTRICAS, opcionalmente com ESCOPO DE SESSÃO.
 *
 *   GET /api/metrics/profile              → a conta inteira (comportamento de sempre)
 *   GET /api/metrics/profile?sessao=<id>  → só aquela gravação
 *
 * O parâmetro segue o padrão que o caminho dos jogos já usa (`/api/vocab/para-jogo?fonte=sessao
 * &fonteRef=<id>`): escopo é dado de entrada, não uma rota separada. Sem ele, a aba de métricas
 * da Sessão não tinha o que chamar e preenchia o vazio com dado da conta inteira.
 */
metricsRouter.get('/profile', async (req, res) => {
  const q = parseOr400(metricsProfileQuerySchema, req.query, res)
  if (!q) return
  try {
    const sessao = q.sessao?.trim() ? q.sessao.trim() : null
    res.json(await computeProfile(req.userId, { sessionId: sessao }))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, {
        status: 500,
        event: 'metrics_route_error',
        route: req.path,
        requestId: req.requestId,
      }),
    })
  }
})

/**
 * A CURVA DE XP no tempo, com os marcos de subida de nível.
 *
 * Rota PRÓPRIA, e não um campo de `/profile`: `computeProfile` já varre cinco tabelas inteiras e
 * roda a cada mudança da lista de gravações e a cada gasto de seeds. Quem paga por este cálculo é
 * a tela que desenha o gráfico, não todas as outras.
 */
metricsRouter.get('/xp', async (req, res) => {
  const q = parseOr400(metricsXpQuerySchema, req.query, res)
  if (!q) return
  try {
    res.json(await computeXpHistory(req.userId, { balde: q.balde ?? 'dia', desde: q.desde || undefined }))
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'metrics_xp_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * GASTA SEEDS — e é aqui que o servidor passou a ser a autoridade sobre o preço.
 *
 * O QUE ESTA ROTA FAZIA ATÉ 01/09: gravava o `amount` e o `reason` que o cliente mandasse. Como a
 * POSSE é derivada do razão (`seed_spends.reason LIKE 'loja:%'`), um POST
 * `{amount: 1, reason: 'loja:tema-custom'}` entregava o lendário de 600 Seeds por 1 — e o servidor
 * passava a ATESTAR essa posse em `itensComprados`. Não havia, também, nenhuma conferência de
 * saldo: dava para gastar o que não se tinha, porque o único guarda era o botão desabilitado na
 * tela, e um cliente adulterado não tem botão.
 *
 * AGORA SÃO TRÊS PORTAS, nesta ordem:
 *   1. o `reason` tem de AUTORIZAR alguma coisa (formato fechado + item existente no catálogo +
 *      exclusivo de conquista nunca à venda) — `autorizarGasto`, em `core/economiaAutoridade`;
 *   2. o `amount` tem de ser o preço do catálogo. Divergência é 400 com o preço certo no corpo,
 *      em vez de cobrar em silêncio um valor diferente do que a tela mostrou;
 *   3. o saldo tem de pagar — 402 dizendo quanto falta.
 *
 * IDEMPOTENTE por `spendId`, como sempre: reenviar a mesma compra devolve 200 com
 * `jaExistia: true` em vez de cobrar de novo. Por isso a conferência de saldo só roda quando a
 * compra ainda NÃO foi cobrada: sem essa guarda, quem gastou as últimas 40 Seeds veria o retry da
 * própria compra ser recusado por saldo insuficiente.
 *
 * CORRIDA CONHECIDA: duas compras DIFERENTES em voo ao mesmo tempo podem passar as duas pela
 * conferência e estourar o saldo em uma delas. Fechar isso exigiria rodar `computeProfile` inteiro
 * dentro de transação — conexão nova, `synchronous=FULL`, fsync por commit (ver `emTransacao` em
 * `db.ts`) — e o ganho seria impedir um item além da conta, contra o que a rota permitia antes:
 * qualquer item por 1 Seed. O ledger continua íntegro e auditável nos dois casos.
 */
metricsRouter.post('/seeds/gastar', async (req, res) => {
  const payload = parseOr400(seedSpendSchema, req.body, res)
  if (!payload) return
  try {
    const autorizacao = autorizarGasto(payload.reason)
    if (ehRecusa(autorizacao)) {
      /* Fase 4 — ENVELOPE UNIFORME. As outras duas recusas DESTA MESMA rota já vinham com `code`
         (`preco_divergente`, `saldo_insuficiente`) e esta saía como `{ error }` solto: a tela
         precisava distinguir por texto, exatamente o que o `code` existe para evitar. O texto de
         `autorizarGasto` continua no `error` — ele diz QUAL item foi recusado e por quê. */
      responderErro(res, 400, autorizacao.erro, 'motivo_desconhecido')
      return
    }
    if (payload.amount !== autorizacao.preco) {
      // Preço divergente é sinal de adulteração OU de tela desatualizada depois de uma mudança de
      // preço. Nos dois casos, recusar e devolver o preço certo é melhor do que cobrar um valor
      // que a pessoa não viu.
      /* `detalhes`, e nao campo avulso no topo: o cliente le UM lugar. Antes o `preco` viajava
         solto e nenhuma tela o lia — o servidor dizia o preco certo e a pessoa via so "erro". */
      responderErro(res, 400, 'preço divergente do catálogo', 'preco_divergente', { preco: autorizacao.preco })
      return
    }
    /* O REENVIO DE UMA COMPRA JÁ PAGA NÃO PEDE SALDO. Quem gastou as últimas 40 Seeds veria o
       retry da própria compra virar 402, e a idempotência deixaria de ser idempotente. */
    const jaCobrado = await seedSpendsRepo.jaGastou(req.userId, payload.spendId)
    let ganhas: number | undefined
    let saldo = 0
    if (!jaCobrado) {
      const economia = await economiaDoUsuario(req.userId)
      ganhas = economia.ganhas
      saldo = economia.saldo
      /* Recusa ANTECIPADA, para o 402 poder dizer quanto falta: o teto dentro do INSERT sabe
         barrar, mas não sabe explicar. As duas conferências usam o mesmo número. */
      if (saldo < autorizacao.preco) {
        responderErro(res, 402, 'saldo insuficiente', 'saldo_insuficiente', {
          falta: autorizacao.preco - saldo,
          saldo,
          preco: autorizacao.preco,
        })
        return
      }
    }
    const { linha, jaExistia, recusadoPorSaldo } = await seedSpendsRepo.debitar(
      req.userId,
      { ...payload, amount: autorizacao.preco },
      { tetoDeGasto: ganhas },
    )
    if (recusadoPorSaldo || !linha) {
      /* Chegou aqui quem passou na conferência e perdeu a corrida para outra compra simultânea.
         O 402 é o mesmo: a diferença é que agora o saldo não estoura. */
      responderErro(res, 402, 'saldo insuficiente', 'saldo_insuficiente', {
        falta: autorizacao.preco,
        saldo,
        preco: autorizacao.preco,
      })
      return
    }
    /* O TOTAL DO RAZÃO, e não o perfil inteiro. Era `(await computeProfile(req.userId)).seedsGastas`
       — uma segunda varredura das cinco tabelas para devolver um número que é `SUM(amount)` de
       `seed_spends`, exatamente o que `computeProfile` põe nesse campo (fix/rotas-caras). */
    const seedsGastas = await seedSpendsRepo.totalGasto(req.userId)
    res.json({ jaExistia, gasto: linha.amount, seedsGastas })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, {
        status: 400,
        event: 'metrics_route_error',
        route: req.path,
        requestId: req.requestId,
      }),
    })
  }
})

/**
 * ECONOMIA v2 (A7) — as duas rotas que o cliente chamava desde 2026-08-28 e que só existiam no
 * servidor efêmero: na conta logada, TODA conquista falhava com 404 permanente e nunca
 * desbloqueava. O contrato (payload e resposta) espelha o efêmero, que é a referência em uso.
 */

/** Presença do dia: idempotente por (usuário, dia local). O `dia` vem do fuso do CLIENTE. */
metricsRouter.post('/presenca', async (req, res) => {
  const payload = parseOr400(presencaSchema, req.body, res)
  if (!payload) return
  try {
    const hojeDoServidor = diaLocal(Date.now())
    const dia = payload.dia ?? hojeDoServidor
    // Fuso real fica a no máximo 1 dia do servidor; 2 de folga barra dia inventado sem
    // rejeitar nenhum fuso legítimo. Dia fora da janela = 400, não presença retroativa.
    if (Math.abs(dia - hojeDoServidor) > 2) {
      /* Fase 4 — ENVELOPE UNIFORME: era `{ error }` solto, sem `code`, enquanto as recusas de
         `/seeds/gastar` já discriminavam por código. Aqui o `code` importa em particular porque a
         causa provável é RELÓGIO do cliente errado, e a tela só consegue dizer isso se souber
         qual recusa recebeu. `detalhes` traz o dia do servidor, que é o que permite comparar. */
      responderErro(res, 400, 'dia fora da janela aceitável', 'dia_fora_da_janela', { diaDoServidor: hojeDoServidor })
      return
    }
    const { jaExistia } = await economiaRepo.registrarPresenca(req.userId, dia)
    const { atual } = sequencias(await economiaRepo.diasDePresenca(req.userId), dia)
    res.json({ jaExistia, dia, streakPresenca: atual })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, {
        status: 500,
        event: 'metrics_route_error',
        route: req.path,
        requestId: req.requestId,
      }),
    })
  }
})

/**
 * CRÉDITO DE CONQUISTA — o valor vem da REGRA, nunca do corpo.
 *
 * O QUE ESTA ROTA FAZIA ATÉ 01/09: creditava o `amount` e o `xp` que o cliente mandasse, com um
 * `creditoId` que era qualquer string de 8 a 80 caracteres. O Zod só conferia formato, com teto de
 * 10.000 em cada campo — e o `xp` entra direto no cálculo de nível (`core/learning/xp.ts`), que
 * destrava o catálogo. Com o teto de escrita de 120 requisições por minuto, isso eram 1,2 milhão
 * de Seeds e 1,2 milhão de XP por minuto.
 *
 * AGORA: o `creditoId` tem de resolver para uma conquista do catálogo, e o que se credita é a
 * recompensa DELA. E, para as onze conquistas cuja condição o servidor sabe conferir
 * (`CONQUISTAS_CONFERIVEIS`), a condição é conferida contra os contadores do servidor antes de
 * creditar — conquista não cumprida é 400.
 */
/**
 * O DROP DE FIM DE RODADA — o único crédito em que o servidor também decide O QUÊ, não só quanto.
 *
 * Toda a família passa por aqui porque `valorDoCredito` não consegue resolvê-la: o valor de um
 * baú depende do ITEM SORTEADO, e o item não está — nem pode estar — no `creditoId`. Se estivesse,
 * escolher o `creditoId` seria escolher o prêmio, e o cliente escolheria o lendário. É a mesma
 * lição do `amount` de 01/09, aplicada ao objeto em vez de ao preço.
 *
 * QUATRO GUARDAS, nesta ordem (e, entre a 2 e a 3, a de DESEMPENHO — duas estrelas nas linhas
 * gravadas, `rodadaRendeBau`, desde 27/09):
 *
 *  1. A RODADA TEM DE EXISTIR E SER DESTA CONTA. É a âncora do baú. Sem ela, um `roundId`
 *     inventado — e `creditoId` é uma string livre de 8 a 80 caracteres no Zod — viraria um item
 *     por request, em loop, que é literalmente o furo que a auditoria de 01/09 fechou do lado das
 *     Seeds. `listarPorRodada` já filtra por `user_id`, então a rodada de outra pessoa não conta.
 *  2. IDEMPOTÊNCIA POR RODADA, e ela é mais forte que o `ON CONFLICT`: um baú já aberto devolve o
 *     MESMO item, lido do razão da linha gravada, sem sortear de novo. Sem esta leitura, o retry
 *     do cliente (ou a remontagem da tela) mostraria um item diferente do que foi creditado —
 *     o banco continuaria certo e a tela mentiria.
 *  3. O SORTEIO É DO SERVIDOR (`decidirBau`, recompensas v2): teto de três baús por dia local,
 *     garantia de raro no 5º seguido, e a faixa sorteada sem peça nova vira Seeds (comum 15,
 *     raro 40) com o `reason` `bau:repetido:<raridade>` — que não atesta posse de nada. A resposta
 *     traz as chances (75/25) e quantos baús faltam para o raro garantido.
 *  4. `valorDoDrop` confere o item de novo antes de gravar, porque `reason` é a coluna de onde a
 *     posse é derivada.
 *
 * `Math.random()` basta: o baú está preso a um `roundId` que só se gasta uma vez e não tem
 * reroll, então adivinhar o próximo item não compra nada — não há decisão que a pessoa possa
 * tomar com essa informação.
 */
async function creditarDrop(
  req: Request,
  res: Response,
  creditoId: string,
  roundId: string,
  fusoPedido: string | undefined,
): Promise<void> {
  const linhas = await exerciseResultsRepo.listarPorRodada(req.userId, roundId)
  if (!linhas.length) {
    responderErro(res, 400, 'rodada inexistente para este drop', 'rodada_inexistente', { roundId })
    return
  }

  /* BAÚ v2 (recompensas v2): o dia do teto é o dia LOCAL de quem joga. */
  const fuso = fusoOuPadrao(fusoPedido)
  const diaDe = (t: number) => diaNoFuso(t, fuso)
  const baus = await economiaRepo.bausAbertos(req.userId)

  const jaAberto = baus.find((b) => b.creditoId === creditoId)
  if (jaAberto) {
    /* IDEMPOTÊNCIA POR RODADA: o baú já aberto devolve o MESMO resultado, lido do razão. */
    const { semRaroSeguidos } = situacaoDoBau(baus, diaDe(Date.now()), diaDe)
    const totais = await economiaRepo.totaisCreditados(req.userId)
    const repetido = jaAberto.reason.startsWith('bau:repetido:')
    res.json({
      jaExistia: true,
      item: repetido ? null : jaAberto.reason.slice('drop:'.length),
      repetido,
      seeds: jaAberto.amount,
      raridade: raridadeDoBau(jaAberto.reason),
      chances: CHANCES_DO_BAU,
      proximoRaroGarantidoEm: proximoRaroGarantidoEm(semRaroSeguidos),
      ...totais,
    })
    return
  }

  const desempenho = rodadaRendeBau(linhas)
  const { bausHoje, semRaroSeguidos } = situacaoDoBau(baus, diaDe(Date.now()), diaDe)
  const jaPossui = new Set([
    ...(await seedSpendsRepo.itensComprados(req.userId)),
    ...baus.filter((b) => b.reason.startsWith('drop:')).map((b) => b.reason.slice('drop:'.length)),
  ])
  const decisao = decidirBau({
    estrelas: desempenho.estrelas,
    bausHoje,
    semRaroSeguidos,
    sorteio: Math.random(),
    elegiveis: itensSorteaveisNoDrop(jaPossui),
  })

  if (decisao.tipo === 'sem-bau' && decisao.motivo === 'estrelas') {
    responderErro(res, 400, 'rodada sem baú: exige duas estrelas', 'rodada_sem_bau', {
      estrelas: desempenho.estrelas,
      exigido: ESTRELAS_PARA_O_BAU,
    })
    return
  }
  if (decisao.tipo === 'sem-bau') {
    /* TETO DO DIA: não é erro de quem pediu, é a regra — 200 sem crédito, dizendo quantos já
       saíram. Nada é gravado, então a mesma rodada amanhã também não vira baú (o baú é da rodada). */
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({
      jaExistia: false,
      item: null,
      semBau: 'teto',
      bausHoje,
      limite: BAUS_POR_DIA,
      chances: CHANCES_DO_BAU,
      proximoRaroGarantidoEm: proximoRaroGarantidoEm(semRaroSeguidos),
      ...totais,
    })
    return
  }

  const credito =
    decisao.tipo === 'item' ? valorDoDrop(creditoId, decisao.item.id) : valorDoRepetido(creditoId, decisao.raridade)
  if (ehRecusa(credito)) {
    /* Inalcançável enquanto `decidirBau` e `valorDoDrop` concordarem — e é por isso que a guarda
       fica: no dia em que divergirem, o certo é 400, não gravar posse. */
    responderErro(res, 400, credito.erro, 'drop_invalido')
    return
  }

  const { jaExistia } = await economiaRepo.creditar(req.userId, {
    creditoId: credito.creditoId,
    amount: credito.seeds,
    xp: credito.xp,
    reason: credito.reason,
  })
  const totais = await economiaRepo.totaisCreditados(req.userId)
  res.json({
    jaExistia,
    item: decisao.tipo === 'item' ? decisao.item.id : null,
    repetido: decisao.tipo === 'seeds',
    seeds: credito.seeds,
    raridade: decisao.raridade,
    chances: CHANCES_DO_BAU,
    proximoRaroGarantidoEm: proximoRaroGarantidoEm(decisao.raridade === 'raro' ? 0 : semRaroSeguidos + 1),
    ...totais,
  })
}

/**
 * O REEMBOLSO DO CORTE DO CATÁLOGO (recompensas v2) — `POST /api/metrics/seeds/reembolso`.
 *
 * O corpo não diz nada: o que é devido sai do RAZÃO de gastos desta conta (`reembolsosDevidos`,
 * no core) menos o que já foi creditado. Cada reembolso é um crédito `reembolso:<reason do gasto>`
 * e a unicidade (usuário, `credito_id`) de `seed_credits` é o que torna dois pedidos simultâneos
 * (duas abas abrindo juntas) um crédito só: o segundo INSERT cai no `ON CONFLICT` e não soma em
 * `creditado`. Repetir o pedido depois devolve `creditado: 0`.
 */
metricsRouter.post('/seeds/reembolso', async (req, res) => {
  try {
    const [gastos, ja] = await Promise.all([seedSpendsRepo.gastos(req.userId), economiaRepo.reembolsos(req.userId)])
    const devidos = reembolsosDevidos(gastos, new Set(ja.map((r) => r.creditoId)))
    let creditado = 0
    for (const d of devidos) {
      const { jaExistia } = await economiaRepo.creditar(req.userId, {
        creditoId: d.creditoId,
        amount: d.seeds,
        xp: 0,
        reason: d.creditoId,
      })
      if (!jaExistia) creditado += d.seeds
    }
    const reembolsado = (await economiaRepo.reembolsos(req.userId)).reduce((n, r) => n + r.amount, 0)
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({ creditado, reembolsado, ...totais })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * A MAESTRIA POR JOGO (recompensas v2, onda 3) — `GET /api/metrics/maestria`.
 *
 * Os 18 jogos com pontos, nível e quanto falta, somados das linhas gravadas (`maestriaPorJogo`,
 * uma vez por `roundId`), e os créditos `maestria:` já lançados — para o cliente pedir os que
 * faltam pela rota de crédito, que confere os pontos de novo antes de gravar. Só leitura.
 */
metricsRouter.get('/maestria', async (req, res) => {
  try {
    const [linhas, creditados] = await Promise.all([
      exerciseResultsRepo.linhasDeMaestria(req.userId),
      economiaRepo.maestriasCreditadas(req.userId),
    ])
    const jogos = maestriaPorJogo(linhas).map((m) => ({ ...m, ...nivelDeMaestria(m.pontos) }))
    res.json({ jogos, creditados })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/**
 * A TEMPORADA (recompensas v2, onda 5) — `GET /api/metrics/temporada`.
 *
 * A temporada em curso (ou `null` fora das datas) e a próxima, o XP da conta ganho DENTRO da janela
 * com o nível que ele dá, se a conta é assinante (plano pago concedido AQUI, nunca pelo cliente) e
 * os créditos `temporada:` já lançados — para o cliente pedir os que faltam pela rota de crédito,
 * que confere tudo de novo. Só leitura; não existe rota que compre nível.
 */
metricsRouter.get('/temporada', async (req, res) => {
  try {
    const agora = new Date()
    const temporada = temporadaAtual(agora)
    const [linhas, plano, creditados] = await Promise.all([
      temporada ? linhasDoHistoricoDeXp(req.userId) : null,
      getPlanForUser(req.userId),
      economiaRepo.temporadasCreditadas(req.userId),
    ])
    const xp = temporada && linhas ? xpDeTemporada(linhas, temporada) : 0
    res.json({
      temporada,
      proxima: proximaTemporada(agora),
      xp,
      nivel: nivelDaTemporada(xp),
      assinante: ehAssinanteDaTemporada(plano),
      creditados,
    })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

metricsRouter.post('/seeds/creditar', async (req, res) => {
  const payload = parseOr400(seedCreditSchema, req.body, res)
  if (!payload) return
  try {
    /* A família de drop desvia ANTES de `valorDoCredito` — ela não sabe o item, e recusa de
       propósito (ver o comentário lá). Qualquer outro `creditoId` segue o fluxo de sempre. */
    const roundId = roundIdDoDrop(payload.creditoId)
    if (roundId) {
      await creditarDrop(req, res, payload.creditoId, roundId, payload.fuso)
      return
    }

    const credito = valorDoCredito(payload.creditoId)
    if (ehRecusa(credito)) {
      responderErro(res, 400, credito.erro, 'credito_desconhecido')
      return
    }

    /* A MAESTRIA (recompensas v2, onda 3): `maestria:<jogo>:<nível>` só credita se os pontos do
       jogo, somados das linhas GRAVADAS desta conta (uma vez por `roundId`), alcançam o limiar do
       nível. Sem isto seriam 20 × 5 Seeds por jogo a qualquer pedido. O reenvio de um nível já
       creditado continua passando (os pontos não diminuem) e cai no `ON CONFLICT`. */
    if (credito.maestria) {
      const { jogo, pontosExigidos } = credito.maestria
      const pontos =
        maestriaPorJogo(await exerciseResultsRepo.linhasDeMaestria(req.userId)).find((m) => m.jogo === jogo)?.pontos ?? 0
      if (pontos < pontosExigidos) {
        responderErro(res, 400, 'nível de maestria ainda não alcançado', 'maestria_nao_alcancada', {
          pontos,
          exigido: pontosExigidos,
        })
        return
      }
    }

    /* A TEMPORADA (onda 5): `temporada:<id>:<nível>:<trilha>` só credita se o XP da conta ganho
       DENTRO da janela alcança nível × 150 — e, na trilha de assinante, se o plano concedido pelo
       servidor é pago. Sem isto a trilha inteira sairia a qualquer pedido, e a de assinante sem
       assinatura. O reenvio de uma casa já creditada continua passando e cai no `ON CONFLICT`. */
    if (credito.temporada) {
      const { temporada, trilha, xpExigido } = credito.temporada
      if (trilha === 'assinante' && !ehAssinanteDaTemporada(await getPlanForUser(req.userId))) {
        responderErro(res, 403, 'a trilha de assinante exige assinatura ativa', 'exige_assinatura')
        return
      }
      const xp = xpDeTemporada(await linhasDoHistoricoDeXp(req.userId), temporada)
      if (xp < xpExigido) {
        responderErro(res, 400, 'nível de temporada ainda não alcançado', 'temporada_nao_alcancada', {
          xp,
          exigido: xpExigido,
        })
        return
      }
    }

    /* Uma leitura de economia serve às conferências abaixo, e nenhuma roda quando o crédito não
       exige nada — `computeProfile` varre cinco tabelas e não vale pagá-lo à toa. */
    const precisaDeEconomia =
      credito.nivelMinimo > 0 ||
      credito.metaDoDia != null ||
      (credito.conquista != null && CONQUISTAS_CONFERIVEIS.has(credito.conquista.id))
    if (precisaDeEconomia) {
      const { metricas, nivel } = await economiaDoUsuario(req.userId)

      /* A META DO DIA (recompensas v2): o dia é de hoje ou de ontem NO FUSO DO USUÁRIO, e os
         acertos daquele dia — revisões certas e itens de jogo certos, gravados no banco —
         alcançam a meta. Sem isto `meta:<dia>` seria 15 Seeds por dia por abrir o app. O reenvio
         de uma meta já creditada cai no `ON CONFLICT` e não chega a pedir nada novo. */
      if (credito.metaDoDia) {
        const fuso = fusoOuPadrao(payload.fuso)
        const agora = Date.now()
        const janela = [diaNoFuso(agora, fuso), diaNoFuso(agora - 86_400_000, fuso)]
        if (!janela.includes(credito.metaDoDia)) {
          responderErro(res, 400, 'dia da meta fora da janela', 'dia_fora_da_janela', { dia: credito.metaDoDia })
          return
        }
        const acertos = acertosNoDia(metricas.acertosRecentes ?? [], credito.metaDoDia, fuso)
        if (!metaDoDiaCumprida(acertos)) {
          responderErro(res, 400, 'meta do dia ainda não cumprida', 'meta_nao_cumprida', {
            acertos,
            meta: META_DIARIA_ACERTOS,
          })
          return
        }
      }

      /* O NÍVEL É DO SERVIDOR. A tela pode esconder o que está trancado, mas esconder é desenho,
         não regra: o nível exigido pelo crédito é conferido aqui. */
      if (nivel < credito.nivelMinimo) {
        responderErro(res, 400, 'nível insuficiente para este crédito', 'nivel_insuficiente', {
          nivel,
          exigido: credito.nivelMinimo,
        })
        return
      }

      if (credito.conquista && CONQUISTAS_CONFERIVEIS.has(credito.conquista.id)) {
        /* As duas chaves que o servidor não sabe preencher (eventos raros e compras da Loja) só
           importam para as conquistas de fora da lista — por isso entram como zero aqui sem
           falsear nenhuma decisão. `idiomas` e `melhorComboPorJogo` SAÍRAM dessa lista: o perfil
           passou a emitir `idiomas` e os recordes passaram a devolver o combo. */
        const ctx: ContextoDeConquistas = {
          metricas,
          nivel,
          melhorComboPorJogo: await exerciseResultsRepo.melhorComboPorJogo(req.userId),
          eventosVistos: 0,
          totalDeEventos: 0,
          idiomas: metricas.idiomas ?? 0,
          compras: metricas.itensComprados?.length ?? 0,
        }
        /* `progressoNoServidor`: a regra da conquista, exceto o Colecionador, cujos eventos vistos
           o servidor não enxerga — para ele valem os pré-requisitos gravados no banco. */
        const { atual, meta } = progressoNoServidor(credito.conquista, ctx)
        if (atual < meta) {
          responderErro(res, 400, 'conquista ainda não cumprida', 'conquista_nao_cumprida', { atual, meta })
          return
        }
      }
    }

    const { jaExistia } = await economiaRepo.creditar(req.userId, {
      creditoId: credito.creditoId,
      amount: credito.seeds,
      xp: credito.xp,
      reason: credito.reason,
    })
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({ jaExistia, ...totais })
  } catch (err) {
    res.status(500).json({
      error: erroDeRota(err, {
        status: 500,
        event: 'metrics_route_error',
        route: req.path,
        requestId: req.requestId,
      }),
    })
  }
})
