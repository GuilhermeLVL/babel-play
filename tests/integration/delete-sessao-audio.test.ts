/**
 * DELETE de sessão não pode confirmar exclusão que não aconteceu (P1-9 da auditoria).
 *
 * Havia duplo swallow na remoção do arquivo (`.catch(() => {})` E `catch {}`) e a resposta
 * era `{ok:true}` de qualquer jeito: o arquivo ficava órfão no disco enquanto o usuário via
 * "apagado". Para um pedido de exclusão (LGPD/GDPR) é confirmar o que não ocorreu.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

let h: EphemeralDb
let router: any
let sessions: any
let audioDir: string

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-del-'))
  process.env.AUDIO_DIR = audioDir
  h = await setupEphemeralDb()
  const mod = await h.load('../../server/routes/sessions') as any
  router = mod.sessionsRouter
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
})
afterAll(async () => { delete process.env.AUDIO_DIR; await h.cleanup() })
afterEach(() => vi.restoreAllMocks())

/** Invoca o handler do DELETE registrado no router, sem subir servidor. */
function handlerDelete() {
  const layer = router.stack.find((l: any) => l.route?.path === '/:id' && l.route?.methods?.delete)
  return layer.route.stack[0].handle
}
function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

async function sessaoComAudio(u: string) {
  const s = await sessions.create(asUserId(u), { title: 'del', kind: 'audio' })
  const file = `${s.id}.webm`
  writeFileSync(path.join(audioDir, file), Buffer.alloc(16, 1))
  await sessions.setAudio(asUserId(u), s.id, file, 'audio/webm')
  return { id: s.id, file }
}

describe('DELETE /api/sessions/:id — P1-9', () => {
  it('caminho feliz: apaga o arquivo e responde ok', async () => {
    const { id, file } = await sessaoComAudio('del-ok')
    const res = fakeRes()
    await handlerDelete()({ userId: asUserId('del-ok'), params: { id } } as any, res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(existsSync(path.join(audioDir, file))).toBe(false)
  })

  it('sessão sem áudio responde ok sem tentar apagar nada', async () => {
    const s = await sessions.create(asUserId('del-semaudio'), { title: 'x', kind: 'audio' })
    const res = fakeRes()
    await handlerDelete()({ userId: asUserId('del-semaudio'), params: { id: s.id } } as any, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  /**
   * Falha REAL, sem mock: `rm` sem `recursive` sobre um DIRETÓRIO lança ERR_FS_EISDIR.
   * (Espiar `node:fs/promises` não funcionaria — `rm` é import nomeado ESM, ligado no load.)
   */
  async function sessaoComAudioQueNaoApaga(u: string) {
    const s = await sessions.create(asUserId(u), { title: 'del', kind: 'audio' })
    const nome = `${s.id}.webm`
    mkdirSync(path.join(audioDir, nome)) // diretório no lugar do arquivo
    await sessions.setAudio(asUserId(u), s.id, nome, 'audio/webm')
    return { id: s.id, nome }
  }

  it('falha ao apagar o arquivo NÃO pode responder ok', async () => {
    const { id } = await sessaoComAudioQueNaoApaga('del-falha')

    const res = fakeRes()
    await handlerDelete()({ userId: asUserId('del-falha'), params: { id } } as any, res)

    expect(res.statusCode).toBe(500)
    expect(res.body?.ok).toBe(false)
    expect(String(res.body?.error)).toMatch(/áudio/i)
  })

  it('mesmo com o arquivo resistindo, a sessão sai da listagem', async () => {
    const { id } = await sessaoComAudioQueNaoApaga('del-linha')

    await handlerDelete()({ userId: asUserId('del-linha'), params: { id } } as any, fakeRes())

    expect(await sessions.get(asUserId('del-linha'), id)).toBeUndefined()
  })
})
