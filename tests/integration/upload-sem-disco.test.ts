/**
 * UPLOAD SEM DISCO (Fase 2, Task 7), pela montagem real (`criarApp()` via harness, modo público).
 *
 * Num Worker não existe `mkdtemp` nem `AUDIO_DIR`: o corpo de `POST /api/sessions/:id/audio` vai do
 * request para o R2 do binding em STREAM (`receberCorpo(...).paraStream()` + `gravarDeStream`). Aqui o
 * Node finge não ter disco (`BABEL_SEM_DISCO=1`, lido na hora por `temDisco()`) e o binding é o dublê
 * em memória (`ligarBucketDoR2`). Conferido:
 *  - um upload de alguns MB vai ao bucket (multipart acima de 5 MiB), nada vai para `AUDIO_DIR`, a cota
 *    fica reservada com o tamanho real, e o GET com `Range` responde 206 pelo `lerFaixa` do binding;
 *  - corpo `chunked` passando de 120 MB → 413, multipart ABORTADO, nada gravado e a cota devolvida;
 *  - o R2 recusando uma parte no meio → 500, abort, cota devolvida;
 *  - o tipo continua saindo dos magic bytes, ANTES de qualquer chamada ao bucket.
 */
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { type ClientRequest, request } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type AppDeTeste, subirApp } from '../caracterizacao/_app'
import { type DubleDoR2, dubleDoR2 } from '../harness/workers/r2Duble'

const MB = 1024 * 1024
const CABECA_WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 0x21)])

interface Resposta {
  status: number
  corpo: string
}

function drenou(req: ClientRequest): Promise<void> {
  return new Promise((r) => {
    const soltar = () => {
      req.off('drain', soltar).off('close', soltar)
      r()
    }
    req.once('drain', soltar).once('close', soltar)
  })
}

