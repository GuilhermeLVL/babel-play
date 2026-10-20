/**
 * UPLOAD DE ÁUDIO COM O TETO DE CLASSE A BATIDO (`openspec/changes/r2-teto-de-uso`).
 *
 * Antes este arquivo cobria `POST /api/import/youtube` (yt-dlp falso), que criava a sessão e baixava o áudio
 * para `AUDIO_DIR` ANTES do PUT no R2. A rota foi aposentada (Task 10 da Fase 2: 410 `rota_removida`); o
 * mesmo contrato de limpeza vale para o caminho que ficou, `POST /api/sessions/:id/audio`, que recebe o
 * corpo num ARQUIVO TEMPORÁRIO em disco antes do PUT no bucket. Quando o PUT é recusado pelo teto, nada pode
 * sobrar: nem o temporário em `AUDIO_DIR/.recebendo`, nem áudio atrelado à sessão, nem a reserva de cota.
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const S3 = {
  S3_ENDPOINT: 'http://r2-falso.invalid',
  S3_BUCKET: 'midia-teste',
  S3_ACCESS_KEY_ID: 'chave-de-teste',
  S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
}
const ENVS = ['AUTH_REQUIRED', 'FREE_STORAGE_MB', 'AUDIO_DIR', 'R2_TETO_OPS_A_MES', ...Object.keys(S3)]
const salvos = Object.fromEntries(ENVS.map((n) => [n, process.env[n]]))

const chamadas: Array<{ metodo: string; url: string }> = []
const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
  chamadas.push({ metodo: init?.method ?? 'GET', url })
  return new Response(null, { status: 200 })
})

let h: EphemeralDb
let sessionsRouter: any
let sessions: any
let contadores: any
let quota: any
let audioDir: string

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-r2-upload-'))
  process.env.AUDIO_DIR = audioDir
  Object.assign(process.env, S3)
  process.env.R2_TETO_OPS_A_MES = '3'
  process.env.AUTH_REQUIRED = '1' // a cota só é contabilizada com login (a reserva é o que o teste confere)
  process.env.FREE_STORAGE_MB = '100'
  vi.stubGlobal('fetch', fetchFalso)
  h = await setupEphemeralDb()
  ;({ sessionsRouter } = await h.load('../../server/routes/sessions'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ usageCountersRepo: contadores } = await h.load('../../server/db/repositories/usageCounters'))
  quota = await h.load('../../server/lib/storageQuota')
})

afterAll(async () => {
  vi.unstubAllGlobals()
  for (const [k, v] of Object.entries(salvos)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await h.cleanup()
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), r)
  return r
}

describe('upload de áudio com a classe A no teto', () => {
  it('responde 503 e não deixa temporário em AUDIO_DIR, áudio na sessão nem reserva de cota', async () => {
    const u = asUserId('r2-upload')
    const id = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    await contadores.increment(asUserId('__r2__'), 'r2_ops_a', new Date().toISOString().slice(0, 7), 3)
    const corpo = Buffer.alloc(2048, 7)
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(corpo) // magic bytes de webm
    const res = fakeRes()
    const camada = sessionsRouter.stack.find((l: any) => l.route?.path === '/:id/audio' && l.route?.methods?.post)
    await camada.route.stack.at(-1).handle(
      {
        userId: u,
        params: { id },
        body: corpo,
        headers: { 'content-type': 'audio/webm' },
        path: `/${id}/audio`,
      },
      res,
    )

    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ code: 'r2_teto_operacoes' })
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([])
    const recebendo = path.join(audioDir, '.recebendo')
    expect(existsSync(recebendo) ? readdirSync(recebendo) : []).toEqual([])
    const sessao = await sessions.get(u, id)
    expect(sessao, 'a sessão continua existindo').toBeTruthy()
    expect(JSON.parse(sessao.meta || '{}').audioFile ?? null, 'nenhum áudio atrelado').toBeNull()
    expect(await quota.usoDeArmazenamento(u)).toBe(0)
  })
})
