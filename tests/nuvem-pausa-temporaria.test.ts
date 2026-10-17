/**
 * A NUVEM DESLIGA POR UM TEMPO, NÃO PELA SESSÃO (ADR 0007).
 *
 * Com a admissão de IA no servidor, 429 `nuvem_ocupada` é o normal do pico. O cliente precisa:
 *  - cair no motor local NA HORA durante a recusa (sem ida ao servidor por fala);
 *  - voltar à nuvem sozinho depois do `Retry-After`;
 *  - não perder a tradução por nuvem da sessão inteira por causa de UM 5xx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../src/data/api'
import { GroqWhisperStt } from '../src/gateway/adapters/groqWhisper'
import { ServerLlmMt } from '../src/gateway/adapters/serverLlmMt'
import { esperaDoRetryAfter, PAUSA_MAXIMA_MS, PAUSA_PADRAO_MS } from '../src/gateway/pausaDaNuvem'

const api = apiFetch as unknown as ReturnType<typeof vi.fn>

const ocupada = (retryAfter?: string) =>
  new Response(JSON.stringify({ error: 'cheia', code: 'nuvem_ocupada' }), {
    status: 429,
    headers: { 'content-type': 'application/json', ...(retryAfter ? { 'retry-after': retryAfter } : {}) },
  })
const traducao = (texto: string) => new Response(JSON.stringify({ text: texto }), { status: 200 })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))
  api.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Tradutor IA do servidor (server-llm-mt)', () => {
  it('429 com Retry-After 2 s: pausa, cai no local, e volta à nuvem depois do prazo', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValueOnce(ocupada('2'))
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow(/indisponível/)
    expect(a.supports('en', 'pt')).toBe(false) // a cadeia pula direto para o local

    vi.advanceTimersByTime(1_999)
    expect(a.supports('en', 'pt')).toBe(false)
    vi.advanceTimersByTime(2)
    expect(a.supports('en', 'pt')).toBe(true)

    api.mockResolvedValueOnce(traducao('olá'))
    await expect(a.translate('hello', 'en', 'pt')).resolves.toMatchObject({ text: 'olá' })
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('sem Retry-After, a pausa é de 60 s', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValueOnce(ocupada())
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    vi.advanceTimersByTime(PAUSA_PADRAO_MS - 1)
    expect(a.supports('en', 'pt')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(a.supports('en', 'pt')).toBe(true)
  })

  it('um 5xx isolado NÃO desliga a tradução por nuvem da sessão', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    expect(a.supports('en', 'pt')).toBe(true)
    api.mockResolvedValueOnce(traducao('olá'))
    await expect(a.translate('hello', 'en', 'pt')).resolves.toMatchObject({ text: 'olá' })
  })

  it('três 5xx SEGUIDOS pausam (é o provedor, não a rede) — e religa sozinho', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValue(new Response('{}', { status: 502 }))
    for (let i = 0; i < 3; i++) await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    expect(a.supports('en', 'pt')).toBe(false)
    vi.advanceTimersByTime(PAUSA_PADRAO_MS)
    expect(a.supports('en', 'pt')).toBe(true)
  })

  it('501 (servidor sem chave) continua desligando pela sessão: configuração não muda com a página aberta', async () => {
    const a = new ServerLlmMt()
    api.mockResolvedValueOnce(new Response('{}', { status: 501 }))
    await expect(a.translate('hello', 'en', 'pt')).rejects.toThrow()
    vi.advanceTimersByTime(PAUSA_MAXIMA_MS * 2)
    expect(a.supports('en', 'pt')).toBe(false)
  })
})

describe('STT de nuvem (groq-whisper)', () => {
  const pcm = new Float32Array(16_000)

  it('429 nuvem_ocupada com Retry-After 2 s: indisponível (o gateway cai no local) e volta depois', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(ocupada('2'))
    const erro = await a.transcribePcm(pcm, 16_000).catch((e) => e)
    expect(erro).toMatchObject({ status: 429, code: 'nuvem_ocupada', retryAfterMs: 2_000 })
    expect(a.isAvailable()).toBe(false)

    vi.advanceTimersByTime(2_000)
    expect(a.isAvailable()).toBe(true)
    api.mockResolvedValueOnce(new Response(JSON.stringify({ text: 'olá mundo', language: 'pt' }), { status: 200 }))
    await expect(a.transcribePcm(pcm, 16_000)).resolves.toMatchObject({ text: 'olá mundo' })
  })

  /* A CAPTURA DUPLA manda dois trechos juntos e a admissão deixa UMA transcrição em voo por pessoa: o segundo recebe
     429 `nuvem_ocupada/em_voo` com Retry-After 1. Esperar e tentar UMA vez custa ~1 s; o modelo local, 8 s e pior. */
  const emVoo = () =>
    new Response(
      JSON.stringify({ error: 'cheia', code: 'nuvem_ocupada', detalhes: { motivo: 'em_voo', retryAfter: 1 } }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '1' },
      },
    )

  it('429 em_voo: espera o Retry-After, tenta de novo e entrega o texto da nuvem', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(emVoo())
    api.mockResolvedValueOnce(new Response(JSON.stringify({ text: 'olá mundo', language: 'pt' }), { status: 200 }))
    const pronto = a.transcribePcm(pcm, 16_000)
    await vi.advanceTimersByTimeAsync(1_300)
    await expect(pronto).resolves.toMatchObject({ text: 'olá mundo' })
    expect(api).toHaveBeenCalledTimes(2)
    expect(a.isAvailable()).toBe(true) // não pausou: o provedor não estava fora
  })

  it('429 em_voo na 1ª tentativa e na 2ª: a 3ª entrega o texto (o outro canal demora 1 a 2 s)', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(emVoo())
    api.mockResolvedValueOnce(emVoo())
    api.mockResolvedValueOnce(new Response(JSON.stringify({ text: 'olá mundo', language: 'pt' }), { status: 200 }))
    const pronto = a.transcribePcm(pcm, 16_000)
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(pronto).resolves.toMatchObject({ text: 'olá mundo' })
    expect(api).toHaveBeenCalledTimes(3)
  })

  it('429 em_voo três vezes: cai no caminho de sempre (pausa e erro para o gateway usar o local)', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(emVoo())
    api.mockResolvedValueOnce(emVoo())
    api.mockResolvedValueOnce(emVoo())
    const pronto = a.transcribePcm(pcm, 16_000).catch((e) => e)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(await pronto).toMatchObject({ status: 429, code: 'nuvem_ocupada' })
    expect(api).toHaveBeenCalledTimes(3) // DUAS novas tentativas, nunca um laço
    expect(a.isAvailable()).toBe(false)
  })

  it('429 que não é em_voo (o balde do provedor) não espera nem repete', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(ocupada('2'))
    const erro = await a.transcribePcm(pcm, 16_000).catch((e) => e)
    expect(erro).toMatchObject({ status: 429, code: 'nuvem_ocupada' })
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('cancelar durante a espera do em_voo acorda na hora (a tentativa seguinte já nasce abortada)', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    const ctrl = new AbortController()
    api.mockResolvedValueOnce(emVoo())
    api.mockRejectedValueOnce(Object.assign(new Error('abortado'), { name: 'AbortError' }))
    const pronto = a.transcribePcm(pcm, 16_000, { signal: ctrl.signal }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10)
    ctrl.abort()
    await vi.advanceTimersByTimeAsync(10)
    expect(await pronto).toMatchObject({ name: 'AbortError' })
  })

  it('402 e 503 também pausam; um 500 isolado não', async () => {
    const a = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
    api.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await a.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(a.isAvailable()).toBe(true)
    api.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    await a.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(a.isAvailable()).toBe(false)
  })
})

describe('esperaDoRetryAfter', () => {
  it('segundos, data HTTP, ausente e teto', () => {
    const agora = Date.now()
    expect(esperaDoRetryAfter('3', agora)).toBe(3_000)
    expect(esperaDoRetryAfter(new Date(agora + 5_000).toUTCString(), agora)).toBe(5_000)
    expect(esperaDoRetryAfter(null, agora)).toBe(PAUSA_PADRAO_MS)
    expect(esperaDoRetryAfter('lixo', agora)).toBe(PAUSA_PADRAO_MS)
    expect(esperaDoRetryAfter('86400', agora)).toBe(PAUSA_MAXIMA_MS)
  })
})
