/**
 * O TUTOR — `POST /api/tutor/chat` (antes `/api/gemini/chat`, que continua como ALIAS temporário
 * para o cliente em cache; ver `server/http/app.ts`).
 *
 * O NOME MUDOU PORQUE MENTIA. A rota chamava-se "gemini" e respondia pela Groq quase sempre; e na
 * Fase 2 do lançamento o Gemini saiu de vez: o app é aberto a menores, e os termos do Gemini
 * proíbem uso em serviço voltado a menores de 18.
 *
 * A CASCATA, em ordem:
 *   1. nuvem gerenciada — Groq (principal) → OpenRouter (reserva), `server/ai/cascata.ts`. Só com o
 *      entitlement `managedCloudLlm` e com a cota reservada ANTES da chamada;
 *   2. Ollama local — SÓ no self-host (`AUTH_REQUIRED` desligado). Num servidor hospedado o
 *      `localhost:11434` não existe: tentar só atrasava a resposta e fingia um caminho que o
 *      assinante não tem.
 *
 * O PROMPT É DO SERVIDOR (`server/ai/llmRequest.ts` + `funcoesDeIa.ts`): o corpo diz a função
 * (`tutor` | `corretor`) e traz o conteúdo; `systemInstruction`, temperatura e `max_tokens` do
 * cliente são descartados.
 */
import { type Request, type Response, Router } from 'express'

import { percorrerCascata } from '../ai/cascata'
import { chamarChat, type MensagemDeChat, tamanhoDoPrompt } from '../ai/llmClient'
import { prepareLlmRequest } from '../ai/llmRequest'
import { cascataDeNuvem, llmLocal } from '../ai/provedores'
import { abrirReservaDeLlm, type ReservaDeLlm } from '../ai/reservaDeNuvem'
import { authRequired } from '../lib/auth'
import { getEntitlementsForUser } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import { estimarTokens } from '../lib/usageQuota'

export const tutorRouter = Router()

/** Teto de espera da nuvem. Alguém está olhando o balão de "pensando". */
const TIMEOUT_NUVEM_MS = 30_000
/** O local roda na CPU de quem usa o app: a espera é o preço de não depender de nuvem. */
const TIMEOUT_LOCAL_MS = 60_000

async function tentarLocal(messages: MensagemDeChat[], maxTokens: number): Promise<string | null> {
  const r = await chamarChat({ ...llmLocal(), messages, maxTokens, timeoutMs: TIMEOUT_LOCAL_MS })
  if (!r.ok) {
    log('warn', { event: 'tutor_ollama_indisponivel', error: r.causa })
    return null
  }
  return r.texto ?? null
}

export async function tutorChat(req: Request, res: Response): Promise<void> {
  // Reserva de cota (chamada + tokens): estornada em todo caminho que não entrega resposta da nuvem.
  let reserva: ReservaDeLlm | null = null
  try {
    const prep = prepareLlmRequest(req.body)
    if (!prep.ok) {
      res.status(prep.status).json({ error: prep.error, code: prep.code })
      return
    }
    const selfHost = !authRequired()
    const plano = await getEntitlementsForUser(req.userId)

    if (plano.managedCloudLlm) {
      const provedores = cascataDeNuvem({ modelosGrandes: plano.largerModels })
      if (provedores.length > 0) {
        reserva = await abrirReservaDeLlm(
          req.userId,
          estimarTokens(tamanhoDoPrompt(prep.messages), prep.maxTokens),
          res,
        )
        if (!reserva) return // já respondeu: 402 de cota ou 503 do contador
        const { entregue, ultimaFalha } = await percorrerCascata(
          provedores,
          {
            messages: prep.messages,
            temperature: prep.temperature,
            maxTokens: prep.maxTokens,
            timeoutMs: TIMEOUT_NUVEM_MS,
          },
          { evento: 'tutor', route: '/api/tutor/chat', requestId: req.requestId },
        )
        if (entregue) {
          await reserva.consumir(entregue.tokensEntrada + entregue.tokensSaida)
          res.json({ text: entregue.texto, engine: 'nuvem', local: false })
          return
        }
        log('error', {
          event: 'tutor_nuvem_indisponivel',
          route: '/api/tutor/chat',
          error: ultimaFalha.slice(0, 300),
          requestId: req.requestId,
        })
      }
      if (!selfHost) {
        res.json({ text: null, unavailable: true, reason: 'nuvem_indisponivel' })
        return
      }
    } else if (!selfHost) {
      // Modo público, plano sem nuvem: explica o plano. Não há modelo local no servidor hospedado.
      res.json({ text: null, unavailable: true, reason: 'managed_requires_plan' })
      return
    }

    // Self-host: o Ollama da máquina do dono é o piso.
    const local = await tentarLocal(prep.messages, prep.maxTokens)
    if (local) {
      res.json({ text: local, engine: 'ollama', local: true })
      return
    }
    res.json({ text: null, unavailable: true, reason: 'no_local_model' })
  } catch (error) {
    log('error', { event: 'tutor_erro', error: erroDeRota(error, { event: 'tutor_erro' }), requestId: req.requestId })
    if (!res.headersSent) res.status(502).json({ error: 'tutor indisponível', code: 'provedor_indisponivel' })
  } finally {
    await reserva?.estornar()
  }
}

tutorRouter.post('/chat', tutorChat)
