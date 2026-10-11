/**
 * `GET /api/vocab/conteudo` — as contagens por fonte do seletor de conteúdo.
 *
 * O contrato é `src/core/learning/contagensDeConteudo.ts`. Cada número tem uma linha semeada que o
 * explica e uma que NÃO pode entrar nele (cartão suspenso, apagado, de outro idioma, de sessão apagada,
 * de OUTRA CONTA), e o ETag por versão é cobrado nas duas pontas.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ContagensDeConteudo } from '../../src/core/learning/contagensDeConteudo'
import { type AppDeTeste, subirApp } from './_app'

const DIA = 86_400_000
/** Em cima do minuto: o "agora" da rota é o fim do minuto do pedido. */
const AGORA = Date.UTC(2026, 9, 5, 15, 0, 0)
const A = 'conteudo-a'
const B = 'conteudo-b'
const FRASE = 'We ship the dashboard today, not tomorrow.'

describe('GET /api/vocab/conteudo', () => {
  let s: AppDeTeste
  let a: string
  let b: string

  const ler = async (token: string, idioma = ''): Promise<ContagensDeConteudo> => {
    const r = await s.get(`/api/vocab/conteudo${idioma ? `?idioma=${idioma}` : ''}`, token)
    expect(r.status).toBe(200)
    return (await r.json()) as ContagensDeConteudo
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'publico' })
    a = await s.token(A)
    b = await s.token(B)
    for (const token of [a, b]) {
      expect((await s.get('/api/me/entitlements', token)).status).toBe(200)
      expect((await s.put('/api/me/idade', { nascimento: '1990-05-17' }, token)).status).toBeLessThan(300)
    }
    const { db } = await s.load('../../server/db/db')
    const t = await s.load('../../server/db/schema')

    const sessoes: Array<[id: string, dono: string, titulo: string, tipo: string, quando: number, apagada?: boolean]> = [
      ['s1', A, 'Reunião de produto', 'live', AGORA - 2 * DIA],
      ['s2', A, 'Aula de espanhol', 'video', AGORA - 5 * DIA],
      ['s3', A, 'Sessão apagada', 'live', AGORA - 9 * DIA, true],
      ['s4', A, 'Sem cartão nenhum', 'document', AGORA - DIA],
      ['sb', B, 'Sessão da outra conta', 'live', AGORA - DIA],
    ]
    for (const [id, userId, title, kind, quando, apagada] of sessoes)
      await db.insert(t.sessions).values({
        id,
        createdAt: quando,
        updatedAt: quando,
        userId,
        deletedAt: apagada ? AGORA - 5 : null,
        title,
        kind,
        sourceLang: 'en',
        targetLang: 'pt',
        durationMs: 600_000,
        status: 'done',
      })

    interface Cartao {
      id: string
      userId?: string
      srcLang?: string | null
      inDeck?: number | null
      dueAt?: number | null
      lapses?: number
      sessionId?: string | null
      sentence?: string | null
      deletedAt?: number
    }
    const cartoes: Cartao[] = [
      // vence agora, com frase útil
      { id: 'c1', sessionId: 's1', dueAt: AGORA - 1000, sentence: FRASE },
      // a MESMA frase noutro cartão (maiúsculas diferentes): uma frase só
      { id: 'c2', sessionId: 's1', dueAt: AGORA + DIA, sentence: FRASE.toUpperCase() },
      // frase curta (3 palavras): não serve aos jogos; nova nunca vista: não é "para hoje"
      { id: 'c3', sessionId: 's1', dueAt: null, sentence: 'Too short here' },
      // difícil (8 erros), vence exatamente agora; `en-US` conta como `en`; `in_deck` nulo conta
      { id: 'c4', srcLang: 'en-US', inDeck: null, lapses: 8, dueAt: AGORA, sentence: 'Customers were complaining about it a lot.' },
      // de sessão APAGADA: continua em Tudo, mas a sessão não é fonte
      { id: 'c5', sessionId: 's3', dueAt: AGORA + DIA },
      // espanhol: outro idioma
      { id: 'c6', srcLang: 'es', sessionId: 's2', dueAt: AGORA - DIA, sentence: 'Hemos hablado mucho de este tema hoy.' },
      { id: 'c7', srcLang: 'es', lapses: 9, dueAt: AGORA + DIA },
      // SUSPENSA: difícil, vencida, de sessão e de baralho; não entra em nada
      { id: 'c8', sessionId: 's1', inDeck: 0, lapses: 9, dueAt: AGORA - DIA, sentence: 'This one is suspended for now.' },
      // APAGADA
      { id: 'c9', sessionId: 's1', dueAt: AGORA - 1000, deletedAt: AGORA - 5 },
      // OUTRA CONTA: mesma sessão no nome, mesmo baralho no id
      { id: 'b1', userId: B, sessionId: 'sb', dueAt: AGORA - 1000, lapses: 20, sentence: 'This belongs to another account entirely.' },
    ]
    for (const c of cartoes)
      await db.insert(t.vocabCards).values({
        id: c.id,
        createdAt: AGORA - 15 * DIA,
        updatedAt: AGORA - 15 * DIA,
        userId: c.userId ?? A,
        deletedAt: c.deletedAt ?? null,
        sessionId: c.sessionId ?? null,
        word: `palavra-${c.id}`,
        back: 'tradução',
        sentence: c.sentence ?? null,
        srcLang: c.srcLang === undefined ? 'en' : c.srcLang,
        tgtLang: 'pt',
        inDeck: c.inDeck === undefined ? 1 : c.inDeck,
        box: 1,
        dueAt: c.dueAt ?? null,
        reps: 0,
        lapses: c.lapses ?? 0,
        addedAt: AGORA - 15 * DIA,
        normKey: `k|${c.id}`,
        occurrences: 1,
      })

    for (const [id, userId, nome] of [
      ['dA', A, 'Phrasal Verbs'],
      ['dVazio', A, 'Baralho sem cartão ativo'],
      ['dB', B, 'Baralho da outra conta'],
    ] as const)
      await db.insert(t.ankiDecks).values({
        id,
        createdAt: AGORA - 20 * DIA,
        updatedAt: AGORA - 20 * DIA,
        userId,
        nome,
        arquivoOrigem: `${id}.apkg`,
      })

    const ocorrencias: Array<[cartao: string, tipo: string, ref: string | null, dono?: string, apagada?: boolean]> = [
      ['c2', 'anki', 'dA'],
      ['c2', 'anki', 'dA'], // a mesma nota duas vezes: um par só
      ['c4', 'anki', 'dA'],
      ['c8', 'anki', 'dVazio'], // só cartão suspenso: o baralho não aparece
      ['c1', 'anki', 'dA', A, true], // ocorrência apagada
      ['c4', 'trilha', 'en'],
      ['c4', 'trilha', 'es'], // duas ocorrências de trilha: um cartão só
      ['b1', 'anki', 'dB', B],
      ['b1', 'trilha', 'en', B],
    ]
    for (const [k, [cardId, originKind, originRef, dono, apagada]] of ocorrencias.entries())
      await db.insert(t.vocabOccurrences).values({
        id: `occ-${k}`,
        createdAt: AGORA - DIA,
        updatedAt: AGORA - DIA,
        userId: dono ?? A,
        deletedAt: apagada ? AGORA - 5 : null,
        cardId,
        occurredAt: AGORA - DIA,
        originKind,
        originRef,
      })
  }, 60_000)

  afterAll(async () => {
    vi.useRealTimers()
    await s.encerrar()
  })

  it('com dois idiomas, conta um por vez: Tudo, Difíceis, sessões, Anki e Trilha em inglês', async () => {
    const k = await ler(a, 'en')
    expect(k.agora).toBe(AGORA)
    expect(k.idioma).toBe('en')
    expect(k.idiomas).toEqual([
      { id: 'en', palavras: 5 },
      { id: 'es', palavras: 2 },
    ])
    // c1..c5; frases: a de c1/c2 (uma só) e a de c4; vencem c1 e c4
    expect(k.tudo).toEqual({ palavras: 5, frases: 2, paraHoje: 2 })
    expect(k.dificeis).toEqual({ palavras: 1, frases: 1, paraHoje: 1 })
    expect(k.sessoes).toEqual([
      { id: 's1', nome: 'Reunião de produto', tipo: 'live', quando: AGORA - 2 * DIA, duracaoMs: 600_000, palavras: 3, frases: 1, paraHoje: 1 },
    ])
    expect(k.anki).toEqual([
      { id: 'dA', nome: 'Phrasal Verbs', tipo: null, quando: AGORA - 20 * DIA, duracaoMs: null, palavras: 2, frases: 2, paraHoje: 1 },
    ])
    expect(k.trilha).toEqual({ palavras: 1, frases: 1, paraHoje: 1 })
  })

  it('no outro idioma, só o que é dele', async () => {
    const k = await ler(a, 'es')
    expect(k.idioma).toBe('es')
    expect(k.tudo).toEqual({ palavras: 2, frases: 1, paraHoje: 1 })
    expect(k.dificeis).toEqual({ palavras: 1, frases: 0, paraHoje: 0 })
    expect(k.sessoes.map((x) => [x.id, x.tipo, x.palavras])).toEqual([['s2', 'video', 1]])
    expect(k.anki).toEqual([])
    expect(k.trilha).toBeNull()
  })

  it('sem idioma, ou com um que a conta não tem, vale o maior', async () => {
    expect((await ler(a)).idioma).toBe('en')
    expect((await ler(a, 'ja')).idioma).toBe('en')
    expect((await ler(a, 'pt-BR')).idioma).toBe('en')
  })

  it('a outra conta só vê o que é dela, e com um idioma só nada é filtrado', async () => {
    const k = await ler(b, 'es')
    expect(k.idioma).toBe('')
    expect(k.idiomas).toEqual([{ id: 'en', palavras: 1 }])
    expect(k.tudo).toEqual({ palavras: 1, frases: 1, paraHoje: 1 })
    expect(k.dificeis.palavras).toBe(1)
    expect(k.sessoes.map((x) => x.id)).toEqual(['sb'])
    expect(k.anki.map((x) => x.id)).toEqual(['dB'])
    const deA = JSON.stringify(await ler(a, 'en'))
    expect(deA).not.toContain('outra conta')
    expect(deA).not.toContain('"sb"')
    expect(deA).not.toContain('"dB"')
  })

  it('sem token: 401', async () => {
    expect((await s.get('/api/vocab/conteudo')).status).toBe(401)
  })

  it('idioma fora do formato: 400', async () => {
    expect((await s.get('/api/vocab/conteudo?idioma=%27%20or%201', a)).status).toBe(400)
  })

  it('ETag pela versão: 304 quando nada mudou, 200 com ETag novo depois de uma escrita', async () => {
    const r1 = await s.get('/api/vocab/conteudo?idioma=en', a)
    const etag = r1.headers.get('etag')
    expect(etag).toMatch(/^W\/"conteudo-/)
    const r2 = await s.chamar('GET', '/api/vocab/conteudo?idioma=en', { token: a, headers: { 'if-none-match': etag! } })
    expect(r2.status).toBe(304)
    expect(await r2.text()).toBe('')
    // o ETag de um idioma não vale no outro, nem o de uma conta na outra
    expect((await s.chamar('GET', '/api/vocab/conteudo?idioma=es', { token: a, headers: { 'if-none-match': etag! } })).status).toBe(200)
    expect((await s.chamar('GET', '/api/vocab/conteudo?idioma=en', { token: b, headers: { 'if-none-match': etag! } })).status).toBe(200)

    // suspender c1 pela rota de verdade: a versão sobe e a contagem muda
    expect((await s.patch('/api/vocab/c1', { inDeck: false }, a)).status).toBe(200)
    const r3 = await s.chamar('GET', '/api/vocab/conteudo?idioma=en', { token: a, headers: { 'if-none-match': etag! } })
    expect(r3.status).toBe(200)
    expect(r3.headers.get('etag')).not.toBe(etag)
    const k = (await r3.json()) as ContagensDeConteudo
    expect(k.tudo).toEqual({ palavras: 4, frases: 2, paraHoje: 1 })
    expect(k.sessoes[0]).toMatchObject({ id: 's1', palavras: 2, paraHoje: 0 })
  })
})
