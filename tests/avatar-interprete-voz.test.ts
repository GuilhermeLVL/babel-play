/**
 * A PONTE DA VOZ DO INTÉRPRETE COM O AVATAR (M4): a voz que passa por `criarPonteDaVoz().envolver` precisa soar e
 * proteger o microfone EXATAMENTE como a que não passa. Regressões:
 *  · guarda de eco (`isTtsActive`, `marcarFalaExterna` na voz da nuvem): ligado enquanto toca e na cauda;
 *  · mesmos callbacks, mesma ordem; cancelar ainda corta;
 *  · desligada, a ponte devolve o MESMO motor (sem nenhum invólucro).
 */
import { describe, expect, it, vi } from 'vitest'

import { criarPonteDaVoz } from '../src/lib/avatar/ponteDaVoz'
import { isTtsActive, type SpeakOptions, type TtsEngine } from '../src/lib/tts'
import { criarVozDaNuvem, type ReprodutorDaVoz } from '../src/lib/voz/vozDaNuvem'

function nuvemFalsa() {
  let fim: (() => void) | null = null
  const parar = vi.fn()
  const tocador = (): ReprodutorDaVoz => ({
    tocar: () => Promise.resolve(),
    parar,
    aoTerminar: (cb) => {
      fim = cb
    },
    aoFalhar: () => undefined,
  })
  const reserva: TtsEngine = { speak: vi.fn(), cancel: vi.fn() }
  const voz = criarVozDaNuvem({
    reserva,
    tocador,
    guardados: null,
    buscar: async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }),
  })
  return { voz, terminar: () => fim?.(), parar }
}

const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('ponte da voz', () => {
  it('desligada: devolve o mesmo motor, sem invólucro', () => {
    const motor: TtsEngine = { speak: vi.fn(), cancel: vi.fn() }
    const ponte = criarPonteDaVoz()
    expect(ponte.envolver(motor)).toBe(motor)
    expect(ponte.falando()).toBe(false)
    expect(ponte.pose()).toBeNull()
  })

  it('ligada, voz da nuvem: o guarda de eco liga ao tocar, a cauda vale no fim, e os callbacks seguem a ordem', async () => {
    const { voz, terminar } = nuvemFalsa()
    const ponte = criarPonteDaVoz()
    ponte.ativar(true)
    const motor = ponte.envolver(voz)
    expect(motor).not.toBe(voz)

    const ordem: string[] = []
    const opts: SpeakOptions = {
      lang: 'en-US',
      onStart: () => ordem.push('start'),
      onEnd: () => ordem.push('end'),
    }
    expect(isTtsActive()).toBe(false)
    motor.speak('good morning', opts)
    await vi.waitFor(() => expect(ordem).toEqual(['start']))
    expect(isTtsActive()).toBe(true) // o microfone ignora o que o app fala
    expect(ponte.falando()).toBe(true)
    terminar()
    await esperar()
    expect(ordem).toEqual(['start', 'end'])
    expect(ponte.falando()).toBe(false)
    expect(isTtsActive()).toBe(true) // a cauda de 800 ms ainda protege do eco
    expect(isTtsActive(0)).toBe(false)
  })

  it('cancelar corta o áudio da nuvem e desliga o avatar', async () => {
    const { voz, parar } = nuvemFalsa()
    const ponte = criarPonteDaVoz()
    ponte.ativar(true)
    const motor = ponte.envolver(voz)
    const onStart = vi.fn()
    motor.speak('hello', { lang: 'en-US', onStart })
    await vi.waitFor(() => expect(onStart).toHaveBeenCalled())
    motor.cancel()
    expect(parar).toHaveBeenCalled()
    expect(ponte.falando()).toBe(false)
  })

  it('desligar no meio da conversa devolve o motor original e solta a ligação', () => {
    const { voz } = nuvemFalsa()
    const ponte = criarPonteDaVoz()
    ponte.ativar(true)
    expect(ponte.envolver(voz)).not.toBe(voz)
    ponte.ativar(false)
    expect(ponte.envolver(voz)).toBe(voz)
  })
})
