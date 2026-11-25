// @vitest-environment jsdom
/**
 * tela-de-jogos-v2 2.6b: a folha "Como se joga" ganha a prévia da rodada (novas, já viu, para repetir),
 * só com contagens e com a regra de zeros da 2.6a.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { linhasDaPrevia, previaDaFolha } from '../src/core/minigames/previaDaFolha'

const { default: ComoSeJoga } = await import('../src/components/minigames/ComoSeJoga')

afterEach(cleanup)

describe('previaDaFolha', () => {
  it('conta novas, já vistas e vencidas pelas refs', () => {
    const itens = [{ ref: 'a' }, { ref: 'b' }, { ref: 'c' }, { ref: 'd' }]
    const p = previaDaFolha(itens, new Set(['a', 'b']), new Set(['b']))
    expect(p).toEqual({ novas: 2, jaViu: 2, paraRepetir: 1 })
  })

  it('tudo zero: só "novas" aparece, mesmo em zero', () => {
    expect(linhasDaPrevia({ novas: 0, jaViu: 0, paraRepetir: 0 })).toEqual([{ chave: 'novas', n: 0 }])
  })

  it('mostra as que não são zero, em ordem fixa', () => {
    expect(linhasDaPrevia({ novas: 3, jaViu: 0, paraRepetir: 2 }).map((l) => l.chave)).toEqual(['novas', 'paraRepetir'])
  })
})

describe('ComoSeJoga com prévia', () => {
  const props = {
    jogo: 'memory' as const,
    titulo: 'Memória',
    ageProfile: 'pro' as const,
    onJogar: () => {},
    onFechar: () => {},
  }

  it('sem prévia (aberta do lobby), a seção não existe', () => {
    render(<ComoSeJoga {...props} />)
    expect(document.querySelector('[data-secao="previa-da-rodada"]')).toBeNull()
  })

  it('prévia toda zerada: só "novas" aparece', () => {
    render(<ComoSeJoga {...props} previa={{ novas: 0, jaViu: 0, paraRepetir: 0 }} />)
    const linhas = [...document.querySelectorAll('[data-secao="previa-da-rodada"] [data-previa]')]
    expect(linhas.map((l) => l.getAttribute('data-previa'))).toEqual(['novas'])
  })

  it('prévia com fatos: mostra os números', () => {
    render(<ComoSeJoga {...props} previa={{ novas: 5, jaViu: 3, paraRepetir: 2 }} />)
    const linhas = [...document.querySelectorAll('[data-secao="previa-da-rodada"] [data-previa]')]
    expect(linhas.map((l) => l.textContent)).toEqual(['novas5', 'já viu3', 'para repetir2'])
  })
})
