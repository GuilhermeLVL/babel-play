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
import { hasEntitlement } from '../lib/entitlements'

export const aiRouter = Router()

aiRouter.post('/llm/chat/completions', llmChatProxy)
aiRouter.post('/providers/test', providerTest)
// STT de nuvem (áudio do sistema → Whisper). Corpo = bytes WAV crus (raw), não JSON.
aiRouter.post('/stt', raw({ type: ['audio/wav', 'application/octet-stream'], limit: '25mb' }), sttTranscribeProxy)
// Tradução via LLM (Groq) — 501 sem chave; sustenta a cadeia de MT e o modo multi-idioma.
aiRouter.post('/mt', mtTranslateProxy)
/*
 * O roteador de STT pergunta se a nuvem está disponível SEM gastar chamada de API — e a resposta
 * é POR USUÁRIO, não só por configuração.
 *
 * A versão anterior respondia "disponível" para qualquer um se houvesse chave no servidor. Com um
 * plano sem STT gerenciado, o cliente era roteado para a nuvem (`sttRouter.ts` escolhe
 * `preferCloud`) e só descobria o 402 AO ENVIAR ÁUDIO — no meio da captura ao vivo, a pior hora.
 * É o espelho exato do defeito já corrigido no MT (ver `serverLlmMt.ts:42-44`). Credencial BYOK
 * libera em qualquer plano: a chave é do usuário, o custo é dele.
 */
aiRouter.get('/stt/available', async (req, res) => {
  try {
    if (!sttDeNuvemConfigurado()) {
      // Sem chave no servidor, BYOK ainda serve — o proxy aceita credencial própria.
      const temByok = (await credentialsRepo.list(req.userId)).length > 0
      res.status(temByok ? 200 : 501).json({ available: temByok })
      return
    }
    const ok =
      (await hasEntitlement(req.userId, 'managedCloudStt')) ||
      (await credentialsRepo.list(req.userId)).length > 0
    res.status(ok ? 200 : 501).json({ available: ok })
  } catch (err) {
    // Indeciso = indisponível: mandar o usuário para a nuvem no escuro é o defeito que esta rota corrige.
    res.status(501).json({ available: false, error: erroDeRota(err, { event: 'stt_available_error' }) })
  }
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
    res.status(400).json({ error: erroDeRota(err, { status: 400, event: 'ai_route_error', route: req.path, requestId: req.requestId }) })
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
