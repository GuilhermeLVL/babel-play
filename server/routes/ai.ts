/**
 * Rotas do AI Gateway (montadas em `/api/ai`). Proxy de LLM (segredo), teste de
 * provider e CRUD de credenciais (segredo write-only). Perfis entram na próxima
 * etapa da Fase 1.
 */
import { raw, Router } from 'express'

import { alternativasProxy } from '../ai/alternativas'
import { mtTranslateProxy } from '../ai/mtProxy'
import { polirProxy } from '../ai/polimento'
import { llmChatProxy, providerTest } from '../ai/proxy'
// F14-02: a leitura de env sai do handler. B1 (Fase B): a pergunta é do registro de provedores, a
// MESMA que a porta da transcrição faz — as duas discordavam (B0).
import { sttDeNuvemConfigurado } from '../ai/registroDeProvedores'
import { apagarDoGlossario, gravarNoGlossario, listarGlossario } from '../ai/rotasDoGlossario'
import { portaDoStt, sttTranscribeProxy } from '../ai/sttProxy'
import { credentialsRepo } from '../db/repositories/credentials'
import { getPlanForUser, hasEntitlement } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { flagLigada } from '../lib/flags'
import { avaliarAlivio, pedeAlivio } from '../lib/nuvemDeAlivio'
import { portaoDaNuvem } from '../lib/orcamentoDeIa'
import { createCredentialSchema, idParamSchema, parseOr400 } from '../validation'

export const aiRouter = Router()

aiRouter.post('/llm/chat/completions', llmChatProxy)
aiRouter.post('/providers/test', providerTest)
/* STT de nuvem (áudio do sistema → Whisper). Corpo = bytes Ogg Opus ou WAV crus (raw), não JSON.
   A PORTA vem ANTES do `raw()` (ADR 0007; fase 2 §2.3): plano (402), portão (503), configuração
   (501) e admissão (429 `nuvem_ocupada`) respondem sem ler um byte do corpo de até 25 MB. */
aiRouter.post(
  '/stt',
  portaDoStt,
  raw({ type: ['audio/wav', 'audio/ogg', 'application/octet-stream'], limit: '25mb' }),
  sttTranscribeProxy,
)
// Tradução via LLM (Groq) — 501 sem chave; sustenta a cadeia de MT e o modo multi-idioma.
aiRouter.post('/mt', mtTranslateProxy)
/* "Outras formas" ao tocar numa frase (D4 da Fase D): até 3 opções e uma nota, só com a Tradução
   Nuance (402 `exige_nuance` pelo entitlement), com a cota, a admissão e o custo das outras funções. */
aiRouter.post('/mt/alternativas', alternativasProxy)
/* "Polir a tradução da sessão" (D5 da Fase D): um bloco de até 40 falas por pedido, lidas do banco,
   no nível `polimento`; a polida vai AO LADO da original, e o bloco já polido não é cobrado de novo. */
aiRouter.post('/mt/polir', polirProxy)
/* O GLOSSÁRIO PESSOAL da Tradução Nuance (D3 da Fase D): ler e apagar em qualquer plano (é dado da
   pessoa), gravar só com `traducaoNuance` (`server/ai/rotasDoGlossario.ts`). */
aiRouter.get('/glossario', listarGlossario)
aiRouter.post('/glossario', gravarNoGlossario)
aiRouter.delete('/glossario/:id', apagarDoGlossario)
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
    const byok = (await credentialsRepo.list(req.userId)).length > 0
    if (byok) {
      res.json({ available: true })
      return
    }
    /* A nuvem GERENCIADA também precisa do portão global (chave de emergência e orçamento do mês):
       responder "disponível" com a nuvem fechada mandaria o roteador para um 503 no meio da captura. */
    /* Fase 7: o convidado só tem nuvem com a flag `nuvem_convidado` ligada (`server/lib/convidado.ts`). */
    const convidadoSemNuvem = req.convidado === true && !(await flagLigada(req, 'nuvem_convidado'))
    /* A NUVEM DE ALÍVIO (A10): a conta Grátis que aceitou a oferta pergunta com `x-nuvem-alivio: 1`,
       e a resposta é o MESMO veredicto da porta (flag, perfil protegido, franquia, pool do dia) —
       dizer "disponível" e recusar na primeira fala seria o defeito que esta rota existe para evitar. */
    const alivio =
      req.convidado !== true && pedeAlivio(req) && (await getPlanForUser(req.userId)) === 'free'
        ? await avaliarAlivio(req)
        : null
    if (alivio && alivio.ok === false) {
      res.status(501).json({ available: false, motivo: alivio.code })
      return
    }
    const direito = alivio?.ok === true || (!convidadoSemNuvem && (await hasEntitlement(req.userId, 'managedCloudStt')))
    const portao = direito ? await portaoDaNuvem() : null
    const ok = !!portao?.ok
    res
      .status(ok ? 200 : 501)
      .json(ok ? { available: true } : { available: false, ...(portao ? { motivo: portao.motivo } : {}) })
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
    res.status(400).json({
      error: erroDeRota(err, { status: 400, event: 'ai_route_error', route: req.path, requestId: req.requestId }),
    })
  }
})

aiRouter.delete('/credentials/:id', async (req, res) => {
  const p = parseOr400(idParamSchema, req.params, res)
  if (!p) return
  // P2-N4: 404 quando nada foi afetado — antes respondia ok até para credencial de outro dono.
  const removeu = await credentialsRepo.remove(req.userId, p.id)
  if (!removeu) {
    res.status(404).json({ error: 'credencial não encontrada' })
    return
  }
  res.json({ ok: true })
})
