// @vitest-environment jsdom
/**
 * A DESCOBERTA DO ELENCO (flag `avatar_elenco`): a dica da primeira vez (dispensável, lembrada no aparelho), a frase de
 * amostra por idioma e o botão "Experimentar" por personagem.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DicaDoElenco from '../src/components/views/leitor/DicaDoElenco'
import PainelDoElenco from '../src/components/views/leitor/PainelDoElenco'
import type { ElencoDoLivro } from '../src/components/views/leitor/useElencoDoLivro'
import { fraseDeAmostra } from '../src/core/avatar/amostraDeVoz'
import { dicaDoElencoJaVista, marcarDicaDoElencoVista } from '../src/lib/leitor/dicaDoElenco'

const VOZES = [
  { name: 'Luciana', lang: 'pt-BR', base: 'pt', local: true, neural: false },
  { name: 'Felipe', lang: 'pt-BR', base: 'pt', local: true, neural: false },
]

function elenco(extra: Partial<ElencoDoLivro> = {}): ElencoDoLivro {
  return {
    disponivel: true,
    ligado: true,
    avatar: true,
    personagens: ['Ana', 'Bruno'],
    vozes: VOZES,
    distribuicao: null,
    gostos: { Ana: 'Felipe' },
    livroProprio: false,
    fichaPronta: true,
    config: () => null,
    ligar: vi.fn(),
    mostrarAvatar: vi.fn(),
    escolherVoz: vi.fn(),
    experimentar: vi.fn(),
    ...extra,
  }
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('a dica do elenco', () => {
  it('mostra a contagem e dispensa', () => {
    const aoFechar = vi.fn()
    render(<DicaDoElenco personagens={3} aoAbrir={vi.fn()} aoFechar={aoFechar} />)
    expect(screen.getByTestId('dica-elenco').textContent).toMatch(/3 personagens/)
    fireEvent.click(screen.getByRole('button', { name: /Dispensar/ }))
    expect(aoFechar).toHaveBeenCalled()
  })

  it('o botão abre o elenco', () => {
    const aoAbrir = vi.fn()
    render(<DicaDoElenco personagens={2} aoAbrir={aoAbrir} aoFechar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Escolher as vozes/ }))
    expect(aoAbrir).toHaveBeenCalled()
  })

  it('singular com uma personagem', () => {
    render(<DicaDoElenco personagens={1} aoAbrir={vi.fn()} aoFechar={vi.fn()} />)
    expect(screen.getByTestId('dica-elenco').textContent).toMatch(/1 personagem\b/)
  })

  it('lembra a dispensa e sobrevive a armazenamento quebrado', () => {
    expect(dicaDoElencoJaVista()).toBe(false)
    marcarDicaDoElencoVista()
    expect(dicaDoElencoJaVista()).toBe(true)
    const s = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const g = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(() => dicaDoElencoJaVista()).not.toThrow()
    expect(() => marcarDicaDoElencoVista()).not.toThrow()
    s.mockRestore()
    g.mockRestore()
  })
})

describe('a frase de amostra', () => {
  it('fala no idioma do livro e cai no nome da personagem quando não há frase', () => {
    expect(fraseDeAmostra('en-US', 'Ana')).toMatch(/Ana/)
    expect(fraseDeAmostra('pt', 'Ana')).toMatch(/Ana/)
    expect(fraseDeAmostra('en', 'Ana')).not.toBe(fraseDeAmostra('pt', 'Ana'))
    expect(fraseDeAmostra('tlh', 'Ana')).toBe('Ana')
  })
})

describe('o painel do elenco: experimentar e livro trazido', () => {
  it('cada personagem tem um botão Experimentar com a voz escolhida', () => {
    const e = elenco()
    render(<PainelDoElenco elenco={e} vozDoNarrador="Luciana" nuvem={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Experimentar a voz de Ana' }))
    expect(e.experimentar).toHaveBeenCalledWith('Ana', 'Felipe')
    expect(screen.getByRole('button', { name: 'Experimentar a voz de Bruno' })).toBeTruthy()
  })

  it('livro trazido: frase honesta de que só há narrador, sem seletores', () => {
    render(<PainelDoElenco elenco={elenco({ personagens: [], livroProprio: true })} vozDoNarrador="" nuvem={false} />)
    expect(screen.getByTestId('elenco-so-narrador').textContent).toMatch(/livros que você traz/i)
    expect(screen.queryByTestId('elenco-voz-0')).toBeNull()
  })

  it('enquanto a ficha carrega não afirma que não há personagens', () => {
    render(<PainelDoElenco elenco={elenco({ personagens: [], fichaPronta: false })} vozDoNarrador="" nuvem={false} />)
    expect(screen.queryByTestId('elenco-so-narrador')).toBeNull()
  })

  it('livro do catálogo sem ficha: diz só narrador, sem culpar o arquivo da pessoa', () => {
    render(<PainelDoElenco elenco={elenco({ personagens: [] })} vozDoNarrador="" nuvem={false} />)
    expect(screen.getByTestId('elenco-so-narrador').textContent).not.toMatch(/você traz/i)
  })
})
