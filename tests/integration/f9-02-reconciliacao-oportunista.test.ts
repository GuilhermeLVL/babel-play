/**
 * F9-02 — `reconciliarArmazenamento` existia, estava testada e NÃO tinha chamador.
 *
 * O chamador escolhido é oportunista, no `GET /api/me/entitlements`: é a rota por onde todo usuário
 * ativo passa e que já lê o contador para mostrar o uso. O custo é limitado pela janela de frescor
 * (`STORAGE_RECONCILE_HOURS`, 24h por padrão): contador recente não dispara varredura.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let router: any
let sessions: any
let quota: any
let audioDir: string

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-recon-'))
  process.env.AUDIO_DIR = audioDir
  h = await setupEphemeralDb()
  ;({ meRouter: router } = await h.load('../../server/routes/me'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  quota = await h.load('../../server/lib/storageQuota')
})
afterAll(async () => { delete process.env.AUDIO_DIR; await h.cleanup() })
afterEach(() => {
  delete process.env.AUTH_REQUIRED
  delete process.env.STORAGE_RECONCILE_HOURS
  delete process.env.FREE_STORAGE_MB
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  r.setHeader = () => r
  return r
}
async function entitlements(u: string) {
  const layer = router.stack.find((l: any) => l.route?.path === '/entitlements' && l.route?.methods?.get)
  const res = fakeRes()
  await layer.route.stack[0].handle({ path: '/entitlements', userId: asUserId(u), body: {} } as any, res)
  return res
}

/** Uma sessão com N bytes de áudio REAIS no disco. */
async function sessaoComAudio(u: string, bytes: number) {
  const s = await sessions.create(asUserId(u), { title: 'recon', kind: 'audio' })
  const nome = `${s.id}.webm`
  writeFileSync(path.join(audioDir, nome), Buffer.alloc(bytes, 1))
  await sessions.setAudio(asUserId(u), s.id, nome, 'audio/webm')
  return nome
}

describe('GET /api/me/entitlements reconcilia o contador vencido (F9-02)', () => {
  it('contador divergente e VENCIDO é reescrito a partir do disco', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '5'
    const u = 'recon-vencido'
    await sessaoComAudio(u, 700)
    // Divergência artificial: 50.000 bytes contabilizados que não existem em disco.
    await quota.ajustarArmazenamento(asUserId(u), 50_000)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(50_000)

    process.env.STORAGE_RECONCILE_HOURS = '0.0000001' // qualquer contador já nasce vencido
    const res = await entitlements(u)

    expect(res.statusCode).toBe(200)
    expect(res.body.armazenamento.usados).toBe(700)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(700)
  })

  it('contador FRESCO não dispara varredura — a divergência sobrevive dentro da janela', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '5'
    const u = 'recon-fresco'
    await sessaoComAudio(u, 300)
    await quota.ajustarArmazenamento(asUserId(u), 40_000)

    process.env.STORAGE_RECONCILE_HOURS = '24'
    const res = await entitlements(u)

    expect(res.body.armazenamento.usados).toBe(40_000)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(40_000)
  })

  it('`STORAGE_RECONCILE_HOURS=0` desliga a reconciliação sem quebrar a rota', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '5'
    const u = 'recon-desligado'
    await sessaoComAudio(u, 200)
    await quota.ajustarArmazenamento(asUserId(u), 9_999)

    process.env.STORAGE_RECONCILE_HOURS = '0'
    const res = await entitlements(u)

    expect(res.statusCode).toBe(200)
    expect(res.body.armazenamento.usados).toBe(9_999)
  })

  it('usuário sem contador nenhum: a rota responde e o número sai do disco', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '5'
    const u = 'recon-virgem'
    await sessaoComAudio(u, 128)

    const res = await entitlements(u)

    expect(res.statusCode).toBe(200)
    expect(res.body.armazenamento.usados).toBe(128)
    expect(res.body.armazenamento.teto).toBe(Math.floor(5 * 1024 * 1024))
  })

  it('selfhost (teto nulo) não reconcilia — não há contador para corrigir', async () => {
    delete process.env.AUTH_REQUIRED
    process.env.STORAGE_RECONCILE_HOURS = '0.0000001'
    const u = 'recon-selfhost'
    await sessaoComAudio(u, 500)

    const res = await entitlements(u)

    expect(res.statusCode).toBe(200)
    expect(res.body.armazenamento.teto).toBeNull()
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)
  })
})
