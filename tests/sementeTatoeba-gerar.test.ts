/**
 * O GERADOR DA SEMENTE (`scripts/semente-traducao/gerar.mjs`): filtros, escolha da tradução e o
 * corte no orçamento de 150 KB gzip por par. Puro — nenhum download.
 */
import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { cabecalho, cortarNoOrcamento, escolher, estranheza, serve } from '../scripts/semente-traducao/gerar.mjs'

describe('filtros da semente', () => {
  it('até 8 palavras dos dois lados', () => {
    expect(serve('Good morning.', 'Bom dia.')).toBe(true)
    expect(serve('one two three four five six seven eight nine', 'um')).toBe(false)
  })

  it('sem algarismo, aspas nem parênteses', () => {
    expect(serve('I have 2 cats.', 'Tenho 2 gatos.')).toBe(false)
    expect(serve('He said "no".', 'Ele disse "não".')).toBe(false)
  })

  it('sem nome próprio: maiúscula no meio ou a mesma dos dois lados ("Tom")', () => {
    expect(serve('I met Mary.', 'Conheci a Mary.')).toBe(false)
    expect(serve('Tom is happy.', 'Tom está feliz.')).toBe(false)
    expect(serve('I am happy.', 'Estou feliz.')).toBe(true)
  })
})

describe('escolha da tradução', () => {
  it('uma por frase, pelo voto; empate, a menos estranha ao português do Brasil', () => {
    const pares = [
      { idA: '1', a: 'I love you.', idB: '10', b: 'Amo-a.' },
      { idA: '1', a: 'I love you.', idB: '11', b: 'Eu te amo.' },
      { idA: '2', a: 'Thank you!', idB: '20', b: 'Valeu!' },
      { idA: '2', a: 'Thank you!', idB: '21', b: 'Obrigado!' },
      { idA: '3', a: 'Thank you.', idB: '22', b: 'Obrigado.' },
    ]
    const r = escolher(pares, new Map())
    expect(r.find((p: { a: string }) => p.a === 'I love you.').b).toBe('Eu te amo.')
    expect(r.filter((p: { a: string }) => /^thank you/i.test(p.a))).toHaveLength(1) // "Thank you!" = "thank you."
    expect(estranheza('Amo-a.')).toBeGreaterThan(estranheza('Eu te amo.'))
  })

  it('a frase mais traduzida (mais dita) vem antes', () => {
    const pares = [
      { idA: '5', a: 'You are old.', idB: '50', b: 'Você é velho.' },
      ...['Obrigado!', 'Obrigada!', 'Valeu!'].map((b, k) => ({ idA: '6', a: 'Thank you!', idB: `6${k}`, b })),
    ]
    expect(escolher(pares, new Map())[0].a).toBe('Thank you!')
  })
})

describe('orçamento', () => {
  it('corta no maior prefixo que cabe em gzip e mantém o cabeçalho de atribuição', () => {
    const muitas = Array.from({ length: 3000 }, (_, k) => ({
      a: `sentence number ${k.toString(36)}`,
      b: `frase ${k * 7919}`,
    }))
    const { n, tsv } = cortarNoOrcamento(muitas, cabecalho('en', 'pt'), 4 * 1024)
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(3000)
    expect(gzipSync(tsv).length).toBeLessThanOrEqual(4 * 1024)
    expect(tsv).toMatch(/Tatoeba \(https:\/\/tatoeba\.org\), licença CC BY 2\.0 FR/)
  })
})
