/**
 * UMA NOTA RUIM NÃO PODE DERRUBAR O BARALHO INTEIRO.
 *
 * `bulkAddCardsSchema` valida o LOTE: se uma nota estiver fora do formato, a rota devolve 400 e
 * NENHUM cartão entra. Medido importando um baralho Anki real de 39 notas com a palavra `a` no
 * meio: 39 lidas, ZERO gravadas — e a tela dizia apenas "0 entraram no seu baralho", porque
 * `bulkAddCards` transformava o 400 (que trazia a causa exata, `cards.34.word — Too small`) num
 * resultado vazio indistinguível de "não havia nada para entrar".
 *
 * Não é caso raro: todo baralho de idioma tem artigo ou pronome de uma letra.
 */
import { describe, it, expect } from 'vitest'
import { foraDoBulkAdd, LIMITES_DO_BULK_ADD } from '../src/core/learning/quality'

describe('a fronteira de formato do bulk-add', () => {
  it('espelha o schema do servidor: 2 a 200 caracteres', () => {
    expect(LIMITES_DO_BULK_ADD).toEqual({ min: 2, max: 200 })
  })

  it('a palavra de UMA letra é o caso que derrubava o lote', () => {
    expect(foraDoBulkAdd('a')).toBe('palavra-curta')
    expect(foraDoBulkAdd('I')).toBe('palavra-curta')
    // Um caractere de escrita logográfica É uma palavra inteira (日 = dia). Descartá-lo custava
    // 70% de um baralho japonês, medido no G0 multi-idioma.
    expect(foraDoBulkAdd('日')).toBeNull()
  })

  it('espaço em volta não conta — é assim que o servidor mede (`z.string().trim()`)', () => {
    expect(foraDoBulkAdd('  a  ')).toBe('palavra-curta')
    expect(foraDoBulkAdd('  be  ')).toBeNull()
  })

  it('palavra longa demais também sai, em vez de derrubar o resto', () => {
    expect(foraDoBulkAdd('x'.repeat(201))).toBe('palavra-longa')
    expect(foraDoBulkAdd('x'.repeat(200))).toBeNull()
  })

  it('o que é vocabulário de verdade passa — inclusive com espaço e acento', () => {
    for (const w of ['bread', 'ice cream', 'pássaro', 'friendship', 'être']) {
      expect(foraDoBulkAdd(w), w).toBeNull()
    }
  })

  /**
   * A régua de CONTEÚDO continua sendo do servidor. Filtrar formato aqui não é duplicá-la — é
   * garantir que o lote chegue aceitável, para que o servidor possa recusar POR ITEM em vez de o
   * lote inteiro morrer na porta.
   */
  it('não recusa por conteúdo: gramatical e sem tradução são decisão do servidor', () => {
    expect(foraDoBulkAdd('the')).toBeNull()
    expect(foraDoBulkAdd('be')).toBeNull()
  })

  it('o baralho que falhou de verdade passa a entregar 38 de 39', () => {
    // As 39 notas lidas do arquivo de teste; só `a` está fora do FORMATO.
    const notas = [
      'bread', 'house', 'water', 'green', 'story', 'plant', 'child', 'river', 'light', 'night',
      'table', 'smile', 'brave', 'cloud', 'dream', 'garden', 'winter', 'summer', 'forest',
      'silver', 'door', 'fish', 'bird', 'tree', 'book', 'shelter', 'kitchen', 'morning',
      'freedom', 'teacher', 'friendship', 'understand', 'ice cream', 'be', 'a', 'the',
      'duplicate', 'duplicate', 'run',
    ]
    const vao = notas.filter(w => foraDoBulkAdd(w) === null)
    expect(notas.length).toBe(39)
    expect(vao.length).toBe(38)
    expect(notas.filter(w => foraDoBulkAdd(w) !== null)).toEqual(['a'])
  })
})
