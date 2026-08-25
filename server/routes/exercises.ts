/** Rotas de exercícios (montadas em `/api/exercises`). */
import { Router } from 'express'
import { exerciseResultsRepo } from '../db/repositories/exerciseResults'
import { exerciseResultSchema, rodadaSchema, historicoQuerySchema, recordesQuerySchema, parseOr400, exerciseResultsQuerySchema } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'

export const exercisesRouter = Router()

/**
 * O que já apareceu, agregado por item. É a leitura que faltava para a interface poder dizer
 * o que vem, repetir uma rodada e não repetir o que a pessoa já acertou.
 * Filtros opcionais: `?origem=baralho&desde=<epoch-ms>`.
 */
exercisesRouter.get('/historico', async (req, res) => {
  const q = parseOr400(historicoQuerySchema, req.query, res)
  if (!q) return
  res.json(await exerciseResultsRepo.listarHistoricoPorItem(req.userId, q))
})

/**
 * O melhor placar de cada jogo. `score` era gravado desde sempre e nunca lido — esta rota é o
 * caminho de volta. Filtro opcional `?origem=`: bater recorde no A1 da trilha e no baralho
 * inteiro não são a mesma proeza, e misturar os dois faria o alvo parecer inalcançável.
 */
exercisesRouter.get('/recordes', async (req, res) => {
  const q = parseOr400(recordesQuerySchema, req.query, res)
  if (!q) return
  res.json(await exerciseResultsRepo.listarRecordes(req.userId, q))
})

/**
 * `?origem=` recorta no BANCO o que a tela de jogos já descartava no cliente. Sem ele, cada fim
 * de rodada baixava a tabela inteira — e a corrente de rodadas é justamente o que faz essa tabela
 * crescer depressa. `sessionId` continua valendo e tem precedência (é o filtro mais específico).
 */
exercisesRouter.get('/results', async (req, res) => {
  const q = parseOr400(exerciseResultsQuerySchema, req.query, res)
  if (!q) return
  const { sessionId, origem } = q
  const rows = sessionId
    ? await exerciseResultsRepo.listBySession(req.userId, sessionId)
    : origem
      ? await exerciseResultsRepo.listByOrigem(req.userId, origem)
      : await exerciseResultsRepo.list(req.userId)
  res.json(rows)
})

/**
 * UMA rodada, UMA requisição (F3). O cliente fazia `Promise.all` de N POSTs — 20 itens viravam
 * 20 requests e ~60 queries, e uma falha parcial deixava a rodada meio gravada em silêncio.
 */
exercisesRouter.post('/rodada', async (req, res) => {
  const payload = parseOr400(rodadaSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await exerciseResultsRepo.addRodada(req.userId, payload))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'exercises_route_error', route: req.path, requestId: req.requestId }) })
  }
})

exercisesRouter.post('/results', async (req, res) => {
  const payload = parseOr400(exerciseResultSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await exerciseResultsRepo.add(req.userId, payload))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'exercises_route_error', route: req.path, requestId: req.requestId }) })
  }
})
