/**
 * TETO MENSAL DE OPERAÇÕES NO R2 (`openspec/changes/r2-teto-de-uso`, requisito "Teto mensal de
 * operações no R2"). O embrulho `comTetoDeOperacoes` conta cada operação do adaptador S3 por classe
 * (A: gravar/gravarDeArquivo/remover; B: ler/lerFaixa/tamanho) em `usage_counters` (`__r2__`,
 * `r2_ops_a`/`r2_ops_b`, janela `YYYY-MM` UTC) e recusa no teto; `remover` sempre passa.
 *
 * Os casos do embrulho usam um relógio injetado num ano distante — cada caso tem o SEU mês, então os
 * contadores não se misturam. Os casos de rota usam o mês corrente e o `fetch` falso (as rotas criam
 * o adaptador no import).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const S3 = {
  S3_ENDPOINT: 'http://r2-falso.invalid',
  S3_BUCKET: 'midia-teste',
  S3_ACCESS_KEY_ID: 'chave-de-teste',
  S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
}
const ENVS = [
  'AUTH_REQUIRED',
  'FREE_STORAGE_MB',
  'AUDIO_DIR',
  'R2_TETO_OPS_A_MES',
  'R2_TETO_OPS_B_MES',
  ...Object.keys(S3),
]
const salvos = Object.fromEntries(ENVS.map((n) => [n, process.env[n]]))

const chamadas: Array<{ metodo: string; url: string }> = []
const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
  const metodo = init?.method ?? 'GET'
  chamadas.push({ metodo, url })
  if (url.includes('falha-de-rede')) throw new TypeError('fetch failed')
  if (metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '4' } })
  if (metodo === 'GET') return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
  return new Response(null, { status: 200 })
})

let h: EphemeralDb
let teto: typeof import('../../server/lib/tetoDoR2')
let armazenamento: typeof import('../../server/lib/armazenamento')
let contadores: any
let sessions: any
let router: any
let quota: any

const TETO_DAS_ROTAS = 5

beforeAll(async () => {
  process.env.AUDIO_DIR = mkdtempSync(path.join(tmpdir(), 'babel-r2-ops-'))
  Object.assign(process.env, S3)
  process.env.R2_TETO_OPS_A_MES = String(TETO_DAS_ROTAS)
  process.env.R2_TETO_OPS_B_MES = String(TETO_DAS_ROTAS)
  vi.stubGlobal('fetch', fetchFalso)
  h = await setupEphemeralDb()
  teto = await h.load('../../server/lib/tetoDoR2')
  armazenamento = await h.load('../../server/lib/armazenamento')
  ;({ usageCountersRepo: contadores } = await h.load('../../server/db/repositories/usageCounters'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ sessionsRouter: router } = await h.load('../../server/routes/sessions'))
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

const R2 = asUserId('__r2__')
const ops = (classe: 'a' | 'b', janela: string): Promise<number> => contadores.get(R2, `r2_ops_${classe}`, janela)
async function fixarOps(classe: 'a' | 'b', janela: string, valor: number) {
  await contadores.reset(R2, `r2_ops_${classe}`, janela)
  if (valor > 0) await contadores.increment(R2, `r2_ops_${classe}`, janela, valor)
}

/** Armazenamento falso que só registra o que chegou até ele. */
function storeFalso() {
  const feitas: string[] = []
  const store = {
    tipo: 's3' as const,
    gravar: async () => void feitas.push('gravar'),
    gravarDeArquivo: async () => void feitas.push('gravarDeArquivo'),
    ler: async () => (feitas.push('ler'), Buffer.from('x')),
    lerFaixa: async () => (feitas.push('lerFaixa'), Readable.from(Buffer.from('x'))),
    remover: async () => void feitas.push('remover'),
    tamanho: async () => (feitas.push('tamanho'), 1),
    sondar: async () => void feitas.push('sondar'),
  }
  return { store, feitas }
}

const relogio = (iso: string) => () => new Date(iso)