describe('upload sem disco: stream direto para o R2 do binding', () => {
  let s: AppDeTeste
  let audioDir: string
  let bucket: DubleDoR2
  let quota: typeof import('../../server/lib/storageQuota')
  let ligarBucketDoR2: typeof import('../../server/lib/armazenamentoR2').ligarBucketDoR2
  const tokens: Record<string, string> = {}
  const envAntes = {
    AUDIO_DIR: process.env.AUDIO_DIR,
    FREE_STORAGE_MB: process.env.FREE_STORAGE_MB,
    BABEL_SEM_DISCO: process.env.BABEL_SEM_DISCO,
  }

  /* Um bucket por caso: o store das sessões é memoizado no primeiro uso, então o dublê é UM objeto cujo
     comportamento (falhar uma parte) cada caso troca. */
  let falharParte: number | undefined
  const bucketDoCaso = (): DubleDoR2 => {
    const base = dubleDoR2({ soTamanhos: false })
    return {
      ...base,
      async createMultipartUpload(chave, o) {
        const up = await base.createMultipartUpload(chave, o)
        return {
          ...up,
          async uploadPart(n, d) {
            if (n === falharParte) {
              base.chamadas.push({ op: 'uploadPart', chave, numero: n, tamanho: 0, primeiroByte: -1, sha256: '' })
              throw new Error(`r2 dublê: falha na parte ${n}`)
            }
            return up.uploadPart(n, d)
          },
        }
      },
    }
  }

  beforeAll(async () => {
    audioDir = mkdtempSync(path.join(tmpdir(), 'babel-sem-disco-'))
    process.env.AUDIO_DIR = audioDir
    process.env.FREE_STORAGE_MB = '1000'
    process.env.BABEL_SEM_DISCO = '1'
    s = await subirApp({ modo: 'publico', adultoPorPadrao: true })
    quota = await s.load('../../server/lib/storageQuota')
    ;({ ligarBucketDoR2 } = await s.load('../../server/lib/armazenamentoR2'))
    bucket = bucketDoCaso()
    ligarBucketDoR2(bucket)
    for (const u of ['ana', 'bia', 'caio', 'duda', 'edu', 'fabi', 'gil']) tokens[u] = await s.token(`sem-disco-${u}`)
  }, 60_000)

  afterAll(async () => {
    ligarBucketDoR2?.(null)
    await s.encerrar()
    for (const [k, v] of Object.entries(envAntes)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    rmSync(audioDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    falharParte = undefined
    bucket.chamadas.length = 0
  })

  async function novaSessao(u: string): Promise<string> {
    const r = await s.post('/api/sessions', { title: 'sem disco', kind: 'audio' }, tokens[u])
    expect(r.status).toBe(200)
    return ((await r.json()) as { id: string }).id
  }

  const uso = (u: string) => quota.usoDeArmazenamento(asUserId(`sem-disco-${u}`))

  function abrirUpload(caminho: string, u: string, headers: Record<string, string> = {}) {
    const base = new URL(s.base)
    const req = request({
      host: base.hostname,
      port: base.port,
      path: caminho,
      method: 'POST',
      headers: { 'content-type': 'audio/webm', authorization: `Bearer ${tokens[u]}`, ...headers },
    })
    const resposta = new Promise<Resposta>((ok, falha) => {
      req.on('response', (res) => {
        const partes: Buffer[] = []
        res.on('data', (c: Buffer) => partes.push(c))
        res.on('end', () => ok({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString() }))
        res.on('error', falha)
      })
      req.on('error', falha)
    })
    resposta.catch(() => {})
    return { req, resposta }
  }

  it('alguns MB → multipart no bucket, nada no disco, cota com o tamanho real, Range 206', async () => {
    const id = await novaSessao('ana')
    const corpo = Buffer.concat([CABECA_WEBM, Buffer.alloc(7 * MB, 0x44)])
    const r = await s.chamar('POST', `/api/sessions/${id}/audio`, {
      token: tokens.ana,
      raw: corpo,
      headers: { 'content-type': 'audio/webm' },
    })
    expect(r.status).toBe(200)
    const ops = bucket.chamadas.map((c) => c.op)
    expect(ops).toContain('createMultipartUpload')
    expect(ops.filter((o) => o === 'uploadPart')).toHaveLength(2)
    expect(ops).toContain('complete')
    expect(bucket.conteudo(`${id}.webm`)?.equals(corpo)).toBe(true)
    // Nem o objeto nem temporário de recepção no disco.
    expect(readdirSync(audioDir)).toEqual([])
    expect(await uso('ana')).toBe(corpo.length)

    const g = await s.chamar('GET', `/api/sessions/${id}/audio`, {
      token: tokens.ana,
      headers: { range: 'bytes=0-3' },
    })
    expect(g.status).toBe(206)
    expect(g.headers.get('content-range')).toBe(`bytes 0-3/${corpo.length}`)
    expect(Buffer.from(await g.arrayBuffer())).toEqual(CABECA_WEBM.subarray(0, 4))
    expect(bucket.chamadas.at(-1)).toEqual({ op: 'get', chave: `${id}.webm`, range: { offset: 0, length: 4 } })
  })

  it('pequeno (< 5 MiB) → um put só', async () => {
    const id = await novaSessao('bia')
    const r = await s.chamar('POST', `/api/sessions/${id}/audio`, {
      token: tokens.bia,
      raw: CABECA_WEBM,
      headers: { 'content-type': 'audio/webm' },
    })
    expect(r.status).toBe(200)
    expect(bucket.chamadas.filter((c) => c.op !== 'head').map((c) => c.op)).toEqual(['put'])
    expect(await uso('bia')).toBe(CABECA_WEBM.length)
  })

  it('tipo inválido → 400 sem tocar o bucket para gravar', async () => {
    const id = await novaSessao('bia')
    const r = await s.chamar('POST', `/api/sessions/${id}/audio`, {
      token: tokens.bia,
      raw: Buffer.alloc(1024, 0x50),
      headers: { 'content-type': 'audio/webm' },
    })
    expect(r.status).toBe(400)
    expect(bucket.chamadas.filter((c) => c.op !== 'head')).toEqual([])
  })

  it('chunked passando de 120 MB → 413, multipart abortado, nada gravado, cota devolvida', async () => {
    const id = await novaSessao('caio')
    const antes = await uso('caio')
    const a = abrirUpload(`/api/sessions/${id}/audio`, 'caio') // sem Content-Length: chunked
    let respondeu = false
    void a.resposta.then(
      () => (respondeu = true),
      () => (respondeu = true),
    )
    const pedaco = Buffer.alloc(MB, 0x33)
    a.req.write(CABECA_WEBM)
    for (let i = 0; i < 130 && !respondeu; i++) {
      if (!a.req.write(pedaco)) await drenou(a.req)
    }
    const r = await a.resposta.catch(() => null)
    a.req.destroy()
    expect(r?.status).toBe(413)
    expect(JSON.parse(r?.corpo ?? '{}').code).toBe('corpo_grande_demais')
    expect(bucket.contar('abort')).toBe(1)
    expect(bucket.contar('complete')).toBe(0)
    expect(bucket.chaves()).not.toContain(`${id}.webm`)
    expect(await uso('caio')).toBe(antes)
    expect(existsSync(path.join(audioDir, '.recebendo'))).toBe(false)
  }, 60_000)

  it('R2 recusa uma parte no meio → 500, abort, cota devolvida', async () => {
    const id = await novaSessao('duda')
    const antes = await uso('duda')
    falharParte = 2
    const r = await s.chamar('POST', `/api/sessions/${id}/audio`, {
      token: tokens.duda,
      raw: Buffer.concat([CABECA_WEBM, Buffer.alloc(12 * MB, 0x55)]),
      headers: { 'content-type': 'audio/webm' },
    })
    expect(r.status).toBe(500)
    expect(bucket.contar('abort')).toBe(1)
    expect(bucket.contar('complete')).toBe(0)
    expect(await uso('duda')).toBe(antes)
  })

  /**
   * Envia o corpo INTEIRO por um socket cru (respeitando o `drain`) e devolve o status e quanto levou até
   * a última escrita passar. Socket cru, e não `http.request`: o cliente HTTP do Node para de escrever
   * quando a resposta chega antes do fim do corpo, e aí não daria para ver se o SERVIDOR drena.
   */
  async function enviarCru(caminho: string, u: string, partes: Buffer[], chunked = false) {
    const base = new URL(s.base)
    const sock = connect(Number(base.port), base.hostname)
    await new Promise((r) => sock.once('connect', r))
    let resposta = ''
    sock.on('data', (d) => (resposta += d.toString('latin1')))
    sock.on('error', () => {})
    let fechou = false
    sock.once('close', () => (fechou = true))
    const t0 = Date.now()
    const total = partes.reduce((n, p) => n + p.length, 0)
    sock.write(
      `POST ${caminho} HTTP/1.1\r\nHost: ${base.host}\r\nAuthorization: Bearer ${tokens[u]}\r\n` +
        `Content-Type: audio/webm\r\n` +
        (chunked ? 'Transfer-Encoding: chunked\r\n\r\n' : `Content-Length: ${total}\r\n\r\n`),
    )
    const escrever = async (b: Buffer | string) => {
      if (!sock.write(b)) {
        await new Promise<void>((r) => {
          const soltar = () => {
            sock.off('drain', soltar).off('close', soltar)
            r()
          }
          sock.once('drain', soltar).once('close', soltar)
        })
      }
    }
    for (const p of partes) {
      if (chunked) await escrever(`${p.length.toString(16)}\r\n`)
      await escrever(p)
      if (chunked) await escrever('\r\n')
    }
    if (chunked) await escrever('0\r\n\r\n')
    const ms = Date.now() - t0
    // Socket fechado antes do fim do corpo também "termina rápido" — mas aí o corpo não foi drenado.
    const fechouAntes = fechou
    for (let i = 0; i < 50 && !/^HTTP\/1\.1 \d+/.test(resposta); i++) await new Promise((r) => setTimeout(r, 20))
    sock.destroy()
    return { status: Number(/^HTTP\/1\.1 (\d+)/.exec(resposta)?.[1] ?? 0), ms, fechouAntes }
  }

  /* RECUSA COM O CORPO CHEGANDO: o resto é descartado e a conexão termina já, não no prazo de 10 s do
     descarte. Antes, o leitor do stream continuava pausando o request a cada pedaço e o descarte travava. */
  it('tipo inválido com alguns MB chegando → 400 e o corpo drenado em < 2 s', async () => {
    const id = await novaSessao('edu')
    const lixo = Buffer.alloc(MB, 0x50)
    const { status, ms, fechouAntes } = await enviarCru(`/api/sessions/${id}/audio`, 'edu', Array(8).fill(lixo))
    expect(status).toBe(400)
    expect(ms).toBeLessThan(2000)
    expect(fechouAntes).toBe(false)
  })

  it('cota recusando o chunked (507) com o corpo chegando → resposta e corpo drenado em < 2 s', async () => {
    const id = await novaSessao('fabi')
    const antes = process.env.FREE_STORAGE_MB
    process.env.FREE_STORAGE_MB = '100' // o chunked reserva 120 MB: passa do plano
    try {
      const pedaco = Buffer.alloc(MB, 0x33)
      const { status, ms, fechouAntes } = await enviarCru(
        `/api/sessions/${id}/audio`,
        'fabi',
        [CABECA_WEBM, ...Array(8).fill(pedaco)],
        true,
      )
      expect(status).toBe(507)
      expect(ms).toBeLessThan(2000)
      expect(fechouAntes).toBe(false)
      expect(bucket.chamadas.filter((c) => c.op !== 'head')).toEqual([])
    } finally {
      process.env.FREE_STORAGE_MB = antes
    }
  })

  it('teto mensal de operações A estourando na parte 3 → 503, abort, cota devolvida', async () => {
    const { usageCountersRepo } = await s.load('../../server/db/repositories/usageCounters')
    const r2 = asUserId('__r2__')
    const janela = new Date().toISOString().slice(0, 7)
    await usageCountersRepo.reset(r2, 'r2_ops_a', janela)
    await usageCountersRepo.increment(r2, 'r2_ops_a', janela, 900_000 - 3) // create, parte 1 e 2 cabem
    try {
      const id = await novaSessao('gil')
      const antes = await uso('gil')
      const r = await s.chamar('POST', `/api/sessions/${id}/audio`, {
        token: tokens.gil,
        raw: Buffer.concat([CABECA_WEBM, Buffer.alloc(12 * MB, 0x66)]),
        headers: { 'content-type': 'audio/webm' },
      })
      expect(r.status).toBe(503)
      expect(((await r.json()) as { code: string }).code).toBe('r2_teto_operacoes')
      expect(bucket.contar('uploadPart')).toBe(2)
      expect(bucket.contar('abort')).toBe(1)
      expect(bucket.contar('complete')).toBe(0)
      expect(await uso('gil')).toBe(antes)
    } finally {
      await usageCountersRepo.reset(r2, 'r2_ops_a', janela)
    }
  })
})
