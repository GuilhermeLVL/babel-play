/**
 * Rotas do AI Gateway (montadas em `/api/ai`). Proxy de LLM (segredo), teste de
 * provider e CRUD de credenciais (segredo write-only). Perfis entram na próxima
 * etapa da Fase 1.
 */
import { Router, raw } from 'express'
import { credentialsRepo } from '../db/repositories/credentials'
import { llmChatProxy, providerTest } from '../ai/proxy'
import { sttTranscribeProxy } from '../ai/sttProxy'
import { mtTranslateProxy } from '../ai/mtProxy'
import { createCredentialSchema, parseOr400, idParamSchema } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
// F14-02: a leitura de env sai do handler e passa pelo inventario declarado em lib/config.
import { sttDeNuvemConfigurado } from '../lib/config'

export const aiRouter = Router()

aiRouter.post('/llm/chat/completions', llmChatProxy)
aiRouter.post('/providers/test', providerTest)
// STT de nuvem (áudio do sistema → Whisper). Corpo = bytes WAV crus (raw), não JSON.
aiRouter.post('/stt', raw({ type: ['audio/wav', 'application/octet-stream'], limit: '25mb' }), sttTranscribeProxy)
// Tradução via LLM (Groq) — 501 sem chave; sustenta a cadeia de MT e o modo multi-idioma.
aiRouter.post('/mt', mtTranslateProxy)
// O roteador de STT pergunta se a nuvem está configurada SEM gastar chamada de API.
aiRouter.get('/stt/available', (_req, res) => {
  const ok = sttDeNuvemConfigurado()
  res.status(ok ? 200 : 501).json({ available: ok })
})

aiRouter.get('/credentials', async (req, res) => {
  res.json(await credentialsRepo.list(req.userId))
})

aiRouter.post('/credentials', async (req, res) => {
  const payload = parseOr400(createCredentialSchema, req.body, res)
  if (!payload) return
  try {
    res.json(await credentialsRepo.create(req.userId, payload))
  } catch (err) {
    res.status(400).json({ error: erroDeRota(err, { event: 'ai_route_error', route: req.path, requestId: req.requestId }) })
  }
})

aiRouter.delete('/credentials/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  // P2-N4: 404 quando nada foi afetado — antes respondia ok até para credencial de outro dono.
  const removeu = await credentialsRepo.remove(req.userId, p.id)
  if (!removeu) { res.status(404).json({ error: 'credencial não encontrada' }); return }
  res.json({ ok: true })
})
