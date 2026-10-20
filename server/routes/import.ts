/**
 * Rotas de IMPORTAÇÃO (montadas em `/api/import`). Cada importação produz uma SESSÃO no formato
 * canônico (sessions + utterances [+ áudio]), então todo o downstream (Análise, vocabulário,
 * exercícios, player sincronizado) funciona sem tela nova.
 *
 *  - POST /youtube                     → 410 rota_removida (o yt-dlp saiu; ver o comentário da rota)
 *  - POST /web      { url }            → extrai o artigo (cliente monta a sessão-documento)
 *
 * PDF e DOCX não passam mais por aqui: são lidos no navegador (`src/lib/import/extrairDocumento.ts`).
 */
import { Router } from 'express'

import { extractArticle } from '../import/web'
import { erroDeRota } from '../lib/erroDeRota'
import { responderErro } from '../lib/respostaDeErro'
// F11-04: schemas de corpo e de cabeçalho das rotas de importação.
import { importUrlSchema, parseOr400 } from '../validation'

export const importRouter = Router()

/**
 * YouTube: APOSENTADO (Task 10 da Fase 2). Rodava o yt-dlp como subprocesso no servidor, o que não existe
 * num Worker (e já respondia 403 em produção). A rota fica registrada para quem ainda a chama receber uma
 * resposta explícita — 410, não um 404 que parece defeito —, sem validar corpo nem checar plano.
 */
importRouter.post('/youtube', (_req, res) => {
  responderErro(res, 410, 'a importação de vídeos do YouTube foi removida', 'rota_removida')
})

// Artigo web: servidor busca o HTML e devolve o texto principal (o cliente monta a sessão).
importRouter.post('/web', async (req, res) => {
  const corpo = parseOr400(importUrlSchema, req.body, res)
  if (!corpo) return
  try {
    const url = corpo.url.trim()
    if (!url) {
      res.status(400).json({ error: 'Informe uma URL.' })
      return
    }
    res.json(await extractArticle(url))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'import_route_error' }) })
  }
})
