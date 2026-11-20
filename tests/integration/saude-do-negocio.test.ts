/**
 * A SAÚDE DO NEGÓCIO (`GET /api/ops/saude`): o vigia que avisa antes do usuário reclamar.
 *   - a rota: 501 sem o segredo, 401 com o errado, 200 com o certo;
 *   - cobrança pendente (evento `nao-aplicado`) deixa vermelho;
 *   - o fim de cada job é marcado ao terminar bem, e o cron parado fica vermelho depois do limite;
 *   - `avaliarJobs` (pura) nos limites: dentro, fora, nunca rodou com vigilância nova e antiga.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let ops: any
let saude: any
let executar: any
let registro: any
let repo: any
let db: any
let dorm: any

const TOKEN = 'token-do-vigia-de-teste'

function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headers: {} }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), r)
  r.setHeader = (k: string, v: string) => (r.headers[k] = v)
  return r
}
const req = (auth?: string) => ({ header: (k: string) => (k.toLowerCase() === 'authorization' ? auth : undefined) })
const HORA = 3_600_000

beforeAll(async () => {
  h = await setupEphemeralDb()
  ops = await h.load('../../server/routes/ops')
  saude = await h.load('../../server/lib/saudeDoNegocio')
  executar = await h.load('../../server/jobs/executar')
  registro = await h.load('../../server/jobs/registro')
  repo = (await h.load('../../server/db/repositories/billingEvents')).billingEventsRepo
  db = await h.load('../../server/db/db')
  dorm = await h.load('drizzle-orm')
})
afterAll(async () => {
  delete process.env.OPS_SAUDE_TOKEN
  await h.cleanup()
})

describe('a rota', () => {
  it('501 sem o segredo configurado', async () => {
    delete process.env.OPS_SAUDE_TOKEN
    const res = mockRes()
    await ops.saudeHandler(req(`Bearer ${TOKEN}`), res)
    expect(res.statusCode).toBe(501)
  })

  it('401 com token errado ou ausente; 200 com o certo', async () => {
    process.env.OPS_SAUDE_TOKEN = TOKEN
    for (const auth of [undefined, 'Bearer errado', `Basic ${TOKEN}`, `Bearer ${TOKEN}x`]) {
      const res = mockRes()
      await ops.saudeHandler(req(auth), res)
      expect(res.statusCode, String(auth)).toBe(401)
    }
    const ok = mockRes()
    await ops.saudeHandler(req(`Bearer ${TOKEN}`), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['Cache-Control']).toBe('no-store')
    expect(ok.body.checagens.map((c: any) => c.nome)).toEqual(
      expect.arrayContaining(['cobranca_pendente', 'orcamento_ia']),
    )
  })
})

describe('as checagens', () => {
  it('banco limpo: tudo verde', async () => {
    const s = await saude.coletarSaude({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    expect(s.checagens.find((c: any) => c.nome === 'cobranca_pendente').ok).toBe(true)
    expect(s.checagens.find((c: any) => c.nome === 'orcamento_ia').ok).toBe(true)
  })

  it('evento do Asaas não aplicado deixa a cobrança vermelha e o conjunto não-ok', async () => {
    await repo.marcarSeNovo('evt-saude-1', 'asaas', 'PAYMENT_RECEIVED', null, 'pay_1', { event: 'PAYMENT_RECEIVED' })
    await repo.registrarResultado('evt-saude-1', 'nao-aplicado', 'compra-nao-encontrada')
    const s = await saude.coletarSaude({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    const c = s.checagens.find((x: any) => x.nome === 'cobranca_pendente')
    expect(c.ok).toBe(false)
    expect(c.detalhe).toContain('1 evento')
    expect(s.ok).toBe(false)
    await repo.registrarResultado('evt-saude-1', 'aplicado', null)
  })

  it('no staging (Asaas em sandbox) os jobs não são cobrados: não há cron lá', async () => {
    const s = await saude.coletarSaude({ ASAAS_SANDBOX: '1' } as NodeJS.ProcessEnv)
    expect(s.checagens.find((c: any) => c.nome === 'jobs').ok).toBe(true)
  })
})

describe('o fim de cada job', () => {
  it('uma passada que termina bem grava a marca g:fim:<nome>', async () => {
    const jobs = [
      {
        nome: 'job-de-saude',
        cron: '1 1 * * *',
        node: { atrasoInicialMs: 0, intervaloMs: 24 * HORA },
        rodar: async () => ({ n: 1 }),
      },
    ]
    const r = await executar.executarJob('job-de-saude', { jobs })
    expect(r.estado).toBe('ok')
    const lidas = await db.db.execute(
      dorm.sql`SELECT criado_em FROM travas WHERE chave = ${executar.chaveDoFim('job-de-saude')}`,
    )
    expect(db.linhas(lidas)).toHaveLength(1)
  })

  it('uma passada que falha NÃO marca o fim', async () => {
    const jobs = [
      {
        nome: 'job-que-falha',
        cron: '1 1 * * *',
        node: { atrasoInicialMs: 0, intervaloMs: 24 * HORA },
        rodar: async () => {
          throw new Error('x')
        },
      },
    ]
    const r = await executar.executarJob('job-que-falha', { jobs })
    expect(r.estado).toBe('falhou')
    const lidas = await db.db.execute(
      dorm.sql`SELECT criado_em FROM travas WHERE chave = ${executar.chaveDoFim('job-que-falha')}`,
    )
    expect(db.linhas(lidas)).toHaveLength(0)
  })
})

describe('avaliarJobs (pura)', () => {
  const diario = {
    nome: 'diario',
    cron: 'x',
    node: { atrasoInicialMs: 0, intervaloMs: 24 * HORA },
    rodar: async () => ({}),
  }
  const desligado = { ...diario, nome: 'desligado', condicao: () => false }
  const agora = 1_000_000_000_000
  const limite = 24 * HORA * 1.5 + 2 * HORA

  it('dentro do limite é verde; passou do limite é vermelho', () => {
    const verde = saude.avaliarJobs([diario], {}, new Map([['diario', agora - 30 * HORA]]), agora - 100 * HORA, agora)
    expect(verde[0].ok).toBe(true)
    const vermelho = saude.avaliarJobs(
      [diario],
      {},
      new Map([['diario', agora - limite - 1]]),
      agora - 100 * HORA,
      agora,
    )
    expect(vermelho[0].ok).toBe(false)
    expect(vermelho[0].detalhe).toContain('terminou há')
  })

  it('sem marca: verde com a vigilância recente, vermelho depois do limite', () => {
    expect(saude.avaliarJobs([diario], {}, new Map(), agora - 5 * HORA, agora)[0].ok).toBe(true)
    const r = saude.avaliarJobs([diario], {}, new Map(), agora - limite - HORA, agora)[0]
    expect(r.ok).toBe(false)
    expect(r.detalhe).toContain('nunca terminou')
  })

  it('job desligado neste ambiente não entra', () => {
    expect(saude.avaliarJobs([desligado], {}, new Map(), null, agora)).toEqual([])
  })

  it('o registro real tem ao menos um job e todos têm intervalo positivo', () => {
    expect(registro.JOBS.length).toBeGreaterThan(0)
    for (const j of registro.JOBS) expect(saude.limiteDoJob(j)).toBeGreaterThan(0)
  })
})
