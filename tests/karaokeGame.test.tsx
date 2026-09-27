// @vitest-environment jsdom
/**
 * O KARAOKÊ PODIA TERMINAR UMA RODADA VAZIA — E COMEMORAR ERRO NELA.
 *
 * O `ItemOutcome` só nascia dentro de `rec.onresult`. Passar por todas as falas sem falar produzia
 * um relatório com ZERO itens, e aí `todos.some(o => o.correct)` é falso numa lista vazia: o jogo
 * caía em `comemorar('erro')` e a raspadinha mostrava "0 de 0 · 0%". Ou seja, dizia que a pessoa
 * errou uma rodada em que nada foi avaliado.
 *
 * O mesmo arquivo já acertava esse princípio em outro lugar — quando não há reconhecimento de voz,
 * ele diz que não dá nota, porque "nota de pronúncia inventada seria pior que nenhuma". A rodada
 * vazia era a mesma situação por outro caminho.
 *
 * Estes testes travam três coisas: pular registra resultado, rodada vazia não comemora, e falar
 * várias vezes na mesma fala não a faz aparecer várias vezes no histórico.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoundReport } from '../src/core/minigames/types'

const comemorarMock = vi.fn()
/* `multiplicador` é stub: estes testes olham o RELATÓRIO da rodada, não a pontuação — ver a
   explicação em `blitzGame.test.tsx`, onde a dependência falsa quebrou de verdade. */
vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  tremor: vi.fn(),
  comemorar: comemorarMock,
  pontosDoElemento: vi.fn(),
  multiplicador: () => 1,
}))
/* `criarFalante` toca áudio/TTS — irrelevante aqui, e no jsdom `play()` nem existe. */
vi.mock('../src/lib/falante', () => ({
  criarFalante: () => ({ ouvir: vi.fn(), parar: vi.fn(), disponivel: true, modo: 'voz' }),
}))

const { default: KaraokeGame } = await import('../src/components/minigames/KaraokeGame')

/** Falas com id: sem `itemRef` o jogo não tem como saber que é a mesma fala. */
function falas() {
  return [
    {
      id: 'f1',
      texto: 'the cat is on the roof',
      translation: 'o gato está no telhado',
      startMs: 0,
      endMs: 2000,
      lang: 'en',
    },
    {
      id: 'f2',
      texto: 'she opened the window',
      translation: 'ela abriu a janela',
      startMs: 2000,
      endMs: 4000,
      lang: 'en',
    },
  ]
}

