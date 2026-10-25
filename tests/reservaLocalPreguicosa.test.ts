/**
 * RESERVA LOCAL PREGUIÇOSA NO CELULAR E NO QUEST (auditoria de eficiência 2026-09-28, achado 4).
 *
 * Com a nuvem como motor principal, o modelo local é só RESERVA — e mesmo assim quem paga baixava
 * 80–209 MB de STT + 113 MB de tradutor e rodava parciais locais, no plano de dados e na memória do
 * celular. Nestes aparelhos a reserva agora espera a PRIMEIRA falha da nuvem (ou o disjuntor), e o
 * parcial local não roda. No desktop nada muda. E o sinal de falha vem do adaptador groq-whisper.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import {
  parakeetDeReservaNaFalha,
  parakeetDeReservaNaResposta,
  planoDaReservaLocal,
  RESPOSTAS_PARA_SOLTAR_O_PARAKEET,
} from '../src/lib/captura/reservaLocal'
import type { TipoDeDispositivo } from '../src/lib/dispositivo/perfil'

const TIPOS: TipoDeDispositivo[] = ['quest', 'celular-fraco', 'celular-bom', 'desktop-com-gpu', 'desktop-sem-gpu']

describe('planoDaReservaLocal', () => {
  it.each(['quest', 'celular-fraco', 'celular-bom'] as const)(
    '%s com nuvem primeiro: não baixa a reserva agora e não roda parcial local',
    (tipo) => {
      expect(planoDaReservaLocal({ preferCloud: true, tipo })).toEqual({
        carregarAgora: false,
        parciaisLocais: false,
        parakeetNaFalha: false,
      })
    },
  )

  it.each(['desktop-com-gpu', 'desktop-sem-gpu'] as const)('%s com nuvem primeiro: comportamento de antes', (tipo) => {
    expect(planoDaReservaLocal({ preferCloud: true, tipo })).toEqual({
      carregarAgora: true,
      parciaisLocais: true,
      parakeetNaFalha: false,
    })
  })

  /* Fase B, item 5: o Parakeet de reserva (~2 GB de RAM) só entra na PRIMEIRA falha da nuvem; até lá a
     reserva quente é o Whisper base de sempre (os parciais e a queda invisível continuam iguais). */
  it('computador com nuvem primeiro e o Parakeet de reserva: Whisper base quente, Parakeet só na falha', () => {
    for (const tipo of ['desktop-com-gpu', 'desktop-sem-gpu'] as const)
      expect(planoDaReservaLocal({ preferCloud: true, tipo, localModel: ID_DO_PARAKEET })).toEqual({
        carregarAgora: true,
        parciaisLocais: true,
        parakeetNaFalha: true,
      })
  })

  it('o Parakeet como motor (rota local) carrega já, como sempre', () => {
    expect(planoDaReservaLocal({ preferCloud: false, tipo: 'desktop-com-gpu', localModel: ID_DO_PARAKEET })).toEqual({
      carregarAgora: true,
      parciaisLocais: true,
      parakeetNaFalha: false,
    })
  })

  it('rota local (sem nuvem) em qualquer aparelho: o modelo local é o motor, carrega já', () => {
    for (const tipo of TIPOS)
      expect(planoDaReservaLocal({ preferCloud: false, tipo })).toEqual({
        carregarAgora: true,
        parciaisLocais: true,
        parakeetNaFalha: false,
      })
  })
})

/* Rodada de correção 1, item 2: o ciclo do Parakeet de reserva. Entra só quando a nuvem PAUSA (não no
   soluço), uma vez; sai depois de RESPOSTAS_PARA_SOLTAR_O_PARAKEET respostas boas seguidas. */
