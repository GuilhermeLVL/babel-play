/**
 * A VOZ NATURAL DA NUVEM NO CLIENTE (E5 da Fase E): um `TtsEngine` que pede o áudio a `POST /api/ai/tts`
 * e o toca — e que, a QUALQUER falha, lê a MESMA fala com a voz do aparelho, com os MESMOS callbacks: a
 * fila de fala (`filaDeFala.ts`) nem percebe, e a pessoa ouve a tradução do mesmo jeito.
 *
 *   - 402 (sem o Premium, cota do mês) e 503 da flag desligada: a voz do aparelho, e a nuvem fica
 *     pausada na sessão (não adianta pedir de novo a cada fala);
 *   - 429 (nuvem ocupada, uso justo do dia): a voz do aparelho, e a nuvem pausada pelo Retry-After;
 *   - 5xx, timeout, rede, áudio que não toca: a voz do aparelho NESTE item; o próximo tenta a nuvem;
 *   - a voz da nuvem marca o guarda de eco enquanto toca (`marcarFalaExterna`);
 *   - cancelar no meio do pedido não toca nada nem cai na reserva;
 *   - Repetir não pede de novo (o último áudio fica guardado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isTtsActive, type SpeakOptions, type TtsEngine } from '../src/lib/tts'
import { criarVozDaNuvem, type ReprodutorDaVoz } from '../src/lib/voz/vozDaNuvem'

function reservaFalsa() {
  const falas: Array<{ texto: string; opts: SpeakOptions }> = []
  const motor: TtsEngine = {
    speak: vi.fn((texto: string, opts?: SpeakOptions) => {
      falas.push({ texto, opts: opts! })
      opts?.onStart?.()
    }),
    cancel: vi.fn(),
  }
  return { motor, falas }
}

/** O reprodutor falso: `tocar` resolve (ou rejeita); `terminar` dispara o fim. */
function tocadorFalso(o: { falhaAoTocar?: boolean } = {}) {
  const tocados: Blob[] = []
  let fim: (() => void) | null = null
  let erro: (() => void) | null = null
  const parar = vi.fn()
  const fabrica = (blob: Blob): ReprodutorDaVoz => {
    tocados.push(blob)
    return {
      tocar: () => (o.falhaAoTocar ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()),
      parar,
      aoTerminar: (cb) => {
        fim = cb
      },
      aoFalhar: (cb) => {
        erro = cb
      },
    }
  }
  return { fabrica, tocados, parar, terminar: () => fim?.(), falhar: () => erro?.() }
}

const audio = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })
const falha = (status: number, cabecalhos: Record<string, string> = {}, code = 'x') =>
  new Response(JSON.stringify({ error: 'não', code }), {
    status,
    headers: { 'content-type': 'application/json', ...cabecalhos },
  })

let agora = 1_000_000
const esperar = () => new Promise((r) => setTimeout(r, 0))

function montar(respostas: Array<Response | Error | 'pendurar'>, o: { falhaAoTocar?: boolean; prazoMs?: number } = {}) {
  const reserva = reservaFalsa()
  const tocador = tocadorFalso(o)
  const pedidos: Array<{ caminho: string; corpo: Record<string, unknown>; signal?: AbortSignal }> = []
  const buscar = vi.fn(async (caminho: string, init: RequestInit) => {
    pedidos.push({ caminho, corpo: JSON.parse(String(init.body)), signal: init.signal ?? undefined })
    const r = respostas.shift() ?? audio()
    if (r === 'pendurar')
      return new Promise<Response>((_ok, rejeitar) =>
        init.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortado', 'AbortError'))),
      )
    if (r instanceof Error) throw r
    return r
  })
  const voz = criarVozDaNuvem({
    reserva: reserva.motor,
    buscar,
    tocador: tocador.fabrica,
    agora: () => agora,
    ...(o.prazoMs ? { prazoMs: o.prazoMs } : {}),
    voz: 'Kore',
  })
  const cb = () => ({ onStart: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })
  return { voz, reserva, tocador, pedidos, buscar, cb }
}

beforeEach(() => {
  agora = 1_000_000
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a voz da nuvem fala', () => {
  it('pede o áudio da fala, toca, e avisa começo e fim; o guarda de eco vale enquanto toca', async () => {
    const m = montar([audio()])
    const c = m.cb()
    m.voz.speak('Where is the station?', { lang: 'en-US', rate: 1.1, ...c })
    await esperar()
    expect(m.pedidos).toEqual([
      {
        caminho: '/api/ai/tts',
        corpo: { texto: 'Where is the station?', idioma: 'en-US', voz: 'Kore', velocidade: 1.1 },
        signal: expect.any(AbortSignal),
      },
    ])
    expect(m.tocador.tocados).toHaveLength(1)
    expect(c.onStart).toHaveBeenCalledTimes(1)
    expect(isTtsActive()).toBe(true)
    expect(m.voz.isSpeaking?.()).toBe(true)
    expect(m.voz.motorDaUltimaFala()).toBe('voz-da-nuvem')
    m.tocador.terminar()
    expect(c.onEnd).toHaveBeenCalledTimes(1)
    expect(m.reserva.motor.speak).not.toHaveBeenCalled()
    expect(m.voz.isSpeaking?.()).toBe(false)
  })

  it('Repetir a mesma fala não pede de novo: o último áudio fica guardado', async () => {
    const m = montar([audio()])
    m.voz.speak('Thank you', { lang: 'en', ...m.cb() })
    await esperar()
    m.tocador.terminar()
    m.voz.speak('Thank you', { lang: 'en', ...m.cb() })
    await esperar()
    expect(m.buscar).toHaveBeenCalledTimes(1)
    expect(m.tocador.tocados).toHaveLength(2)
  })
})

