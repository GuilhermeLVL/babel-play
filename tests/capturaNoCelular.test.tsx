// @vitest-environment jsdom
/**
 * A CAPTURA NO CELULAR (maquete aprovada pelo dono, 2026-09-29):
 *   · a frase vira botões de palavra (sem pontuação, sem repetir);
 *   · a tela fica acesa enquanto grava (Screen Wake Lock), e a trava volta quando a aba reaparece;
 *   · na conversa, o toque no balão abre as ações da fala (e a palavra solta não fala sozinha),
 *     e a palavra do caderno continua abrindo a palavra — não a frase.
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ChatTranscript from '../src/components/ChatTranscript'
import CapturaNoCelular from '../src/components/views/captura/celular/CapturaNoCelular'
import { palavrasDaFrase } from '../src/components/views/captura/celular/FolhaDaFrase'
import { useTelaAcesa } from '../src/lib/captura/telaAcesa'

afterEach(cleanup)

describe('CapturaNoCelular: as ondas chegam prontas (a folha que não re-renderiza a tela)', () => {
  const props = {
    abrindo: false,
    retomar: false,
    tempo: '00:07',
    lados: [
      { rotulo: 'Eles falam', nome: 'Inglês' },
      { rotulo: 'Você lê', nome: 'Português' },
    ] as [{ rotulo: string; nome: string }, { rotulo: string; nome: string }],
    aoAbrirIdiomas: vi.fn(),
    parCurto: 'EN → PT',
    modo: null,
    micLigado: true,
    micAbrindo: false,
    aoAlternarMic: vi.fn(),
    flutuante: { ativo: false, alternar: vi.fn() },
    podeIniciar: true,
    aoIniciar: vi.fn(),
    aoParar: vi.fn(),
    aoAbrirOpcoes: vi.fn(),
    aoAbrirAjuda: vi.fn(),
    aoAbrirVisual: vi.fn(),
    temFalas: false,
    conversa: null,
    ondas: <span data-testid="ondas" />,
  }

  it('gravando, a barra do alto mostra as ondas recebidas', () => {
    const { container } = render(<CapturaNoCelular {...props} gravando />)
    expect(container.querySelector('.cel-barra [data-testid="ondas"]')).not.toBeNull()
  })

  it('pronto para começar, sem ondas (não há o que medir)', () => {
    render(<CapturaNoCelular {...props} gravando={false} />)
    expect(screen.queryByTestId('ondas')).toBeNull()
  })
})

describe('palavrasDaFrase', () => {
  it('tira a pontuação das pontas, ignora número solto e não repete', () => {
    expect(palavrasDaFrase('The weather, the WEATHER is great! 42 — ok?')).toEqual(['The', 'weather', 'is', 'great', 'ok'])
  })
  it('mantém o apóstrofo e o hífen de dentro da palavra', () => {
    expect(palavrasDaFrase("I'm well-known.")).toEqual(["I'm", 'well-known'])
  })
})

describe('useTelaAcesa', () => {
  function escopoFalso() {
    const soltar = vi.fn(async () => undefined)
    const trava = { release: soltar, released: false }
    const request = vi.fn(async () => trava)
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    return { escopo: { navigator: { wakeLock: { request } }, document: doc } as unknown as typeof globalThis, request, soltar, trava, doc }
  }

  it('pede a trava ao gravar e a solta ao parar', async () => {
    const f = escopoFalso()
    const { rerender } = renderHook(({ ativo }) => useTelaAcesa(ativo, f.escopo), { initialProps: { ativo: true } })
    await act(async () => undefined)
    expect(f.request).toHaveBeenCalledWith('screen')
    rerender({ ativo: false })
    await act(async () => undefined)
    expect(f.soltar).toHaveBeenCalled()
  })

  it('pede de novo quando a aba volta (o navegador solta a trava ao esconder)', async () => {
    const f = escopoFalso()
    renderHook(() => useTelaAcesa(true, f.escopo))
    await act(async () => undefined)
    f.trava.released = true
    await act(async () => {
      f.doc.dispatchEvent(new Event('visibilitychange'))
    })
    expect(f.request).toHaveBeenCalledTimes(2)
  })

  it('sem a API, não faz nada (a tela só apaga como antes)', () => {
    expect(() => renderHook(() => useTelaAcesa(true, { navigator: {} } as unknown as typeof globalThis))).not.toThrow()
  })
})

describe('ChatTranscript: o toque na fala (celular)', () => {
  const base = {
    speakers: [{ id: 's1', name: 'Pessoa 1', color: '#000' }],
    scenario: 'media' as const,
    tsSettings: { fontSize: 'md', textColor: 'default', displayOrder: 'original-first' } as never,
    ageProfile: 'adult' as never,
    sourceLang: 'pt-BR',
    targetLang: 'en-US',
    isRecording: true,
    addedWords: [],
    onExamineWord: vi.fn(),
    onSpeakWord: vi.fn(),
  }
  const fala = {
    id: 'f1',
    speakerId: 's1',
    source: 'system' as const,
    timestamp: '00:01',
    originalText: 'the weather is great',
    translatedText: 'o tempo está ótimo',
    words: [{ word: 'weather' } as never],
    lang: 'en-US',
  }

  it('tocar no balão abre as ações; a palavra solta não fala sozinha', () => {
    const aoTocarFala = vi.fn()
    const onSpeakWord = vi.fn()
    const { container } = render(
      <ChatTranscript {...base} onSpeakWord={onSpeakWord} segments={[fala]} aoTocarFala={aoTocarFala} />,
    )
    fireEvent.click(container.querySelector('.w')!)
    expect(onSpeakWord).not.toHaveBeenCalled()
    expect(aoTocarFala).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), 'en-US')
  })

  it('a palavra do caderno abre a palavra, não a frase', () => {
    const aoTocarFala = vi.fn()
    const onExamineWord = vi.fn()
    render(<ChatTranscript {...base} onExamineWord={onExamineWord} segments={[fala]} aoTocarFala={aoTocarFala} />)
    fireEvent.click(screen.getByRole('button', { name: 'weather' }))
    expect(onExamineWord).toHaveBeenCalled()
    expect(aoTocarFala).not.toHaveBeenCalled()
  })

  it('a fala em foco mostra os atalhos; as outras, só o botão (leitor de tela e teclado)', () => {
    render(
      <ChatTranscript
        {...base}
        segments={[fala, { ...fala, id: 'f2', originalText: 'second line' }]}
        aoTocarFala={vi.fn()}
        falaEmFoco="f1"
        acoesDaFala={() => <button type="button">Devagar</button>}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Devagar' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Ações da fala' })).toHaveLength(1)
  })

  it('sem aoTocarFala, a palavra solta fala como sempre', () => {
    const onSpeakWord = vi.fn()
    const { container } = render(<ChatTranscript {...base} onSpeakWord={onSpeakWord} segments={[fala]} />)
    fireEvent.click(container.querySelector('.w')!)
    expect(onSpeakWord).toHaveBeenCalledWith('the', 'en-US')
  })
})

