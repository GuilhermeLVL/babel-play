/**
 * TETO GLOBAL DE ARMAZENAMENTO NO R2 (`openspec/changes/r2-teto-de-uso`, requisito "Teto global de
 * armazenamento no R2"). Cada `it` espelha um cenário da spec, mais o `0` e o `ilimitado`.
 *
 * O total da conta é a soma dos contadores `storage_bytes`/`total` de todo mundo. Para pôr a conta num
 * total conhecido sem gravar gigabytes, um usuário de ENCHIMENTO recebe a diferença entre o alvo e o
 * que já existe — assim o arquivo roda igual no PGlite (banco vazio) e, com `TESTE_POSTGRES_URL`, num
 * Postgres de verdade que pode ter sobras de outras execuções. É lá que os dois uploads simultâneos
 * correm de fato (pool de várias conexões) e que a trava global é provada.
 *
 * Com S3 configurado o adaptador fala com a rede: o `fetch` é trocado por um falso ANTES de carregar as
 * rotas (o adaptador captura o `fetch` ao ser criado), e cada chamada fica registrada.
 */
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const MB = 1024 * 1024
const PREFIXO = `r2teto-${randomUUID().slice(0, 8)}`
const ENCHIMENTO = `${PREFIXO}-enchimento`

const S3 = {
  S3_ENDPOINT: 'http://r2-falso.invalid',
  S3_BUCKET: 'midia-teste',
  S3_ACCESS_KEY_ID: 'chave-de-teste',
  S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
}
const ENVS = ['AUTH_REQUIRED', 'FREE_STORAGE_MB', 'R2_TETO_MB', 'AUDIO_DIR', ...Object.keys(S3)] as const
const salvos = Object.fromEntries(ENVS.map((n) => [n, process.env[n]]))

const chamadas: Array<{ metodo: string; url: string }> = []
const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
  const metodo = init?.method ?? 'GET'
  chamadas.push({ metodo, url })
  if (metodo === 'HEAD') return new Response(null, { status: 404 })
  return new Response(null, { status: 200 })
})

let h: EphemeralDb
let quota: any
let router: any
let sessions: any
let dbMod: any
let schema: any
let drizzle: any

function ligarS3() {
  Object.assign(process.env, S3)
}
function desligarS3() {
  for (const n of Object.keys(S3)) delete process.env[n]
}

