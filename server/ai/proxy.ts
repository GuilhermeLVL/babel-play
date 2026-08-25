/**
 * Proxy de IA (chokepoint de segredos, espelha o `llmClient` do desktop). O
 * navegador chama `/api/ai/llm/chat/completions` com o header `x-credential-id`;
 * o server resolve a credencial → segredo + baseUrl, valida SSRF, e encaminha ao
 * provedor OpenAI-compatible fazendo pass-through do streaming. A chave NUNCA
 * chega ao cliente.
 */
import type { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { credentialsRepo } from '../db/repositories/credentials'
import { assertPublicUrl } from './ssrf'
import { log } from '../lib/logger'
import { erroDeRota } from '../lib/erroDeRota'

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

    const body = { ...(req.body ?? {}) }
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
    log('error', { event: 'llm_proxy_error', route: '/api/ai/llm/chat/completions', error: erroDeRota(err, { event: 'ai_proxy_route_error' }) })
    if (!res.headersSent) res.status(502).json({ error: erroDeRota(err, { event: 'ai_proxy_route_error' }) })
    else res.end()
  }
}

/** POST /api/ai/providers/test — ping mínimo a um provider (por baseUrl+key ou credentialId). */
export async function providerTest(req: Request, res: Response): Promise<void> {
  try {
    let { baseUrl, model, apiKey } = req.body ?? {}
    const { credentialId } = req.body ?? {}
    if (credentialId) {
      const c = await credentialsRepo.getSecret(req.userId, credentialId)
      // S-01: com `credentialId`, o HOST e o SEGREDO vêm EXCLUSIVAMENTE da credencial. Aceitar
      // `baseUrl`/`apiKey` do corpo aqui (a precedência `??` invertida) permitia enviar o segredo
      // da vítima para um host escolhido pelo chamador — exfiltração confirmada por PoC. O `model`
      // (não é segredo) segue sobrescrevível pelo corpo.
      baseUrl = c.baseUrl
      apiKey = c.secret
      model = model ?? c.defaultModel
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
    log('warn', { event: 'provider_test_error', route: '/api/ai/providers/test', error: erroDeRota(err, { event: 'ai_proxy_route_error' }) })
    res.json({ ok: false, message: erroDeRota(err, { event: 'ai_proxy_route_error' }) })
  }
}
