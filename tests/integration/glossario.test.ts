/**
 * D3 (Fase D, 30/09/2026) — O GLOSSÁRIO PESSOAL: o repositório, a tradução que o usa e a LGPD.
 *
 * O que se prova aqui (a defesa contra injeção de prompt está em `seguranca/glossario-injecao`):
 *   - o mesmo termo (normalizado) no mesmo par é a MESMA entrada — a tradução troca, o teto não conta
 *     de novo; o teto de 500 fecha termo novo e deixa trocar os que existem;
 *   - cada pessoa vê e apaga só o dela;
 *   - uma tradução COM glossário nunca vai ao cache — nem ao L2 (SQLite, 30 dias), nem ao L1 (memória):
 *     os dois são compartilhados entre pessoas, e a escolha de uma serviria a frase de outra;
 *   - sem termo do glossário no texto, o cache funciona como sempre;
 *   - o glossário entra na exportação e sai com a exclusão da conta (LGPD art. 18).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdmissao } from '../../server/ai/admissao'
import { esquecerDisjuntores } from '../../server/ai/disjuntor'
import { esquecerGlossarioEmMemoria, MAX_ENTRADAS_DO_GLOSSARIO, normalizarTermo } from '../../server/ai/glossario'
import { esquecerRegistro } from '../../server/ai/registroDeProvedores'
import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { PLANO_PAGO } from '../harness/planoPago'

const ENVS = ['IA_PROVEDORES', 'GROQ_API_KEY', 'LLM_API_KEY', 'OPENROUTER_API_KEY', 'NUANCE_AO_VIVO'] as const
const ANA = asUserId('glossario-ana')
const BIA = asUserId('glossario-bia')

let h: EphemeralDb
let repo: any
let conta: any
let mtTranslateProxy: (req: any, res: any) => Promise<void>
let cache: any
let client: { execute: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }> }

const entrada = (termo: string, traducao: string, origem = 'en', destino = 'pt') => ({
  origem,
  destino,
  termo,
  termoNorm: normalizarTermo(termo),
  traducao,
})

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), (r.headersSent = true), r)
  r.setHeader = () => r
  return r
}
function provedorFalso(): { n: number } {
  const contagem = { n: 0 }
  vi.stubGlobal('fetch', async () => {
    contagem.n += 1
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: `tradução ${contagem.n}` } }],
        usage: { prompt_tokens: 20, completion_tokens: 4 },
      }),
    }
  })
  return contagem
}
const linhasNoL2 = async () => Number((await client.execute('SELECT COUNT(*) AS n FROM cache_de_traducao')).rows[0].n)

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ glossarioRepo: repo } = await h.load<any>('../../server/db/repositories/glossario'))
  ;({ contaRepo: conta } = await h.load<any>('../../server/db/repositories/conta'))
  ;({ mtTranslateProxy } = await h.load<any>('../../server/ai/mtProxy'))
  cache = await h.load<any>('../../server/ai/cacheDeTraducao')
  ;({ client } = await h.load<any>('../../server/db/db'))
  const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
  await subscriptionsRepo.upsert(ANA, { plan: PLANO_PAGO, status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  for (const e of ENVS) process.env[e] = ''
  await h.cleanup()
})
beforeEach(async () => {
  for (const e of ENVS) process.env[e] = ''
  process.env.GROQ_API_KEY = 'chave-groq-falsa'
  esquecerGlossarioEmMemoria()
  await cache.esvaziarCacheDeTraducao()
})
afterEach(() => {
  vi.unstubAllGlobals()
  esquecerDisjuntores()
  esquecerAdmissao()
  esquecerRegistro()
})

describe('o repositório', () => {
  it('o mesmo termo normalizado no mesmo par é a mesma entrada: a tradução troca', async () => {
    const a = await repo.gravar(BIA, entrada('Deadline', 'prazo'), 500)
    const b = await repo.gravar(BIA, entrada('  deadline ', 'prazo final'), 500)
    expect(a).toMatchObject({ ok: true, nova: true })
    expect(b).toMatchObject({ ok: true, nova: false })
    expect(b.entrada.id).toBe(a.entrada.id)
    const lista = await repo.listar(BIA, 500)
    expect(lista).toHaveLength(1)
    expect(lista[0].traducao).toBe('prazo final')
    // Outro par é outra entrada.
    await repo.gravar(BIA, entrada('deadline', 'plazo', 'en', 'es'), 500)
    expect(await repo.contar(BIA)).toBe(2)
  })

  it('cada pessoa vê e apaga só o dela', async () => {
    const { entrada: daBia } = await repo.gravar(BIA, entrada('meeting', 'reunião'), 500)
    expect((await repo.listar(ANA, 500)).some((e: any) => e.id === daBia.id)).toBe(false)
    expect(await repo.apagar(ANA, daBia.id)).toBe(false)
    expect(await repo.apagar(BIA, daBia.id)).toBe(true)
    expect(await repo.apagar(BIA, daBia.id)).toBe(false)
  })

  it(`o teto de ${MAX_ENTRADAS_DO_GLOSSARIO}: fecha termo novo e deixa trocar o que existe`, async () => {
    const CARLA = asUserId('glossario-carla')
    for (let i = 0; i < MAX_ENTRADAS_DO_GLOSSARIO; i++) {
      expect((await repo.gravar(CARLA, entrada(`term${i}`, `termo${i}`), MAX_ENTRADAS_DO_GLOSSARIO)).ok).toBe(true)
    }
    expect(await repo.gravar(CARLA, entrada('one more', 'mais um'), MAX_ENTRADAS_DO_GLOSSARIO)).toEqual({
      ok: false,
      motivo: 'cheio',
    })
    expect((await repo.gravar(CARLA, entrada('term7', 'outro'), MAX_ENTRADAS_DO_GLOSSARIO)).ok).toBe(true)
    expect(await repo.contar(CARLA)).toBe(MAX_ENTRADAS_DO_GLOSSARIO)
  }, 60_000)
})

describe('a tradução com glossário nunca vai ao cache compartilhado', () => {
  it('termo do glossário na frase: o provedor é chamado toda vez, e nada entra no L1 nem no L2', async () => {
    await repo.gravar(ANA, entrada('deadline', 'data-limite'), 500)
    const chamadas = provedorFalso()
    const corpo = { text: 'the deadline', src: 'en', tgt: 'pt' }
    const a = mockRes()
    await mtTranslateProxy({ userId: ANA, body: corpo, requestId: 'r-c1' }, a)
    const b = mockRes()
    await mtTranslateProxy({ userId: ANA, body: corpo, requestId: 'r-c2' }, b)
    expect(a.statusCode).toBe(200)
    expect(b.body?.cache).toBeUndefined()
    expect(chamadas.n).toBe(2)
    expect(await linhasNoL2()).toBe(0)
    expect(cache.cacheDeTraducao.tamanho()).toBe(0)
  })

  it('sem termo do glossário na frase: o cache de sempre (a segunda sai dele, e a curta vai ao L2)', async () => {
    const chamadas = provedorFalso()
    const corpo = { text: 'good morning', src: 'en', tgt: 'pt' }
    await mtTranslateProxy({ userId: ANA, body: corpo, requestId: 'r-c3' }, mockRes())
    const b = mockRes()
    await mtTranslateProxy({ userId: ANA, body: corpo, requestId: 'r-c4' }, b)
    expect(chamadas.n).toBe(1)
    expect(b.body?.cache).toBe(true)
    expect(await linhasNoL2()).toBe(1)
  })

  it('a frase que outra pessoa já pôs no cache não é servida a quem tem o termo no glossário', async () => {
    const chamadas = provedorFalso()
    const corpo = { text: 'see you at the meetup', src: 'en', tgt: 'pt' }
    await mtTranslateProxy({ userId: BIA, body: corpo, requestId: 'r-c5' }, mockRes()) // Bia é Grátis: 402
    const { subscriptionsRepo } = await h.load<any>('../../server/db/repositories/subscriptions')
    const DANI = asUserId('glossario-dani')
    await subscriptionsRepo.upsert(DANI, { plan: PLANO_PAGO, status: 'active' })
    await mtTranslateProxy({ userId: DANI, body: corpo, requestId: 'r-c6' }, mockRes()) // no cache agora
    await repo.gravar(ANA, entrada('meetup', 'encontro'), 500)
    const daAna = mockRes()
    await mtTranslateProxy({ userId: ANA, body: corpo, requestId: 'r-c7' }, daAna)
    expect(daAna.body?.cache).toBeUndefined()
    expect(chamadas.n).toBe(2)
  })
})

describe('LGPD: o glossário é dado do titular', () => {
  it('entra na exportação e sai com a exclusão da conta', async () => {
    const EVA = asUserId('glossario-eva')
    await repo.gravar(EVA, entrada('rollout', 'lançamento'), 500)
    const exportado = await conta.exportar(EVA)
    expect(exportado.dados.glossario).toHaveLength(1)
    expect(exportado.dados.glossario[0]).toMatchObject({ termo: 'rollout', traducao: 'lançamento' })
    const relatorio = await conta.excluir(EVA)
    expect(relatorio.linhasPorTabela.glossario).toBe(1)
    expect(await repo.contar(EVA)).toBe(0)
  })
})
