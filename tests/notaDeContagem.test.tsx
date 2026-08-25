// @vitest-environment jsdom
/**
 * Z2 — a UX comunica que a contagem de ocorrências começou na migração.
 *
 * A migração da F2b não teve histórico para reconstruir: cada cartão nasceu com UMA ocorrência de
 * origem `legado`. Isso estava no comentário da migração e no relatório — e o usuário, que é quem
 * olha o número, não sabia. Um "1×" que significa "não medido" é um número falso apresentado como
 * dado (Ajuste 4).
 *
 * Os três estados que a tela precisa distinguir estão cobertos aqui.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(() => cleanup())
import NotaDeContagem, { formatarInicio, rotuloDeOcorrencias } from '../src/components/views/vocab/NotaDeContagem'

const EM = new Date('2026-08-08T12:00:00Z').getTime()

describe('NotaDeContagem — os três estados', () => {
  it('ESTADO 1 · acervo todo anterior à contagem: diz a data E explica o "1×"', () => {
    render(<NotaDeContagem inicioEm={EM} totalLegado={1902} total={1902} />)
    expect(screen.getByText(/começou em/i)).toBeTruthy()
    expect(screen.getByText(/agosto/i)).toBeTruthy()
    // A explicação é o ponto: sem ela o número parece medição.
    expect(screen.getByText(/não foram registrados, não porque só aconteceram uma vez/i)).toBeTruthy()
  })

  it('ESTADO 2 · acervo misto: quantifica quanto é anterior', () => {
    render(<NotaDeContagem inicioEm={EM} totalLegado={300} total={1902} />)
    expect(screen.getByText(/300 de 1902/)).toBeTruthy()
  })

  it('ESTADO 3 · nenhuma ocorrência nova ainda: diz que começa AGORA, sem inventar data', () => {
    render(<NotaDeContagem inicioEm={null} totalLegado={10} total={10} />)
    expect(screen.getByText(/começa agora/i)).toBeTruthy()
    expect(screen.queryByText(/começou em/i)).toBeNull()
  })

  it('acervo vazio não renderiza nota — não há o que declarar', () => {
    const { container } = render(<NotaDeContagem inicioEm={null} totalLegado={0} total={0} />)
    expect(container.textContent).toBe('')
  })
})

describe('rotuloDeOcorrencias — "não medido" ≠ "medido uma vez"', () => {
  it('cartão só com legado diz que não há contagem anterior', () => {
    expect(rotuloDeOcorrencias(1, true)).toBe('sem contagem anterior')
  })

  it('cartão com um encontro REAL diz um encontro', () => {
    expect(rotuloDeOcorrencias(1, false)).toBe('1 encontro')
  })

  it('plural correto acima de um', () => {
    expect(rotuloDeOcorrencias(7, false)).toBe('7 encontros')
  })
})

describe('formatarInicio', () => {
  it('sem data devolve null em vez de "Invalid Date"', () => {
    expect(formatarInicio(null)).toBeNull()
  })
})
