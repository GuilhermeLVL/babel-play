/**
 * Rotas do ACERVO Anki (`openspec/changes/motor-anki-acervo`), montadas em `/api/anki`.
 *
 *  - GET    /decks                    → baralhos do usuário, com contagens
 *  - GET    /decks/:id/notas          → notas do baralho, paginadas por cursor (+ filtros)
 *  - POST   /decks/:id/ativar         → projeta o próximo lote (arquivada → cartão jogável)
 *  - POST   /decks/:id/desativar      → arquiva as notas do baralho, sem apagar nada
 *  - DELETE /decks/:id                → purga física (exige `confirmar: true`)
 *  - GET    /imports/:id              → progresso de um import (ledger)
 *
 * TODAS escopadas por `req.userId` — o acervo é privado do importador (decisão jurídica do G0,
 * `design.md` §5.7). Um baralho de outro usuário responde 404 em vez de 403 com dado dentro: o
 * `ankiRepo`/`vocabRepo` já filtram por `(id, userId)` em toda consulta, então "não achei" e "não é
 * seu" são indistinguíveis por fora — o que é a postura certa (não vaza que o id existe).
 */
import { Router } from 'express'

import { ankiRepo } from '../db/repositories/anki'
import { vocabRepo } from '../db/repositories/vocab'
import { erroDeRota } from '../lib/erroDeRota'
import { ankiAtivarSchema, ankiNotasQuerySchema, ankiPurgarSchema,idParamSchema, parseOr400 } from '../validation'

export const ankiRouter = Router()

/**
 * `ankiRepo` não expõe "achar UM deck por id" — só `listarBaralhos` (que já escopa por userId).
 * Reusar essa lista aqui é o jeito de responder 404 (deck alheio ou inexistente são
 * indistinguíveis de propósito — §5.7) sem tocar no repositório, que não é meu para editar.
 */
async function deckDoUsuario(userId: Parameters<typeof ankiRepo.listarBaralhos>[0], deckId: string) {
  const decks = await ankiRepo.listarBaralhos(userId)
  return decks.find((d) => d.id === deckId)
}

ankiRouter.get('/decks', async (req, res) => {
  try {
    res.json(await ankiRepo.listarBaralhos(req.userId))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})

ankiRouter.get('/decks/:id/notas', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const q = parseOr400(ankiNotasQuerySchema, req.query, res)
  if (!q) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) { res.status(404).json({ error: 'baralho não encontrado' }); return }
    const r = await ankiRepo.listarNotas(req.userId, p.id, {
      limite: q.limite,
      cursor: q.cursor ?? null,
      estado: q.estado,
      busca: q.busca,
    })
    res.json(r)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Projeta o próximo lote de notas `arquivada` → cartão jogável (Decisão 3: ativação explícita). */
ankiRouter.post('/decks/:id/ativar', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(ankiAtivarSchema, req.body, res)
  if (!body) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) { res.status(404).json({ error: 'baralho não encontrado' }); return }
    const r = body.limite !== undefined
      ? await vocabRepo.ativarLote(req.userId, p.id, body.limite)
      : await vocabRepo.ativarLote(req.userId, p.id)
    res.json(r)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/** Desativa o baralho: notas viram 'arquivada', nada é apagado (ver `ankiRepo.desativarBaralho`). */
ankiRouter.post('/decks/:id/desativar', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) { res.status(404).json({ error: 'baralho não encontrado' }); return }
    await ankiRepo.desativarBaralho(req.userId, p.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})

/**
 * PURGA física — exige confirmação explícita (S-nenhuma-boa-surpresa, mesmo contrato de
 * `DELETE /api/me`). `review_logs`/`vocab_cards` não são tocados aqui: quem apaga o cartão jogável
 * projetado é uma decisão separada do usuário, não efeito colateral de esvaziar o acervo Anki.
 */
ankiRouter.delete('/decks/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(ankiPurgarSchema, req.body, res)
  if (!body) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) { res.status(404).json({ error: 'baralho não encontrado' }); return }
    const antes = await ankiRepo.listarNotas(req.userId, p.id, { limite: 1 })
    const notasApagadas = antes.total
    await ankiRepo.purgarBaralho(req.userId, p.id)
    res.json({ ok: true, notasApagadas })
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})

ankiRouter.get('/imports/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const r = await ankiRepo.lerImport(req.userId, p.id)
    if (!r) { res.status(404).json({ error: 'import não encontrado' }); return }
    res.json(r)
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }) })
  }
})