beforeAll(async () => {
  process.env.AUDIO_DIR = mkdtempSync(path.join(tmpdir(), 'babel-r2-teto-'))
  ligarS3()
  vi.stubGlobal('fetch', fetchFalso)
  h = await abrirBancoDeTeste()
  quota = await h.load('../../server/lib/storageQuota')
  ;({ sessionsRouter: router } = await h.load('../../server/routes/sessions'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  dbMod = await h.load('../../server/db/db')
  schema = await h.load('../../server/db/schema')
  drizzle = await import('drizzle-orm')
}, 60_000)

afterEach(() => {
  ligarS3()
  delete process.env.R2_TETO_MB
  chamadas.length = 0
})

afterAll(async () => {
  const { like } = drizzle
  await dbMod.db.delete(schema.usageCounters).where(like(schema.usageCounters.userId, `${PREFIXO}%`))
  vi.unstubAllGlobals()
  for (const [k, v] of Object.entries(salvos)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await h.cleanup()
})

/** Soma da conta inteira (o mesmo que o servidor confere). */
async function totalDaConta(): Promise<number> {
  const { sql } = drizzle
  const r = await dbMod.db.execute(
    sql`select coalesce(sum(count), 0)::bigint as total from usage_counters where metric = 'storage_bytes' and "window" = 'total'`,
  )
  return Number(dbMod.linhas(r)[0].total)
}

/** Põe a conta em `alvo` bytes guardados, pelo usuário de enchimento. */
async function contaCom(alvo: number): Promise<void> {
  const { and, eq } = drizzle
  const t = schema.usageCounters
  const onde = and(eq(t.userId, ENCHIMENTO), eq(t.metric, 'storage_bytes'), eq(t.window, 'total'))
  await dbMod.db.delete(t).where(onde)
  const resto = alvo - (await totalDaConta())
  expect(resto, 'o banco já passa do alvo').toBeGreaterThanOrEqual(0)
  const agora = Date.now()
  await dbMod.db.insert(t).values({
    id: randomUUID(),
    userId: ENCHIMENTO,
    createdAt: agora,
    updatedAt: agora,
    metric: 'storage_bytes',
    window: 'total',
    count: resto,
  })
}

/** Usuário pagante sem teto próprio que atrapalhe (o que se mede aqui é o teto da CONTA). */
function usuario(): string {
  process.env.AUTH_REQUIRED = '1'
  process.env.FREE_STORAGE_MB = '100000'
  return `${PREFIXO}-${randomUUID().slice(0, 8)}`
}

function handlerDe(rota: string, metodo: 'post') {
  const layer = router.stack.find((l: any) => l.route?.path === rota && l.route?.methods?.[metodo])
  const pilha = layer.route.stack
  return pilha[pilha.length - 1].handle
}
function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}
function corpoDeAudio(bytes: number): Buffer {
  const b = Buffer.alloc(bytes, 7)
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b) // WebM (EBML): o upload confere os magic bytes
  return b
}

describe('teto global de armazenamento no R2', () => {
  it('upload abaixo do teto: aceito, e o contador do usuário sobe 10 MB', async () => {
    const u = usuario()
    await contaCom(1024 * MB) // 1 GB guardado; teto padrão 9 216 MB
    const r = await quota.reservarArmazenamento(asUserId(u), 10 * MB)
    expect(r.ok).toBe(true)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(10 * MB)
  })

  it('upload que cruzaria o teto: motivo = conta, nada reservado; a rota responde 507 neutro e não grava', async () => {
    const u = usuario()
    await contaCom(9210 * MB)
    const r = await quota.reservarArmazenamento(asUserId(u), 10 * MB)
    expect(r).toMatchObject({ ok: false, motivo: 'conta' })
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)

    const recusa = quota.corpoDeRecusa(r)
    expect(recusa.status).toBe(507)
    expect(recusa.body.error).toMatch(/limite de armazenamento/)
    expect(JSON.stringify(recusa.body)).not.toMatch(/9210|9216|MB|capBytes|usedBytes/)

    // A rota: upload real de 10 MB com a conta a 6 MB do teto.
    const id = (await sessions.create(asUserId(u), { title: 'r2', kind: 'audio' })).id as string
    const res = fakeRes()
    await handlerDe('/:id/audio', 'post')(
      {
        userId: asUserId(u),
        params: { id },
        body: corpoDeAudio(10 * MB),
        headers: { 'content-type': 'audio/webm' },
        path: `/${id}/audio`,
      },
      res,
    )
    expect(res.statusCode).toBe(507)
    expect(res.body.code).toBe('r2_teto_armazenamento')
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([])
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)
  })

  it('dois uploads simultâneos no limite: exatamente um é aceito, o outro recebe 507', async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      const a = usuario()
      const b = usuario()
      await contaCom(9206 * MB) // restam 10 MB até 9 216
      const rs = await Promise.all([
        quota.reservarArmazenamento(asUserId(a), 8 * MB),
        quota.reservarArmazenamento(asUserId(b), 8 * MB),
      ])
      expect(rs.filter((r: any) => r.ok)).toHaveLength(1)
      const recusado = rs.find((r: any) => !r.ok)
      expect(recusado.motivo).toBe('conta')
      expect(quota.corpoDeRecusa(recusado).status).toBe(507)
      expect(await totalDaConta()).toBe(9214 * MB)
    }
  }, 60_000)

  it('R2_TETO_MB=0 recusa todo upload novo', async () => {
    process.env.R2_TETO_MB = '0'
    const u = usuario()
    const r = await quota.reservarArmazenamento(asUserId(u), 1)
    expect(r).toMatchObject({ ok: false, motivo: 'conta' })
  })

  it('R2_TETO_MB=ilimitado nunca recusa pela conta', async () => {
    process.env.R2_TETO_MB = 'ilimitado'
    const u = usuario()
    await contaCom(20_000 * MB)
    const r = await quota.reservarArmazenamento(asUserId(u), 10 * MB)
    expect(r.ok).toBe(true)
  })

  it('armazenamento em disco (sem S3): o teto global não é consultado e a cota por usuário vale como hoje', async () => {
    desligarS3()
    process.env.R2_TETO_MB = '0' // fecharia tudo, se fosse consultado
    const u = usuario()
    await contaCom(9210 * MB)
    const r = await quota.reservarArmazenamento(asUserId(u), 10 * MB)
    expect(r.ok).toBe(true)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(10 * MB)

    process.env.FREE_STORAGE_MB = '15' // e a cota do usuário continua recusando por ele
    const r2 = await quota.reservarArmazenamento(asUserId(u), 10 * MB)
    expect(r2).toMatchObject({ ok: false, motivo: 'usuario' })
    expect(quota.corpoDeRecusa(r2).body.code).toBe('storage_quota_exceeded')
  })
})
