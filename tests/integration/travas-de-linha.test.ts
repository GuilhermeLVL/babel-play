/**
 * TRAVAS DE LINHA (Fase 2, tarefa 3): `travarUsuario` e `travarGlobal` deixam o `pg_advisory_xact_lock` e
 * passam a travar uma LINHA da tabela `travas` (`u:<userId>` / `g:<nome>`) até o fim da transação.
 *
 * Por quê: o Hyperdrive da Cloudflare (pool por transação) não suporta advisory locks — a conexão do
 * servidor troca de dono entre transações e a trava consultiva fica presa ou some. Trava de linha vive e
 * morre com a transação, que é o que o pool por transação preserva.
 *
 * As provas de ordem (o segundo só entra depois do COMMIT do primeiro) só valem num Postgres de verdade
 * (`TESTE_POSTGRES_URL`): o PGlite tem uma conexão só e serializa de qualquer jeito. A forma (linha na
 * tabela, sem depender de `users`), a ausência de advisory lock no código e a poda da limpeza diária
 * rodam nos dois.
 */
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL
const SEGURA_MS = 250

let h: EphemeralDb
let m: typeof import('../../server/db/db')
let sql: typeof import('drizzle-orm').sql
let limparBanco: typeof import('../../server/lib/limpezaDiaria').limparBanco

beforeAll(async () => {
  h = await abrirBancoDeTeste({ env: { DB_LOCK_TIMEOUT_MS: '1500' } })
  m = await h.load('../../server/db/db')
  ;({ sql } = await h.load('drizzle-orm'))
  ;({ limparBanco } = await h.load('../../server/lib/limpezaDiaria'))
}, 60_000)

afterAll(async () => {
  delete process.env.DB_LOCK_TIMEOUT_MS
  await h?.cleanup()
})

const codigoDe = (e: unknown): unknown =>
  (e as { code?: unknown })?.code ?? (e as { cause?: { code?: unknown } })?.cause?.code

async function chaves(prefixo: string): Promise<string[]> {
  const r = await m.db.execute(sql`SELECT chave FROM travas WHERE chave LIKE ${prefixo + '%'} ORDER BY chave`)
  return m.linhas<{ chave: string }>(r).map((l) => l.chave)
}

/**
 * Duas transações na MESMA trava: a primeira trava, segura `SEGURA_MS` e anota o instante logo antes do
 * COMMIT; a segunda começa só depois de a primeira travar e anota o instante em que a trava dela voltou.
 */
async function ordem(travar: (tx: Parameters<Parameters<typeof m.emTransacao>[0]>[0]) => Promise<void>) {
  let travou!: () => void
  const travada = new Promise<void>((r) => (travou = r))
  let fimDaPrimeira = 0
  const primeira = m.emTransacao(async (tx) => {
    await travar(tx)
    travou()
    await new Promise((r) => setTimeout(r, SEGURA_MS))
    fimDaPrimeira = Date.now()
  })
  await travada
  let entradaDaSegunda = 0
  const segunda = m.emTransacao(async (tx) => {
    await travar(tx)
    entradaDaSegunda = Date.now()
  })
  await Promise.all([primeira, segunda])
  return { fimDaPrimeira, entradaDaSegunda }
}

