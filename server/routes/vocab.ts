/** Rotas de vocabulário/SRS (montadas em `/api/vocab`). */
import { Router } from 'express'
import { vocabRepo } from '../db/repositories/vocab'
import type { Grade } from '../../src/core/learning/scheduler'
import {
  bulkAddCardsSchema, parseOr400, reviewGradeSchema, relabelVocabSchema,
  idParamSchema, vocabParaJogoQuerySchema, vocabPaginaQuerySchema, patchVocabSchema,
} from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'

export const vocabRouter = Router()

vocabRouter.get('/', async (req, res) => {
  res.json(await vocabRepo.list(req.userId))
})

/**
 * SELEÇÃO PARA JOGO (F4) — no servidor, onde os índices trabalham.
 * Antes o cliente baixava o baralho inteiro a cada fim de rodada e filtrava em JS.
 */
vocabRouter.get('/para-jogo', async (req, res) => {
  // F11-04: o `as never` saiu daqui. Os enums são validados no schema, então o que chega ao
  // repositório já tem o tipo que ele declara — em vez de o compilador acreditar no cliente.
  const q = parseOr400(vocabParaJogoQuerySchema, req.query, res)
  if (!q) return
  try {
    res.json(await vocabRepo.selecionarParaJogo(req.userId, {
      fonte: q.fonte ?? 'baralho',
      fonteRef: q.fonteRef ?? null,
      dificuldade: q.dificuldade,
      estrategia: q.estrategia ?? 'equilibrado',
      limite: q.limite,
      evitar: q.evitar,
      lang: q.lang ?? null,
    }))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Página do catálogo (F5): busca, filtros e ordenação resolvidos no servidor. */
vocabRouter.get('/pagina', async (req, res) => {
  const q = parseOr400(vocabPaginaQuerySchema, req.query, res)
  if (!q) return
  try {
    res.json(await vocabRepo.listarPagina(req.userId, {
      limite: q.limite,
      cursor: q.cursorValor !== undefined && q.cursorId ? { valor: q.cursorValor, id: q.cursorId } : null,
      busca: q.q,
      niveis: q.niveis,
      origens: q.origens,
      desde: q.desde,
      ate: q.ate,
      ordem: q.ordem ?? 'recentes',
    }))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Z3: instrumentação da distribuição por faixa — o drift precisa ser um número observável. */
vocabRouter.get('/distribuicao-dificuldade', async (req, res) => {
  try {
    const d = await vocabRepo.distribuicaoDeDificuldade(req.userId)
    // Log estruturado: é assim que a concentração vira métrica em produção, não reclamação.
    log('info', { event: 'dificuldade_distribuicao', requestId: req.requestId, maiorFaixaPct: d.maiorFaixaPct, tipoDeCorte: d.cortes.tipo, total: d.total })
    res.json(d)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Z2: quando a contagem de ocorrências começou a valer, para a tela poder declarar. */
vocabRouter.get('/inicio-da-contagem', async (req, res) => {
  try {
    res.json(await vocabRepo.inicioDaContagem(req.userId))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Ocorrências de um cartão (F5): linha do tempo, origens e contextos. */
vocabRouter.get('/:id/ocorrencias', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    res.json(await vocabRepo.ocorrencias(req.userId, p.id))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

vocabRouter.post('/bulk-add', async (req, res) => {
  const payload = parseOr400(bulkAddCardsSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await vocabRepo.bulkAdd(req.userId, payload.cards))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * Reetiquetagem de idioma (Auditoria). Recebe SÓ o que o usuário confirmou na tela — o servidor não
 * classifica nem deduz nada aqui; a decisão foi dele.
 */
vocabRouter.post('/relabel', async (req, res) => {
  // P2-1: array sem teto virava um UPDATE por item num laço.
  const payload = parseOr400(relabelVocabSchema, req.body, res)
  if (!payload) return
  try {
    res.json({ changed: await vocabRepo.relabel(req.userId, payload.items) })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * Edição de um cartão pela curadoria: tradução e presença no baralho.
 * Só estes dois campos — o resto do cartão (agendamento, idioma, frase) tem donos próprios.
 */
vocabRouter.patch('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(patchVocabSchema, req.body, res)
  if (!body) return
  try {
    const patch: { back?: string; inDeck?: boolean } = {}
    if (body.back !== undefined) patch.back = body.back
    if (body.inDeck !== undefined) patch.inDeck = body.inDeck
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nada a alterar' })
    const card = await vocabRepo.patch(req.userId, p.id, patch)
    if (!card) return res.status(404).json({ error: 'card não encontrado' })
    res.json(card)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

vocabRouter.post('/:id/review', async (req, res) => {
  // P2-1: era `(req.body?.grade ?? 3) as Grade` — cast sem checagem, e o valor entrava no
  // FSRS e era persistido em `review_logs.grade`, corrompendo o histórico do usuário.
  const payload = parseOr400(reviewGradeSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await vocabRepo.review(req.userId, req.params.id, payload.grade as Grade))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'vocab_route_error', route: req.path, requestId: req.requestId }) })
  }
})

vocabRouter.delete('/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  await vocabRepo.remove(req.userId, p.id)
  res.json({ ok: true })
})
