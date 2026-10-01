// @vitest-environment jsdom
/**
 * A TELA DO MODO INTÉRPRETE (E3 da Fase E), a maquete aprovada pelo dono. O que se prende:
 *   - celular: a metade de cima (o outro) virada 180°; computador: duas colunas sem virar;
 *   - cada metade mostra a última frase do OUTRO traduzida, com o original;
 *   - tocar "Falar" abre o microfone e o botão vira "Parar" (com anel);
 *   - a ponte com a captura liga ao montar e desliga ao sair;
 *   - a tradução é lida em voz alta e a metade de quem ouve mostra "Repetir" e "Parar voz";
 *   - o chip diz a voz em uso;
 *   - no computador, os atalhos 1/2/R/P/Esc.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const voz = vi.hoisted(() => ({
  falas: [] as Array<{ texto: string; lang: string; fim?: () => void }>,
}))
vi.mock('../src/lib/tts', async (original) => {
  const real = await original<typeof import('../src/lib/tts')>()
  return {
    ...real,
    nativeTts: {
      speak: (texto: string, opts: { lang: string; onStart?: () => void; onEnd?: () => void }) => {
        voz.falas.push({ texto, lang: opts.lang, fim: opts.onEnd })
        opts.onStart?.()
      },
      cancel: () => {},
      isSpeaking: () => false,
    },
  }
})

import ModoInterprete, { type FalaDoInterprete } from '../src/components/views/captura/interprete/ModoInterprete'
import type { PonteDoInterprete } from '../src/lib/captura/controleDoInterprete'

beforeEach(() => {
  voz.falas.length = 0
  localStorage.clear()
})
afterEach(() => cleanup())

function montar(
  o: {
    layout?: 'celular' | 'computador'
    falas?: FalaDoInterprete[]
    automatico?: 'disponivel' | 'premium' | 'oculto'
  } = {},
) {
  const abrir = vi.fn()
  const fechar = vi.fn()
  const aoSair = vi.fn()
  const ponte: { atual: PonteDoInterprete | null } = { atual: null }
  const registrarPonte = vi.fn((p: PonteDoInterprete | null) => {
    ponte.atual = p
  })
  const props = {
    idiomas: { meu: 'pt-BR', outro: 'en-US' },
    microfone: { abrir, fechar },
    registrarPonte,
    vozNaturalDisponivel: false,
    layout: o.layout ?? ('celular' as const),
    aoSair,
    ...(o.automatico ? { automatico: o.automatico } : {}),
  }
  const r = render(<ModoInterprete {...props} falas={o.falas ?? []} />)
  const trocarFalas = (falas: FalaDoInterprete[]) => r.rerender(<ModoInterprete {...props} falas={falas} />)
  return { abrir, fechar, aoSair, ponte, registrarPonte, trocarFalas, ...r }
}

describe('ModoInterprete', () => {
  it('celular: a metade do outro fica virada; cada uma com o seu idioma', () => {
    montar()
    expect(screen.getByTestId('interprete-outro').hasAttribute('data-virada')).toBe(true)
    expect(screen.getByTestId('interprete-meu').hasAttribute('data-virada')).toBe(false)
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Falar em Português/i })).toBeTruthy()
    expect(screen.getByTestId('voz-em-uso').textContent).toContain('Voz do aparelho')
  })

  it('computador: nenhuma metade virada', () => {
    montar({ layout: 'computador' })
    expect(screen.getByTestId('interprete-outro').hasAttribute('data-virada')).toBe(false)
  })

  it('tocar Falar abre o microfone e o botão vira Parar', () => {
    const { abrir, ponte } = montar()
    expect(ponte.atual).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    expect(abrir).toHaveBeenCalledTimes(1)
    const parar = screen.getByRole('button', { name: 'Parar de ouvir' })
    expect(parar.getAttribute('aria-pressed')).toBe('true')
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu', fala: 'pt-BR', para: 'en' })
  })

  it('a fala traduzida aparece do outro lado, é lida, e quem ouve ganha Repetir e Parar voz', () => {
    const { ponte, fechar, trocarFalas } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Falar em Português/i }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic', lado: 'meu' }))
    expect(fechar).toHaveBeenCalled()
    trocarFalas([{ id: 'a1', originalText: 'bom dia', translatedText: 'good morning', lado: 'meu' }])
    act(() =>
      ponte.atual!.aoTraduzirFinal({
        segId: 'a1',
        original: 'bom dia',
        resultado: 'traduzida',
        traducao: 'good morning',
        de: 'pt',
        para: 'en',
        aproximada: false,
        falada: true,
      }),
    )
    const doOutro = screen.getByTestId('interprete-outro')
    expect(doOutro.textContent).toContain('good morning')
    expect(doOutro.textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'good morning', lang: 'en-US' })])
    expect(screen.getByRole('button', { name: 'Repetir a tradução' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Parar a voz' }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })

  it('sair desliga a ponte e avisa a captura', () => {
    const { aoSair, registrarPonte } = montar()
    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo intérprete' }))
    expect(aoSair).toHaveBeenCalledTimes(1)
    cleanup()
    expect(registrarPonte).toHaveBeenLastCalledWith(null)
  })

  it('computador: 1 e 2 falam, Esc sai', () => {
    const { abrir, aoSair, ponte } = montar({ layout: 'computador' })
    fireEvent.keyDown(window, { key: '2' })
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'outro', fala: 'en-US' })
    fireEvent.keyDown(window, { key: '1' })
    expect(ponte.atual!.direcao()).toMatchObject({ lado: 'meu' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(aoSair).toHaveBeenCalledTimes(1)
  })
})

/* ───────────────────────────── o modo automático (E7) ───────────────────────────── */

