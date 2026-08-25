/**
 * REGRESSÃO — A-04 / S-07 (Alto): proxy de LLM sem timeout, sem backpressure, sem teto de tokens.
 *
 * `server/ai/proxy.ts` (llmChatProxy) era a ÚNICA rota de IA sem timeout no `fetch` upstream, ignorava
 * o retorno de `res.write()` (sem backpressure) e encaminhava `max_tokens` do cliente sem teto.
 * Correção: `AbortSignal.timeout`, `pipeline()` (respeita dreno), e clamp de `max_tokens` no servidor.
 *
 * O `fetch` é interceptado; nada sai da máquina. Verifica as propriedades do REQUEST montado.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Writable } from 'node:stream'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const OWNER = asUserId('a04-owner')

let h: EphemeralDb
let llmChatProxy: (req: unknown, res: unknown) => Promise<void>
let credId: string
let captured: { signal: unknown; body: any } | null

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ llmChatProxy } = await h.load<{ llmChatProxy: typeof llmChatProxy }>('../../server/ai/proxy'))
  const { credentialsRepo } = await h.load<{ credentialsRepo: {
    create: (userId: unknown, p: Record<string, unknown>) => Promise<{ id: string }>
  } }>('../../server/db/repositories/credentials')
  const cred = await credentialsRepo.create(OWNER, {
    label: 'a04', kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.1-8b-instant', secret: 'sk-fake',
  })
  credId = cred.id
})
afterAll(async () => { await h.cleanup() })

function mockFetch() {
  captured = null
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: string | URL | Request, opts?: RequestInit) => {
    captured = { signal: opts?.signal ?? null, body: JSON.parse(String(opts?.body ?? '{}')) }
    // corpo pequeno; a resposta é um web ReadableStream (o proxy faz pipeline dela).
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

/** res mínimo que é um Writable (para o pipeline) + os métodos do Express usados pelo proxy. */
function mkRes() {
  const chunks: Buffer[] = []
  const w = new Writable({ write(c, _e, cb) { chunks.push(Buffer.from(c)); cb() } }) as Writable & Record<string, any>
  w.statusCode = 200
  w.headersSent = false
  w.status = (c: number) => { w.statusCode = c; return w }
  w.setHeader = () => w
  w.json = (o: unknown) => { w._json = o; return w }
  w.header = () => undefined
  w.chunks = chunks
  return w
}

describe('A-04/S-07 — proxy de LLM endurecido', () => {
  it('CORRIGIDO (A-04): o fetch upstream tem timeout (AbortSignal)', async () => {
    const spy = mockFetch()
    const res = mkRes()
    const req = { userId: OWNER, header: (n: string) => (n === 'x-credential-id' ? credId : undefined), body: { messages: [] } }
    await llmChatProxy(req, res)
    spy.mockRestore()
    expect(captured?.signal).toBeTruthy()
    expect(String((captured?.signal as any)?.constructor?.name)).toContain('AbortSignal')
  })

  it('CORRIGIDO (S-07): max_tokens é clampado no servidor mesmo se o cliente pedir muito', async () => {
    const spy = mockFetch()
    const res = mkRes()
    const req = { userId: OWNER, header: (n: string) => (n === 'x-credential-id' ? credId : undefined), body: { messages: [], max_tokens: 999999 } }
    await llmChatProxy(req, res)
    spy.mockRestore()
    expect(captured?.body.max_tokens).toBeLessThanOrEqual(4096)
  })

  it('sem x-credential-id → 400 (comportamento preservado)', async () => {
    const res = mkRes()
    const req = { header: () => undefined, body: {} }
    await llmChatProxy(req, res)
    expect(res.statusCode).toBe(400)
  })
})
