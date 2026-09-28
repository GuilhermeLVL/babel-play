// @vitest-environment jsdom
/**
 * A CONVERSA NÃO CONGELA COM A SESSÃO LONGA (ei/f2). Medido no Playwright com falas injetadas: 3.000
 * falas davam 48 mil nós no DOM e 191 ms por quadro parado, e a lista inteira re-renderizava a cada
 * mudança de estado da tela — inclusive o relógio de 1 s. Aqui ficam as três travas:
 *
 *  1. o relógio (qualquer estado do pai que não é da conversa) NÃO re-renderiza a transcrição;
 *  2. uma fala nova re-renderiza SÓ a sua linha, não as outras;
 *  3. só as últimas falas vão ao DOM, com "Mostrar falas anteriores (N)" abrindo em páginas — e a
 *     fala em que a pessoa tocou não some quando a janela desliza.
 *
 * A contagem é por espião nas duas funções que cada render chama exatamente uma vez: o estilo da
 * transcrição (uma por render do componente) e a chave da palavra (uma por palavra renderizada).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const conta = vi.hoisted(() => ({ estilo: 0, palavra: 0 }))

vi.mock('../src/lib/transcriptUtils', async (original) => {
  const real = await original<typeof import('../src/lib/transcriptUtils')>()
  return {
    ...real,
    getTranscriptStyleClasses: (s: Parameters<typeof real.getTranscriptStyleClasses>[0]) => {
      conta.estilo++
      return real.getTranscriptStyleClasses(s)
    },
  }
})
vi.mock('../src/lib/estilosDeLegenda', async (original) => {
  const real = await original<typeof import('../src/lib/estilosDeLegenda')>()
  return {
    ...real,
    chaveDaPalavra: (p: string) => {
      conta.palavra++
      return real.chaveDaPalavra(p)
    },
  }
})

import ChatTranscript, { type ChatSegment, JANELA_DA_CONVERSA } from '../src/components/ChatTranscript'
import { DEFAULT_TRANSCRIPT_SETTINGS } from '../src/lib/transcriptUtils'

const fala = (i: number, extra: Partial<ChatSegment> = {}): ChatSegment => ({
  id: `s${i}`,
  speakerId: 'a',
  source: 'system',
  timestamp: '00:00',
  originalText: `fala numero ${i}`,
  translatedText: `tradução ${i}`,
  words: [],
  ...extra,
})
const falas = (n: number) => Array.from({ length: n }, (_, i) => fala(i))

const SPEAKERS = [{ id: 'a', name: 'Outros', color: '#333' }]
const APRENDIDAS: ReadonlySet<string> = new Set()
const ADDED: string[] = []
const noop = () => {}

/** Props estáveis, como a tela passa depois do memo — só o que o teste troca muda. */
const base = {
  speakers: SPEAKERS,
  scenario: 'media' as const,
  tsSettings: DEFAULT_TRANSCRIPT_SETTINGS,
  ageProfile: 'pro' as never,
  sourceLang: 'pt',
  targetLang: 'en',
  isRecording: true,
  selectedWord: null,
  addedWords: ADDED,
  aprendidas: APRENDIDAS,
  onExamineWord: noop,
  onSpeakWord: noop,
}

