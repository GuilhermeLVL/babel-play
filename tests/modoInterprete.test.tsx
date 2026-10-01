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
})
afterEach(() => cleanup())

function montar(
  o: {
    layout?: 'celular' | 'computador'
    falas?: FalaDoInterprete[]
    aviso?: string | null
    preparo?: { texto: string; pct: number | null } | null
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
    aviso: o.aviso,
    preparo: o.preparo,
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
  /* Os avisos de erro e o preparo dos dois lados moravam na tela de Captura, por baixo do intérprete:
     quem falava no inglês não via nada acontecer (relato do dono no celular, 2026-09-30). */
  it('o aviso de erro aparece DENTRO da tela, na faixa do meio', () => {
    montar({ aviso: 'O navegador não reconhece English neste aparelho.' })
    const aviso = screen.getByRole('alert')
    expect(aviso.textContent).toContain('O navegador não reconhece English')
    expect(screen.getByTestId('modo-interprete').contains(aviso)).toBe(true)
  })

  it('sem aviso, nenhum alerta', () => {
    montar()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('o preparo dos dois lados aparece na faixa, com a porcentagem quando há', () => {
    montar({ preparo: { texto: 'Preparando a tradução…', pct: 25 } })
    const preparo = screen.getByTestId('preparo-do-interprete')
    expect(preparo.textContent).toContain('Preparando a tradução…')
    expect(preparo.textContent).toContain('25%')
    expect(preparo.getAttribute('role')).toBe('status')
  })

  it('o preparo sem porcentagem (o pacote do navegador) não inventa número', () => {
    montar({ preparo: { texto: 'Preparando o reconhecimento de voz…', pct: null } })
    expect(screen.getByTestId('preparo-do-interprete').textContent).not.toContain('%')
  })

  it('sem preparo, a faixa não mostra nada', () => {
    montar()
    expect(screen.queryByTestId('preparo-do-interprete')).toBeNull()
  })

  it('um microfone que falha depois de abrir devolve a metade a "Falar" (a ponte avisa o controle)', () => {
    const { ponte } = montar()
    fireEvent.click(screen.getByRole('button', { name: /Falar em English/i }))
    expect(screen.getByRole('button', { name: 'Parar de ouvir' })).toBeTruthy()
    act(() => ponte.atual!.microfoneFalhou(new Error('idioma')))
    expect(screen.getByTestId('modo-interprete').getAttribute('data-fase')).toBe('parado')
    expect(screen.getByRole('button', { name: /Falar em English/i })).toBeTruthy()
  })
})
