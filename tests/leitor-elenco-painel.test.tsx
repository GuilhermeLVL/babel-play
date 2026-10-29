// @vitest-environment jsdom
/**
 * O PAINEL DO ELENCO e suas escolhas (M5): interruptor, voz por personagem, resumo em texto, avatar opcional; as
 * escolhas ficam no aparelho; livro trazido nunca consulta a ficha.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PainelDoElenco from '../src/components/views/leitor/PainelDoElenco'
import type { ElencoDoLivro } from '../src/components/views/leitor/useElencoDoLivro'
import { montarDistribuicao } from '../src/core/avatar/elenco'
import { ELENCO_PADRAO, gravarEscolhasDoElenco, lerEscolhasDoElenco } from '../src/lib/leitor/preferenciasDoElenco'
import { personagensDoLivro } from '../src/lib/livros/elenco'

const VOZES = [
  { name: 'Luciana', lang: 'pt-BR', base: 'pt', local: true, neural: false },
  { name: 'Felipe', lang: 'pt-BR', base: 'pt', local: true, neural: false },
  { name: 'Joana', lang: 'pt-BR', base: 'pt', local: true, neural: false },
]

function elenco(extra: Partial<ElencoDoLivro> = {}): ElencoDoLivro {
  const personagens = ['Ana', 'Bruno']
  return {
    disponivel: true,
    ligado: true,
    avatar: true,
    personagens,
    vozes: VOZES,
    distribuicao: montarDistribuicao({
      idioma: 'pt',
      personagens,
      vozes: VOZES.map((v) => ({ id: v.name, idioma: v.lang })),
      vozPrincipal: 'Luciana',
    }),
    gostos: {},
    config: () => null,
    ligar: vi.fn(),
    mostrarAvatar: vi.fn(),
    escolherVoz: vi.fn(),
    ...extra,
  }
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('o painel do elenco', () => {
  it('sem a flag não renderiza nada', () => {
    const { container } = render(
      <PainelDoElenco elenco={elenco({ disponivel: false })} vozDoNarrador="" nuvem={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('desligado: o resumo diz que uma voz só lê, e não há lista de vozes', () => {
    render(<PainelDoElenco elenco={elenco({ ligado: false })} vozDoNarrador="Luciana" nuvem={false} />)
    expect(screen.getByTestId('elenco-resumo').textContent).toMatch(/uma voz só/i)
    expect(screen.queryByTestId('elenco-voz-0')).toBeNull()
    const ligar = screen.getByTestId('elenco-ligar') as HTMLInputElement
    expect(ligar.getAttribute('role')).toBe('switch')
    expect(ligar.checked).toBe(false)
  })

  it('o interruptor chama `ligar` e é alcançável pelo rótulo', () => {
    const e = elenco({ ligado: false })
    render(<PainelDoElenco elenco={e} vozDoNarrador="" nuvem={false} />)
    fireEvent.click(screen.getByLabelText('Dar uma voz a cada personagem'))
    expect(e.ligar).toHaveBeenCalledWith(true)
  })

  it('ligado: uma voz por personagem, rotulada pelo nome, e trocar chama `escolherVoz`', () => {
    const e = elenco()
    render(<PainelDoElenco elenco={e} vozDoNarrador="Luciana" nuvem={false} />)
    expect(screen.getByTestId('elenco-resumo').textContent).toMatch(/própria: 2\./)
    const ana = screen.getByLabelText('Ana') as HTMLSelectElement
    expect(within(ana).getAllByRole('option')).toHaveLength(3)
    fireEvent.change(ana, { target: { value: 'Joana' } })
    expect(e.escolherVoz).toHaveBeenCalledWith('Ana', 'Joana')
    expect(screen.getByLabelText('Bruno')).toBeTruthy()
  })

  it('sem personagens na ficha (livro trazido): explica e não mostra seletores', () => {
    render(<PainelDoElenco elenco={elenco({ personagens: [], distribuicao: null })} vozDoNarrador="" nuvem={false} />)
    expect(screen.getByTestId('elenco-resumo').textContent).toMatch(/só o narrador/i)
    expect(screen.queryByTestId('elenco-voz-0')).toBeNull()
  })

  it('voz natural da nuvem: só o ritmo muda, sem seletores de voz', () => {
    render(<PainelDoElenco elenco={elenco()} vozDoNarrador="" nuvem />)
    expect(screen.getByTestId('elenco-resumo').textContent).toMatch(/só o ritmo/i)
    expect(screen.queryByTestId('elenco-voz-0')).toBeNull()
  })

  it('o avatar é opcional', () => {
    const e = elenco()
    render(<PainelDoElenco elenco={e} vozDoNarrador="" nuvem={false} />)
    fireEvent.click(screen.getByTestId('elenco-avatar'))
    expect(e.mostrarAvatar).toHaveBeenCalledWith(false)
  })
})

describe('as escolhas do elenco no aparelho', () => {
  it('padrão: desligado, avatar sim, sem gostos', () => {
    expect(lerEscolhasDoElenco('cat:x')).toEqual(ELENCO_PADRAO)
  })

  it('ida e volta, por livro', () => {
    gravarEscolhasDoElenco('cat:a', { ligado: true, avatar: false, gostos: { Ana: 'Joana' } })
    expect(lerEscolhasDoElenco('cat:a')).toEqual({ ligado: true, avatar: false, gostos: { Ana: 'Joana' } })
    expect(lerEscolhasDoElenco('cat:b').ligado).toBe(false)
  })

  it('valor corrompido ou de outra forma volta ao padrão', () => {
    localStorage.setItem('leitor:elenco:cat:a', '{não é json')
    expect(lerEscolhasDoElenco('cat:a')).toEqual(ELENCO_PADRAO)
    localStorage.setItem('leitor:elenco:cat:a', JSON.stringify({ ligado: 'sim', gostos: { Ana: 42, Bia: 'Joana' } }))
    expect(lerEscolhasDoElenco('cat:a')).toEqual({ ligado: false, avatar: true, gostos: { Bia: 'Joana' } })
  })
})

describe('as personagens do livro', () => {
  it('livro trazido pela pessoa nunca consulta nada', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await personagensDoLivro('hash-do-arquivo', 'arquivo')).toEqual([])
    expect(await personagensDoLivro('cat:x', 'arquivo')).toEqual([])
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('falha de rede vira lista vazia (só narrador)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await personagensDoLivro('cat:x', 'catalogo')).toEqual([])
    vi.unstubAllGlobals()
  })
})
