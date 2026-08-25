/**
 * F4-04 — o tipo do upload sai do CONTEÚDO, não do que o cliente declara.
 *
 * Medido antes: o `Content-Type` chegava do cliente, era gravado em `sessions.meta` e devolvido no
 * GET do áudio. O pior caso estava fechado por TERCEIROS (o glob `audio/*` do `express.raw` e o
 * `nosniff` do helmet), não por validação própria — nenhuma referência a magic bytes em `server/`.
 *
 * O que este arquivo amarra: um arquivo que MENTE (ZIP/PDF anunciado como `audio/webm`) é recusado
 * com 400 e não chega ao disco; e o que é gravado em `meta` é o tipo DETECTADO, não o declarado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { detectarTipoDeArquivo, detectarAudio } from '../../server/lib/tipoDeArquivo'

/** Um corpo com a assinatura pedida e enchimento depois — o tamanho não importa para a detecção. */
function comAssinatura(sig: number[] | string, total = 64, offset = 0): Buffer {
  const b = Buffer.alloc(total, 0)
  const s = typeof sig === 'string' ? Buffer.from(sig, 'ascii') : Buffer.from(sig)
  s.copy(b, offset)
  return b
}

const WEBM = comAssinatura([0x1a, 0x45, 0xdf, 0xa3])
const OGG = comAssinatura('OggS')
const MP4 = comAssinatura('ftyp', 64, 4)
const MP3_ID3 = comAssinatura('ID3')
const MP3_SYNC = comAssinatura([0xff, 0xfb])
const ZIP = comAssinatura([0x50, 0x4b, 0x03, 0x04])
const PDF = comAssinatura('%PDF-')

function WAV(): Buffer {
  const b = Buffer.alloc(64, 0)
  Buffer.from('RIFF', 'ascii').copy(b, 0)
  Buffer.from('WAVE', 'ascii').copy(b, 8)
  return b
}

describe('detecção por magic bytes', () => {
  it('reconhece os formatos de áudio que o app realmente recebe', () => {
    expect(detectarAudio(WEBM)).toMatchObject({ mime: 'audio/webm', ext: 'webm' })
    expect(detectarAudio(OGG)).toMatchObject({ mime: 'audio/ogg', ext: 'ogg' })
    expect(detectarAudio(MP4)).toMatchObject({ mime: 'audio/mp4', ext: 'mp4' })
    expect(detectarAudio(WAV())).toMatchObject({ mime: 'audio/wav', ext: 'wav' })
    expect(detectarAudio(MP3_ID3)).toMatchObject({ mime: 'audio/mpeg', ext: 'mp3' })
    expect(detectarAudio(MP3_SYNC)).toMatchObject({ mime: 'audio/mpeg', ext: 'mp3' })
  })

  it('reconhece os pacotes da importação (ZIP cobre .apkg e .docx)', () => {
    expect(detectarTipoDeArquivo(ZIP)).toMatchObject({ mime: 'application/zip', categoria: 'documento' })
    expect(detectarTipoDeArquivo(PDF)).toMatchObject({ mime: 'application/pdf', categoria: 'documento' })
  })

  it('`detectarAudio` NÃO devolve documento — ZIP renomeado não vira áudio', () => {
    expect(detectarAudio(ZIP)).toBeNull()
    expect(detectarAudio(PDF)).toBeNull()
  })

  it('lixo e corpo curto demais não casam com nada', () => {
    expect(detectarTipoDeArquivo(Buffer.alloc(64, 7))).toBeNull()
    expect(detectarTipoDeArquivo(Buffer.from([0x1a]))).toBeNull()
    expect(detectarTipoDeArquivo(Buffer.alloc(0))).toBeNull()
  })

  it('RIFF sem WAVE (ex.: AVI) não passa por áudio', () => {
    const avi = Buffer.alloc(64, 0)
    Buffer.from('RIFF', 'ascii').copy(avi, 0)
    Buffer.from('AVI ', 'ascii').copy(avi, 8)
    expect(detectarAudio(avi)).toBeNull()
  })
})

