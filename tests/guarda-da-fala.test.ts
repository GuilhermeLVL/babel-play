/**
 * O keep-alive da fala do Chrome (relógio simulado) e o registro de motores de voz do gateway.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CAPACIDADES_DA_NUVEM } from '../src/core/voz/portaDeVoz'
import {
  motorDeVozRegistrado,
  neuralLocalPronto,
  neuralLocalRegistrado,
  registrarMotorDeVoz,
  reiniciarRegistroDeMotoresDeVoz,
} from '../src/gateway/registroDeMotoresDeVoz'
import { nativeTts } from '../src/lib/tts'
import { criarGuardaDaFala, INTERVALO_DO_KEEP_ALIVE_MS } from '../src/lib/voz/guardaDaFala'

afterEach(() => {
  vi.useRealTimers()
  reiniciarRegistroDeMotoresDeVoz()
})

function sintese() {
  const s = { speaking: true, paused: false, pause: vi.fn(), resume: vi.fn() }
  return s
}

describe('guarda da fala (keep-alive)', () => {
  it('a cada 10 s de fala faz pause() e resume(), nessa ordem', () => {
    vi.useFakeTimers()
    const s = sintese()
    const ordem: string[] = []
    s.pause.mockImplementation(() => ordem.push('pause'))
    s.resume.mockImplementation(() => ordem.push('resume'))
    const g = criarGuardaDaFala(s)
    g.iniciar()
    vi.advanceTimersByTime(INTERVALO_DO_KEEP_ALIVE_MS - 1)
    expect(s.pause).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ordem).toEqual(['pause', 'resume'])
    vi.advanceTimersByTime(INTERVALO_DO_KEEP_ALIVE_MS * 2)
    expect(s.pause).toHaveBeenCalledTimes(3)
    g.parar()
    vi.advanceTimersByTime(INTERVALO_DO_KEEP_ALIVE_MS * 3)
    expect(s.pause).toHaveBeenCalledTimes(3)
    expect(g.ativo).toBe(false)
  })

  it('não mexe numa fala que a pessoa pausou', () => {
    vi.useFakeTimers()
    const s = sintese()
    s.paused = true
    const g = criarGuardaDaFala(s)
    g.iniciar()
    vi.advanceTimersByTime(INTERVALO_DO_KEEP_ALIVE_MS * 3)
    expect(s.pause).not.toHaveBeenCalled()
    expect(s.resume).not.toHaveBeenCalled()
    expect(g.ativo).toBe(true)
  })

  it('desliga sozinho quando a fala acabou sem avisar', () => {
    vi.useFakeTimers()
    const s = sintese()
    const g = criarGuardaDaFala(s)
    g.iniciar()
    s.speaking = false
    vi.advanceTimersByTime(INTERVALO_DO_KEEP_ALIVE_MS)
    expect(s.pause).not.toHaveBeenCalled()
    expect(g.ativo).toBe(false)
  })

  it('iniciar duas vezes não empilha relógios', () => {
    vi.useFakeTimers()
    const s = sintese()
    const g = criarGuardaDaFala(s, { intervaloMs: 1000 })
    g.iniciar()
    g.iniciar()
    vi.advanceTimersByTime(1000)
    expect(s.pause).toHaveBeenCalledTimes(1)
  })

  it('aceita um relógio injetado', () => {
    const fns: Array<() => void> = []
    const limpos: unknown[] = []
    const g = criarGuardaDaFala(sintese(), {
      relogio: {
        setInterval: (fn) => (fns.push(fn), fns.length),
        clearInterval: (id) => limpos.push(id),
      },
    })
    g.iniciar()
    g.parar()
    expect(limpos).toEqual([1])
  })
})

describe('registro de motores de voz', () => {
  it('de fábrica: aparelho e nuvem, e nenhum neural local', async () => {
    expect(motorDeVozRegistrado('aparelho')?.criar()).toBe(nativeTts)
    expect(motorDeVozRegistrado('nuvem')?.capacidades).toEqual(CAPACIDADES_DA_NUVEM)
    expect(neuralLocalRegistrado()).toBe(false)
    expect(neuralLocalPronto('pt')).toBe(false)
  })

  it('o ponto do motor neural futuro: registrar basta, e o "pronto" é por idioma', () => {
    registrarMotorDeVoz({
      id: 'neural-local',
      capacidades: { ...CAPACIDADES_DA_NUVEM, textoSaiDoAparelho: false },
      pronto: (idioma) => idioma.startsWith('en'),
      criar: () => nativeTts,
    })
    expect(neuralLocalRegistrado()).toBe(true)
    expect(neuralLocalPronto('en-US')).toBe(true)
    expect(neuralLocalPronto('pt-BR')).toBe(false)
  })
})
