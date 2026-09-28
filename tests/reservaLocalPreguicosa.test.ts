/**
 * RESERVA LOCAL PREGUIÇOSA NO CELULAR E NO QUEST (auditoria de eficiência 2026-09-28, achado 4).
 *
 * Com a nuvem como motor principal, o modelo local é só RESERVA — e mesmo assim quem paga baixava
 * 80–209 MB de STT + 113 MB de tradutor e rodava parciais locais, no plano de dados e na memória do
 * celular. Nestes aparelhos a reserva agora espera a PRIMEIRA falha da nuvem (ou o disjuntor), e o
 * parcial local não roda. No desktop nada muda. E o sinal de falha vem do adaptador groq-whisper.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { planoDaReservaLocal } from '../src/lib/captura/reservaLocal'
import type { TipoDeDispositivo } from '../src/lib/dispositivo/perfil'

const TIPOS: TipoDeDispositivo[] = ['quest', 'celular-fraco', 'celular-bom', 'desktop-com-gpu', 'desktop-sem-gpu']

describe('planoDaReservaLocal', () => {
  it.each(['quest', 'celular-fraco', 'celular-bom'] as const)(
    '%s com nuvem primeiro: não baixa a reserva agora e não roda parcial local',
    (tipo) => {
      expect(planoDaReservaLocal({ preferCloud: true, tipo })).toEqual({ carregarAgora: false, parciaisLocais: false })
    },
  )

  it.each(['desktop-com-gpu', 'desktop-sem-gpu'] as const)('%s com nuvem primeiro: comportamento de antes', (tipo) => {
    expect(planoDaReservaLocal({ preferCloud: true, tipo })).toEqual({ carregarAgora: true, parciaisLocais: true })
  })

  it('rota local (sem nuvem) em qualquer aparelho: o modelo local é o motor, carrega já', () => {
    for (const tipo of TIPOS)
      expect(planoDaReservaLocal({ preferCloud: false, tipo })).toEqual({ carregarAgora: true, parciaisLocais: true })
  })
})

describe('sinal de falha da nuvem no adaptador groq-whisper', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/data/api')
  })

  async function montar(resposta: () => Promise<Response>) {
    vi.doMock('../src/data/api', () => ({ apiFetch: vi.fn(resposta) }))
    const { aoFalharANuvemDoStt } = await import('../src/gateway/falhaDaNuvemDoStt')
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    const ouvinte = vi.fn()
    const soltar = aoFalharANuvemDoStt(ouvinte)
    return { stt: new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }), ouvinte, soltar }
  }
  const pcm = new Float32Array(1600)

  it('HTTP de erro (ex.: 503 do disjuntor) avisa quem ouve', async () => {
    const { stt, ouvinte } = await montar(async () => new Response('{"code":"provedor_em_disjuntor"}', { status: 503 }))
    await stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('erro de rede avisa; cancelamento (AbortError) não', async () => {
    const rede = await montar(async () => {
      throw new TypeError('Failed to fetch')
    })
    await rede.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(rede.ouvinte).toHaveBeenCalledTimes(1)

    vi.resetModules()
    const abortado = await montar(async () => {
      throw Object.assign(new Error('abortado'), { name: 'AbortError' })
    })
    await abortado.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(abortado.ouvinte).not.toHaveBeenCalled()
  })

  it('sucesso não avisa, e quem soltou não ouve mais', async () => {
    const ok = await montar(async () => new Response(JSON.stringify({ text: 'oi' }), { status: 200 }))
    await ok.stt.transcribePcm(pcm, 16_000)
    expect(ok.ouvinte).not.toHaveBeenCalled()

    vi.resetModules()
    const erro = await montar(async () => new Response('x', { status: 502 }))
    erro.soltar()
    await erro.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(erro.ouvinte).not.toHaveBeenCalled()
  })
})
