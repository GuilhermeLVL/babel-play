// @vitest-environment jsdom
/**
 * A FALA QUE ESPERA O TRADUTOR diz isso na linha da tradução (relato do dono no celular, 2026-09-29):
 * "Baixando o tradutor… 42%" enquanto o download anda, "Preparando a tradução…" sem porcentagem — e
 * não o original entre parênteses com a faixa de falha. Só as falas pendentes mudam de texto.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import ChatTranscript, { type ChatSegment } from '../src/components/ChatTranscript'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const fala = (id: string, extra: Partial<ChatSegment> = {}): ChatSegment => ({
  id,
  speakerId: 'a',
  source: 'mic',
  timestamp: '00:00',
  originalText: `fala ${id}`,
  translatedText: '…',
  words: [],
  ...extra,
})

const noop = () => {}
const props = {
  speakers: [{ id: 'a', name: 'Você', color: '#333' }],
  scenario: 'mic' as const,
  tsSettings: DEFAULT_TRANSCRIPT_SETTINGS,
  ageProfile: 'pro' as never,
  sourceLang: 'pt',
  targetLang: 'en',
  isRecording: true,
  selectedWord: null,
  addedWords: [],
  onExamineWord: noop,
  onSpeakWord: noop,
}

afterEach(() => cleanup())

describe('ChatTranscript: tradução pendente', () => {
  it('com o download andando, a fala pendente mostra a porcentagem; as outras seguem iguais', () => {
    render(
      <ChatTranscript
        {...props}
        segments={[fala('a', { traducaoPendente: true }), fala('b', { translatedText: 'already' })]}
        progressoDoTradutor={0.42}
      />,
    )
    expect(screen.getAllByTestId('traducao-pendente')).toHaveLength(1)
    expect(screen.getByTestId('traducao-pendente').textContent).toBe('Baixando o tradutor… 42%')
    expect(screen.getByText('already')).toBeTruthy()
  })

  it('sem porcentagem (ou já em 100%, carregando), "Preparando a tradução…"', () => {
    render(<ChatTranscript {...props} segments={[fala('a', { traducaoPendente: true })]} progressoDoTradutor={null} />)
    expect(screen.getByTestId('traducao-pendente').textContent).toBe('Preparando a tradução…')
  })

  it('a tradução que chegou tira o rótulo', () => {
    render(
      <ChatTranscript
        {...props}
        segments={[fala('a', { traducaoPendente: true, translatedText: 'Good morning' })]}
        progressoDoTradutor={0.5}
      />,
    )
    expect(screen.queryByTestId('traducao-pendente')).toBeNull()
    expect(screen.getByText('Good morning')).toBeTruthy()
  })
})
