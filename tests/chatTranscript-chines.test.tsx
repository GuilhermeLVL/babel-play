// @vitest-environment jsdom
/**
 * O ORIGINAL EM CHINÊS NA CONVERSA: sem espaço entre as palavras, `split(' ')` entregava a frase inteira como
 * UMA palavra, que nunca casava com as palavras do vocabulário (`学习`, `中文`): nenhuma ficava tocável nem
 * destacada. Cada pedaço agora vem partido nas palavras dele (`palavrasDoPedaco`), sem inserir espaço no texto.
 */
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ChatTranscript, { type ChatSegment } from '../src/components/ChatTranscript'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const fala = (extra: Partial<ChatSegment>): ChatSegment => ({
  id: 's1',
  speakerId: 'a',
  source: 'system',
  timestamp: '00:00',
  originalText: '',
  translatedText: 'Eu gosto de estudar chinês.',
  words: [],
  ...extra,
})

const props = {
  speakers: [{ id: 'a', name: 'Alguém', color: '#333' }],
  scenario: 'media' as const,
  tsSettings: DEFAULT_TRANSCRIPT_SETTINGS,
  ageProfile: 'pro' as never,
  sourceLang: 'pt',
  targetLang: 'zh',
  isRecording: true,
  selectedWord: null,
  addedWords: [],
  onSpeakWord: () => {},
}

afterEach(() => cleanup())

describe('ChatTranscript: original em chinês', () => {
  it('as palavras do vocabulário viram botões e o texto não ganha espaços', () => {
    const onExamineWord = vi.fn()
    const { container } = render(
      <ChatTranscript
        {...props}
        onExamineWord={onExamineWord}
        segments={[
          fala({
            lang: 'zh',
            originalText: '我喜欢学习中文。',
            words: [
              { word: '学习', translation: '' },
              { word: '中文', translation: '' },
            ],
          }),
        ]}
      />,
    )
    const botoes = Array.from(container.querySelectorAll('button.palavra')).map((b) => b.textContent)
    expect(botoes).toEqual(['学习', '中文'])
    expect(container.querySelector('.orig')?.textContent?.replace(/\s+/g, '')).toBe('我喜欢学习中文。')
    expect(container.querySelector('.orig')?.textContent?.trim()).toBe('我喜欢学习中文。')
  })

  it('toque numa palavra do vocabulário examina só ela', () => {
    const onExamineWord = vi.fn()
    const { container } = render(
      <ChatTranscript
        {...props}
        onExamineWord={onExamineWord}
        segments={[fala({ lang: 'zh', originalText: '我喜欢学习中文。', words: [{ word: '学习', translation: '' }] })]}
      />,
    )
    ;(container.querySelector('button.palavra') as HTMLButtonElement).click()
    expect(onExamineWord).toHaveBeenCalledWith({ word: '学习', translation: '' }, 'zh-CN', '我喜欢学习中文。')
  })

  it('a pontuação do chinês não vira palavra tocável', () => {
    const { container } = render(
      <ChatTranscript
        {...props}
        onExamineWord={() => {}}
        segments={[fala({ lang: 'zh', originalText: '你好，世界！', words: [] })]}
      />,
    )
    const tocaveis = Array.from(container.querySelectorAll('.orig .w')).map((n) => n.textContent)
    expect(tocaveis).not.toContain('，')
    expect(tocaveis).not.toContain('！')
    expect(tocaveis).toEqual(expect.arrayContaining(['你好', '世界']))
  })

  it('idioma com espaço segue igual: uma palavra por pedaço, espaço entre elas', () => {
    const { container } = render(
      <ChatTranscript
        {...props}
        onExamineWord={() => {}}
        segments={[
          fala({ lang: 'en', originalText: 'I like well-known tea', words: [{ word: 'well-known', translation: '' }] }),
        ]}
      />,
    )
    expect(container.querySelector('.orig')?.textContent?.trim()).toBe('I like well-known tea')
    expect(Array.from(container.querySelectorAll('button.palavra')).map((b) => b.textContent)).toEqual(['well-known'])
  })
})
