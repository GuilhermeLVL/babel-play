/** Rota de métricas (montada em `/api/metrics`). */
import { Router } from 'express'
import { computeProfile, computeXpHistory } from '../db/repositories/metrics'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import { seedSpendSchema, parseOr400, metricsProfileQuerySchema, metricsXpQuerySchema } from '../validation'
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