beforeEach(() => {
  conta.estilo = 0
  conta.palavra = 0
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ChatTranscript: memo', () => {
  it('o relógio de 1 s do pai NÃO re-renderiza a transcrição', () => {
    vi.useFakeTimers()
    const segs = falas(5)
    function Tela() {
      const [timer, setTimer] = useState(0)
      React.useEffect(() => {
        const iv = setInterval(() => setTimer((t) => t + 1), 1000)
        return () => clearInterval(iv)
      }, [])
      return (
        <>
          <span data-testid="relogio">{timer}</span>
          <ChatTranscript {...base} segments={segs} />
        </>
      )
    }
    render(<Tela />)
    const depoisDoPrimeiro = conta.estilo
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByTestId('relogio').textContent).toBe('5')
    expect(conta.estilo).toBe(depoisDoPrimeiro)
  })

  it('uma fala nova re-renderiza só a SUA linha (as antigas ficam como estão)', () => {
    const segs = falas(50)
    const { rerender } = render(<ChatTranscript {...base} segments={segs} />)
    conta.palavra = 0
    rerender(<ChatTranscript {...base} segments={[...segs, fala(50)]} />)
    // "fala numero 50" = 3 palavras; sem o memo por linha seriam 51 × 3.
    expect(conta.palavra).toBe(3)
  })

  it('callbacks novos a cada render não derrubam o memo das linhas', () => {
    const segs = falas(20)
    const { rerender } = render(<ChatTranscript {...base} segments={segs} onExamineWord={() => {}} />)
    conta.palavra = 0
    rerender(<ChatTranscript {...base} segments={segs} onExamineWord={() => {}} onSpeakWord={() => {}} />)
    expect(conta.palavra).toBe(0)
  })

  it('o callback mais recente é o chamado (a linha memorizada não prende o antigo)', () => {
    const antigo = vi.fn()
    const novo = vi.fn()
    const segs = [fala(0, { originalText: 'hello' })]
    const { rerender } = render(<ChatTranscript {...base} segments={segs} onSpeakWord={antigo} />)
    rerender(<ChatTranscript {...base} segments={segs} onSpeakWord={novo} />)
    fireEvent.click(screen.getByText('hello'))
    expect(antigo).not.toHaveBeenCalled()
    expect(novo).toHaveBeenCalledWith('hello', 'en')
  })
})

describe('ChatTranscript: janela das últimas falas', () => {
  it('com poucas falas, mostra todas e nenhum botão', () => {
    render(<ChatTranscript {...base} segments={falas(30)} />)
    expect(document.querySelectorAll('.fala')).toHaveLength(30)
    expect(screen.queryByRole('button', { name: /Mostrar falas anteriores/ })).toBeNull()
  })

  it('com muitas, só as últimas vão ao DOM e o botão abre as anteriores em páginas', () => {
    const n = JANELA_DA_CONVERSA * 2 + 100
    render(<ChatTranscript {...base} segments={falas(n)} />)
    const visiveis = () => [...document.querySelectorAll('.fala')]
    expect(visiveis()).toHaveLength(JANELA_DA_CONVERSA)
    // A última fala está lá; a primeira, não.
    expect(visiveis().at(-1)!.textContent).toContain(`${n - 1}`)
    const botao = screen.getByRole('button', {
      name: `Mostrar falas anteriores (${n - JANELA_DA_CONVERSA})`,
    })
    fireEvent.click(botao)
    expect(visiveis()).toHaveLength(JANELA_DA_CONVERSA * 2)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar falas anteriores (100)' }))
    expect(visiveis()).toHaveLength(n)
    expect(visiveis()[0].textContent).toContain('fala numero 0')
    expect(screen.queryByRole('button', { name: /Mostrar falas anteriores/ })).toBeNull()
  })

  it('a fala em que a pessoa tocou continua no DOM quando a janela desliza', () => {
    const onSpeakWord = vi.fn()
    const segs = falas(JANELA_DA_CONVERSA)
    const { rerender } = render(<ChatTranscript {...base} segments={segs} onSpeakWord={onSpeakWord} />)
    const primeira = document.querySelector('.fala .w')!
    fireEvent.click(primeira)
    expect(onSpeakWord).toHaveBeenCalledOnce()
    // Chegam 300 falas novas: sem a trava, a fala 0 sairia da janela.
    const mais = [...segs, ...Array.from({ length: 300 }, (_, i) => fala(JANELA_DA_CONVERSA + i))]
    rerender(<ChatTranscript {...base} segments={mais} onSpeakWord={onSpeakWord} />)
    expect(document.querySelector('.fala')!.textContent).toContain('fala numero 0')
  })
})