let h: EphemeralDb
let router: any
let sessions: any
let audioDir: string

beforeAll(async () => {
  audioDir = mkdtempSync(path.join(tmpdir(), 'babel-tipo-'))
  process.env.AUDIO_DIR = audioDir
  h = await setupEphemeralDb()
  ;({ sessionsRouter: router } = await h.load('../../server/routes/sessions'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
})
afterAll(async () => { delete process.env.AUDIO_DIR; await h.cleanup() })

function upload(req: any, res: any) {
  const layer = router.stack.find((l: any) => l.route?.path === '/:id/audio' && l.route?.methods?.post)
  const pilha = layer.route.stack
  return pilha[pilha.length - 1].handle(req, res)
}
function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
async function novaSessao(u: string) {
  return (await sessions.create(asUserId(u), { title: 'tipo', kind: 'audio' })).id as string
}
function req(u: string, id: string, body: Buffer, contentType = 'audio/webm') {
  return { userId: asUserId(u), params: { id }, body, headers: { 'content-type': contentType }, path: `/${id}/audio` } as any
}

describe('POST /api/sessions/:id/audio — o Content-Type do cliente não é evidência', () => {
  it('ZIP disfarçado de audio/webm é recusado com 400 e não toca o disco', async () => {
    const u = 'tipo-zip'
    const id = await novaSessao(u)
    const res = fakeRes()

    await upload(req(u, id, ZIP, 'audio/webm'), res)

    expect(res.statusCode).toBe(400)
    expect(res.body?.code).toBe('audio_content_invalid')
    expect(readdirSync(audioDir).filter((f) => f.startsWith(id))).toEqual([])
    // E a sessão continua sem áudio: nada foi registrado no meta.
    const s = await sessions.get(asUserId(u), id)
    expect(JSON.parse(s.meta || '{}').audioFile).toBeUndefined()
  })

  it('PDF com extensão/Content-Type mentindo também é recusado', async () => {
    const u = 'tipo-pdf'
    const id = await novaSessao(u)
    const res = fakeRes()
    await upload(req(u, id, PDF, 'audio/mp4'), res)
    expect(res.statusCode).toBe(400)
    expect(readdirSync(audioDir).filter((f) => f.startsWith(id))).toEqual([])
  })

  it('bytes sem assinatura conhecida são recusados (não existe "aceita se não souber")', async () => {
    const u = 'tipo-lixo'
    const id = await novaSessao(u)
    const res = fakeRes()
    await upload(req(u, id, Buffer.alloc(2048, 7), 'audio/webm'), res)
    expect(res.statusCode).toBe(400)
    expect(readdirSync(audioDir).filter((f) => f.startsWith(id))).toEqual([])
  })

  it('grava o tipo DETECTADO, não o declarado — e é ele que volta no GET', async () => {
    const u = 'tipo-detectado'
    const id = await novaSessao(u)
    const res = fakeRes()

    // O cliente MENTE dizendo webm; o conteúdo é OGG de verdade.
    await upload(req(u, id, OGG, 'audio/webm'), res)

    expect(res.statusCode).toBe(200)
    const meta = JSON.parse((await sessions.get(asUserId(u), id)).meta || '{}')
    expect(meta.audioType).toBe('audio/ogg')
    expect(meta.audioFile).toBe(`${id}.ogg`)
    expect(existsSync(path.join(audioDir, `${id}.ogg`))).toBe(true)
  })

  it('áudio legítimo continua passando', async () => {
    const u = 'tipo-ok'
    const id = await novaSessao(u)
    const res = fakeRes()
    await upload(req(u, id, WEBM, 'application/octet-stream'), res)
    expect(res.statusCode).toBe(200)
    expect(existsSync(path.join(audioDir, `${id}.webm`))).toBe(true)
  })
})
