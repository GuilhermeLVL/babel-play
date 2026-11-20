/**
 * OS TOKENS QUE A COTA COBRA quando o provedor não diz o uso (`server/ai/llmClient.ts#tokensDaChamada`): sem `usage`
 * (ou sem um lado dele), a chamada não sai de graça — o lado que falta é estimado pelo texto (~4 caracteres por token),
 * em fluxo e no caminho inteiro.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { chamarChat, chamarChatEmFluxo, tamanhoDoPrompt, tokensDaChamada } from '../server/ai/llmClient'

const MENSAGENS = [
  { role: 'system' as const, content: 'Você é um professor de conversação. '.repeat(10) },
  { role: 'user' as const, content: 'Frase a responder: <<<Can we move our meeting to Thursday?>>>' },
]
const PEDIDO = {
  base: 'https://openrouter.ai/api/v1',
  apiKey: 'x',
  model: 'google/gemma-4-26b-a4b-it',
  messages: MENSAGENS,
}
const TEXTO = JSON.stringify({ sugestoes: [{ texto: 'Sure.', traducao: 'Claro.', tom: 'neutro' }] })
const entradaEstimada = Math.ceil(tamanhoDoPrompt(MENSAGENS) / 4)
const saidaEstimada = Math.ceil(TEXTO.length / 4)

const sse = (texto: string, uso?: unknown) => {
  let s = ''
  for (let i = 0; i < texto.length; i += 10)
    s += `data: ${JSON.stringify({ choices: [{ delta: { content: texto.slice(i, i + 10) } }] })}\n\n`
  if (uso) s += `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: uso })}\n\n`
  return new Response(`${s}data: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
const json = (texto: string, uso?: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content: texto } }], ...(uso ? { usage: uso } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
const fluxo = { aoTexto: () => false, prazoFinal: Date.now() + 10_000 }

afterEach(() => vi.unstubAllGlobals())

describe('tokensDaChamada', () => {
  it('o declarado vale como veio; o que falta, vem zero ou não é número vira a estimativa', () => {
    expect(tokensDaChamada({ prompt_tokens: 300, completion_tokens: 100 }, 4000, 400)).toEqual({
      tokensEntrada: 300,
      tokensSaida: 100,
    })
    expect(tokensDaChamada(undefined, 4000, 401)).toEqual({ tokensEntrada: 1000, tokensSaida: 101 })
    expect(tokensDaChamada({ prompt_tokens: 0, completion_tokens: Number.NaN }, 40, 8)).toEqual({
      tokensEntrada: 10,
      tokensSaida: 2,
    })
    expect(tokensDaChamada({ prompt_tokens: -5 } as never, 40, 0)).toEqual({ tokensEntrada: 10, tokensSaida: 0 })
  })
})

describe('em fluxo', () => {
  it('sem usage nenhum: cobra a estimativa dos dois lados (nunca 0)', async () => {
    vi.stubGlobal('fetch', async () => sse(TEXTO))
    const r = await chamarChatEmFluxo(PEDIDO, fluxo)
    expect(r.ok).toBe(true)
    expect(r.tokensEntrada).toBe(entradaEstimada)
    expect(r.tokensSaida).toBe(saidaEstimada)
    expect(r.tokens).toBe(entradaEstimada + saidaEstimada)
    expect(r.tokens).toBeGreaterThan(0)
  })

  it('usage parcial: o lado declarado vale, o que falta é preenchido pela estimativa', async () => {
    vi.stubGlobal('fetch', async () => sse(TEXTO, { prompt_tokens: 300 }))
    const r = await chamarChatEmFluxo(PEDIDO, fluxo)
    expect(r.tokensEntrada).toBe(300)
    expect(r.tokensSaida).toBe(saidaEstimada)
    vi.stubGlobal('fetch', async () => sse(TEXTO, { completion_tokens: 42 }))
    const s = await chamarChatEmFluxo(PEDIDO, fluxo)
    expect(s.tokensEntrada).toBe(entradaEstimada)
    expect(s.tokensSaida).toBe(42)
  })

  it('o uso inteiro declarado: o real', async () => {
    vi.stubGlobal('fetch', async () => sse(TEXTO, { prompt_tokens: 300, completion_tokens: 100 }))
    const r = await chamarChatEmFluxo(PEDIDO, fluxo)
    expect([r.tokensEntrada, r.tokensSaida]).toEqual([300, 100])
  })
})

describe('no caminho inteiro (o mesmo buraco, a mesma regra)', () => {
  it('sem usage: a estimativa; com usage parcial: o lado que falta', async () => {
    vi.stubGlobal('fetch', async () => json(TEXTO))
    const r = await chamarChat(PEDIDO)
    expect([r.tokensEntrada, r.tokensSaida]).toEqual([entradaEstimada, saidaEstimada])
    vi.stubGlobal('fetch', async () => json(TEXTO, { completion_tokens: 7 }))
    const s = await chamarChat(PEDIDO)
    expect([s.tokensEntrada, s.tokensSaida]).toEqual([entradaEstimada, 7])
  })
})

describe('o prazo depois do compromisso', () => {
  it('sem prazoFinal (a cascata sem prazo total): vale o prazo da PERNA, nunca "agora"', async () => {
    let ctrl!: ReadableStreamDefaultController<Uint8Array>
    vi.stubGlobal('fetch', async () => {
      const corpo = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) })
      return new Response(corpo, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    })
    const restantes: number[] = []
    const pendente = chamarChatEmFluxo(
      { ...PEDIDO, timeoutMs: 2_000 },
      {
        aoTexto: (_t, restanteMs) => {
          restantes.push(restanteMs)
          return true // compromete no primeiro pedaço
        },
      },
    )
    await vi.waitFor(() => expect(ctrl).toBeDefined())
    const enc = (s: string) => new TextEncoder().encode(s)
    ctrl.enqueue(enc(`data: ${JSON.stringify({ choices: [{ delta: { content: TEXTO.slice(0, 10) } }] })}\n\n`))
    /* Depois do compromisso o fluxo continua por 150 ms: com o prazo "agora", seria cortado na hora. */
    await new Promise((r) => setTimeout(r, 150))
    ctrl.enqueue(enc(`data: ${JSON.stringify({ choices: [{ delta: { content: TEXTO.slice(10) } }] })}\n\n`))
    ctrl.close()
    const r = await pendente
    expect(r.ok).toBe(true)
    expect(r.texto).toBe(TEXTO)
    expect(restantes[0]).toBeGreaterThan(1_500)
    expect(restantes[0]).toBeLessThanOrEqual(2_000)
  })
})