describe('comTetoDeOperacoes: contagem por classe', () => {
  it('gravar/gravarDeArquivo/remover contam em A; ler/lerFaixa/tamanho em B; sondar não conta', async () => {
    const { store, feitas } = storeFalso()
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: 100, opsB: 100 },
      agora: relogio('2101-01-15T12:00:00Z'),
    })
    await s.gravar('x', Buffer.from('a'), 'audio/webm')
    await s.gravarDeArquivo('x', '/tmp/nada', 'audio/webm')
    await s.remover('x')
    await s.ler('x')
    await s.lerFaixa('x', 0, 0)
    await s.tamanho('x')
    await s.sondar()
    expect(feitas).toEqual(['gravar', 'gravarDeArquivo', 'remover', 'ler', 'lerFaixa', 'tamanho', 'sondar'])
    expect(await ops('a', '2101-01')).toBe(3)
    expect(await ops('b', '2101-01')).toBe(3)
    expect(s.tipo).toBe('s3')
  })

  it('ilimitado continua contando, e nunca recusa', async () => {
    const { store } = storeFalso()
    await fixarOps('a', '2101-02', 5_000_000)
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: Infinity, opsB: Infinity },
      agora: relogio('2101-02-01T00:00:00Z'),
    })
    await s.gravar('x', Buffer.from('a'), 'audio/webm')
    expect(await ops('a', '2101-02')).toBe(5_000_001)
  })
})

describe('comTetoDeOperacoes: recusa no teto', () => {
  it('gravação com o teto de classe A batido lança ErroDeTetoDoR2; remover no mesmo estado é executado', async () => {
    const { store, feitas } = storeFalso()
    await fixarOps('a', '2101-03', 10)
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: 10, opsB: 100 },
      agora: relogio('2101-03-10T00:00:00Z'),
    })
    const erro = await s.gravar('x', Buffer.from('a'), 'audio/webm').catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(teto.ErroDeTetoDoR2)
    expect((erro as { codigo: string }).codigo).toBe('R2_TETO_OPS')
    await expect(s.gravarDeArquivo('x', '/tmp/nada', 'audio/webm')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    expect(await ops('a', '2101-03')).toBe(10) // recusa não conta

    await s.remover('x')
    expect(feitas).toEqual(['remover'])
    expect(await ops('a', '2101-03')).toBe(11)
  })

  it('classe B batida recusa ler e lerFaixa; tamanho responde e conta (exclusão e reconciliação dependem dele)', async () => {
    const { store, feitas } = storeFalso()
    await fixarOps('b', '2101-04', 3)
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: 100, opsB: 3 },
      agora: relogio('2101-04-10T00:00:00Z'),
    })
    await expect(s.ler('x')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    await expect(s.lerFaixa('x', 0, 1)).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    expect(feitas).toEqual([])
    expect(await ops('b', '2101-04')).toBe(3)

    expect(await s.tamanho('x')).toBe(1)
    expect(feitas).toEqual(['tamanho'])
    expect(await ops('b', '2101-04')).toBe(4)
    await expect(s.ler('x')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
  })

  it('teto 0 fecha a classe mesmo sem contador no mês', async () => {
    const { store, feitas } = storeFalso()
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: 0, opsB: 0 },
      agora: relogio('2101-05-10T00:00:00Z'),
    })
    await expect(s.gravar('x', Buffer.from('a'), 'audio/webm')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    await expect(s.ler('x')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    await s.remover('x')
    expect(feitas).toEqual(['remover'])
  })

  it('virada de mês: com outubro no teto, a primeira operação de novembro (UTC) conta em novembro e passa', async () => {
    const { store } = storeFalso()
    await fixarOps('a', '2101-10', 10)
    let agora = '2101-10-31T23:59:59.999Z'
    const s = teto.comTetoDeOperacoes(store, {
      tetos: { bytes: Infinity, opsA: 10, opsB: 100 },
      agora: () => new Date(agora),
    })
    await expect(s.gravar('x', Buffer.from('a'), 'audio/webm')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    agora = '2101-11-01T00:00:00.000Z'
    await s.gravar('x', Buffer.from('a'), 'audio/webm')
    expect(await ops('a', '2101-11')).toBe(1)
    expect(await ops('a', '2101-10')).toBe(10)
  })
})

describe('armazenamentoDoAmbiente: o embrulho só no S3', () => {
  it('disco não conta', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'babel-r2-disco-'))
    const mes = new Date().toISOString().slice(0, 7)
    const antesA = await ops('a', mes)
    const antesB = await ops('b', mes)
    const s = armazenamento.armazenamentoDoAmbiente(dir, {})
    expect(s.tipo).toBe('arquivos')
    await s.gravar('a.webm', Buffer.from('abc'), 'audio/webm')
    await s.ler('a.webm')
    await s.tamanho('a.webm')
    await s.remover('a.webm')
    expect(await ops('a', mes)).toBe(antesA)
    expect(await ops('b', mes)).toBe(antesB)
  })

  it('S3 é embrulhado; valor inválido de teto é erro de configuração ao criar (boot)', async () => {
    const mes = new Date().toISOString().slice(0, 7)
    const antes = await ops('b', mes)
    const s = armazenamento.armazenamentoDoAmbiente('/nao-usado', { ...S3, R2_TETO_OPS_B_MES: 'ilimitado' })
    expect(s.tipo).toBe('s3')
    await s.tamanho('qualquer.webm')
    expect(await ops('b', mes)).toBe(antes + 1)
    expect(() => armazenamento.armazenamentoDoAmbiente('/nao-usado', { ...S3, R2_TETO_MB: 'muito' })).toThrow(
      /R2_TETO_MB/,
    )
  })
})

