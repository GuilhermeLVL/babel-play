// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ehWebKitDeToque, fonteDeAudioDaVoz, prepararAnalisadorDaVoz } from '../src/lib/avatar/amplitude'
import { destravarComAvatar } from '../src/lib/avatar/destravarComAvatar'

function contextoFalso(estado: string = 'running') {
  const ouvintes = new Map<string, () => void>()
  const ctx = {
    state: estado,
    destination: {},
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    close: vi.fn(async () => undefined),
    addEventListener: (nome: string, cb: () => void) => ouvintes.set(nome, cb),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn() })),
    createAnalyser: () => ({
      fftSize: 0,
      smoothingTimeConstant: 0,
      getByteTimeDomainData: (b: Uint8Array) => b.fill(128 + 64),
    }),
  }
  return { ctx, mudar: (s: string) => ((ctx.state = s), ouvintes.get('statechange')?.()) }
}

afterEach(() => vi.restoreAllMocks())

describe('destravar com avatar', () => {
  it('sem avatar: só o destravador original, nada de Web Audio', () => {
    const original = vi.fn()
    destravarComAvatar(original, () => false)()
    expect(original).toHaveBeenCalledTimes(1)
  })
  it('com avatar: o original roda primeiro, no mesmo gesto', () => {
    const ordem: string[] = []
    const original = vi.fn(() => ordem.push('original'))
    destravarComAvatar(original, () => (ordem.push('ativo?'), true))()
    expect(ordem).toEqual(['original', 'ativo?'])
  })
})

describe('contexto de áudio suspenso ou interrompido', () => {
  it('iPhone/iPad: o analisador nem é ligado (o som da tradução vale mais que a boca)', async () => {
    const el = document.createElement('audio')
    const { ctx } = contextoFalso()
    expect(await prepararAnalisadorDaVoz(el, () => ctx as unknown as AudioContext, true)).toBe(false)
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled()
    expect(ehWebKitDeToque({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', maxTouchPoints: 5 })).toBe(true)
    expect(ehWebKitDeToque({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 })).toBe(true)
    expect(ehWebKitDeToque({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 })).toBe(false)
    expect(ehWebKitDeToque({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', maxTouchPoints: 0 })).toBe(false)
  })

  it('interrompido: a amplitude vira null (a boca cai na cadência) e volta no próximo gesto', async () => {
    const el = document.createElement('audio')
    const { ctx, mudar } = contextoFalso()
    expect(await prepararAnalisadorDaVoz(el, () => ctx as unknown as AudioContext, false)).toBe(true)
    const fonte = fonteDeAudioDaVoz(el)!
    expect(fonte.amplitude()).toBeCloseTo(0.5, 2)

    // o navegador interrompe e a retomada imediata é recusada (sem gesto)
    ctx.resume.mockImplementation(async () => {
      throw new DOMException('sem gesto', 'NotAllowedError')
    })
    mudar('interrupted')
    expect(fonte.amplitude()).toBeNull()

    // o próximo gesto retoma
    ctx.resume.mockImplementation(async () => {
      ctx.state = 'running'
    })
    document.dispatchEvent(new Event('pointerdown'))
    await vi.waitFor(() => expect(ctx.state).toBe('running'))
    expect(fonte.amplitude()).toBeCloseTo(0.5, 2)
  })
})