describe('o ciclo do Parakeet de reserva', () => {
  const inicio = { ativo: false, respostasSeguidas: 0 }

  it('falha que não pausou (soluço): nada', () => {
    expect(parakeetDeReservaNaFalha(inicio, { pausou: false })).toEqual({ estado: inicio, acao: null })
  })

  it('a nuvem pausou: liga, uma vez só', () => {
    const r = parakeetDeReservaNaFalha(inicio, { pausou: true })
    expect(r.acao).toBe('ligar')
    expect(r.estado.ativo).toBe(true)
    expect(parakeetDeReservaNaFalha(r.estado, { pausou: true }).acao).toBeNull()
  })

  it('sai depois de N respostas boas SEGUIDAS; uma falha no meio zera a contagem', () => {
    let e = parakeetDeReservaNaFalha(inicio, { pausou: true }).estado
    for (let i = 0; i < RESPOSTAS_PARA_SOLTAR_O_PARAKEET - 1; i++) {
      const r = parakeetDeReservaNaResposta(e)
      expect(r.acao).toBeNull()
      e = r.estado
    }
    e = parakeetDeReservaNaFalha(e, { pausou: false }).estado // soluço: zera
    for (let i = 0; i < RESPOSTAS_PARA_SOLTAR_O_PARAKEET - 1; i++) e = parakeetDeReservaNaResposta(e).estado
    const fim = parakeetDeReservaNaResposta(e)
    expect(fim.acao).toBe('desligar')
    expect(fim.estado).toEqual(inicio)
  })

  it('resposta boa sem o Parakeet ligado: nada', () => {
    expect(parakeetDeReservaNaResposta(inicio)).toEqual({ estado: inicio, acao: null })
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

/* Rodada de correção 1, item 2: a reserva pesada (o Parakeet) só entra quando a nuvem PAUSA — não na
   primeira falha transitória — e sai quando a nuvem volta a responder. O sinal diz se pausou e avisa a
   volta. */
describe('o sinal diz se a nuvem PAUSOU, e avisa quando ela responde', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../src/data/api')
  })

  async function montar(resposta: () => Promise<Response>) {
    vi.doMock('../src/data/api', () => ({ apiFetch: vi.fn(resposta) }))
    const sinal = await import('../src/gateway/falhaDaNuvemDoStt')
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    const falhas = vi.fn()
    const respostasOk = vi.fn()
    sinal.aoFalharANuvemDoStt(falhas)
    sinal.aoResponderANuvemDoStt(respostasOk)
    return { stt: new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }), falhas, respostasOk }
  }
  const pcm = new Float32Array(1600)

  it('402/429/503 pausam: o ouvinte recebe `pausou: true`', async () => {
    const m = await montar(async () => new Response('{"code":"cota"}', { status: 402 }))
    await m.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(m.falhas).toHaveBeenCalledWith({ pausou: true })
  })

  it('um 500 isolado e a rede caída não pausam: `pausou: false`', async () => {
    const m = await montar(async () => new Response('x', { status: 500 }))
    await m.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(m.falhas).toHaveBeenLastCalledWith({ pausou: false })
    vi.resetModules()
    const rede = await montar(async () => {
      throw new TypeError('Failed to fetch')
    })
    await rede.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(rede.falhas).toHaveBeenLastCalledWith({ pausou: false })
  })

  it('o terceiro 5xx seguido pausa', async () => {
    const m = await montar(async () => new Response('x', { status: 500 }))
    for (let k = 0; k < 3; k++) await m.stt.transcribePcm(pcm, 16_000).catch(() => undefined)
    expect(m.falhas.mock.calls.map((c) => c[0])).toEqual([{ pausou: false }, { pausou: false }, { pausou: true }])
  })

  it('a resposta boa avisa quem ouve a volta da nuvem', async () => {
    const m = await montar(async () => new Response(JSON.stringify({ text: 'oi' }), { status: 200 }))
    await m.stt.transcribePcm(pcm, 16_000)
    expect(m.respostasOk).toHaveBeenCalledTimes(1)
    expect(m.falhas).not.toHaveBeenCalled()
  })
})
