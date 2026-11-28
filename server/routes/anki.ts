/**
 * Rotas do ACERVO Anki (`openspec/changes/motor-anki-acervo`), montadas em `/api/anki`.
 *
 *  - GET    /decks                    → baralhos do usuário, com contagens
 *  - GET    /decks/:id/notas          → notas do baralho, paginadas por cursor (+ filtros)
 *  - POST   /decks/:id/ativar         → projeta o próximo lote (arquivada → cartão jogável)
 *  - POST   /decks/:id/desativar      → arquiva as notas do baralho, sem apagar nada
 *  - DELETE /decks/:id                → purga física (exige `confirmar: true`)
 *  - GET    /decks/:id/estruturas     → os tipos de nota do baralho, com os campos reais e o palpite de papéis
 *  - POST   /decks/:id/remapear       → refaz frente/verso/exemplo de `campos_brutos` com os papéis escolhidos
 *  - GET    /imports/:id              → progresso de um import (ledger)
 *  - POST   /imports, /imports/:id/notas, /imports/:id/fechar → importação em lotes
 *                                       (`server/routes/ankiImports.ts`)
 *
 * TODAS escopadas por `req.userId` — o acervo é privado do importador (decisão jurídica do G0,
 * `design.md` §5.7). Um baralho de outro usuário responde 404 em vez de 403 com dado dentro: o
 * `ankiRepo`/`vocabRepo` já filtram por `(id, userId)` em toda consulta, então "não achei" e "não é
 * seu" são indistinguíveis por fora — o que é a postura certa (não vaza que o id existe).
 */
import { Router } from 'express'

import {
  type EstruturaLida,
  inferirMapeamento,
  limparCampo,
  mapeamentoServe,
  type PapelNaImportacao,
} from '../../src/core/anki'
import { ankiRepo, type NotaParaRemapear } from '../db/repositories/anki'
import { vocabRepo } from '../db/repositories/vocab'
import { decidirRemapeamento } from '../import/remapearNotas'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'
import {
  ankiAtivarSchema,
  ankiNotasQuerySchema,
  ankiPurgarSchema,
  ankiRemapearSchema,
  idParamSchema,
  parseOr400,
} from '../validation'
import { ankiImportsRouter } from './ankiImports'

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
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

