import { afterEach, describe, expect, it } from 'vitest'

import {
  converterEscritaChinesa,
  escritaDoIdioma,
  esquecerEscritaChinesa,
  prepararEscritaChinesa,
} from '../src/lib/captura/escritaChinesa'

/**
 * A ESCRITA DO CHINÊS: o Whisper devolve 简体 ou 繁體 conforme o provedor (medido: o mesmo áudio saiu com `氣` num provedor e tudo
 * simplificado em outro). O texto vai para a escrita da variante que a pessoa escolheu, e só quando o idioma é chinês.
 */
const TRADICIONAL = '我喜歡學習中文。今天天氣很好,我們去公園散步吧!'
const SIMPLIFICADA = '我喜欢学习中文。今天天气很好,我们去公园散步吧!'

afterEach(() => esquecerEscritaChinesa())

describe('escritaDoIdioma', () => {
  it.each(['zh', 'zh-CN', 'zh_CN', 'ZH-cn', 'zh-SG', 'zh-Hans', 'zh-Hans-CN'])('%s é simplificada', (l) => {
    expect(escritaDoIdioma(l)).toBe('simplificada')
  })

  it.each(['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh_tw'])('%s é tradicional', (l) => {
    expect(escritaDoIdioma(l)).toBe('tradicional')
  })

  it.each(['ja', 'ja-JP', 'ko-KR', 'en-US', 'pt-BR', '', null, undefined])('%s não é chinês', (l) => {
    expect(escritaDoIdioma(l as string)).toBeNull()
  })
})

describe('converterEscritaChinesa', () => {
  it('sem o conversor carregado, o texto passa como veio (nunca bloqueia a fala)', () => {
    expect(converterEscritaChinesa(TRADICIONAL, 'zh-CN')).toBe(TRADICIONAL)
  })

  it('carregado, tradicional → simplificada para zh e zh-CN', async () => {
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa(TRADICIONAL, 'zh-CN')).toBe(SIMPLIFICADA)
    expect(converterEscritaChinesa(TRADICIONAL, 'zh')).toBe(SIMPLIFICADA)
  })

  it('o que já está simplificado fica igual (idempotente)', async () => {
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa(SIMPLIFICADA, 'zh-CN')).toBe(SIMPLIFICADA)
  })

  it('zh-TW pede o contrário: simplificada → tradicional', async () => {
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa(SIMPLIFICADA, 'zh-TW')).toBe(TRADICIONAL)
  })

  it('só chinês: japonês, coreano, português e inglês passam intactos', async () => {
    await prepararEscritaChinesa()
    const ja = 'こんにちは、元気ですか？私は言語を勉強します。'
    expect(converterEscritaChinesa(ja, 'ja-JP')).toBe(ja)
    expect(converterEscritaChinesa('저는 언어를 공부해요.', 'ko-KR')).toBe('저는 언어를 공부해요.')
    expect(converterEscritaChinesa('Eu gosto de estudar.', 'pt-BR')).toBe('Eu gosto de estudar.')
  })

  it('números, latim e pontuação dentro de uma frase chinesa ficam como estão', async () => {
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa('我們在 2026 年學 Python。', 'zh-CN')).toBe('我们在 2026 年学 Python。')
  })

  it('texto vazio devolve vazio', async () => {
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa('', 'zh-CN')).toBe('')
  })

  it('prepararEscritaChinesa pode ser chamado várias vezes', async () => {
    await Promise.all([prepararEscritaChinesa(), prepararEscritaChinesa(), prepararEscritaChinesa()])
    await prepararEscritaChinesa()
    expect(converterEscritaChinesa('學', 'zh')).toBe('学')
  })
})
