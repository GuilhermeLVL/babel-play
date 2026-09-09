/** Rota de métricas (montada em `/api/metrics`). */
import { type Request, type Response, Router } from 'express'

import {
  autorizarGasto,
  CONQUISTAS_CONFERIVEIS,
  ehRecusa,
  itensSorteaveisNoDrop,
  roundIdDoDrop,
  sortearItemDoDrop,
  valorDoCredito,
  valorDoDrop,
} from '../../src/core/economiaAutoridade'
import type { ContextoDeConquistas } from '../../src/core/learning/conquistas'
import { diaLocal, sequencias } from '../../src/core/learning/economia'
import { economiaRepo } from '../db/repositories/economia'
import { exerciseResultsRepo } from '../db/repositories/exerciseResults'
import { computeProfile, computeXpHistory } from '../db/repositories/metrics'
import { economiaDoUsuario } from '../db/repositories/metrics'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
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
    res
      .status(500)
      .json({
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
    res
      .status(500)
      .json({
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
    const perfil = await computeProfile(req.userId)
    res.json({ jaExistia, gasto: linha.amount, seedsGastas: perfil.seedsGastas })
  } catch (err) {
    res
      .status(400)
      .json({
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
    res
      .status(500)
      .json({
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
 * QUATRO GUARDAS, nesta ordem:
 *
 *  1. A RODADA TEM DE EXISTIR E SER DESTA CONTA. É a âncora do baú. Sem ela, um `roundId`
 *     inventado — e `creditoId` é uma string livre de 8 a 80 caracteres no Zod — viraria um item
 *     por request, em loop, que é literalmente o furo que a auditoria de 01/09 fechou do lado das
 *     Seeds. `listarPorRodada` já filtra por `user_id`, então a rodada de outra pessoa não conta.
 *  2. IDEMPOTÊNCIA POR RODADA, e ela é mais forte que o `ON CONFLICT`: um baú já aberto devolve o
 *     MESMO item, lido do razão da linha gravada, sem sortear de novo. Sem esta leitura, o retry
 *     do cliente (ou a remontagem da tela) mostraria um item diferente do que foi creditado —
 *     o banco continuaria certo e a tela mentiria.
 *  3. O SORTEIO É DO SERVIDOR, sobre o que a pessoa ainda NÃO tem (compras da Loja + baús
 *     anteriores). Coleção completa devolve `item: null` e não grava nada: um baú de duplicata é
 *     pior do que baú nenhum, e gravar um crédito vazio consumiria a rodada à toa.
 *  4. `valorDoDrop` confere o item de novo antes de gravar, porque `reason` é a coluna de onde a
 *     posse é derivada.
 *
 * `Math.random()` basta: o baú está preso a um `roundId` que só se gasta uma vez e não tem
 * reroll, então adivinhar o próximo item não compra nada — não há decisão que a pessoa possa
 * tomar com essa informação.
 */
async function creditarDrop(req: Request, res: Response, creditoId: string, roundId: string): Promise<void> {
  const linhas = await exerciseResultsRepo.listarPorRodada(req.userId, roundId)
  if (!linhas.length) {
    responderErro(res, 400, 'rodada inexistente para este drop', 'rodada_inexistente', { roundId })
    return
  }

  const drops = await economiaRepo.dropsSorteados(req.userId)
  const jaAberto = drops.find((d) => d.creditoId === creditoId)
  if (jaAberto) {
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({ jaExistia: true, item: jaAberto.itemId, ...totais })
    return
  }

  const jaPossui = new Set([...(await seedSpendsRepo.itensComprados(req.userId)), ...drops.map((d) => d.itemId)])
  const sorteado = sortearItemDoDrop(Math.random(), itensSorteaveisNoDrop(jaPossui))
  if (!sorteado) {
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({ jaExistia: false, item: null, ...totais })
    return
  }

  const credito = valorDoDrop(creditoId, sorteado.id)
  if (ehRecusa(credito)) {
    /* Inalcançável enquanto `itensSorteaveisNoDrop` e `valorDoDrop` concordarem — e é exatamente
       por isso que a guarda fica: o dia em que elas divergirem, o certo é 400, não gravar posse. */
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
  res.json({ jaExistia, item: sorteado.id, ...totais })
}

metricsRouter.post('/seeds/creditar', async (req, res) => {
  const payload = parseOr400(seedCreditSchema, req.body, res)
  if (!payload) return
  try {
    /* A família de drop desvia ANTES de `valorDoCredito` — ela não sabe o item, e recusa de
       propósito (ver o comentário lá). Qualquer outro `creditoId` segue o fluxo de sempre. */
    const roundId = roundIdDoDrop(payload.creditoId)
    if (roundId) {
      await creditarDrop(req, res, payload.creditoId, roundId)
      return
    }

    const credito = valorDoCredito(payload.creditoId)
    if (ehRecusa(credito)) {
      responderErro(res, 400, credito.erro, 'credito_desconhecido')
      return
    }

    /* Uma leitura de economia serve às DUAS conferências abaixo, e nenhuma das duas roda quando o
       crédito não exige nada — `computeProfile` varre cinco tabelas e não vale pagá-lo à toa. */
    const precisaDeEconomia =
      credito.nivelMinimo > 0 || (credito.conquista != null && CONQUISTAS_CONFERIVEIS.has(credito.conquista.id))
    if (precisaDeEconomia) {
      const { metricas, nivel } = await economiaDoUsuario(req.userId)

      /* O NÍVEL É DO SERVIDOR. A tela do passe já esconde a década trancada, mas esconder é
         desenho, não regra: sem esta linha o cofre de 172 Seeds da década 10 sairia no nível 1
         para quem pedisse a rota direto. */
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
        const { atual, meta } = credito.conquista.progresso(ctx)
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
    res
      .status(500)
      .json({
        error: erroDeRota(err, {
          status: 500,
          event: 'metrics_route_error',
          route: req.path,
          requestId: req.requestId,
        }),
      })
  }
})