ankiRouter.get('/decks/:id/notas', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const q = parseOr400(ankiNotasQuerySchema, req.query, res)
  if (!q) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    const r = await ankiRepo.listarNotas(req.userId, p.id, {
      limite: q.limite,
      cursor: q.cursor ?? null,
      estado: q.estado,
      busca: q.busca,
    })
    res.json(r)
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Projeta o próximo lote de notas `arquivada` → cartão jogável (Decisão 3: ativação explícita). */
ankiRouter.post('/decks/:id/ativar', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(ankiAtivarSchema, req.body, res)
  if (!body) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    const r =
      body.limite !== undefined
        ? await vocabRepo.ativarLote(req.userId, p.id, body.limite)
        : await vocabRepo.ativarLote(req.userId, p.id)
    res.json(r)
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Desativa o baralho: notas viram 'arquivada', nada é apagado (ver `ankiRepo.desativarBaralho`). */
ankiRouter.post('/decks/:id/desativar', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    await ankiRepo.desativarBaralho(req.userId, p.id)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
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
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    const antes = await ankiRepo.listarNotas(req.userId, p.id, { limite: 1 })
    const notasApagadas = antes.total
    await ankiRepo.purgarBaralho(req.userId, p.id)
    res.json({ ok: true, notasApagadas })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Corta o texto de amostra: a tela só precisa reconhecer o campo, não ler o conteúdo inteiro. */
const AMOSTRA_MAX = 80

/**
 * Os tipos de nota do baralho com os campos REAIS (nomes e três notas de amostra) e o palpite de papéis: o que o
 * Mapeador mostra em "Corrigir campos". Só leitura; o que é lido vem de `campos_brutos`, gravado no import.
 */
ankiRouter.get('/decks/:id/estruturas', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    const tipos = await ankiRepo.estruturasDoBaralho(req.userId, p.id)
    const estruturas: EstruturaLida[] = []
    for (const t of tipos) {
      const linhas: Array<Record<string, unknown>> = []
      for (const bruto of t.amostra) {
        try {
          const campos = (JSON.parse(bruto) as { campos?: unknown })?.campos
          if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
            linhas.push(campos as Record<string, unknown>)
          }
        } catch {
          // Amostra ilegível: a próxima serve.
        }
      }
      if (!linhas.length) continue
      const nomes = Object.keys(linhas[0])
      const amostra = linhas
        .slice(0, 3)
        .map((l) =>
          nomes.map((n) => limparCampo(typeof l[n] === 'string' ? (l[n] as string) : '').slice(0, AMOSTRA_MAX)),
        )
      const inferido = inferirMapeamento(nomes, { amostra })
      estruturas.push({
        hash: t.estruturaHash,
        notetype: t.notetype ?? '',
        campos: nomes,
        notas: t.notas,
        papeis: inferido.papeis,
        palpites: inferido.palpites,
        precisaDeConferencia: inferido.precisaDeConferencia,
        amostra,
      })
    }
    res.json({ estruturas })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/** Notas lidas por página no remapear: o baralho inteiro nunca fica em memória de uma vez. */
const PAGINA_DO_REMAPEAR = 500

/**
 * REMAPEAR SEM REIMPORTAR. Recalcula frente, verso e exemplo de cada nota a partir de `campos_brutos` com os papéis que
 * a pessoa escolheu (`decidirRemapeamento`: função pura do núcleo + a limpeza e a régua do servidor) e grava só o texto e
 * o motivo de descarte. Nota ATIVADA não tem o texto reescrito e SRS/`projected_card_id` nunca são tocados. O mapeamento
 * vem do cliente, mas a limpeza e a régua são refeitas aqui: o servidor não confia nele. Baralho de outra conta: 404.
 */
ankiRouter.post('/decks/:id/remapear', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  const body = parseOr400(ankiRemapearSchema, req.body, res)
  if (!body) return
  try {
    if (!(await deckDoUsuario(req.userId, p.id))) {
      res.status(404).json({ error: 'baralho não encontrado' })
      return
    }
    const mapeamentos = new Map<string, PapelNaImportacao[]>()
    for (const m of body.mapeamentos) {
      if (!mapeamentoServe(m.papeis, m.papeis.length)) {
        return responderErro(
          res,
          400,
          'o mapeamento precisa de palavra (ou frase) e de tradução',
          'mapeamento_invalido',
        )
      }
      mapeamentos.set(m.estruturaHash, m.papeis)
    }

    const total = {
      notas: 0,
      mudaram: 0,
      passaramAServir: 0,
      deixaramDeServir: 0,
      preencheram: 0,
      protegidas: 0,
      ignoradas: 0,
    }
    let depoisDe: string | null = null
    for (;;) {
      const pagina: NotaParaRemapear[] = await ankiRepo.notasParaRemapear(
        req.userId,
        p.id,
        depoisDe,
        PAGINA_DO_REMAPEAR,
      )
      if (!pagina.length) break
      const mudancas = []
      for (const nota of pagina) {
        total.notas++
        const d = decidirRemapeamento(nota, mapeamentos)
        if (d.tipo === 'mudou') {
          total.mudaram++
          if (d.passouAServir) total.passaramAServir++
          if (d.deixouDeServir) total.deixaramDeServir++
          mudancas.push(d.mudanca)
        } else if (d.tipo === 'preencheu') {
          total.preencheram++
          mudancas.push(d.mudanca)
        } else if (d.tipo === 'protegida') total.protegidas++
        else if (d.tipo === 'ignorada') total.ignoradas++
      }
      if (!body.simular) await ankiRepo.gravarTextosRemapeados(req.userId, p.id, mudancas)
      depoisDe = pagina[pagina.length - 1].id
      if (pagina.length < PAGINA_DO_REMAPEAR) break
    }
    res.json({ simulado: body.simular === true, ...total })
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

ankiRouter.get('/imports/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  try {
    const r = await ankiRepo.lerImport(req.userId, p.id)
    if (!r) {
      res.status(404).json({ error: 'import não encontrado' })
      return
    }
    res.json(r)
  } catch (err) {
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'anki_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

/* A importação em lotes num router próprio, sob os mesmos middlewares deste (conta obrigatória e
   conta liberada, montados em `server/http/app.ts`). Fora do `expensiveLimiter`: um import de 50.000
   notas são 100 lotes, e o teto dele é o da própria rota (500 por lote, 50.000 por import). */
ankiRouter.use(ankiImportsRouter)
