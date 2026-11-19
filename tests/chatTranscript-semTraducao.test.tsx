// @vitest-environment jsdom
/**
 * A LINHA SEM TRADUÇÃO NÃO FINGE QUE TRADUZIU (CEL-01, auditoria de 17/11/2026). No celular, o espanhol aparecia entre
 * parênteses, em letra grande, no lugar da tradução — e a pessoa não percebia o aviso de 8 s. Agora a linha mostra o
 * motivo: "Sem tradução neste aparelho" (o par não tem rota) ou "Tradução indisponível agora" com "Tentar de novo".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ChatTranscript, { type ChatSegment } from '../src/components/ChatTranscript'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const ORIGINAL = 'Perdón, ¿dónde está la salida?'
const fala = (extra: Partial<ChatSegment> = {}): ChatSegment => ({
  id: 'a',
  speakerId: 'a',
  source: 'system',
  timestamp: '00:00',
  originalText: ORIGINAL,
  translatedText: '',
  words: [],
  ...extra,
})

const noop = () => {}
const props = {
  speakers: [{ id: 'a', name: 'Eles', color: '#333' }],
  scenario: 'media' as const,
  tsSettings: DEFAULT_TRANSCRIPT_SETTINGS,
  ageProfile: 'pro' as never,
  sourceLang: 'pt',
  targetLang: 'es',
  isRecording: true,
  selectedWord: null,
  addedWords: [],
  onExamineWord: noop,
  onSpeakWord: noop,
}

afterEach(() => cleanup())

describe('ChatTranscript: linha sem tradução', () => {
  it('falha da cadeia: "Tradução indisponível agora · Tentar de novo", sem o original entre parênteses', () => {
    const aoTentar = vi.fn()
    const { container } = render(
      <ChatTranscript {...props} segments={[fala({ semTraducao: 'falhou' })]} onTentarTraducaoDeNovo={aoTentar} />,
    )
    expect(screen.getByTestId('sem-traducao').textContent).toContain('Tradução indisponível agora')
    expect(container.textContent).not.toContain(`(${ORIGINAL})`)
    fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    expect(aoTentar).toHaveBeenCalledWith('a')
  })

  it('par sem rota no aparelho: "Sem tradução neste aparelho", sem botão de tentar', () => {
    const { container } = render(<ChatTranscript {...props} segments={[fala({ semTraducao: 'sem-rota' })]} />)
    expect(screen.getByTestId('sem-traducao').textContent).toBe('Sem tradução neste aparelho')
    expect(screen.queryByRole('button', { name: /Tentar de novo/ })).toBeNull()
    expect(container.textContent).not.toContain(`(${ORIGINAL})`)
  })

  it('o original continua no lugar dele (uma vez só)', () => {
    const { container } = render(<ChatTranscript {...props} segments={[fala({ semTraducao: 'falhou' })]} />)
    expect(container.textContent?.split('salida').length).toBe(2)
  })
})