describe('travas de linha', () => {
  it('nenhum advisory lock sobrou em server/', () => {
    const achados: string[] = []
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome)
        if (statSync(p).isDirectory()) varrer(p)
        else if (/pg_advisory/.test(readFileSync(p, 'utf8'))) achados.push(p)
      }
    }
    varrer(join(__dirname, '../../server'))
    expect(achados).toEqual([])
  })

  it('usuário que não existe em users também trava: a linha u:<id> nasce na tabela travas', async () => {
    const userId = `fantasma-${randomUUID()}`
    await m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, userId)
    })
    expect(await chaves(`u:${userId}`)).toEqual([`u:${userId}`])
    const r = await m.db.execute(sql`SELECT count(*)::int AS n FROM users WHERE id = ${userId}`)
    expect(m.linhas<{ n: number }>(r)[0].n).toBe(0)
    // De novo, com a linha já existente: não duplica nem falha.
    await m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, userId)
    })
    expect(await chaves(`u:${userId}`)).toEqual([`u:${userId}`])
  })

  it('a trava global vira a linha g:<nome>, separada da de usuário de mesmo nome', async () => {
    const nome = `teto-${randomUUID()}`
    await m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, nome)
      await m.travarGlobal(tx, nome)
    })
    expect(await chaves(`g:${nome}`)).toEqual([`g:${nome}`])
    expect(await chaves(`u:${nome}`)).toEqual([`u:${nome}`])
  })

  it.skipIf(!URL_PG)('travarUsuario: a segunda transação só entra depois do COMMIT da primeira', async () => {
    const userId = `ordem-${randomUUID()}`
    // 1ª rodada: a linha ainda não existe (as duas disputam a inserção).
    const a = await ordem((tx) => m.travarUsuario(tx, userId))
    expect(a.entradaDaSegunda).toBeGreaterThanOrEqual(a.fimDaPrimeira)
    // 2ª rodada: a linha já existe (as duas disputam a trava da linha).
    const b = await ordem((tx) => m.travarUsuario(tx, userId))
    expect(b.entradaDaSegunda).toBeGreaterThanOrEqual(b.fimDaPrimeira)
  })

  it.skipIf(!URL_PG)('travarGlobal: a segunda transação só entra depois do COMMIT da primeira', async () => {
    const nome = `global-${randomUUID()}`
    const a = await ordem((tx) => m.travarGlobal(tx, nome))
    expect(a.entradaDaSegunda).toBeGreaterThanOrEqual(a.fimDaPrimeira)
    const b = await ordem((tx) => m.travarGlobal(tx, nome))
    expect(b.entradaDaSegunda).toBeGreaterThanOrEqual(b.fimDaPrimeira)
  })

  it.skipIf(!URL_PG)('usuários diferentes não esperam um pelo outro', async () => {
    const [u1, u2] = [`livre-${randomUUID()}`, `livre-${randomUUID()}`]
    let soltar!: () => void
    const segurando = new Promise<void>((r) => (soltar = r))
    let travou!: () => void
    const travada = new Promise<void>((r) => (travou = r))
    const primeira = m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, u1)
      travou()
      await segurando
    })
    await travada
    const t0 = Date.now()
    await m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, u2)
    })
    const ms = Date.now() - t0
    soltar()
    await primeira
    expect(ms).toBeLessThan(SEGURA_MS)
  })

  it.skipIf(!URL_PG)('linha já existente e travada por outra: desiste com 55P03 (lock_timeout)', async () => {
    const userId = `timeout-${randomUUID()}`
    await m.emTransacao((tx) => m.travarUsuario(tx, userId)) // a linha passa a existir
    let soltar!: () => void
    const segurando = new Promise<void>((r) => (soltar = r))
    let travou!: () => void
    const travada = new Promise<void>((r) => (travou = r))
    const primeira = m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, userId)
      travou()
      await segurando
    })
    await travada
    let erro: unknown
    try {
      await m.emTransacao((tx) => m.travarUsuario(tx, userId))
    } catch (e) {
      erro = e
    }
    soltar()
    await primeira
    expect(codigoDe(erro)).toBe('55P03')
  })

  it('a limpeza diária poda u:<id> de quem não existe mais e mantém o resto', async () => {
    const vivo = `vivo-${randomUUID()}`
    const morto = `morto-${randomUUID()}`
    const global = `g-${randomUUID()}`
    const agora = Date.now()
    await m.db.execute(sql`INSERT INTO users (id, created_at, updated_at) VALUES (${vivo}, ${agora}, ${agora})`)
    await m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, vivo)
      await m.travarUsuario(tx, morto)
      await m.travarGlobal(tx, global)
    })
    const r = await limparBanco({ agora, dias: 30 })
    expect(r.travasPodadas).toBeGreaterThanOrEqual(1)
    expect(await chaves(`u:${vivo}`)).toEqual([`u:${vivo}`])
    expect(await chaves(`u:${morto}`)).toEqual([])
    expect(await chaves(`g:${global}`)).toEqual([`g:${global}`])
  })

  it.skipIf(!URL_PG)('a poda pula a linha que alguém está segurando, sem esperar por ela', async () => {
    const preso = `preso-${randomUUID()}`
    await m.emTransacao((tx) => m.travarUsuario(tx, preso))
    let soltar!: () => void
    const segurando = new Promise<void>((r) => (soltar = r))
    let travou!: () => void
    const travada = new Promise<void>((r) => (travou = r))
    const primeira = m.emTransacao(async (tx) => {
      await m.travarUsuario(tx, preso)
      travou()
      await segurando
    })
    await travada
    try {
      await limparBanco({ agora: Date.now(), dias: 30 }) // não espera a trava (nem cai em 55P03)
    } finally {
      soltar()
      await primeira
    }
    expect(await chaves(`u:${preso}`)).toEqual([`u:${preso}`])
  })
})
