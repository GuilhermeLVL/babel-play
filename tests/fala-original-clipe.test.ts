// @vitest-environment jsdom
/**
 * `falaOriginal` com o clipe do cartão (openspec `cartao-com-audio-do-trecho`, tarefa 2.4): com clipe, a sessão NÃO é baixada
 * (`urlDeAudio` não é chamado); sem clipe, cai no trecho da sessão e depois na voz do aparelho.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const urlDeAudio = vi.fn()
const falar = vi.fn()
const abrirClipe = vi.fn()

vi.mock('../src/lib/audioDaSessao', () => ({ urlDeAudio: (...a: unknown[]) => urlDeAudio(...a), liberar: vi.fn() }))
vi.mock('../src/lib/tts', () => ({
  cancelSpeech: vi.fn(),
  falar: (...a: unknown[]) => falar(...a),
}))
vi.mock('../src/lib/voz/haVoz', () => ({ haVozPara: () => true }))
vi.mock('../src/lib/cartoes/audioDoCartao', () => ({ abrirClipeDoCartao: (...a: unknown[]) => abrirClipe(...a) }))

import type { CenaDoCartao } from '../src/lib/revisao/cena'
import { criarTocador } from '../src/lib/revisao/falaOriginal'

const cena: CenaDoCartao = {
  sessionId: 's1',
  titulo: 'Reunião',
  quem: 'A',
  frase: 'She went to the market',
  traducao: '',
  inicioMs: 1000,
  fimMs: 3000,
  temAudio: true,
}

let tocados: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  tocados = []
  URL.createObjectURL = vi.fn(() => 'blob:clipe') as never
  URL.revokeObjectURL = vi.fn() as never
  /* o elemento de áudio falso: `play` resolve e `onended` dispara logo depois */
  class AudioFalso {
    src = ''
    playbackRate = 1
    currentTime = 0
    onended: (() => void) | null = null
    onerror: (() => void) | null = null
    addEventListener(_: string, f: () => void) {
      f()
    }
    pause() {}
    async play() {
      tocados.push(this.src)
      setTimeout(() => this.onended?.(), 0)
    }
  }
  globalThis.Audio = AudioFalso as never
  falar.mockImplementation((_t: string, _i: string, o: { onEnd: () => void }) => {
    o.onEnd()
    return true
  })
})

describe('falaOriginal com clipe do cartão', () => {
  it('com clipe, toca o clipe e não baixa a sessão nem usa a voz', async () => {
    abrirClipe.mockResolvedValue(new Blob([new Uint8Array(10)]))
    await criarTocador().original(cena, 'en', 1, 'c1')
    expect(abrirClipe).toHaveBeenCalledWith('c1')
    expect(tocados).toEqual(['blob:clipe'])
    expect(urlDeAudio).not.toHaveBeenCalled()
    expect(falar).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clipe')
  })

  it('sem clipe, cai no trecho da sessão', async () => {
    abrirClipe.mockResolvedValue(null)
    urlDeAudio.mockResolvedValue('blob:sessao')
    await criarTocador().original(cena, 'en', 1, 'c1')
    expect(urlDeAudio).toHaveBeenCalledWith('s1')
  })

  it('sem clipe e sem áudio da sessão, cai na voz do aparelho', async () => {
    abrirClipe.mockResolvedValue(null)
    await criarTocador().original({ ...cena, temAudio: false }, 'en', 1, 'c1')
    expect(urlDeAudio).not.toHaveBeenCalled()
    expect(falar).toHaveBeenCalled()
  })

  it('sem o id do cartão, o armazém nem é consultado (comportamento de hoje)', async () => {
    await criarTocador().original({ ...cena, temAudio: false }, 'en')
    expect(abrirClipe).not.toHaveBeenCalled()
    expect(falar).toHaveBeenCalled()
  })
})