describe('qualquer falha: a voz do aparelho lê a MESMA fala, com os mesmos callbacks', () => {
  it.each([
    ['402 (sem o Premium)', falha(402, {}, 'exige_voz_natural')],
    ['503 (flag desligada)', falha(503, {}, 'voz_natural_desligada')],
    ['429 (nuvem ocupada)', falha(429, { 'retry-after': '30' }, 'nuvem_ocupada')],
    ['429 (uso justo do dia)', falha(429, { 'retry-after': '3600' }, 'uso_justo_do_dia')],
    ['500', falha(500)],
    ['502', falha(502)],
    ['501 (sem chave no servidor)', falha(501, {}, 'voz_nao_configurada')],
    ['rede', new TypeError('Failed to fetch')],
  ])('%s', async (_nome, resposta) => {
    const m = montar([resposta as Response | Error])
    const c = m.cb()
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...c })
    await esperar()
    expect(m.reserva.falas).toHaveLength(1)
    expect(m.reserva.falas[0].texto).toBe('Bom dia')
    expect(m.reserva.falas[0].opts.lang).toBe('pt-BR')
    expect(m.reserva.falas[0].opts.onStart).toBe(c.onStart)
    expect(m.reserva.falas[0].opts.onEnd).toBe(c.onEnd)
    expect(c.onStart).toHaveBeenCalledTimes(1)
    expect(m.tocador.tocados).toHaveLength(0)
    expect(m.voz.motorDaUltimaFala()).toBe('voz-do-aparelho')
  })

  it('timeout: o pedido é abortado no prazo e a voz do aparelho lê', async () => {
    vi.useFakeTimers()
    const m = montar(['pendurar'], { prazoMs: 4_000 })
    const c = m.cb()
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...c })
    await vi.advanceTimersByTimeAsync(4_001)
    expect(m.pedidos[0].signal?.aborted).toBe(true)
    expect(m.reserva.falas).toHaveLength(1)
    expect(c.onStart).toHaveBeenCalledTimes(1)
  })

  it('o áudio que não toca (autoplay bloqueado): a voz do aparelho lê', async () => {
    const m = montar([audio()], { falhaAoTocar: true })
    const c = m.cb()
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...c })
    await esperar()
    await esperar()
    expect(m.reserva.falas).toHaveLength(1)
    expect(c.onStart).toHaveBeenCalledTimes(1)
  })

  it('erro no meio da reprodução (já começou): o erro chega a quem chamou, sem ler de novo', async () => {
    const m = montar([audio()])
    const c = m.cb()
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...c })
    await esperar()
    m.tocador.falhar()
    expect(c.onError).toHaveBeenCalledTimes(1)
    expect(m.reserva.falas).toHaveLength(0)
  })
})

describe('a pausa da nuvem depois da recusa', () => {
  it('402/503: a sessão inteira segue na voz do aparelho, sem pedir de novo', async () => {
    const m = montar([falha(402, {}, 'exige_voz_natural')])
    m.voz.speak('um', { lang: 'pt', ...m.cb() })
    await esperar()
    agora += 24 * 3_600_000
    m.voz.speak('dois', { lang: 'pt', ...m.cb() })
    await esperar()
    expect(m.buscar).toHaveBeenCalledTimes(1)
    expect(m.reserva.falas.map((f) => f.texto)).toEqual(['um', 'dois'])
  })

  it('429: pausa pelo Retry-After, e depois volta a tentar a nuvem', async () => {
    const m = montar([falha(429, { 'retry-after': '30' }, 'nuvem_ocupada'), audio()])
    m.voz.speak('um', { lang: 'pt', ...m.cb() })
    await esperar()
    agora += 10_000
    m.voz.speak('dois', { lang: 'pt', ...m.cb() })
    await esperar()
    expect(m.buscar).toHaveBeenCalledTimes(1)
    agora += 21_000
    m.voz.speak('três', { lang: 'pt', ...m.cb() })
    await esperar()
    expect(m.buscar).toHaveBeenCalledTimes(2)
    expect(m.tocador.tocados).toHaveLength(1)
  })

  it('5xx: só este item vai ao aparelho; o próximo tenta a nuvem', async () => {
    const m = montar([falha(502), audio()])
    m.voz.speak('um', { lang: 'pt', ...m.cb() })
    await esperar()
    m.voz.speak('dois', { lang: 'pt', ...m.cb() })
    await esperar()
    expect(m.buscar).toHaveBeenCalledTimes(2)
    expect(m.tocador.tocados).toHaveLength(1)
  })
})

describe('cancelar', () => {
  it('no meio do pedido: nada toca, a reserva não lê, e o pedido é abortado', async () => {
    const m = montar(['pendurar'])
    const c = m.cb()
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...c })
    m.voz.cancel()
    await esperar()
    await esperar()
    expect(m.pedidos[0].signal?.aborted).toBe(true)
    expect(m.reserva.falas).toHaveLength(0)
    expect(m.tocador.tocados).toHaveLength(0)
    expect(c.onStart).not.toHaveBeenCalled()
    expect(m.reserva.motor.cancel).toHaveBeenCalled()
  })

  it('durante a reprodução: para o áudio e solta o guarda de eco', async () => {
    const m = montar([audio()])
    m.voz.speak('Bom dia', { lang: 'pt-BR', ...m.cb() })
    await esperar()
    m.voz.cancel()
    expect(m.tocador.parar).toHaveBeenCalled()
    expect(m.voz.isSpeaking?.()).toBe(false)
  })
})
