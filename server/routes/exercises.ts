/** Rotas de exercícios (montadas em `/api/exercises`). */
import { Router } from 'express'
import { exerciseResultsRepo } from '../db/repositories/exerciseResults'
import { vocabRepo } from '../db/repositories/vocab'
import { rodadaSchema, historicoQuerySchema, recordesQuerySchema, parseOr400, exerciseResultsQuerySchema } from '../validation'
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
    const gravacao = await exerciseResultsRepo.addRodada(req.userId, payload)
    res.json(gravacao)

    /**
     * A DIFICULDADE PASSA A TER GATILHO — este era o chamador que faltava.
     *
     * `recalcularDificuldade` estava escrita, testada em dois arquivos de integração, e sem um
     * único chamador de produção. O efeito medido na auditoria de 07/09: `difficulty_score` NULL
     * em 2.818 de 2.818 cartões, `palavrasDificeis` sempre `[]`, o recorte "difíceis" do filtro
     * facetado e a estratégia `em-dificuldade` selecionando nada. Uma função correta que ninguém
     * chama entrega o mesmo que uma função que não existe.
     *
     * SÓ OS CARTÕES DA RODADA, e não a varredura de 7 dias: é o desempenho DESTES itens que
     * acabou de mudar. A varredura larga continua disponível pela mesma função (sem `cardIds`)
     * para quando houver um job.
     *
     * DEPOIS do `res.json`, e é deliberado: quem jogou já recebeu a confirmação da rodada. O
     * recálculo alimenta uma tela que ele vai abrir depois, e não vale segurar a resposta por ele.
     * Falha aqui é `warn`, nunca 500 — a rodada está gravada, e é isso que a pessoa fez.
     */
    const cardIds = [...new Set(payload.itens.map((i) => i.cardId).filter((x): x is string => !!x))]
    if (cardIds.length) {
      void vocabRepo.recalcularDificuldade(req.userId, cardIds).catch((err) => {
        erroDeRota(err, { status: 200, event: 'dificuldade_pos_rodada', route: req.path, requestId: req.requestId })
      })
    }
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'exercises_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/* `POST /exercises/results` SAIU (auditoria de 2026-09-07, achado A53).
   Era o gravador POR ITEM, anterior a `/rodada`, e continuava roteado so para o Estudo: schema
   proprio (sem `cardId`), sem `roundId` para agrupar, e as metricas liam as duas formas do mesmo
   dado. O Estudo passou a gravar por `/rodada`, como os nove jogos. */