describe('ModoInterprete: automático', () => {
  const traducao = (segId: string, texto: string, de: string, para: string) => ({
    segId,
    original: 'x',
    resultado: 'traduzida' as const,
    traducao: texto,
    de,
    para,
    aproximada: false,
    falada: true,
  })

  it('com o automático no plano, ele já vem escolhido: um botão "Ouvir a conversa", nenhum "Falar" por lado', () => {
    montar({ automatico: 'disponivel' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('automatico')
    expect(screen.getByRole('button', { name: 'Ouvir a conversa' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Falar em/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Modo automático/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('"Ouvir a conversa" abre o microfone sem lado; o botão vira "Parar de ouvir a conversa"', () => {
    const { abrir, ponte } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(ponte.atual!.automatico()).toBe(true)
    expect(ponte.atual!.direcao()).toBeNull()
    expect(screen.getByRole('button', { name: 'Parar de ouvir a conversa' })).toBeTruthy()
  })

  it('a fala do outro (inglês medido) aparece traduzida na MINHA metade, é lida em português, e o microfone reabre', () => {
    const { abrir, ponte, trocarFalas } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    act(() => ponte.atual!.aoFimDaFala({ segId: 'a1', source: 'mic' }))
    act(() => void ponte.atual!.ladoDaFala('a1', { idiomaDoMotor: 'en', idiomaDoTexto: '', audioMs: 2500 }))
    trocarFalas([{ id: 'a1', originalText: 'good morning', translatedText: 'bom dia', lado: 'outro' }])
    act(() => ponte.atual!.aoTraduzirFinal(traducao('a1', 'bom dia', 'en', 'pt')))
    expect(screen.getByTestId('interprete-meu').textContent).toContain('bom dia')
    expect(voz.falas).toEqual([expect.objectContaining({ texto: 'bom dia', lang: 'pt-BR' })])
    act(() => voz.falas[0].fim?.())
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('ouvindo')
    expect(abrir).toHaveBeenCalledTimes(2)
  })

  it('"Por toque" volta aos dois botões de Falar, e a escolha é lembrada', () => {
    const { unmount } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
    unmount()
    montar({ automatico: 'disponivel' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
  })

  it('trocar de modo no meio da escuta fecha o microfone', () => {
    const { fechar } = montar({ automatico: 'disponivel' })
    fireEvent.click(screen.getByRole('button', { name: 'Ouvir a conversa' }))
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(fechar).toHaveBeenCalled()
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })

  it('sem o automático no plano (Grátis): o modo é por toque, e o botão diz que é do Premium sem ligar nada', () => {
    const { abrir } = montar({ automatico: 'premium' })
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    fireEvent.click(screen.getByRole('button', { name: /Modo automático/ }))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-modo')).toBe('toque')
    expect(screen.getByTestId('aviso-do-interprete').textContent).toMatch(/Premium/)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('no site sem servidor (oculto) o botão do automático nem aparece', () => {
    montar({ automatico: 'oculto' })
    expect(screen.queryByRole('button', { name: /Modo automático/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
  })

  it('computador: a tecla 1 liga e desliga a escuta', () => {
    const { abrir, fechar } = montar({ layout: 'computador', automatico: 'disponivel' })
    fireEvent.keyDown(window, { key: '1' })
    expect(abrir).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: '1' })
    expect(fechar).toHaveBeenCalled()
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
  })
})
