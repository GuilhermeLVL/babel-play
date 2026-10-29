import { afterEach, describe, expect, it, vi } from 'vitest'

import { cancelSpeech, setEnvolturaDaFala, setTtsEngine, speak, type TtsEngine } from '../src/lib/tts'

const motor = () => ({ speak: vi.fn(), cancel: vi.fn() }) satisfies TtsEngine

describe('envoltura da fala (o avatar escuta quem fala pelo ponto único)', () => {
  afterEach(() => setEnvolturaDaFala(null))

  it('sem envoltura, a fala vai direto ao motor', () => {
    const m = motor()
    setTtsEngine(m)
    speak('olá', { lang: 'pt-BR' })
    expect(m.speak).toHaveBeenCalledWith('olá', { lang: 'pt-BR' })
  })

  it('com envoltura, fala e cancelamento passam por ela', () => {
    const m = motor()
    const embrulhado = motor()
    const envolver = vi.fn(() => embrulhado)
    setTtsEngine(m)
    setEnvolturaDaFala(envolver)
    speak('olá', { lang: 'pt-BR' })
    expect(envolver).toHaveBeenCalledWith(m)
    expect(embrulhado.speak).toHaveBeenCalledOnce()
    expect(m.speak).not.toHaveBeenCalled()
    cancelSpeech()
    expect(embrulhado.cancel).toHaveBeenCalledOnce()
  })

  it('tirar a envoltura devolve o motor direto', () => {
    const m = motor()
    setTtsEngine(m)
    setEnvolturaDaFala(() => motor())
    setEnvolturaDaFala(null)
    speak('a', { lang: 'pt-BR' })
    expect(m.speak).toHaveBeenCalledOnce()
  })
})
