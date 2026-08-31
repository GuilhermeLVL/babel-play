/** Rota de métricas (montada em `/api/metrics`). */
import { Router } from 'express'
import { computeProfile, computeXpHistory } from '../db/repositories/metrics'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import { economiaRepo } from '../db/repositories/economia'
import { diaLocal, sequencias } from '../../src/core/learning/economia'
import { seedSpendSchema, seedCreditSchema, presencaSchema, parseOr400, metricsProfileQuerySchema, metricsXpQuerySchema } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'

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
    res.status(500).json({ error: erroDeRota(err, { event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
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
    res.status(500).json({ error: erroDeRota(err, { event: 'metrics_xp_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * Gasta seeds. Fica em `/api/metrics` porque é aqui que o saldo é calculado — separar o débito
 * do lugar que soma daria dois donos para o mesmo número.
 *
 * IDEMPOTENTE por `spendId`: reenviar a mesma compra devolve 200 com `jaExistia: true` em vez de
 * cobrar de novo. O cliente não precisa distinguir "deu certo" de "já tinha dado certo" — nos dois
 * casos a compra está paga uma vez só.
 *
 * A resposta traz o saldo recalculado para a tela não ter de pedir as métricas inteiras de volta
 * só para atualizar um número.
 */
metricsRouter.post('/seeds/gastar', async (req, res) => {
  const payload = parseOr400(seedSpendSchema, req.body, res)
  if (!payload) return
  try {
    const { linha, jaExistia } = await seedSpendsRepo.debitar(req.userId, payload)
    const perfil = await computeProfile(req.userId)
    res.json({ jaExistia, gasto: linha.amount, seedsGastas: perfil.seedsGastas })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
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
    res.status(500).json({ error: erroDeRota(err, { event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Crédito avulso (conquista): idempotente por `creditoId`, o gêmeo de `/seeds/gastar`. */
metricsRouter.post('/seeds/creditar', async (req, res) => {
  const payload = parseOr400(seedCreditSchema, req.body, res)
  if (!payload) return
  try {
    const { jaExistia } = await economiaRepo.creditar(req.userId, payload)
    const totais = await economiaRepo.totaisCreditados(req.userId)
    res.json({ jaExistia, ...totais })
  } catch (err) {
    res.status(500).json({ error: erroDeRota(err, { event: 'metrics_route_error', route: req.path, requestId: req.requestId }) })
  }
})
