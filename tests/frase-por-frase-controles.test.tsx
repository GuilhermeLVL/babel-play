// @vitest-environment jsdom
/**
 * Os controles do modo "Frase por frase" na faixa do player: escolhas, aviso de tempos ruins e a ponte com a sombra.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FrasePorFrase from '../src/components/views/analise/FrasePorFrase'
import PlayerInterativo from '../src/components/views/analise/PlayerInterativo'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'
import type { FrasePorFraseDaTela } from '../src/lib/analise/usarFrasePorFrase'
import type { Recording } from '../src/types'

vi.mock('../src/components/views/analise/SombraDaFala', () => ({
  default: ({ texto }: { texto: string }) => <div data-testid="sombra">{texto}</div>,
}))

const fala = (index: number, startTime: number): FalaDaAnalise =>
  ({
    id: `u${index}`,
    original: `original ${index}`,
    translation: '',
    lang: 'en',
    speaker: 'Ana',
    time: '',
    words: [],
    startTime,
    index,
  }) as FalaDaAnalise
const FALAS = [fala(0, 0), fala(1, 3), fala(2, 6)]

function fraseDaTela(extra: Partial<FrasePorFraseDaTela> = {}): FrasePorFraseDaTela {
  return {
    disponivel: true,
    tempos: { usavel: true, motivo: null, indice: null },
    ativo: true,
    esperando: false,
    fraseDaPausa: null,
    escolha: { ligado: true, repeticoes: 1, pausa: 1, pararNoFim: false },
    ligar: vi.fn(),
    mudar: vi.fn(),
    seguirAgora: vi.fn(),
    ...extra,
  }
}

afterEach(cleanup)

describe('controles do modo', () => {
  it('mostra repetições, pausa e parar no fim e repassa as escolhas', () => {
    const frase = fraseDaTela()
    render(
      <FrasePorFrase frase={frase} falas={FALAS} naFala={0} aoPraticar={vi.fn()} aoSeguirDepoisDaPratica={vi.fn()} />,
    )
    fireEvent.change(screen.getByLabelText('Repetir'), { target: { value: '3' } })
    expect(frase.mudar).toHaveBeenCalledWith({ repeticoes: 3 })
    fireEvent.change(screen.getByLabelText('Pausa para repetir'), { target: { value: '2' } })
    expect(frase.mudar).toHaveBeenCalledWith({ pausa: 2 })
    fireEvent.click(screen.getByLabelText('Parar no fim da frase'))
    expect(frase.mudar).toHaveBeenCalledWith({ pararNoFim: true })
    fireEvent.click(screen.getByLabelText('Frase por frase'))
    expect(frase.ligar).toHaveBeenCalledWith(false)
  })

  it('desligado: só o interruptor, sem os ajustes', () => {
    const frase = fraseDaTela({
      ativo: false,
      escolha: { ligado: false, repeticoes: 1, pausa: 1, pararNoFim: false },
    })
    render(
      <FrasePorFrase frase={frase} falas={FALAS} naFala={0} aoPraticar={vi.fn()} aoSeguirDepoisDaPratica={vi.fn()} />,
    )
    expect(screen.getByLabelText('Frase por frase')).toBeTruthy()
    expect(screen.queryByLabelText('Repetir')).toBeNull()
    expect(screen.queryByText('Repetir em voz alta')).toBeNull()
  })

  it('tempos ruins: diz o motivo e não oferece a prática', () => {
    const frase = fraseDaTela({
      ativo: false,
      tempos: { usavel: false, motivo: 'frase-longa-demais', indice: 1 },
    })
    render(
      <FrasePorFrase frase={frase} falas={FALAS} naFala={0} aoPraticar={vi.fn()} aoSeguirDepoisDaPratica={vi.fn()} />,
    )
    expect(screen.getByRole('status').textContent).toContain('não tem tempos bons')
    expect(screen.queryByText('Repetir em voz alta')).toBeNull()
  })

  it('na pausa, convida a falar e "Já repeti, seguir" avança', () => {
    const frase = fraseDaTela({ esperando: true, fraseDaPausa: 0 })
    render(
      <FrasePorFrase frase={frase} falas={FALAS} naFala={0} aoPraticar={vi.fn()} aoSeguirDepoisDaPratica={vi.fn()} />,
    )
    expect(screen.getByRole('status').textContent).toContain('Sua vez')
    fireEvent.click(screen.getByText('Já repeti, seguir'))
    expect(frase.seguirAgora).toHaveBeenCalled()
  })

  it('"Repetir em voz alta" abre a sombra da frase em foco; ao fechar segue da seguinte', async () => {
    const aoPraticar = vi.fn()
    const aoSeguir = vi.fn()
    render(
      <FrasePorFrase
        frase={fraseDaTela()}
        falas={FALAS}
        naFala={1}
        aoPraticar={aoPraticar}
        aoSeguirDepoisDaPratica={aoSeguir}
      />,
    )
    fireEvent.click(screen.getByText('Repetir em voz alta'))
    expect(aoPraticar).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('sombra').textContent).toBe('original 1'))
    fireEvent.click(screen.getByText('Fechar e seguir'))
    expect(aoSeguir).toHaveBeenCalledWith(2)
    expect(screen.queryByTestId('sombra')).toBeNull()
  })

  it('na última frase, fechar a sombra não segue', async () => {
    const aoSeguir = vi.fn()
    render(
      <FrasePorFrase
        frase={fraseDaTela()}
        falas={FALAS}
        naFala={2}
        aoPraticar={vi.fn()}
        aoSeguirDepoisDaPratica={aoSeguir}
      />,
    )
    fireEvent.click(screen.getByText('Repetir em voz alta'))
    await waitFor(() => screen.getByTestId('sombra'))
    fireEvent.click(screen.getByText('Fechar'))
    expect(aoSeguir).not.toHaveBeenCalled()
  })
})

describe('a faixa do player', () => {
  const gravacao = { id: 'r1', type: 'audio' } as unknown as Recording
  const props = {
    recording: gravacao,
    parsedSentences: FALAS,
    hasRealAudio: false,
    audioSrc: null,
    audioRef: { current: null },
    audioDuration: 0,
    setAudioDuration: vi.fn(),
    isPlaying: false,
    setIsPlaying: vi.fn(),
    setCurrentTime: vi.fn(),
    activeSentenceIndex: 0,
    seekTo: vi.fn(),
  }

  it('sem o slot (flag desligada) nenhum controle do modo aparece e a faixa é a de hoje', () => {
    const { container } = render(<PlayerInterativo {...props} />)
    expect(screen.queryByLabelText('Frase por frase')).toBeNull()
    expect(container.querySelector('.px-player-guiada')).toBeNull()
  })

  it('com o slot, o controle aparece dentro da faixa', () => {
    const { container } = render(
      <PlayerInterativo
        {...props}
        frase={
          <FrasePorFrase
            frase={fraseDaTela()}
            falas={FALAS}
            naFala={0}
            aoPraticar={vi.fn()}
            aoSeguirDepoisDaPratica={vi.fn()}
          />
        }
      />,
    )
    expect(container.querySelector('.px-player-guiada .px-frase')).not.toBeNull()
  })
})
