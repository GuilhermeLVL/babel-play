/**
 * Proxy de IA (chokepoint de segredos, espelha o `llmClient` do desktop). O
 * navegador chama `/api/ai/llm/chat/completions` com o header `x-credential-id`;
 * o server resolve a credencial → segredo + baseUrl, valida SSRF, e encaminha ao
 * provedor OpenAI-compatible fazendo pass-through do streaming. A chave NUNCA
 * chega ao cliente.
 */
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { Request, Response } from 'express'

import { credentialsRepo } from '../db/repositories/credentials'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'
import { responderErro } from '../lib/respostaDeErro'
import { llmChatCompletionsSchema, parseOr400, providerTestSchema } from '../validation'
import { assertPublicUrl, ehDestinoBloqueado } from './ssrf'

/** A-04: teto de tempo do proxy de LLM (era a ÚNICA rota de IA sem timeout). */
const LLM_TIMEOUT_MS = 60_000
/** S-07: teto de tokens de saída imposto no SERVIDOR (o cliente não dita custo ilimitado). */
const MAX_OUTPUT_TOKENS = 4096

/** POST /api/ai/llm/chat/completions (OpenAI-compatible; SSE pass-through). */
export async function llmChatProxy(req: Request, res: Response): Promise<void> {
  try {
    const credentialId = req.header('x-credential-id')
    if (!credentialId) {
      res.status(400).json({ error: 'header x-credential-id ausente' })
      return
    }
    const { baseUrl, defaultModel, secret } = await credentialsRepo.getSecret(req.userId, credentialId)
    if (!baseUrl) {
      res.status(400).json({ error: 'credencial sem baseUrl' })
      return
    }
    await assertPublicUrl(baseUrl) // anti-SSRF

    /* ACHADO DA FASE 4: aqui era `const body = { ...(req.body ?? {}) }` — o corpo do cliente,
       inteiro e sem schema, seguia para o provedor. Quem chamasse escolhia CADA parâmetro do
       pedido (e do custo). Agora só os campos declarados passam; campo desconhecido é 400.

       DEPOIS do `assertPublicUrl` de propósito: a ordem credencial → SSRF → corpo é a que a
       caracterização gravou (credencial inexistente = 502, não 400 de payload), e trocá-la mudaria
       o status de fluxos já congelados sem ganho de segurança — o corpo não é usado antes daqui. */
    const validado = parseOr400(llmChatCompletionsSchema, req.body, res)
    if (!validado) return
    const body: Record<string, unknown> = { ...validado }
    if (!body.model && defaultModel) body.model = defaultModel
    // S-07: teto de tokens no servidor — clampa o que o cliente pediu (inclusive ausência) ao máximo.
    body.max_tokens = Math.min(Number(body.max_tokens) || MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (secret) headers['Authorization'] = 'Bearer ' + secret

    const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions'
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS), // A-04: teto de tempo
    })

    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
    if (!upstream.body) {
      res.end()
      return
    }
    // A-04: backpressure — o loop manual ignorava o retorno de res.write() (buffer crescia sem limite
    // com um cliente lento). `pipeline` respeita o dreno do socket e propaga erro/cancelamento.
    await pipeline(Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream), res)
  } catch (err) {
    log('error', {
      event: 'llm_proxy_error',
      route: '/api/ai/llm/chat/completions',
      error: erroDeRota(err, { event: 'ai_proxy_route_error' }),
    })
    if (!res.headersSent)
      res.status(502).json({ error: erroDeRota(err, { status: 502, event: 'ai_proxy_route_error' }) })
    else res.end()
  }
}

/** POST /api/ai/providers/test — ping mínimo a um provider (por baseUrl+key ou credentialId). */
export async function providerTest(req: Request, res: Response): Promise<void> {
  // Fora do `try`: `parseOr400` já respondeu 400 quando falha, e o `catch` abaixo responderia
  // por cima. O corpo era desestruturado cru — sem tipo, sem teto, sem recusa de campo estranho.
  const corpo = parseOr400(providerTestSchema, req.body, res)
  if (!corpo) return
  try {
    let { baseUrl, model, apiKey } = corpo
    const { credentialId } = corpo
    if (credentialId) {
      const c = await credentialsRepo.getSecret(req.userId, credentialId)
      // S-01: com `credentialId`, o HOST e o SEGREDO vêm EXCLUSIVAMENTE da credencial. Aceitar
      // `baseUrl`/`apiKey` do corpo aqui (a precedência `??` invertida) permitia enviar o segredo
      // da vítima para um host escolhido pelo chamador — exfiltração confirmada por PoC. O `model`
      // (não é segredo) segue sobrescrevível pelo corpo.
      baseUrl = c.baseUrl ?? undefined
      apiKey = c.secret ?? undefined
      model = model ?? c.defaultModel ?? undefined
    }
    if (!baseUrl) {
      res.status(400).json({ ok: false, message: 'baseUrl ausente' })
      return
    }
    await assertPublicUrl(baseUrl)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey
    const t0 = Date.now()
    const r = await fetch(baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) {
      const b = await r.text().catch(() => '')
      res.json({ ok: false, message: `HTTP ${r.status}: ${b.slice(0, 160)}` })
      return
    }
    res.json({ ok: true, latencyMs: Date.now() - t0 })
  } catch (err) {
    /* A RECUSA DE SSRF ERA UM HTTP 200 — o pior achado da Fase 4.
       `baseUrl` em IP privado caía aqui e saía como `{ ok: false, message: 'erro interno' }` com
       status de SUCESSO: `erroDeRota` substituía a causa do guard pela mensagem genérica, e o 200
       tornava a recusa indistinguível de um provedor que apenas falhou no ping. Quem cadastrou a
       URL não descobria o motivo, e nenhum monitor conseguia contar bloqueios.
       Agora é 400 com `code` próprio — sem o IP resolvido na mensagem (ver `ssrf.ts`). */
    if (ehDestinoBloqueado(err)) {
      log('warn', {
        event: 'provider_test_destino_bloqueado',
        route: '/api/ai/providers/test',
        status: 400,
        error: err.message,
        requestId: req.requestId,
      })
      responderErro(res, 400, 'destino não permitido', err.code)
      return
    }
    log('warn', {
      event: 'provider_test_error',
      route: '/api/ai/providers/test',
      error: erroDeRota(err, { event: 'ai_proxy_route_error' }),
    })
    res.json({ ok: false, message: erroDeRota(err, { event: 'ai_proxy_route_error' }) })
  }
}
