// @vitest-environment jsdom
/**
 * A escuta guiada PARA no fim da frase (áudio gravado e voz), não vaza o texto oculto pela transcrição
 * e navega por índice (duas falas no mesmo segundo).
 */
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import PlayerInterativo, { type PropsDoPlayerInterativo } from '../src/components/views/analise/PlayerInterativo'
import TranscricaoDoQuest from '../src/components/views/analise/quest/TranscricaoDoQuest'
import { usePlayerDaSessao } from '../src/lib/analise/playerDaSessao'
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise'
import type { Recording } from '../src/types'

vi.mock('../src/lib/dispositivo/telaNovaDoQuest', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/telaNovaDoQuest')>()
  return { ...real, useQuestNovo: () => true }
})

const fala = (index: number, startTime: number): FalaDaAnalise =>
  ({
    id: `u${index}`,
    original: `original ${index}`,
    translation: `tradução ${index}`,
    lang: 'en',
    speaker: 'Ana',
    time: '',
    words: [],
    startTime,
    index,
  }) as FalaDaAnalise

const FALAS = [fala(0, 0), fala(1, 4), fala(2, 4), fala(3, 9)]
const gravacao = { id: 'r1', type: 'audio' } as unknown as Recording

afterEach(cleanup)

describe('parar no fim da frase (áudio gravado)', () => {
  const montar = (extra: Partial<PropsDoPlayerInterativo>) => {
    const setIsPlaying = vi.fn()
    const props: PropsDoPlayerInterativo = {
      recording: gravacao,
      parsedSentences: FALAS,
      hasRealAudio: true,
      audioSrc: 'blob:x',
      audioRef: { current: null },
      audioDuration: 20,
      setAudioDuration: vi.fn(),
      isPlaying: true,
      setIsPlaying,
      setCurrentTime: vi.fn(),
      activeSentenceIndex: 0,
      seekTo: vi.fn(),
      ...extra,
    }
    render(<PlayerInterativo {...props} />)
    return { setIsPlaying, audio: document.querySelector('audio') as HTMLAudioElement }
  }
  const tocar = (a: HTMLAudioElement, t: number) => {
    a.pause = vi.fn()
    Object.defineProperty(a, 'currentTime', { value: t, writable: true, configurable: true })
    fireEvent.timeUpdate(a)
    return a
  }

  it('com a escuta guiada, ao chegar na fala seguinte pausa um fio antes dela', () => {
    const { setIsPlaying, audio } = montar({ pararNoFim: true })
    tocar(audio, 4.2)
    expect(setIsPlaying).toHaveBeenCalledWith(false)
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.currentTime).toBeCloseTo(3.95, 2)
  })

  it('dentro da frase não pausa; sem a escuta guiada segue como sempre', () => {
    const a = montar({ pararNoFim: true })
    tocar(a.audio, 3)
    expect(a.setIsPlaying).not.toHaveBeenCalled()
    cleanup()
    const b = montar({ pararNoFim: false })
    tocar(b.audio, 5)
    expect(b.setIsPlaying).not.toHaveBeenCalled()
  })

  it('a fala seguinte é a próxima com tempo DIFERENTE (duas no mesmo segundo)', () => {
    const { setIsPlaying, audio } = montar({ pararNoFim: true, activeSentenceIndex: 1 })
    tocar(audio, 5)
    expect(setIsPlaying).not.toHaveBeenCalled()
    tocar(audio, 9.1)
    expect(setIsPlaying).toHaveBeenCalledWith(false)
  })
})

