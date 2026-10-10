/**
 * `GET /api/vocab/resumo` — as contagens da tela Cartões, sem baixar o baralho.
 *
 * O contrato é `src/core/learning/resumoDosCartoes.ts`. Aqui cada número da resposta tem uma linha
 * semeada que o explica (e uma que NÃO pode entrar nele: cartão suspenso, cartão apagado, revisão
 * apagada, ocorrência apagada, outra conta), e o ETag por versão é cobrado nas duas pontas: 304 sem
 * ler tabela nenhuma, 200 com ETag novo depois de uma revisão.
 */
process.env.TZ = 'America/Sao_Paulo'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { ResumoDosCartoes } from '../../src/core/learning/resumoDosCartoes'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { semearRico } from './_semeaduraRica'

const DIA = 86_400_000
const HORA = 3_600_000
/** 05/10/2026 15:00 UTC, em cima do minuto: o "agora" da rota é o fim do minuto do pedido (o próprio instante, quando ele cai em cima do minuto). */
const AGORA = Date.UTC(2026, 9, 5, 15, 0, 0)
/** Meia-noite de quem pediu (03:00 UTC = 00:00 em São Paulo). */
const HOJE = AGORA - 12 * HORA
const A = 'resumo-a'
const B = 'resumo-b'
const RICO = 'resumo-rico'
const rota = (inicio: number = HOJE) => `/api/vocab/resumo?inicioDoDia=${inicio}`

