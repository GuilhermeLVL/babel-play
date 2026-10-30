// @vitest-environment jsdom
/**
 * `SpeakOptions.onBoundary` (M3 do avatar): OPCIONAL e compatível. O `NativeTts` só liga o `onboundary` da
 * fala quando alguém o pediu; quem não pede (Reading e o resto) continua com a mesma fala de antes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

class UtteranceFalsa {
  lang = ''
  voice: unknown = null
  rate = 1
  pitch = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onboundary: ((e: { charIndex?: number; name?: string }) => void) | null = null
  constructor(public text: string) {}
}

function instalar() {
  const falas: UtteranceFalsa[] = []
  vi.stubGlobal('SpeechSynthesisUtterance', UtteranceFalsa)
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [{ lang: 'pt-BR', name: 'Francisca' }],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      speak: (u: UtteranceFalsa) => falas.push(u),
      cancel: vi.fn(),
      resume: vi.fn(),
      paused: false,
    },
  })
  return falas
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('NativeTts: onBoundary opcional', () => {
  it('repassa o charIndex das palavras e ignora marcos de frase', async () => {
    const falas = instalar()
    const { speak } = await import('../src/lib/tts')
    const marcos: number[] = []
    const onEnd = vi.fn()
    speak('Bom dia a todos', { lang: 'pt-BR', onBoundary: (i) => marcos.push(i), onEnd })
    const u = falas[0]
    expect(u.onboundary).toBeTypeOf('function')
    u.onboundary!({ charIndex: 0, name: 'word' })
    u.onboundary!({ charIndex: 4, name: 'word' })
    u.onboundary!({ charIndex: 0, name: 'sentence' })
    u.onboundary!({ charIndex: 8 }) // navegador sem `name`
    u.onboundary!({ name: 'word' }) // sem charIndex: ignora
    expect(marcos).toEqual([0, 4, 8])
    u.onend!()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('sem onBoundary nada é ligado (compatível com quem já usa)', async () => {
    const falas = instalar()
    const { speak } = await import('../src/lib/tts')
    const onStart = vi.fn()
    speak('Olá', { lang: 'pt-BR', onStart })
    expect(falas[0].onboundary).toBeNull()
    falas[0].onstart!()
    expect(onStart).toHaveBeenCalledTimes(1)
  })
})
