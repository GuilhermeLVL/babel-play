// @vitest-environment jsdom
/**
 * OS MOMENTOS QUE VÊM DA NUVEM (Fase 8) — o 402 deixa de ser silencioso.
 *
 * Antes o adaptador de tradução pausava a nuvem num 402 e ninguém ficava sabendo que a cota tinha
 * acabado. Agora cota acabada vira `fim_de_cota`, recurso de plano pago vira `modelo_premium`, e o
 * resto (429 de fila, 503 de portão, 5xx) continua não sendo assunto de plano.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EVENTO_OFERTA, momentoDaRecusa, sinalizarRecusaLida } from '../src/lib/ofertas/eventos'

const vistos: string[] = []
const ouvir = (e: Event) => vistos.push((e as CustomEvent<{ momento: string }>).detail.momento)
window.addEventListener(EVENTO_OFERTA, ouvir)
afterEach(() => {
  vistos.length = 0
  vi.doUnmock('../src/data/api')
  vi.resetModules()
})

describe('momentoDaRecusa', () => {
  it('402 quota_exceeded → fim_de_cota', () => {
    expect(momentoDaRecusa(402, { code: 'quota_exceeded' })).toBe('fim_de_cota')
  })
  it('402 de entitlement → modelo_premium', () => {
    expect(momentoDaRecusa(402, { entitlement: 'managedCloudLlm' })).toBe('modelo_premium')
    expect(momentoDaRecusa(402, { code: 'plano_insuficiente' })).toBe('modelo_premium')
  })
  it('o tutor diz "é de plano pago" com 200 e reason', () => {
    expect(momentoDaRecusa(200, { reason: 'managed_requires_plan' })).toBe('modelo_premium')
  })
  it('429, 503, 5xx e 402 sem motivo de plano: nada', () => {
    expect(momentoDaRecusa(429, { code: 'nuvem_ocupada' })).toBeNull()
    expect(momentoDaRecusa(503, { code: 'quota_exceeded' })).toBeNull()
    expect(momentoDaRecusa(402, { error: 'saldo insuficiente' })).toBeNull()
    expect(momentoDaRecusa(402, null)).toBeNull()
  })
})

it('sinalizarRecusaLida aceita o corpo em texto (o STT lê texto)', () => {
  sinalizarRecusaLida(402, JSON.stringify({ code: 'quota_exceeded' }), 'transcricao')
  sinalizarRecusaLida(402, 'não é json', 'transcricao')
  expect(vistos).toEqual(['fim_de_cota'])
})

it('o Tradutor IA: 402 de cota pausa a nuvem E dispara fim_de_cota, sem consumir o corpo de quem chamou', async () => {
  vi.doMock('../src/data/api', () => ({
    apiFetch: async () =>
      new Response(JSON.stringify({ error: 'limite', code: 'quota_exceeded' }), {
        status: 402,
        headers: { 'content-type': 'application/json' },
      }),
  }))
  const { ServerLlmMt } = await import('../src/gateway/adapters/serverLlmMt')
  const mt = new ServerLlmMt()
  await expect(mt.translate('olá', 'pt', 'en')).rejects.toThrow(/HTTP 402/)
  await vi.waitFor(() => expect(vistos).toEqual(['fim_de_cota']))
  expect(mt.supports('pt', 'en')).toBe(false) // pausado, como antes
})

it('o STT de nuvem: 402 de entitlement dispara modelo_premium', async () => {
  vi.doMock('../src/data/api', () => ({
    apiFetch: async () =>
      new Response(JSON.stringify({ error: 'plano', entitlement: 'managedCloudStt' }), { status: 402 }),
  }))
  const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
  const stt = new GroqWhisperStt({ model: 'whisper-large-v3-turbo' })
  await expect(stt.transcribePcm(new Float32Array(1600), 16000)).rejects.toThrow(/HTTP 402/)
  expect(vistos).toEqual(['modelo_premium'])
})