describe('GET /api/vocab/resumo', () => {
  let s: AppDeTeste
  let a: string
  let b: string
  let rico: string
  let instrucoes: string[] = []

  async function ler(token: string, inicio: number = HOJE): Promise<ResumoDosCartoes> {
    const r = await s.get(rota(inicio), token)
    expect(r.status).toBe(200)
    return (await r.json()) as ResumoDosCartoes
  }

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA)
    s = await subirApp({ modo: 'publico' })
    a = await s.token(A)
    b = await s.token(B)
    rico = await s.token(RICO)
    for (const token of [a, b, rico]) {
      expect((await s.get('/api/me/entitlements', token)).status).toBe(200)
      expect((await s.put('/api/me/idade', { nascimento: '1990-05-17' }, token)).status).toBeLessThan(300)
    }
    const { db } = await s.load('../../server/db/db')
    const t = await s.load('../../server/db/schema')

    for (const id of ['s1', 's2']) {
      await db.insert(t.sessions).values({
        id,
        createdAt: AGORA - 20 * DIA,
        updatedAt: AGORA - 20 * DIA,
        userId: A,
        title: id,
        kind: 'live',
        sourceLang: 'en',
        targetLang: 'pt',
        status: 'done',
      })
    }

    interface Cartao {
      id: string
      userId?: string
      srcLang?: string | null
      inDeck?: number | null
      dueAt?: number | null
      stability?: number | null
      reps?: number | null
      lapses?: number | null
      sessionId?: string | null
      addedAt?: number
      deletedAt?: number | null
    }
    const cartoes: Cartao[] = [
      // nova que vence agora
      { id: 'c1', dueAt: AGORA - 1000, sessionId: 's1', addedAt: AGORA - 10 * DIA },
      // nova nunca vista: guardada, não vence
      { id: 'c2', dueAt: null },
      // aprendendo, vencida desde ontem: previsão no índice 0
      { id: 'c3', srcLang: 'es', stability: 1, reps: 1, dueAt: AGORA - DIA, sessionId: 's2', addedAt: AGORA - DIA },
      // aprendendo, vence amanhã: previsão no índice 1
      { id: 'c4', stability: 1, reps: 1, dueAt: HOJE + DIA + 1000, sessionId: 's1', addedAt: AGORA - 5 * DIA },
      // revisão jovem, vence exatamente agora; difícil (8 erros); `en-US` conta como `en`
      { id: 'c5', srcLang: 'en-US', stability: 5, reps: 3, lapses: 8, dueAt: AGORA },
      // revisão madura (21 dias cravados), último dia da previsão
      { id: 'c6', stability: 21, reps: 5, dueAt: HOJE + 30 * DIA + 5 },
      // madura, além da previsão; `in_deck` nulo conta como no baralho; sem idioma
      { id: 'c7', srcLang: null, inDeck: null, stability: 40, reps: 9, dueAt: HOJE + 31 * DIA },
      // SUSPENSA: vencida, difícil, de idioma, sessão, Anki e Trilha próprios; só `suspensas` a vê
      { id: 'c8', srcLang: 'fr', inDeck: 0, stability: 3, reps: 4, lapses: 9, dueAt: AGORA - DIA, sessionId: 's2' },
      // APAGADA: não entra em nada
      { id: 'c9', srcLang: 'it', dueAt: AGORA - 1000, deletedAt: AGORA - 5 },
      // OUTRA CONTA
      { id: 'b1', userId: B, srcLang: 'de', dueAt: AGORA - 1000 },
    ]
    for (const c of cartoes) {
      const em = c.addedAt ?? AGORA - 15 * DIA
      await db.insert(t.vocabCards).values({
        id: c.id,
        createdAt: em,
        updatedAt: em,
        userId: c.userId ?? A,
        deletedAt: c.deletedAt ?? null,
        sessionId: c.sessionId ?? null,
        word: `palavra-${c.id}`,
        back: 'tradução',
        srcLang: c.srcLang === undefined ? 'en' : c.srcLang,
        tgtLang: 'pt',
        inDeck: c.inDeck === undefined ? 1 : c.inDeck,
        box: 1,
        dueAt: c.dueAt ?? null,
        stability: c.stability ?? null,
        reps: c.reps ?? 0,
        lapses: c.lapses ?? 0,
        addedAt: em,
        normKey: `k|${c.id}`,
        occurrences: 1,
      })
    }

    const ocorrencias: Array<[cartao: string, tipo: string, ref: string | null, apagada?: boolean]> = [
      ['c2', 'anki', 'dA'],
      ['c2', 'anki', 'dA'], // a mesma nota duas vezes: um par cartão×baralho só
      ['c5', 'anki', 'dA'],
      ['c5', 'anki', 'dB'],
      ['c8', 'anki', 'dB'], // suspensa
      ['c8', 'anki', 'dC'], // baralho só com cartão suspenso: não aparece
      ['c1', 'anki', 'dB', true], // ocorrência apagada
      ['c6', 'trilha', 'en'],
      ['c6', 'trilha', 'es'], // duas ocorrências de trilha: um cartão só
      ['c8', 'trilha', 'en'],
      ['c3', 'sessao', 's2'],
    ]
    for (const [k, [cardId, originKind, originRef, apagada]] of ocorrencias.entries()) {
      await db.insert(t.vocabOccurrences).values({
        id: `occ-${k}`,
        createdAt: AGORA - DIA,
        updatedAt: AGORA - DIA,
        userId: A,
        deletedAt: apagada ? AGORA - 5 : null,
        cardId,
        occurredAt: AGORA - DIA,
        originKind,
        originRef,
      })
    }

    const revisoes: Array<{ em: number; nota: number | null; semData?: boolean; apagada?: boolean; de?: string }> = [
      { em: HOJE + HORA, nota: 3 },
      { em: HOJE + 2 * HORA, nota: 1 },
      { em: HOJE + 3 * HORA, nota: 4 },
      { em: HOJE + 4 * HORA, nota: 4, apagada: true },
      { em: HOJE - HORA, nota: 2 }, // ontem
      { em: HOJE - 2 * HORA, nota: null }, // ontem, sem nota: conta no calendário, não na retenção
      { em: HOJE - 6 * DIA + 10, nota: 1 }, // o sexto dia para trás: ainda nos 7 dias
      { em: HOJE - 7 * DIA + 10, nota: 3 }, // fora dos 7, dentro dos 30
      { em: HOJE - 29 * DIA + 10, nota: 4 }, // o último dos 30
      { em: HOJE - 30 * DIA + 10, nota: 1 }, // fora dos 30
      { em: HOJE - 83 * DIA + 10, nota: 3, semData: true }, // o primeiro dia do calendário, só com `created_at`
      { em: HOJE - 84 * DIA + 10, nota: 3 }, // fora do calendário: só em "de sempre"
      { em: HOJE + HORA, nota: 1, de: B },
    ]
    for (const [k, r] of revisoes.entries()) {
      await db.insert(t.reviewLogs).values({
        id: `rev-${k}`,
        createdAt: r.em,
        updatedAt: r.em,
        userId: r.de ?? A,
        deletedAt: r.apagada ? AGORA - 5 : null,
        cardId: r.de ? 'b1' : 'c1',
        reviewedAt: r.semData ? null : r.em,
        grade: r.nota,
      })
    }

    await semearRico(s, RICO)

    const { client } = await s.load('../../server/db/db')
    const execute = client.execute.bind(client)
    const batch = client.batch.bind(client)
    const texto = (x: unknown) => (typeof x === 'string' ? x : ((x as { sql?: string }).sql ?? ''))
    client.execute = ((...p: Parameters<typeof execute>) => {
      instrucoes.push(texto(p[0]))
      return execute(...p)
    }) as typeof client.execute
    client.batch = ((...p: Parameters<typeof batch>) => {
      for (const x of p[0] as unknown[]) instrucoes.push(texto(x))
      return batch(...p)
    }) as typeof client.batch
  }, 60_000)

  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  const dasTabelasDoResumo = (sql: string[]) =>
    sql.filter((x) => /\b(vocab_cards|vocab_occurrences|review_logs)\b/.test(x))

  describe('as contagens', () => {
    let r: ResumoDosCartoes
    beforeAll(async () => {
      r = await ler(a)
    })

    it('devolve o instante e o começo do dia que usou', () => {
      expect(r.agora).toBe(AGORA)
      expect(r.inicioDoDia).toBe(HOJE)
    })

    it('conta o baralho, as suspensas, os idiomas e as difíceis', () => {
      expect(r.total).toBe(7)
      expect(r.suspensas).toBe(1)
      expect(r.idiomas).toBe(2)
      expect(r.dificeis).toBe(1)
    })

    it('divide o baralho por fase, com jovens e maduras pela estabilidade', () => {
      expect(r.fases).toEqual({ novas: 2, aprendendo: 2, jovens: 1, maduras: 2 })
    })

    it('conta o que vence agora por fase, e a nova sem data fica guardada', () => {
      expect(r.hoje).toEqual({ novas: 1, aprendendo: 1, revisar: 1 })
      expect(r.guardadas).toBe(1)
    })

    it('previsão: vencidas e de hoje no índice 0, amanhã no 1, o trigésimo dia no 30', () => {
      expect(r.previsao).toHaveLength(31)
      expect(r.previsao[0]).toBe(3)
      expect(r.previsao[1]).toBe(1)
      expect(r.previsao[30]).toBe(1)
      expect(r.previsao.reduce((x, y) => x + y, 0)).toBe(5)
    })

    it('revisões: de sempre, de hoje e o calendário de 84 dias', () => {
      expect(r.revisoesDeSempre).toBe(11)
      expect(r.revisadasHoje).toBe(3)
      expect(r.calendario).toHaveLength(84)
      const esperado = new Array<number>(84).fill(0)
      esperado[83] = 3
      esperado[82] = 2
      esperado[77] = 1
      esperado[76] = 1
      esperado[54] = 1
      esperado[53] = 1
      esperado[0] = 1
      expect(r.calendario).toEqual(esperado)
    })

    it('retenção: "Errei" é a esquecida, e a última semana é a dos 7 dias', () => {
      expect(r.retencao.d7).toEqual({ total: 5, lembradas: 3 })
      expect(r.retencao.d30).toEqual({ total: 7, lembradas: 5 })
      expect(r.retencao.semanas).toHaveLength(8)
      expect(r.retencao.semanas[7]).toEqual(r.retencao.d7)
      expect(r.retencao.semanas[6]).toEqual({ total: 1, lembradas: 1 })
      expect(r.retencao.semanas[3]).toEqual({ total: 2, lembradas: 1 })
      for (const i of [0, 1, 2, 4, 5]) expect(r.retencao.semanas[i]).toEqual({ total: 0, lembradas: 0 })
    })

    it('botões: as notas dos últimos 30 dias', () => {
      expect(r.botoes).toEqual([2, 1, 2, 2])
    })

    it('por idioma: a base do código, sem o cartão sem idioma', () => {
      expect(r.baralhos.idiomas).toEqual([
        { id: 'en', total: 5, novas: 1, aprendendo: 0, revisar: 1 },
        { id: 'es', total: 1, novas: 0, aprendendo: 1, revisar: 0 },
      ])
    })

    it('por sessão: a de cartão mais recente primeiro', () => {
      expect(r.baralhos.sessoes).toEqual([
        { id: 's2', total: 1, novas: 0, aprendendo: 1, revisar: 0 },
        { id: 's1', total: 2, novas: 1, aprendendo: 0, revisar: 0 },
      ])
    })

    it('por baralho do Anki: pares distintos cartão×baralho, sem ocorrência apagada', () => {
      expect(r.baralhos.anki).toEqual([
        { id: 'dA', total: 2, novas: 0, aprendendo: 0, revisar: 1 },
        { id: 'dB', total: 1, novas: 0, aprendendo: 0, revisar: 1 },
      ])
    })

    it('Trilha: um cartão, mesmo com duas ocorrências', () => {
      expect(r.baralhos.trilha).toEqual({ total: 1, novas: 0, aprendendo: 0, revisar: 0 })
    })
  })

  it('outra conta só vê o que é dela, e sem cartão de Trilha a Trilha é nula', async () => {
    const r = await ler(b)
    expect(r.total).toBe(1)
    expect(r.suspensas).toBe(0)
    expect(r.hoje).toEqual({ novas: 1, aprendendo: 0, revisar: 0 })
    expect(r.revisoesDeSempre).toBe(1)
    expect(r.revisadasHoje).toBe(1)
    expect(r.baralhos.idiomas).toEqual([{ id: 'de', total: 1, novas: 1, aprendendo: 0, revisar: 0 }])
    expect(r.baralhos.sessoes).toEqual([])
    expect(r.baralhos.anki).toEqual([])
    expect(r.baralhos.trilha).toBeNull()
  })

  it('o começo do dia desloca os dias: com o dia de ontem, as revisões de hoje continuam em "hoje"', async () => {
    const r = await ler(a, HOJE - DIA)
    expect(r.inicioDoDia).toBe(HOJE - DIA)
    // ontem (2) + hoje (3): tudo desde o começo do dia pedido
    expect(r.revisadasHoje).toBe(5)
    expect(r.calendario[83]).toBe(5)
    // só a vencida de ontem fica no índice 0; as que vencem agora vão para o 1, a de "amanhã" para o 2
    expect(r.previsao.slice(0, 3)).toEqual([1, 2, 1])
  })

  it('conta semeada grande: as somas fecham, o corpo é pequeno e são poucas consultas', async () => {
    instrucoes = []
    const res = await s.get(rota(), rico)
    expect(res.status).toBe(200)
    const corpo = await res.text()
    const consultas = dasTabelasDoResumo(instrucoes)
    const r = JSON.parse(corpo) as ResumoDosCartoes
    expect(r.total + r.suspensas).toBeGreaterThan(100)
    expect(r.fases.novas + r.fases.aprendendo + r.fases.jovens + r.fases.maduras).toBe(r.total)
    expect(r.hoje.novas + r.hoje.aprendendo + r.hoje.revisar).toBeLessThanOrEqual(r.total)
    expect(r.baralhos.idiomas.reduce((n, x) => n + x.total, 0)).toBe(r.total)
    expect(r.idiomas).toBe(r.baralhos.idiomas.length)
    expect(r.calendario.reduce((x, y) => x + y, 0)).toBeLessThanOrEqual(r.revisoesDeSempre)
    expect(r.revisoesDeSempre).toBe(260)
    expect(r.baralhos.anki.map((x) => x.id).sort()).toEqual(['deck-0', 'deck-1', 'deck-9'])
    expect(r.baralhos.trilha).not.toBeNull()
    // Medido nesta semeadura (116 cartões, 260 revisões): 1.590 bytes.
    expect(corpo.length).toBeLessThan(4000)
    // Cartões, origens, revisões de sempre e revisões por dia: uma consulta cada.
    expect(consultas).toHaveLength(4)
    expect(instrucoes.filter((x) => x.includes('versoes_de_dados'))).toHaveLength(1)
  })

  describe('validação', () => {
    it('400 sem `inicioDoDia`', async () => {
      expect((await s.get('/api/vocab/resumo', a)).status).toBe(400)
    })

    it('400 quando não é um inteiro', async () => {
      expect((await s.get('/api/vocab/resumo?inicioDoDia=ontem', a)).status).toBe(400)
      expect((await s.get(`/api/vocab/resumo?inicioDoDia=${HOJE}.5`, a)).status).toBe(400)
    })

    it('400 a mais de 36 h do relógio do servidor, para trás ou para a frente', async () => {
      expect((await s.get(rota(AGORA - 37 * HORA), a)).status).toBe(400)
      expect((await s.get(rota(AGORA + 37 * HORA), a)).status).toBe(400)
      expect((await s.get(rota(AGORA - 35 * HORA), a)).status).toBe(200)
    })

    it('sem token, 401: a rota é privada', async () => {
      expect((await s.get(rota())).status).toBe(401)
    })
  })

  describe('ETag pela versão dos dados', () => {
    let etag = ''

    it('a resposta traz o ETag do resumo', async () => {
      // um segundo dentro do minuto: o "agora" da rota é o fim dele, e vale até lá
      vi.setSystemTime(AGORA + 1_000)
      const r = await s.get(rota(), a)
      expect(r.status).toBe(200)
      etag = r.headers.get('etag') ?? ''
      expect(etag).toMatch(/^W\/"resumo-cartoes-/)
      await r.arrayBuffer()
    })

    it('com If-None-Match igual: 304, sem corpo e sem ler tabela nenhuma do resumo', async () => {
      vi.setSystemTime(AGORA + 20_000)
      instrucoes = []
      const r = await s.chamar('GET', rota(), { token: a, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(304)
      expect(await r.text()).toBe('')
      expect(dasTabelasDoResumo(instrucoes)).toEqual([])
      expect(instrucoes.filter((x) => x.includes('versoes_de_dados'))).toHaveLength(1)
    })

    it('outro começo de dia não casa com o ETag', async () => {
      const r = await s.chamar('GET', rota(HOJE - HORA), { token: a, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      await r.arrayBuffer()
    })

    it('o ETag de outra conta não vale', async () => {
      const r = await s.chamar('GET', rota(), { token: b, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      await r.arrayBuffer()
    })

    it('depois de uma revisão: 200, ETag novo e a revisão contada', async () => {
      expect((await s.post('/api/vocab/c1/review', { grade: 3 }, a)).status).toBe(200)
      const r = await s.chamar('GET', rota(), { token: a, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const novo = r.headers.get('etag') ?? ''
      expect(novo).toMatch(/^W\/"resumo-cartoes-/)
      expect(novo).not.toBe(etag)
      const corpo = (await r.json()) as ResumoDosCartoes
      expect(corpo.revisoesDeSempre).toBe(12)
      expect(corpo.revisadasHoje).toBe(4)
      // c1 deixou de ser nova e de vencer agora
      expect(corpo.hoje.novas).toBe(0)
      expect(corpo.fases.novas).toBe(1)
      etag = novo
    })

    it('uma ocorrência nova (só a versão `vocab` sobe) também derruba o ETag', async () => {
      const { db } = await s.load('../../server/db/db')
      const t = await s.load('../../server/db/schema')
      await db.insert(t.vocabOccurrences).values({
        id: 'occ-nova',
        createdAt: AGORA,
        updatedAt: AGORA,
        userId: A,
        cardId: 'c4',
        occurredAt: AGORA,
        originKind: 'anki',
        originRef: 'dB',
      })
      const r = await s.chamar('GET', rota(), { token: a, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      const corpo = (await r.json()) as ResumoDosCartoes
      expect(corpo.baralhos.anki.find((x) => x.id === 'dB')?.total).toBe(2)
      etag = r.headers.get('etag') ?? ''
    })

    it('no minuto seguinte o ETag antigo não vale: "vence agora" é recontado', async () => {
      vi.setSystemTime(AGORA + 61_000)
      const r = await s.chamar('GET', rota(), { token: a, headers: { 'if-none-match': etag } })
      expect(r.status).toBe(200)
      expect(((await r.json()) as ResumoDosCartoes).agora).toBe(AGORA + 120_000)
    })
  })
})
