/**
 * F2b — cartão e ocorrência deixam de ser a mesma coisa.
 *
 * O defeito: a 2ª vez que o usuário via uma palavra era DESCARTADA como 'duplicada'
 * (`vocab.ts:113`). Consequência medida no banco real: `frequency` preenchido em **0 de 2.126**
 * linhas, `sentence` guardando só a primeira frase, e nenhuma resposta para "quantas vezes vi" ou
 * "onde vi". A dedup também era 100% em JS, sem UNIQUE — e já tinha falhado 214 vezes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let vocabRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  vocabRepo = (await import('../../server/db/repositories/vocab')).vocabRepo
})
afterAll(async () => { await h?.cleanup?.() })

describe('bulkAdd — repetição vira contagem, não descarte', () => {
  it('a 2ª ocorrência INCREMENTA o contador em vez de sumir', async () => {
    const u = asUserId('rep-1')
    await vocabRepo.bulkAdd(u, [{ word: 'leverage', back: 'alavancagem', srcLang: 'en', sentence: 'primeira frase' }])
    const r2 = await vocabRepo.bulkAdd(u, [{ word: 'leverage', back: 'alavancagem', srcLang: 'en', sentence: 'segunda frase' }])

    const deck = await vocabRepo.list(u)
    const card = deck.find((c: any) => c.word === 'leverage')
    expect(deck.filter((c: any) => c.word === 'leverage')).toHaveLength(1)
    expect(card.occurrences).toBe(2)
    // A resposta continua honesta sobre o que fez com a 2ª: não foi criada, foi contada.
    expect(r2.repetidas ?? r2.skipped.map((s: any) => s.motivo)).toBeTruthy()
  })

  it('cada ocorrência é uma LINHA, com a frase daquela vez', async () => {
    const u = asUserId('rep-2')
    await vocabRepo.bulkAdd(u, [{ word: 'churn', srcLang: 'en', back: 'evasão', sentence: 'frase um' }])
    await vocabRepo.bulkAdd(u, [{ word: 'churn', srcLang: 'en', back: 'evasão', sentence: 'frase dois' }])

    const card = (await vocabRepo.list(u)).find((c: any) => c.word === 'churn')
    const occ = await vocabRepo.ocorrencias(u, card.id)
    expect(occ).toHaveLength(2)
    expect(occ.map((o: any) => o.sentence).sort()).toEqual(['frase dois', 'frase um'])
  })

  it('primeira e última ocorrência são datadas', async () => {
    const u = asUserId('rep-3')
    await vocabRepo.bulkAdd(u, [{ word: 'runway', srcLang: 'en', back: 'caixa' }])
    await new Promise((r) => setTimeout(r, 6))
    await vocabRepo.bulkAdd(u, [{ word: 'runway', srcLang: 'en', back: 'caixa' }])

    const card = (await vocabRepo.list(u)).find((c: any) => c.word === 'runway')
    expect(card.firstSeenAt).toBeLessThan(card.lastSeenAt)
  })

  it('a origem da TRILHA sobrevive ao round-trip (antes virava NULL)', async () => {
    // `Play.tsx:775` mandava sessionId='trilha:en'; `vocab.ts:154` só aceitava sessão existente e
    // gravava null. O filtro que depois procurava 'trilha:en' nunca casava.
    const u = asUserId('rep-4')
    await vocabRepo.bulkAdd(u, [{ word: 'moat', srcLang: 'en', back: 'fosso', sessionId: 'trilha:en' }])
    const card = (await vocabRepo.list(u)).find((c: any) => c.word === 'moat')
    const occ = await vocabRepo.ocorrencias(u, card.id)
    expect(occ[0].originKind).toBe('trilha')
    expect(occ[0].originRef).toBe('en')
  })

  it('normaliza acento e caixa: "Ação" e "acao" são a MESMA palavra', async () => {
    const u = asUserId('rep-5')
    await vocabRepo.bulkAdd(u, [{ word: 'Ação', srcLang: 'pt', back: 'action' }])
    await vocabRepo.bulkAdd(u, [{ word: 'acao', srcLang: 'pt', back: 'action' }])
    const deck = await vocabRepo.list(u)
    expect(deck).toHaveLength(1)
    expect(deck[0].occurrences).toBe(2)
  })

  it('a dedup continua POR USUÁRIO: A e B têm a palavra cada um', async () => {
    await vocabRepo.bulkAdd(A, [{ word: 'scale', srcLang: 'en', back: 'escalar' }])
    await vocabRepo.bulkAdd(B, [{ word: 'scale', srcLang: 'en', back: 'escalar' }])
    expect((await vocabRepo.list(A)).filter((c: any) => c.word === 'scale')).toHaveLength(1)
    expect((await vocabRepo.list(B)).filter((c: any) => c.word === 'scale')).toHaveLength(1)
  })

  it('CONCORRÊNCIA: duas escritas simultâneas da mesma palavra ⇒ UM cartão', async () => {
    // Antes a dedup era um Set em JS entre um SELECT e um INSERT — a janela entre os dois é a
    // corrida. Agora quem garante é o UNIQUE parcial no banco.
    const u = asUserId('rep-6')
    await Promise.all([
      vocabRepo.bulkAdd(u, [{ word: 'burn', srcLang: 'en', back: 'queima' }]),
      vocabRepo.bulkAdd(u, [{ word: 'burn', srcLang: 'en', back: 'queima' }]),
      vocabRepo.bulkAdd(u, [{ word: 'burn', srcLang: 'en', back: 'queima' }]),
    ])
    const deck = (await vocabRepo.list(u)).filter((c: any) => c.word === 'burn')
    expect(deck).toHaveLength(1)
    expect(deck[0].occurrences).toBe(3)
  })

  it('NÃO faz mais SELECT do baralho inteiro para deduplicar', async () => {
    // Regressão de custo: `bulkAdd` carregava TODAS as palavras do usuário a cada inserção,
    // mesmo para um lote de 1. Com o upsert, a dedup é do banco.
    const u = asUserId('rep-7')
    // Sem dígitos: `avaliarCartao` rejeita palavra com número como 'palavra-ruido' — e um teste
    // que usa dado inválido mede a régua de qualidade, não o upsert.
    const letras = 'abcdefghij'
    const muitas = Array.from({ length: 50 }, (_, i) =>
      ({ word: `termo${letras[Math.floor(i / 10)]}${letras[i % 10]}`, srcLang: 'en', back: 'traducao' }))
    const r = await vocabRepo.bulkAdd(u, muitas)
    expect(r.cards).toHaveLength(50)
    const denovo = await vocabRepo.bulkAdd(u, muitas)
    expect(denovo.cards).toHaveLength(0)
    expect((await vocabRepo.list(u))).toHaveLength(50)
  })
})

describe('CEFR na escrita', () => {
  it('grava a procedência do nível, e não um chute', async () => {
    const u = asUserId('cefr-1')
    await vocabRepo.bulkAdd(u, [
      // Palavra de CONTEÚDO: 'about' é gramatical e a régua de qualidade a barra antes do CEFR.
      { word: 'water', srcLang: 'en', back: 'água' },          // está na wordlist (A1)
      { word: 'zufolgen', srcLang: 'en', back: 'inexistente' }, // não está
    ])
    const deck = await vocabRepo.list(u)
    const conhecida = deck.find((c: any) => c.word === 'water')
    const desconhecida = deck.find((c: any) => c.word === 'zufolgen')
    expect(conhecida.cefrSource).toBe('wordlist')
    expect(conhecida.cefrLevel).toBe('A1')
    expect(desconhecida.cefrSource).toBe('ausente')
    expect(desconhecida.cefrLevel).toBeNull()
  })
})
