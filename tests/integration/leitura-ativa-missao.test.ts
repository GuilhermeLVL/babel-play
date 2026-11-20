/**
 * A LEITURA ATIVA NAS RODADAS E NA MISSÃO DO DIA (spec `leitura-ativa-perguntas-e-pratica`; tarefas 10.1 e 10.3).
 *
 * 1. O resultado das perguntas entra pelo caminho das rodadas (`addRodada`, o mesmo de `POST /api/exercises/rodada`)
 *    com `exerciseKind: 'leituraAtiva'`: só o acerto de 1ª/2ª/nenhum (ou sem resposta) e a pergunta, nada do texto.
 * 2. Com a flag `leitura_ativa` ligada e "Leia 1 texto" sorteada, `GET /api/metrics/missoes` conta a rodada; a rota
 *    de crédito da meta usa a mesma régua. Desligada, a missão não aparece e as outras ficam como antes.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { rodadaDaLeitura } from '../../src/core/leitura/rodadaDaLeitura'
import { missoesDoDia } from '../../src/core/missoes'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let exerciseResultsRepo: any
let flags: any
let db: any
let tabela: any
let drizzle: any

const FUSO = 'America/Sao_Paulo'

function handler(caminho: string, metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), r)
  return r
}
async function missoes(u: string) {
  const r = mockRes()
  await handler('/missoes', 'get')(
    {
      userId: asUserId(u),
      body: {},
      query: { fuso: FUSO },
      requestId: 'r',
      path: '/x',
      headers: {},
      header: () => undefined,
    },
    r,
  )
  expect(r.statusCode).toBe(200)
  return r.body
}

/** Um dia (12:00 em São Paulo) em que o sorteio com a leitura traz "Leia 1 texto". */
function diaComLeitura(): Date {
  for (let i = 0; i < 400; i++) {
    const meioDia = Date.UTC(2026, 10, 1, 15, 0) + i * 86_400_000
    const dia = new Date(meioDia - 3 * 3_600_000).toISOString().slice(0, 10)
    if (missoesDoDia(dia, { jogosJogados: [], incluirLeitura: true }).some((m) => m.tipo === 'leitura'))
      return new Date(meioDia)
  }
  throw new Error('nenhum dia com leitura')
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  flags = await h.load<any>('../../server/lib/flags')
  ;({ db } = (await h.load('../../server/db/db')) as any)
  ;({ exerciseResults: tabela } = (await h.load('../../server/db/schema')) as any)
  drizzle = await import('drizzle-orm')
})
afterAll(async () => {
  await flags.definirFlag('leitura_ativa', { habilitada: false }, 'teste')
  await h.cleanup()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('a rodada da leitura', () => {
  it('2 certas de primeira e 1 pulada: 3 linhas com o mesmo roundId, sem texto da pessoa', async () => {
    const u = asUserId('leitura-rodada')
    const rodada = rodadaDaLeitura({
      textoId: 'a1-no-mercado',
      resultados: ['primeira', 'primeira', 'pulada'],
      roundId: 'leitura-a1-1',
      duracaoMs: 60_000,
    })
    await exerciseResultsRepo.addRodada(u, rodada)
    const linhas = await db.select().from(tabela).where(drizzle.eq(tabela.userId, u))
    expect(linhas).toHaveLength(3)
    expect(new Set(linhas.map((l: any) => l.roundId))).toEqual(new Set(['leitura-a1-1']))
    expect(linhas.map((l: any) => l.exerciseKind)).toEqual(['leituraAtiva', 'leituraAtiva', 'leituraAtiva'])
    expect(linhas.map((l: any) => l.correct).sort()).toEqual([1, 1, null].sort())
    /* Só a referência da pergunta: nenhuma opção escolhida nem texto escrito. */
    for (const l of linhas) expect(l.itemRef).toMatch(/^a1-no-mercado#[123]$/)
  })
})

describe('a missão "Leia 1 texto"', () => {
  it('flag ligada e missão sorteada: a rodada de leitura do dia fecha a missão', async () => {
    await flags.definirFlag('leitura_ativa', { habilitada: true }, 'teste')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(diaComLeitura())
    const u = 'leitura-missao'
    expect((await missoes(u)).missoes.find((m: any) => m.tipo === 'leitura')).toMatchObject({ alvo: 1, atual: 0 })
    await exerciseResultsRepo.addRodada(
      asUserId(u),
      rodadaDaLeitura({ textoId: 'a1-no-mercado', resultados: ['segunda'], roundId: 'l-m-1', duracaoMs: 30_000 }),
    )
    expect((await missoes(u)).missoes.find((m: any) => m.tipo === 'leitura')).toMatchObject({ alvo: 1, atual: 1 })
  })

  it('flag desligada: nenhuma missão de leitura, e o sorteio é o de sempre', async () => {
    await flags.definirFlag('leitura_ativa', { habilitada: false }, 'teste')
    vi.useFakeTimers({ toFake: ['Date'] })
    const quando = diaComLeitura()
    vi.setSystemTime(quando)
    const m = await missoes('leitura-sem-flag')
    expect(m.missoes.some((x: any) => x.tipo === 'leitura')).toBe(false)
    expect(m.missoes.map((x: any) => x.tipo)).toEqual(missoesDoDia(m.dia, { jogosJogados: [] }).map((x) => x.tipo))
  })
})
