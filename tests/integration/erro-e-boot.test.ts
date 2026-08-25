/**
 * Diagnóstico de erros e estado de boot (P1-6, P2-5).
 *
 *  P1-6 — os handlers respondiam `String(err).slice(0, 200)` e NÃO logavam. A mensagem do
 *         drizzle começa com `Failed query: insert into "sessions" (...` e o nome das colunas
 *         consome os 200 chars, então a causa real (`SQLITE_BUSY: database is locked`) ficava
 *         fora. Foi preciso sair do HTTP e instrumentar o driver para diagnosticar o P0-2.
 *  P2-5 — migração e backfill do boot falhavam com console.warn e o servidor subia assim
 *         mesmo, sem nenhum sinal externo de que os dados estavam incompletos.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let erroDeRota: any
let boot: any
let health: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ erroDeRota } = await h.load('../../server/lib/erroDeRota'))
  boot = await h.load('../../server/lib/bootStatus')
  ;({ healthHandler: health } = await h.load('../../server/routes/health'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => { boot.resetBootStatus(); vi.restoreAllMocks() })

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

describe('erroDeRota — P1-6', () => {
  it('devolve mensagem truncada para o cliente', () => {
    const msg = erroDeRota(new Error('x'.repeat(500)), { event: 'teste' })
    expect(msg.length).toBeLessThanOrEqual(200)
  })

  it('LOGA a mensagem inteira, mesmo quando a resposta é truncada', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Imita o formato do drizzle: o prefixo come os 200 chars e a causa fica no fim.
    const causa = 'SQLITE_BUSY: database is locked'
    erroDeRota(new Error(`Failed query: insert into "sessions" (${'"col", '.repeat(40)}) — ${causa}`), { event: 'teste' })

    const logado = spy.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logado).toContain(causa)
  })

  it('a mensagem truncada NÃO contém a causa (é por isso que o log importa)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const causa = 'SQLITE_BUSY: database is locked'
    const msg = erroDeRota(new Error(`Failed query: insert into "sessions" (${'"col", '.repeat(40)}) — ${causa}`), { event: 'teste' })
    expect(msg).not.toContain(causa)
  })
})

describe('bootStatus + /api/health — P2-5', () => {
  it('boot limpo: health responde ok', async () => {
    const res = fakeRes()
    await health({} as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.boot).toBe('ok')
  })

  it('falha de migração no boot aparece no health como degraded', async () => {
    boot.registrarFalhaDeBoot('migracao-fsrs', new Error('tabela ausente'))

    const res = fakeRes()
    await health({} as any, res)

    expect(res.statusCode).toBe(503)
    expect(res.body.boot).toBe('degraded')
    expect(JSON.stringify(res.body.bootErros)).toContain('migracao-fsrs')
  })

  it('acumula mais de uma falha', async () => {
    boot.registrarFalhaDeBoot('migracao-fsrs', new Error('a'))
    boot.registrarFalhaDeBoot('backfill-tenancy', new Error('b'))
    expect(boot.bootStatus().erros).toHaveLength(2)
  })

  it('não vaza o texto do erro na resposta (só o passo que falhou)', async () => {
    boot.registrarFalhaDeBoot('backfill-tenancy', new Error('SEGREDO no caminho /var/x'))
    const res = fakeRes()
    await health({} as any, res)
    expect(JSON.stringify(res.body)).not.toContain('SEGREDO')
  })
})