describe('parar no fim da frase (voz) e navegação por índice', () => {
  const onEnds: Array<() => void> = []
  const motor = {
    falar: vi.fn((_t: string, o: { onEnd?: () => void }) => {
      if (o.onEnd) onEnds.push(o.onEnd)
    }),
    calar: vi.fn(),
    podeFalar: () => true,
  }

  const montarHook = (pararNoFim: boolean) => {
    const setIsPlaying = vi.fn()
    const setActiveSentenceIndex = vi.fn()
    const ativo = { current: 0 }
    const hook = renderHook(
      ({ tocando }) =>
        usePlayerDaSessao({
          parsedSentences: FALAS,
          hasRealAudio: false,
          audioSrc: null,
          audioRef: { current: null },
          activeSentenceIndexRef: ativo,
          activeSentenceIndex: 0,
          currentTime: 0,
          isPlaying: tocando,
          playbackSpeed: 1,
          pararNoFimRef: { current: pararNoFim },
          autoSlowEnabled: false,
          ttsLang: 'en',
          seekNonce: 0,
          recordingId: 'r1',
          setCurrentTime: vi.fn(),
          setActiveSentenceIndex,
          setSeekNonce: vi.fn(),
          setAudioDuration: vi.fn(),
          setPeaks: vi.fn(),
          setShadowingSentenceIndex: vi.fn(),
          setIsPlaying,
          narrador: motor,
          narraPeloMotor: true,
        } as never),
      { initialProps: { tocando: true } },
    )
    return { ...hook, setIsPlaying, setActiveSentenceIndex }
  }

  it('ao fim da fala a voz para (não segue para a próxima)', () => {
    onEnds.length = 0
    motor.falar.mockClear()
    const { setIsPlaying } = montarHook(true)
    expect(motor.falar).toHaveBeenCalledTimes(1)
    onEnds[0]()
    expect(setIsPlaying).toHaveBeenCalledWith(false)
    expect(motor.falar).toHaveBeenCalledTimes(1)
  })

  it('sem a escuta guiada a voz segue para a próxima fala', () => {
    onEnds.length = 0
    motor.falar.mockClear()
    montarHook(false)
    onEnds[0]()
    expect(motor.falar).toHaveBeenCalledTimes(2)
  })

  it('seekTo com índice escolhe a fala pedida, mesmo com o mesmo segundo', () => {
    const { result, setActiveSentenceIndex } = montarHook(true)
    result.current.seekTo(4, 1)
    expect(setActiveSentenceIndex).toHaveBeenLastCalledWith(1)
    result.current.seekTo(4, 2)
    expect(setActiveSentenceIndex).toHaveBeenLastCalledWith(2)
  })
})

describe('transcrição com a fala oculta', () => {
  const montar = (extra = {}) => {
    const acoes = {
      aoOuvir: vi.fn(),
      aoAbrirFala: vi.fn(),
      aoAbrirPalavra: vi.fn(),
      aoTentarDeNovo: vi.fn(),
      aoRevelarFala: vi.fn(),
    }
    render(
      <TranscricaoDoQuest
        falas={FALAS}
        estado="pronta"
        documento={false}
        indiceAtivo={0}
        tocando={false}
        classes="t-padrao f-sans s-medio"
        traducaoPrimeiro={false}
        ocultarOriginal={false}
        falaOculta={0}
        traducaoDe={(f) => ({ texto: f.translation, polida: false })}
        procedencia={null}
        palavras={[]}
        podeOuvir={() => true}
        ajustes={[]}
        {...acoes}
        {...extra}
      />,
    )
    return acoes
  }

  it('não mostra original nem tradução da fala oculta; as outras seguem visíveis', () => {
    montar()
    expect(document.querySelector('[data-fala="0"]')?.textContent).not.toContain('original 0')
    expect(screen.queryByText('tradução 0')).toBeNull()
    expect(screen.getByText('Texto oculto')).toBeTruthy()
    expect(document.querySelector('[data-fala="1"]')?.textContent).toContain('original 1')
  })

  it('tocar na linha oculta revela em vez de abrir a folha; "Opções da fala" fica desligado', () => {
    const acoes = montar()
    fireEvent.click(document.querySelector('[data-fala="0"] .qs-fala-texto') as HTMLElement)
    expect(acoes.aoRevelarFala).toHaveBeenCalledTimes(1)
    expect(acoes.aoAbrirFala).not.toHaveBeenCalled()
    expect((document.querySelector('[data-px-opcoes="0"]') as HTMLButtonElement).disabled).toBe(true)
    expect((document.querySelector('[data-px-opcoes="1"]') as HTMLButtonElement).disabled).toBe(false)
  })
})
