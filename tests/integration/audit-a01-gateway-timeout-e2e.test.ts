/**
 * E2E A-01 (audit tasks.md:35): o adapter REAL de produção (`OpenAiCompatibleLlm`) que pendura no
 * `fetch` expira pelo teto POR TENTATIVA do run-loop e a cadeia degrada para o próximo binding.
 *
 * Diferença para o unit `audit-a01-gateway-timeout.test.ts`: lá o "pendura" é um closure sintético
 * (`Promise<never>`); aqui é o adapter de produção fazendo um `fetch` que nunca responde. Cobre a
 * pilha adapter → fetch → `withTimeout` → fallback, não só o núcleo. `fetch` é stubbed (sem socket
 * real): `hang.local` nunca resolve, `ok.local` responde uma chat-completion válida — determinístico.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AiGateway, BreakerRegistry, BudgetLedger } from '@core'
import type { Profile, CapabilityBinding, ChatMessage } from '@core'
import { OpenAiCompatibleLlm } from '../../src/gateway/adapters/openaiCompatible'

const HANG = 'http://hang.local'
const OK = 'http://ok.local'

function okResponse(content: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith(HANG)) return new Promise<Response>(() => { /* pendura de propósito */ })
    if (url.startsWith(OK)) return Promise.resolve(okResponse('resposta-do-fallback'))
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  })
})
afterEach(() => { vi.unstubAllGlobals() })

const MESSAGES: ChatMessage[] = [{ role: 'user', content: 'oi' }]

/** Espelha o resolveLlm de produção para 'openai-compatible' (local), com o adapter REAL. */
const attempt = (b: CapabilityBinding): Promise<string> =>
  new OpenAiCompatibleLlm({
    id: b.adapterId, label: 'x', runtime: 'browser', cost: 'free',
    baseUrl: b.baseUrl ?? '', model: b.model ?? 'm',
  }).chat('sys', MESSAGES).then((r) => r.text)

function gateway(bindings: CapabilityBinding[]): AiGateway {
  const profile: Profile = {
    id: 'e2e', name: 'e2e', builtin: false, economyMode: false,
    budget: { maxCloudRequests: -1, maxTokens: -1 },
    bindings: { llm: bindings },
  }
  return new AiGateway(profile, new BreakerRegistry(), new BudgetLedger(profile.budget), () => true)
}

/** Resolve 'travou' se `p` não assentar dentro de `ms` (pega o congelamento do bug A-01). */
function corridaContraTimer<T>(p: Promise<T>, ms: number): Promise<T | 'travou'> {
  return Promise.race([p, new Promise<'travou'>((r) => setTimeout(() => r('travou'), ms))])
}

describe('A-01 E2E — adapter (fetch) que pendura cai para o fallback', () => {
  const OPTS = { timeoutMs: 100, retries: 1 } as const

  it('adapter primário pendura no fetch → expira e usa o 2º binding', async () => {
    const gw = gateway([
      { adapterId: 'openai-compatible', baseUrl: HANG, model: 'm' },
      { adapterId: 'openai-compatible', baseUrl: OK, model: 'm' },
    ])
    const r = await corridaContraTimer(gw.run('llm', attempt, OPTS), 2000)
    expect(r).toBe('resposta-do-fallback')
  })

  it('CONTROLE: primário OK resolve sem depender do timer', async () => {
    const gw = gateway([{ adapterId: 'openai-compatible', baseUrl: OK, model: 'm' }])
    const r = await corridaContraTimer(gw.run('llm', attempt, OPTS), 2000)
    expect(r).toBe('resposta-do-fallback')
  })
})
