/**
 * IMPORT DO YOUTUBE COM O TETO DE CLASSE A BATIDO (`openspec/changes/r2-teto-de-uso`).
 *
 * O import cria a sessão e baixa o áudio para `AUDIO_DIR` ANTES do PUT no R2. Quando o PUT é recusado
 * pelo teto, nada pode sobrar: nem a sessão sem áudio, nem o arquivo baixado, nem a reserva de cota.
 * O yt-dlp é trocado por um falso (`vi.mock`): o que se mede é a rota, não o download.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const baixados: string[] = []
vi.mock('../../server/import/youtube', () => ({
  hasYtDlp: async () => true,
  resolveYouTube: async () => ({ id: 'abc', title: 'vídeo', durationMs: 10_000, subtitles: {}, autoCaptions: {} }),
  fetchCaptions: async () => null,
  downloadAudio: async (_url: string, id: string, dir: string) => {
    await mkdir(dir, { recursive: true })
    const file = `${id}.m4a`
    writeFileSync(path.join(dir, file), Buffer.alloc(2048, 7))
    baixados.push(path.join(dir, file))
    return { file, contentType: 'audio/mp4' }
  },
}))

const S3 = {
  S3_ENDPOINT: 'http://r2-falso.invalid',
  S3_BUCKET: 'midia-teste',
  S3_ACCESS_KEY_ID: 'chave-de-teste',
  S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
}
const ENVS = ['AUTH_REQUIRED', 'AUDIO_DIR', 'R2_TETO_OPS_A_MES', ...Object.keys(S3)]
const salvos = Object.fromEntries(ENVS.map((n) => [n, process.env[n]]))

const chamadas: Array<{ metodo: string; url: string }> = []
const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
  chamadas.push({ metodo: init?.method ?? 'GET', url })
  return new Response(null, { status: 200 })
})

let h: EphemeralDb
let importRouter: any
let sessions: any
let contadores: any

beforeAll(async () => {
  process.env.AUDIO_DIR = mkdtempSync(path.join(tmpdir(), 'babel-r2-import-'))
  Object.assign(process.env, S3)
  process.env.R2_TETO_OPS_A_MES = '3'
  delete process.env.AUTH_REQUIRED // selfhost: o import do YouTube é liberado
  vi.stubGlobal('fetch', fetchFalso)
  h = await setupEphemeralDb()
  ;({ importRouter } = await h.load('../../server/routes/import'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ usageCountersRepo: contadores } = await h.load('../../server/db/repositories/usageCounters'))
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

describe('import do YouTube com a classe A no teto', () => {
  it('responde 503 e não deixa sessão sem áudio nem arquivo baixado em AUDIO_DIR', async () => {
    const u = asUserId('r2-import')
    await contadores.increment(asUserId('__r2__'), 'r2_ops_a', new Date().toISOString().slice(0, 7), 3)
    const res = fakeRes()
    await importRouter.stack
      .find((l: any) => l.route?.path === '/youtube' && l.route?.methods?.post)
      .route.stack.at(-1)
      .handle({ userId: u, body: { url: 'https://www.youtube.com/watch?v=abcdefghijk' }, path: '/youtube' }, res)

    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ code: 'r2_teto_operacoes' })
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([])
    expect(baixados).toHaveLength(1)
    expect(existsSync(baixados[0])).toBe(false)
    expect(await sessions.list(u)).toEqual([])
  })
})
