import { describe, expect, it } from 'vitest'

import { navegadorSemAudioDaTela } from '../src/lib/captura/navegadorSemAudioDaTela'

const UA = {
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
}

describe('navegadorSemAudioDaTela', () => {
  it('Firefox e Safari não entregam o som da tela ou da aba', () => {
    expect(navegadorSemAudioDaTela(UA.firefox)).toBe(true)
    expect(navegadorSemAudioDaTela(UA.safariMac)).toBe(true)
  })

  it('Chrome, Edge, Opera e Chrome do Android entregam (ou não são o caso)', () => {
    expect(navegadorSemAudioDaTela(UA.chrome)).toBe(false)
    expect(navegadorSemAudioDaTela(UA.edge)).toBe(false)
    expect(navegadorSemAudioDaTela(UA.opera)).toBe(false)
    expect(navegadorSemAudioDaTela(UA.chromeAndroid)).toBe(false)
  })

  it('user agent vazio não é tratado como Firefox/Safari', () => {
    expect(navegadorSemAudioDaTela('')).toBe(false)
  })
})
