/**
 * AVISO A 80 % DO TETO DO R2 (`openspec/changes/r2-teto-de-uso`, requisito "Aviso a 80 % e reversão
 * por variável"). `r2_teto_alerta_80` sai UMA vez por processo e por janela, `r2_teto_recusa` a cada
 * recusa, e o gauge `r2_uso_fracao{recurso}` aparece no scrape.
 *
 * Arquivo próprio de propósito: a marca "já avisei" é do processo (estado do módulo), e cada arquivo de
 * teste tem os seus módulos.
 */
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const MB = 1024 * 1024
const S3 = {
  S3_ENDPOINT: 'http://r2-falso.invalid',
  S3_BUCKET: 'midia-teste',
  S3_ACCESS_KEY_ID: 'chave-de-teste',
  S3_SECRET_ACCESS_KEY: 'segredo-de-teste',
}
const ENVS = ['AUTH_REQUIRED', 'FREE_STORAGE_MB', 'R2_TETO_MB', ...Object.keys(S3)]
const salvos = Object.fromEntries(ENVS.map((n) => [n, process.env[n]]))

let h: EphemeralDb
let quota: any
let teto: typeof import('../../server/lib/tetoDoR2')
let m: typeof import('../../server/http/metricas')
let logger: typeof import('../../server/lib/logger')
let contadores: any
let promClient: typeof import('prom-client')

beforeAll(async () => {
  Object.assign(process.env, S3)
  process.env.AUTH_REQUIRED = '1'
  process.env.FREE_STORAGE_MB = '100000'
  h = await setupEphemeralDb()
  quota = await h.load('../../server/lib/storageQuota')
  teto = await h.load('../../server/lib/tetoDoR2')
  logger = await h.load('../../server/lib/logger')
  m = await h.load('../../server/http/metricas')
  ;({ usageCountersRepo: contadores } = await h.load('../../server/db/repositories/usageCounters'))
  promClient = await import('prom-client')
  m.esquecerMetricas()
  m.handlerDeMetricas()
})

afterEach(() => vi.restoreAllMocks())

afterAll(async () => {
  m.esquecerMetricas()
  for (const [k, v] of Object.entries(salvos)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await h.cleanup()
})

/** Os eventos JSON de um espião de `console.*`. */
const eventos = (espiao: { mock: { calls: unknown[][] } }) =>
  espiao.mock.calls.map((c) => {
    try {
      return JSON.parse(String(c[0])) as Record<string, unknown>
    } catch {
      return {}
    }
  })

function valor(corpo: string, prefixo: string): number | undefined {
  const linha = corpo.split('\n').find((l) => l.startsWith(prefixo))
  return linha === undefined ? undefined : Number(linha.slice(linha.lastIndexOf(' ') + 1))
}

function storeFalso() {
  return {
    tipo: 's3' as const,
    gravar: async () => {},
    gravarDeArquivo: async () => {},
    ler: async () => Buffer.from('x'),
    lerFaixa: async () => Readable.from(Buffer.from('x')),
    remover: async () => {},
    tamanho: async () => 1,
    sondar: async () => {},
  }
}

describe('armazenamento: aproximação do teto', () => {
  it('passar de 80 % de R2_TETO_MB loga r2_teto_alerta_80 (recurso = armazenamento) uma vez, e o gauge mostra a fração', async () => {
    process.env.R2_TETO_MB = '100'
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const u = asUserId(`r2alerta-${randomUUID().slice(0, 8)}`)

    expect((await quota.reservarArmazenamento(u, 70 * MB)).ok).toBe(true) // 70 %
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_alerta_80')).toEqual([])

    expect((await quota.reservarArmazenamento(u, 15 * MB)).ok).toBe(true) // 85 %
    expect((await quota.reservarArmazenamento(u, 1 * MB)).ok).toBe(true) // 86 %: repetir não repete
    const alertas = eventos(avisos).filter((e) => e.event === 'r2_teto_alerta_80')
    expect(alertas).toHaveLength(1)
    expect(alertas[0]).toMatchObject({ recurso: 'armazenamento', usado: 85 * MB, teto: 100 * MB })

    const corpo = await promClient.register.metrics()
    expect(valor(corpo, 'r2_uso_fracao{recurso="armazenamento"}')).toBeCloseTo(0.86, 5)
  })

  it('a recusa pela conta loga r2_teto_recusa', async () => {
    process.env.R2_TETO_MB = '100'
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await quota.reservarArmazenamento(asUserId(`r2alerta-${randomUUID().slice(0, 8)}`), 50 * MB)
    expect(r).toMatchObject({ ok: false, motivo: 'conta' })
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_recusa')).toEqual([
      expect.objectContaining({ recurso: 'armazenamento' }),
    ])
  })
})

describe('operações: aproximação do teto', () => {
  it('80 % do teto de A avisa uma vez por janela; outra janela avisa de novo; a recusa loga r2_teto_recusa', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let agora = '2102-01-10T00:00:00Z'
    const s = teto.comTetoDeOperacoes(storeFalso(), {
      tetos: { bytes: Infinity, opsA: 10, opsB: 100 },
      agora: () => new Date(agora),
    })
    for (let i = 0; i < 7; i++) await s.gravar('x', Buffer.from('a'), 'audio/webm')
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_alerta_80')).toEqual([])
    await s.gravar('x', Buffer.from('a'), 'audio/webm') // 8 de 10
    await s.gravar('x', Buffer.from('a'), 'audio/webm') // 9 de 10: não repete
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_alerta_80')).toEqual([
      expect.objectContaining({ recurso: 'ops_a', usado: 8, teto: 10 }),
    ])
    const corpo = await promClient.register.metrics()
    expect(valor(corpo, 'r2_uso_fracao{recurso="ops_a"}')).toBeCloseTo(0.9, 5)

    await s.gravar('x', Buffer.from('a'), 'audio/webm') // 10 de 10
    await expect(s.gravar('x', Buffer.from('a'), 'audio/webm')).rejects.toBeInstanceOf(teto.ErroDeTetoDoR2)
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_recusa')).toEqual([
      expect.objectContaining({ recurso: 'ops_a', teto: 10 }),
    ])

    agora = '2102-02-01T00:00:00Z'
    await contadores.increment(asUserId('__r2__'), 'r2_ops_a', '2102-02', 7)
    await s.gravar('x', Buffer.from('a'), 'audio/webm')
    expect(eventos(avisos).filter((e) => e.event === 'r2_teto_alerta_80')).toHaveLength(2)
  })

  it('o aviso de 80 % chega aos destinos externos (AVISOS_QUE_ALERTAM)', () => {
    expect(logger.AVISOS_QUE_ALERTAM.has('r2_teto_alerta_80')).toBe(true)
  })
})
