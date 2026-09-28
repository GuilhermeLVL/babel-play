/**
 * CACHE DE TRADUÇÃO EM DOIS NÍVEIS (auditoria de eficiência da IA, 28/09 — relatório §6, fase 1, item 2).
 *
 * O cache do servidor era só memória do processo (L1): um deploy apagava tudo, e a fala do microfone
 * quase nunca acertava porque a chave levava os 3 turnos anteriores da conversa. Estes testes prendem
 * o desenho novo:
 *   - frase CURTA (≤ 4 palavras, normalizada) ignora o contexto na chave — "ok", "thank you" acertam;
 *   - o L2 em SQLite (`cache_de_traducao`, migração 0038) sobrevive ao L1 (despejo ou reinício), vale
 *     30 dias e tem teto de linhas;
 *   - PRIVACIDADE (LGPD art. 12/14, público com menores): só vai ao disco frase de até 12 palavras
 *     (fala: até 4), sem dado que pareça pessoal, e NENHUMA coluna guarda quem pediu;
 *   - acerto no L2 não gasta cota, como o do L1.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  chaveDeTraducao,
  contarPalavras,
  MAX_PALAVRAS_FALA_PERSISTIDA,
  MAX_PALAVRAS_PERSISTIDAS,
  MAX_PALAVRAS_SEM_CONTEXTO,
  normalizarFrase,
  podePersistir,
  TTL_PERSISTENTE_MS,
} from '../../server/ai/cacheDeTraducao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

describe('a chave: normalização e a regra sem contexto', () => {
  it('normaliza caixa, espaços e pontuação final — mas a interrogação fica', () => {
    expect(normalizarFrase('  Thank   YOU. ')).toBe('thank you')
    expect(normalizarFrase('Okay!!!')).toBe('okay')
    expect(normalizarFrase('Ready…')).toBe('ready')
    // "Pronto?" e "Pronto." não são a mesma frase: em português só a pontuação separa as duas.
    expect(normalizarFrase('Ready?')).toBe('ready?')
    expect(contarPalavras(' one  two three ')).toBe(3)
    expect(contarPalavras('   ')).toBe(0)
  })

  it('os limiares são constantes: 4 sem contexto, 12 no disco, 4 no disco para fala', () => {
    expect(MAX_PALAVRAS_SEM_CONTEXTO).toBe(4)
    expect(MAX_PALAVRAS_PERSISTIDAS).toBe(12)
    expect(MAX_PALAVRAS_FALA_PERSISTIDA).toBe(4)
    expect(TTL_PERSISTENTE_MS).toBe(30 * 86_400_000)
  })

  it('fala CURTA ignora o contexto na chave; fala longa continua com ele', () => {
    const base = { src: 'en', tgt: 'pt', falada: true, modelo: 'm', versaoDoPrompt: 'v1' }
    const curtaA = chaveDeTraducao({ ...base, texto: 'Thank you.', contexto: ['a'] })
    const curtaB = chaveDeTraducao({ ...base, texto: 'thank you', contexto: ['b', 'c'] })
    expect(curtaA).toBe(curtaB)
    const longa = 'I will see you tomorrow at school'
    expect(chaveDeTraducao({ ...base, texto: longa, contexto: ['a'] })).not.toBe(
      chaveDeTraducao({ ...base, texto: longa, contexto: ['b'] }),
    )
  })

  it('a versão do prompt entra na chave: prompt novo não herda tradução do antigo', () => {
    const base = { texto: 'hello', tgt: 'pt', falada: false, modelo: 'm' }
    expect(chaveDeTraducao({ ...base, versaoDoPrompt: 'v1' })).not.toBe(chaveDeTraducao({ ...base, versaoDoPrompt: 'v2' }))
  })

  it('só vai ao disco: texto ≤ 12 palavras, fala ≤ 4, e nada que pareça dado pessoal', () => {
    expect(podePersistir({ texto: 'one two three four five six seven eight nine ten eleven twelve', falada: false })).toBe(true)
    expect(podePersistir({ texto: 'one two three four five six seven eight nine ten eleven twelve 13', falada: false })).toBe(false)
    expect(podePersistir({ texto: 'see you later', falada: true })).toBe(true)
    expect(podePersistir({ texto: 'see you later my friend', falada: true })).toBe(false)
    expect(podePersistir({ texto: 'call me at 99887766', falada: false })).toBe(false)
    expect(podePersistir({ texto: 'write to ana@exemplo.com', falada: false })).toBe(false)
  })
})

let h: EphemeralDb
let mtTranslateProxy: any
let cache: any
let repo: any
let subs: any
let counters: any
let client: any

const mes = () => new Date().toISOString().slice(0, 7)

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  return r
}
const respostaOk = (texto: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 30, completion_tokens: 5 },
  }),
})

async function linhas(): Promise<any[]> {
  return (await client.execute('SELECT * FROM cache_de_traducao')).rows
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  cache = await h.load('../../server/ai/cacheDeTraducao')
  ;({ cacheDeTraducaoRepo: repo } = (await h.load('../../server/db/repositories/cacheDeTraducao')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ usageCountersRepo: counters } = (await h.load('../../server/db/repositories/usageCounters')) as any)
  ;({ client } = (await h.load('../../server/db/db')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
beforeEach(() => cache.esvaziarCacheDeTraducao())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.GROQ_API_KEY
  esquecerDisjuntores()
})

async function comPlano(id: string) {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'pro', status: 'active' })
  return u
}

function contarChamadas(texto: string) {
  const c = { n: 0 }
  vi.stubGlobal('fetch', async () => (c.n++, respostaOk(texto)))
  return c
}

describe('L2 em SQLite na rota', () => {
  it('depois de perder o L1 (despejo/reinício), a frase sai do L2 — sem provedor e sem cota', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('l2-1')
    const c = contarChamadas('Obrigado.')
    await mtTranslateProxy({ userId: u, body: { text: 'Thank you.', src: 'en', tgt: 'pt' }, requestId: 'r' }, mockRes())
    expect(c.n).toBe(1)
    expect(await linhas()).toHaveLength(1)

    cache.cacheDeTraducao.esvaziar() // só o L1: é o que um deploy apaga
    const b = mockRes()
    await mtTranslateProxy({ userId: u, body: { text: 'thank you', src: 'en', tgt: 'pt' }, requestId: 'r' }, b)
    expect(c.n).toBe(1)
    expect(b.body?.text).toBe('Obrigado.')
    expect(b.body?.cache).toBe(true)
    expect(await counters.get(u, 'managed_calls', mes())).toBe(1)
    const [linha] = await linhas()
    expect(Number(linha.acertos)).toBe(1)
  })

  it('outro usuário acerta a mesma frase curta (partilha global só do que é curto e normalizado)', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const a = await comPlano('l2-a')
    const b = await comPlano('l2-b')
    const c = contarChamadas('Até logo.')
    await mtTranslateProxy({ userId: a, body: { text: 'See you', tgt: 'pt' }, requestId: 'r' }, mockRes())
    cache.cacheDeTraducao.esvaziar()
    await mtTranslateProxy({ userId: b, body: { text: 'see you!', tgt: 'pt' }, requestId: 'r' }, mockRes())
    expect(c.n).toBe(1)
    expect(await counters.get(b, 'managed_calls', mes())).toBeFalsy()
  })

  it('fala curta com contextos DIFERENTES acerta; fala de 5+ palavras não vai ao disco', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('l2-fala')
    const c = contarChamadas('Beleza.')
    await mtTranslateProxy({ userId: u, body: { text: 'Okay', tgt: 'pt', falada: true, contexto: ['x'] }, requestId: 'r' }, mockRes())
    await mtTranslateProxy({ userId: u, body: { text: 'okay.', tgt: 'pt', falada: true, contexto: ['y', 'z'] }, requestId: 'r' }, mockRes())
    expect(c.n).toBe(1)

    await mtTranslateProxy(
      { userId: u, body: { text: 'I will call you tomorrow', tgt: 'pt', falada: true, contexto: ['x'] }, requestId: 'r' },
      mockRes(),
    )
    expect(c.n).toBe(2)
    expect(await linhas()).toHaveLength(1) // só o "okay"
  })

  it('texto de mais de 12 palavras fica só na memória', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('l2-longo')
    contarChamadas('x')
    const longo = 'one two three four five six seven eight nine ten eleven twelve thirteen'
    await mtTranslateProxy({ userId: u, body: { text: longo, tgt: 'pt' }, requestId: 'r' }, mockRes())
    expect(await linhas()).toHaveLength(0)
  })

  it('nenhuma coluna guarda quem pediu, e nem a frase de origem', async () => {
    process.env.GROQ_API_KEY = 'chave'
    const u = await comPlano('usuario-que-nao-pode-aparecer')
    contarChamadas('Bom dia.')
    await mtTranslateProxy({ userId: u, body: { text: 'Good morning', src: 'en', tgt: 'pt' }, requestId: 'r' }, mockRes())
    const colunas = (await client.execute('PRAGMA table_info(cache_de_traducao)')).rows.map((r: any) => r.name)
    expect(colunas.some((n: string) => /user|usuario|titular|ip/i.test(n))).toBe(false)
    const [linha] = await linhas()
    const tudo = JSON.stringify(linha)
    expect(tudo).not.toContain('usuario-que-nao-pode-aparecer')
    expect(tudo.toLowerCase()).not.toContain('good morning')
    expect(linha.traducao).toBe('Bom dia.')
    expect(linha.origem).toBe('en')
    expect(linha.destino).toBe('pt')
  })
})

describe('L2: TTL de 30 dias e poda', () => {
  const AGORA = Date.UTC(2026, 8, 28, 12)
  const DIA = 86_400_000

  it('linha com mais de 30 dias não é servida', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AGORA - 31 * DIA)
    const consulta = { texto: 'hello', tgt: 'pt', falada: false, modelo: 'm', versaoDoPrompt: 'v' }
    await cache.guardarTraducao(consulta, { texto: 'olá', modelo: 'm' })
    cache.cacheDeTraducao.esvaziar()
    vi.setSystemTime(AGORA)
    expect(await cache.lerTraducao(consulta)).toMatchObject({ guardada: null, consultouNivel2: true })

    vi.setSystemTime(AGORA - 29 * DIA)
    await cache.guardarTraducao(consulta, { texto: 'olá', modelo: 'm' })
    cache.cacheDeTraducao.esvaziar()
    vi.setSystemTime(AGORA)
    expect(await cache.lerTraducao(consulta)).toMatchObject({ guardada: { texto: 'olá' }, nivel: 'l2' })
  })

  it('a poda apaga o vencido e, acima do teto, o menos usado recentemente', async () => {
    const linha = (chave: string, criado: number, usado: number) => ({
      chave,
      origem: 'en',
      destino: 'pt',
      modelo: 'm',
      versaoPrompt: 'v',
      traducao: chave,
      criadoEm: criado,
      usadoEm: usado,
    })
    await repo.gravar(linha('velha', AGORA - 40 * DIA, AGORA - DIA))
    await repo.gravar(linha('a', AGORA - DIA, AGORA - 3_000))
    await repo.gravar(linha('b', AGORA - DIA, AGORA - 1_000))
    await repo.gravar(linha('c', AGORA - DIA, AGORA - 2_000))
    const r = await cache.podarCacheDeTraducao({ agora: AGORA, maxLinhas: 2 })
    expect(r).toEqual({ vencidas: 1, excedentes: 1 })
    expect((await linhas()).map((l) => l.chave).sort()).toEqual(['b', 'c'])
  })
})
