/**
 * O FILTRO LEGAL DO CATÁLOGO DE LIVROS (critério 1 da spec `docs/specs/2026-10-26-livros-e-leitura.md`).
 *
 * Lei 9.610, art. 41: a obra entra em domínio público 70 anos contados de 1º de janeiro do ano seguinte à
 * morte do autor. Em 2026 entra quem morreu até 1955. Art. 14: a tradução tem direito próprio, então o
 * tradutor segue a mesma regra. E o que não se sabe não entra.
 */
import { describe, expect, it } from 'vitest'

import { anoLimite, avaliarLegalidade, entraNoCatalogo, respeitaOLimite } from '../src/core/livros/filtroLegal'
import type { Pessoa } from '../src/core/livros/tipos'

const autor = (anoMorte: number | null, nome = 'Fulano'): Pessoa => ({ nome, anoMorte })
const obra = (o: { autores?: Pessoa[]; tradutores?: Pessoa[]; ehTraducao?: boolean; fonte?: string } = {}) => ({
  autores: o.autores ?? [autor(1900)],
  tradutores: o.tradutores ?? [],
  ehTraducao: o.ehTraducao ?? (o.tradutores?.length ?? 0) > 0,
  fonte: o.fonte ?? 'standard-ebooks',
})

describe('o ano-limite', () => {
  it('é o ano menos 71', () => {
    expect(anoLimite(2026)).toBe(1955)
    expect(anoLimite(2027)).toBe(1956)
  })
})

describe('autor', () => {
  it('morto em 1955 entra em 2026', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1955)] }), 2026)).toBe(true)
  })

  it('morto em 1956 NUNCA entra em 2026', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1956, 'Gabriela')] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'autor-protegido' })
    expect(v).toHaveProperty('detalhe', expect.stringContaining('1956'))
    expect(v).toHaveProperty('detalhe', expect.stringContaining('2027'))
  })

  it('morto em 1998 (Jünger, que o Standard Ebooks tem por ser domínio público nos EUA) não entra', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1998, 'Ernst Jünger')] }), 2026)).toBe(false)
  })

  it('sem ano de morte NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(null)] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'autor-sem-ano-de-morte' })
  })

  it('obra sem autor não entra (anônimo só pela lista de exceções revisada)', () => {
    expect(avaliarLegalidade(obra({ autores: [] }), 2026)).toMatchObject({ entra: false, motivo: 'sem-autor' })
  })

  it('coautoria: basta um autor protegido ou sem ano para a obra ficar de fora', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(1960)] }), 2026)).toBe(false)
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(null)] }), 2026)).toBe(false)
    expect(entraNoCatalogo(obra({ autores: [autor(1900), autor(1950)] }), 2026)).toBe(true)
  })

  it('obra sem tradutor e autor morto em 1900 entra', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1900)], tradutores: [], ehTraducao: false }), 2026)).toBe(true)
  })
})

describe('tradutor', () => {
  it('tradução com tradutor SEM ano de morte NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1881)], tradutores: [autor(null, 'Tradutora')] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'tradutor-sem-ano-de-morte' })
  })

  it('tradução com tradutor DESCONHECIDO (a fonte diz que é tradução, sem dizer de quem) NUNCA entra', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1828)], tradutores: [], ehTraducao: true }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'traducao-sem-tradutor' })
  })

  it('tradução com tradutor morto em 1956 nunca entra em 2026', () => {
    const v = avaliarLegalidade(obra({ autores: [autor(1881)], tradutores: [autor(1956)] }), 2026)
    expect(v).toMatchObject({ entra: false, motivo: 'tradutor-protegido' })
  })

  it('tradução com autor e tradutor mortos até 1955 entra', () => {
    expect(
      entraNoCatalogo(obra({ autores: [autor(1881)], tradutores: [autor(1946, 'Constance Garnett')] }), 2026),
    ).toBe(true)
  })
})

describe('o ano de quem monta', () => {
  it('trocar --ano para 2027 libera quem morreu em 1956 (autor e tradutor)', () => {
    expect(entraNoCatalogo(obra({ autores: [autor(1956)] }), 2027)).toBe(true)
    expect(entraNoCatalogo(obra({ autores: [autor(1900)], tradutores: [autor(1956)] }), 2027)).toBe(true)
    expect(entraNoCatalogo(obra({ autores: [autor(1957)] }), 2027)).toBe(false)
  })
})

describe('a fonte', () => {
  it('só as quatro fontes aceitas', () => {
    expect(entraNoCatalogo(obra({ fonte: 'gutenberg-curado' }), 2026)).toBe(true)
    expect(entraNoCatalogo(obra({ fonte: 'wikisource' }), 2026)).toBe(true)
    expect(avaliarLegalidade(obra({ fonte: 'gutenberg' }), 2026)).toMatchObject({
      entra: false,
      motivo: 'fonte-nao-aceita',
    })
    expect(entraNoCatalogo(obra({ fonte: 'mec' }), 2026)).toBe(false)
  })
})

describe('a defesa dupla do cliente (respeitaOLimite)', () => {
  it('recusa quem passa do anoLimite publicado ou não tem ano, autor ou tradutor', () => {
    expect(respeitaOLimite({ autores: [autor(1955)], tradutores: [] }, 1955)).toBe(true)
    expect(respeitaOLimite({ autores: [autor(1956)], tradutores: [] }, 1955)).toBe(false)
    expect(respeitaOLimite({ autores: [autor(null)], tradutores: [] }, 1955)).toBe(false)
    expect(respeitaOLimite({ autores: [autor(1900)], tradutores: [autor(null)] }, 1955)).toBe(false)
    expect(respeitaOLimite({ autores: [], tradutores: [] }, 1955)).toBe(false)
  })
})
