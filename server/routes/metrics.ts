/** Rota de métricas (montada em `/api/metrics`). */
import { Router } from 'express'
import { computeProfile, computeXpHistory } from '../db/repositories/metrics'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import { economiaRepo } from '../db/repositories/economia'
import { exerciseResultsRepo } from '../db/repositories/exerciseResults'
import { economiaDoUsuario } from '../db/repositories/metrics'
import {
  autorizarGasto, ehRecusa, valorDoCredito, CONQUISTAS_CONFERIVEIS,
} from '../../src/core/economiaAutoridade'
import type { ContextoDeConquistas } from '../../src/core/learning/conquistas'
import { diaLocal, sequencias } from '../../src/core/learning/economia'
import { seedSpendSchema, seedCreditSchema, presencaSchema, parseOr400, metricsProfileQuerySchema, metricsXpQuerySchema } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'

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
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
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
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'metrics_xp_error', route: req.path, requestId: req.requestId }) })
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
      res.status(400).json({ error: autorizacao.erro })
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
        responderErro(res, 402, 'saldo insuficiente', 'saldo_insuficiente', { falta: autorizacao.preco - saldo, saldo, preco: autorizacao.preco })
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
      responderErro(res, 402, 'saldo insuficiente', 'saldo_insuficiente', { falta: autorizacao.preco, saldo, preco: autorizacao.preco })
      return
    }
    const perfil = await computeProfile(req.userId)
    res.json({ jaExistia, gasto: linha.amount, seedsGastas: perfil.seedsGastas })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
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
      res.status(400).json({ error: 'dia fora da janela aceitável' })
      return
    }
    const { jaExistia } = await economiaRepo.registrarPresenca(req.userId, dia)
    const { atual } = sequencias(await economiaRepo.diasDePresenca(req.userId), dia)
    res.json({ jaExistia, dia, streakPresenca: atual })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
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
metricsRouter.post('/seeds/creditar', async (req, res) => {
  const payload = parseOr400(seedCreditSchema, req.body, res)
  if (!payload) return
  try {
    const credito = valorDoCredito(payload.creditoId)
    if (ehRecusa(credito)) {
      responderErro(res, 400, credito.erro, 'credito_desconhecido')
      return
    }

    /* Uma leitura de economia serve às DUAS conferências abaixo, e nenhuma das duas roda quando o
       crédito não exige nada — `computeProfile` varre cinco tabelas e não vale pagá-lo à toa. */
    const precisaDeEconomia = credito.nivelMinimo > 0
      || (credito.conquista != null && CONQUISTAS_CONFERIVEIS.has(credito.conquista.id))
    if (precisaDeEconomia) {
      const { metricas, nivel } = await economiaDoUsuario(req.userId)

      /* O NÍVEL É DO SERVIDOR. A tela do passe já esconde a década trancada, mas esconder é
         desenho, não regra: sem esta linha o cofre de 172 Seeds da década 10 sairia no nível 1
         para quem pedisse a rota direto. */
      if (nivel < credito.nivelMinimo) {
        responderErro(res, 400, 'nível insuficiente para este crédito', 'nivel_insuficiente', { nivel, exigido: credito.nivelMinimo })
        return
      }

      if (credito.conquista && CONQUISTAS_CONFERIVEIS.has(credito.conquista.id)) {
        /* As duas chaves que o servidor não sabe preencher (eventos raros e compras da Loja) só
           importam para as conquistas de fora da lista — por isso entram como zero aqui sem
           falsear nenhuma decisão. `idiomas` e `melhorComboPorJogo` SAÍRAM dessa lista: o perfil
           passou a emitir `idiomas` e os recordes passaram a devolver o combo. */
        const ctx: ContextoDeConquistas = {
          metricas, nivel,
          melhorComboPorJogo: await exerciseResultsRepo.melhorComboPorJogo(req.userId),
          eventosVistos: 0, totalDeEventos: 0,
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
    res.status(500).json({ error: erroDeRota(err, { status: 500, event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
  }
})