function avancar(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/** Clica o botão de avançar/terminar, que é o mesmo elemento nas duas situações. */
function avancarFala(): void {
  const b = screen.getByRole('button', { name: /Próxima|Terminar/ })
  fireEvent.click(b)
}

describe('KaraokeGame — rodada sem avaliação não vira erro', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('pular todas as falas registra um resultado por fala, não uma rodada vazia', () => {
    const f = falas()
    let relatorio: RoundReport | null = null
    render(
      <KaraokeGame
        falas={f}
        audioUrl=""
        ageProfile="pro"
        onFinish={(r) => {
          relatorio = r
        }}
        onExit={() => {}}
      />,
    )

    avancarFala() // pula a primeira
    avancarFala() // pula a segunda e termina
    avancar(1000)

    expect(relatorio).not.toBeNull()
    expect(relatorio!.items).toHaveLength(2)
    /* `revealed` é o campo que o projeto já usa para "desistiu" — a diferença entre "não lembrei"
       e "não aconteceu". */
    expect(relatorio!.items.every((o) => o.revealed === true)).toBe(true)
    expect(relatorio!.items.every((o) => o.correct === false)).toBe(true)
    expect(relatorio!.items.map((o) => o.itemRef)).toEqual(['f1', 'f2'])
  })

  it('cada fala pulada entra UMA vez, mesmo com cliques repetidos no avançar', () => {
    const f = falas()
    let relatorio: RoundReport | null = null
    render(
      <KaraokeGame
        falas={f}
        audioUrl=""
        ageProfile="pro"
        onFinish={(r) => {
          relatorio = r
        }}
        onExit={() => {}}
      />,
    )

    avancarFala()
    avancarFala()
    avancarFala() // rodada já encerrada — não pode acrescentar nada
    avancar(1000)

    const ids = relatorio!.items.map((o) => o.itemRef)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('uma rodada de ZERO itens não comemora erro', () => {
    /* Falas SEM id: nada pode ser registrado (um id fabricado faria o histórico mentir), então a
       rodada termina de fato vazia — o caso exato que caía em `comemorar('erro')`. */
    const semId = [{ texto: 'hello there', translation: 'olá', startMs: 0, endMs: 1000, lang: 'en' }]
    let relatorio: RoundReport | null = null
    render(
      <KaraokeGame
        falas={semId}
        audioUrl=""
        ageProfile="pro"
        onFinish={(r) => {
          relatorio = r
        }}
        onExit={() => {}}
      />,
    )

    avancarFala()
    avancar(1000)

    expect(relatorio!.items).toHaveLength(0)
    const tons = comemorarMock.mock.calls.map((c) => c[0])
    expect(tons).not.toContain('erro')
    expect(tons).toHaveLength(0)
  })

  it('a rodada com resultado continua comemorando normalmente', () => {
    const f = falas()
    render(<KaraokeGame falas={f} audioUrl="" ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    avancarFala()
    avancarFala()
    avancar(1000)
    /* Duas falas puladas = dois itens, nenhum correto → 'erro' é a resposta CERTA aqui: houve
       avaliação e ela foi negativa. O defeito era comemorar erro sem avaliação nenhuma. */
    expect(comemorarMock.mock.calls.map((c) => c[0])).toContain('erro')
  })

})

/*
 * O ESTADO DE "GRAVANDO" (QA dos jogos, 2026-09-26). Dois defeitos no mesmo lugar:
 *  - `rec.onend` comparava `fase` do FECHO de quando a gravação começou (ainda 'parado'): quando o
 *    reconhecimento terminava sem resultado (silêncio, ruído), a tela ficava presa em "Parar";
 *  - o relógio do "Ouvir" continuava vivo e, ao vencer, jogava a fase para 'parado' NO MEIO da
 *    gravação — o botão voltava a "Falar agora" com o microfone aberto.
 */
describe('KaraokeGame — gravar não fica preso nem é interrompido', () => {
  let instancias: Array<{ onresult?: (e: unknown) => void; onend?: () => void; onerror?: (e: unknown) => void }> = []
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    instancias = []
    class SR {
      lang = ''
      interimResults = false
      maxAlternatives = 1
      onresult?: (e: unknown) => void
      onend?: () => void
      onerror?: (e: unknown) => void
      constructor() {
        instancias.push(this)
      }
      start() {}
      stop() {
        this.onend?.()
      }
      abort() {}
    }
    ;(window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = SR
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  })

  it('terminar sem resultado devolve o botão "Falar agora"', () => {
    render(<KaraokeGame falas={falas()} audioUrl="" ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Falar agora/ }))
    expect(screen.getByRole('button', { name: /Parar/ })).toBeTruthy()
    act(() => instancias[0].onend?.())
    expect(screen.queryByRole('button', { name: /Parar/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Falar agora/ })).toBeTruthy()
  })

  it('o relógio do "Ouvir" não interrompe uma gravação em curso', () => {
    render(<KaraokeGame falas={falas()} audioUrl="" ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Ouvir$/ }))
    avancar(300)
    fireEvent.click(screen.getByRole('button', { name: /Falar agora/ }))
    avancar(3000) // o "Ouvir" da fala de 2 s já teria acabado
    expect(screen.getByRole('button', { name: /Parar/ })).toBeTruthy()
  })
})