/* ─────────────── as rotas: teto batido vira 503 ─────────────── */

function handlerDe(rota: string, metodo: 'get' | 'post') {
  const layer = router.stack.find((l: any) => l.route?.path === rota && l.route?.methods?.[metodo])
  const pilha = layer.route.stack
  return pilha[pilha.length - 1].handle
}
function fakeRes() {
  const r: any = { statusCode: 200, body: undefined, headers: {} as Record<string, unknown>, headersSent: false }
  r.status = (c: number) => ((r.statusCode = c), r)
  r.json = (b: any) => ((r.body = b), r)
  r.setHeader = (k: string, v: unknown) => void (r.headers[k] = v)
  r.end = () => r
  return r
}

describe('rotas com o teto de operações batido', () => {
  it('GET do áudio com a classe B batida responde 503 no envelope', async () => {
    const u = asUserId('r2ops-leitor')
    const id = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    await sessions.setAudio(u, id, `${id}.webm`, 'audio/webm')
    await fixarOps('b', new Date().toISOString().slice(0, 7), TETO_DAS_ROTAS)
    chamadas.length = 0
    const res = fakeRes()
    await handlerDe('/:id/audio', 'get')({ userId: u, params: { id }, headers: {}, path: `/${id}/audio` }, res)
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ code: 'r2_teto_operacoes' })
    expect(typeof res.body.error).toBe('string')
    // O HEAD (`tamanho`) passa sempre; a leitura do áudio (GET) não chega ao R2.
    expect(chamadas.filter((c) => c.metodo === 'GET')).toEqual([])
  })

  it('upload com a classe A batida responde 503 e devolve a reserva de cota', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.FREE_STORAGE_MB = '100'
    const u = asUserId('r2ops-gravador')
    const id = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    await fixarOps('a', new Date().toISOString().slice(0, 7), TETO_DAS_ROTAS)
    chamadas.length = 0
    const corpo = Buffer.alloc(2048, 7)
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(corpo)
    const res = fakeRes()
    await handlerDe('/:id/audio', 'post')(
      { userId: u, params: { id }, body: corpo, headers: { 'content-type': 'audio/webm' }, path: `/${id}/audio` },
      res,
    )
    expect(res.statusCode).toBe(503)
    expect(res.body).toMatchObject({ code: 'r2_teto_operacoes' })
    expect(chamadas.filter((c) => c.metodo === 'PUT')).toEqual([])
    expect(await quota.usoDeArmazenamento(u)).toBe(0)
  })
})

describe('reconciliação da cota com o store falhando', () => {
  it('erro do store (não é nome inválido nem objeto ausente) ABORTA a reconciliação, sem gravar subcontagem', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('r2ops-reconcilia-falha')
    const a = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    const b = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    await sessions.setAudio(u, a, `${a}.webm`, 'audio/webm')
    await sessions.setAudio(u, b, `${b}-falha-de-rede.webm`, 'audio/webm')
    await quota.ajustarArmazenamento(u, 999)

    await expect(quota.reconciliarArmazenamento(u)).rejects.toThrow(/fetch failed/)
    expect(await quota.usoDeArmazenamento(u)).toBe(999)
  })

  it('nome inválido continua fora da conta, e o resto é somado', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('r2ops-reconcilia-nome')
    const a = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    const b = (await sessions.create(u, { title: 'r2', kind: 'audio' })).id as string
    await sessions.setAudio(u, a, `${a}.webm`, 'audio/webm')
    await sessions.setAudio(u, b, '../fora.webm', 'audio/webm')
    await quota.ajustarArmazenamento(u, 999)

    expect(await quota.reconciliarArmazenamento(u)).toBe(4) // o HEAD falso responde 4 bytes
    expect(await quota.usoDeArmazenamento(u)).toBe(4)
  })
})
