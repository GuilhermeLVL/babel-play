// @vitest-environment jsdom
/**
 * O TTS FALA NO IDIOMA DO TEXTO — ou não fala (auditoria 2026-09-26, idioma da sessão).
 *
 * Sem voz do idioma, `u.voice` ficava vazio e o navegador lia com a voz PADRÃO do sistema, em geral
 * inglesa: a palavra portuguesa saía com pronúncia americana. E `u.lang = 'pt'` deixava a variante
 * ao acaso. Agora: BCP-47 certo, melhor voz do idioma e, sem voz, aviso em vez de voz errada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type VozFalsa = { lang: string; name: string; localService?: boolean }

class UtteranceFalsa {
  lang = ''
  voice: VozFalsa | null = null
  rate = 1
  pitch = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

function instalar(vozes: VozFalsa[]) {
  const falas: UtteranceFalsa[] = []
  vi.stubGlobal('SpeechSynthesisUtterance', UtteranceFalsa)
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => vozes,
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

async function carregar() {
  vi.resetModules()
  return import('../src/lib/tts')
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

describe('falar(texto, idioma)', () => {
  it('pt vira pt-BR e usa a voz portuguesa (nunca a inglesa)', async () => {
    const falas = instalar([
      { lang: 'en-US', name: 'Microsoft Aria Online (Natural)' },
      { lang: 'pt-BR', name: 'Microsoft Francisca Online (Natural)' },
    ])
    const tts = await carregar()
    expect(tts.falar('reunião', 'pt')).toBe(true)
    expect(falas).toHaveLength(1)
    expect(falas[0].voice?.name).toBe('Microsoft Francisca Online (Natural)')
    expect(falas[0].lang).toBe('pt-BR')
  })

  it('en continua em inglês', async () => {
    const falas = instalar([
      { lang: 'en-US', name: 'Aria' },
      { lang: 'pt-BR', name: 'Francisca' },
    ])
    const tts = await carregar()
    tts.falar('meeting', 'en')
    expect(falas[0].voice?.name).toBe('Aria')
    expect(falas[0].lang).toBe('en-US')
  })

  it('sem voz do idioma: não fala com voz de outro idioma e avisa uma vez', async () => {
    const falas = instalar([{ lang: 'en-US', name: 'Aria' }])
    const tts = await carregar()
    const avisos: string[] = []
    tts.aoFaltarVoz((l) => avisos.push(l))
    const erro = vi.fn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    tts.falar('reunião', 'pt', { onError: erro })
    tts.falar('amanhã', 'pt')
    expect(falas).toHaveLength(0)
    expect(erro).toHaveBeenCalledOnce()
    expect(avisos).toEqual(['pt-BR'])
  })

  it('lista de vozes ainda vazia ("não sei"): fala com o lang BCP-47 e deixa o navegador escolher', async () => {
    const falas = instalar([])
    const tts = await carregar()
    tts.falar('reunião', 'pt')
    expect(falas).toHaveLength(1)
    expect(falas[0].lang).toBe('pt-BR')
  })

  it('idioma vazio não fala (sem default silencioso)', async () => {
    const falas = instalar([{ lang: 'en-US', name: 'Aria' }])
    const tts = await carregar()
    expect(tts.falar('palavra', '')).toBe(false)
    expect(falas).toHaveLength(0)
  })

  it('codigoDeFala mantém a região informada', async () => {
    instalar([])
    const tts = await carregar()
    expect(tts.codigoDeFala('pt')).toBe('pt-BR')
    expect(tts.codigoDeFala('pt-PT')).toBe('pt-PT')
    expect(tts.codigoDeFala('pt_BR')).toBe('pt-BR')
    expect(tts.codigoDeFala('')).toBe('')
  })
})
