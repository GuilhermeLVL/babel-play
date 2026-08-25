/**
 * F4-03 — teto de ARMAZENAMENTO por usuário.
 *
 * O teto de 120 MB do upload é por REQUISIÇÃO: 86 uploads no teto enchem 10 GB, no mesmo volume
 * onde mora o banco. Estes testes provam o teto por USUÁRIO: recusa antes de escrever, devolução
 * ao apagar, e o teto valendo sob concorrência (a race do P0-1 aplicada a bytes).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let h: EphemeralDb
let router: any
let sessions: any
let quota: any
let audioDir: string

/** 0,001 MB = 1048 bytes: teto pequeno o bastante para caber num teste, grande para dois casos. */
const CAP = Math.floor(0.001 * 1024 * 1024)

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-cota-'))
  process.env.AUDIO_DIR = audioDir
  h = await setupEphemeralDb()
  ;({ sessionsRouter: router } = await h.load('../../server/routes/sessions'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  quota = await h.load('../../server/lib/storageQuota')
})
afterAll(async () => { delete process.env.AUDIO_DIR; await h.cleanup() })
afterEach(() => { delete process.env.AUTH_REQUIRED; delete process.env.FREE_STORAGE_MB; delete process.env.PRO_STORAGE_MB })

function handlerDe(rota: string, metodo: 'post' | 'delete') {
  const layer = router.stack.find((l: any) => l.route?.path === rota && l.route?.methods?.[metodo])
  const pilha = layer.route.stack
  return pilha[pilha.length - 1].handle // o último é o handler; os anteriores são middleware (raw)
}
const upload = (req: any, res: any) => handlerDe('/:id/audio', 'post')(req, res)
const remover = (req: any, res: any) => handlerDe('/:id', 'delete')(req, res)

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

async function novaSessao(u: string) {
  const s = await sessions.create(asUserId(u), { title: 'cota', kind: 'audio' })
  return s.id as string
}

/**
 * F4-04: o upload passou a validar o CONTEÚDO por magic bytes, então o corpo destes casos precisa
 * ser um WebM de verdade (EBML `1A 45 DF A3`) — antes era enchimento de 0x07, que hoje leva 400 e
 * nem chegaria à cota. O que os casos medem (bytes reservados) não muda.
 */
function corpoDeAudio(bytes: number): Buffer {
  const b = Buffer.alloc(bytes, 7)
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(b)
  return b
}

function reqUpload(u: string, id: string, bytes: number) {
  return { userId: asUserId(u), params: { id }, body: corpoDeAudio(bytes), headers: { 'content-type': 'audio/webm' }, path: `/${id}/audio` } as any
}

/** Só os arquivos desta sessão — o diretório é compartilhado pelos casos. */
const arquivosDe = (id: string) => readdirSync(audioDir).filter((f) => f.startsWith(id + '.'))

describe('cota de armazenamento por usuário (F4-03)', () => {
  it('dentro da cota: grava e contabiliza os bytes', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-dentro'
    const id = await novaSessao(u)
    const res = fakeRes()

    await upload(reqUpload(u, id, 500), res)

    expect(res.statusCode).toBe(200)
    expect(existsSync(path.join(audioDir, `${id}.webm`))).toBe(true)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(500)
  })

  it('acima da cota: 507 e o arquivo NÃO chega ao disco', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-acima'
    const id = await novaSessao(u)
    const res = fakeRes()

    await upload(reqUpload(u, id, CAP + 1), res)

    expect(res.statusCode).toBe(507)
    expect(res.body?.code).toBe('storage_quota_exceeded')
    expect(arquivosDe(id)).toEqual([])
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)
  })

  it('o segundo upload que não cabe é recusado, e o primeiro continua no disco', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-segundo'
    const a = await novaSessao(u)
    const b = await novaSessao(u)

    await upload(reqUpload(u, a, 800), fakeRes())
    const res = fakeRes()
    await upload(reqUpload(u, b, 800), res)

    expect(res.statusCode).toBe(507)
    expect(arquivosDe(b)).toEqual([])
    expect(existsSync(path.join(audioDir, `${a}.webm`))).toBe(true)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(800)
  })

  it('apagar a sessão devolve a cota — e o próximo upload cabe de novo', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-libera'
    const a = await novaSessao(u)
    await upload(reqUpload(u, a, 900), fakeRes())
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(900)

    const delRes = fakeRes()
    await remover({ userId: asUserId(u), params: { id: a } } as any, delRes)
    expect(delRes.statusCode).toBe(200)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)

    const b = await novaSessao(u)
    const res = fakeRes()
    await upload(reqUpload(u, b, 900), res)
    expect(res.statusCode).toBe(200)
  })

  it('dois uploads concorrentes no limite: só UM passa', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-corrida'
    const a = await novaSessao(u)
    const b = await novaSessao(u)
    const ra = fakeRes()
    const rb = fakeRes()

    // 600 + 600 = 1200 > 1048: ler-e-depois-gravar deixaria os dois passarem (é o P0-1).
    await Promise.all([upload(reqUpload(u, a, 600), ra), upload(reqUpload(u, b, 600), rb)])

    const codigos = [ra.statusCode, rb.statusCode].sort()
    expect(codigos).toEqual([200, 507])
    expect(arquivosDe(a).length + arquivosDe(b).length).toBe(1)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(600)
  })

  it('selfhost é ilimitado: passa muito acima do teto e não contabiliza', async () => {
    delete process.env.AUTH_REQUIRED // sem auth → plano selfhost
    process.env.FREE_STORAGE_MB = '0.001'
    const u = 'cota-selfhost'
    const id = await novaSessao(u)
    const res = fakeRes()

    await upload(reqUpload(u, id, CAP * 5), res)

    expect(res.statusCode).toBe(200)
    expect(existsSync(path.join(audioDir, `${id}.webm`))).toBe(true)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(0)
  })

  it('reconciliação: o contador é reescrito a partir do que existe em disco', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '1'
    const u = 'cota-reconcilia'
    const id = await novaSessao(u)
    await upload(reqUpload(u, id, 400), fakeRes())
    await quota.ajustarArmazenamento(asUserId(u), 100_000) // divergência artificial

    expect(await quota.reconciliarArmazenamento(asUserId(u), audioDir)).toBe(400)
    expect(await quota.usoDeArmazenamento(asUserId(u))).toBe(400)
  })
})
