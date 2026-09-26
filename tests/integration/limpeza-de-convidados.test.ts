/**
 * EXPIRAÇÃO DOS CONVIDADOS (Fase 7) — `server/lib/limpezaDeConvidados.ts`, com relógio e Admin API
 * do Supabase falsos.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { diretivasDeCsp, HOST_DO_TURNSTILE } from '../../server/http/csp'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let limpeza: any
let repo: any
let counters: any
const DIA = 86_400_000
const AGORA = Date.UTC(2026, 10, 15, 3, 0, 0) // 15/11/2026
const salvo = { url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY }

beforeAll(async () => {
  h = await setupEphemeralDb()
  limpeza = await h.load('../../server/lib/limpezaDeConvidados')
  ;({ convidadosRepo: repo } = await h.load('../../server/db/repositories/convidados'))
  ;({ usageCountersRepo: counters } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => {
  await h.cleanup()
})
beforeEach(() => {
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})
afterEach(() => {
  if (salvo.url === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = salvo.url
  if (salvo.chave === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = salvo.chave
  vi.restoreAllMocks()
})

async function convidadoVisto(id: string, diasAtras: number): Promise<void> {
  const t = AGORA - diasAtras * DIA
  await repo.registrar(id, 'hash-' + id, t)
  await counters.increment(id, 'stt_seconds', '2026-11', 30)
  await counters.increment(id, 'stt_seconds', '2026-10', 60)
}

/** Admin API falsa: `estados[id]` diz o que o Supabase responde para cada usuário. */
function adminFalso(estados: Record<string, 'anonimo' | 'conta' | 'ausente' | 'erro'>) {
  const apagados: string[] = []
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    const id = decodeURIComponent(String(url).split('/').pop() ?? '')
    const e = estados[id]
    if (init?.method === 'DELETE') {
      apagados.push(id)
      return new Response(null, { status: 200 })
    }
    if (e === 'erro') return new Response('x', { status: 500 })
    if (e === 'ausente') return new Response('{}', { status: 404 })
    return new Response(JSON.stringify({ id, is_anonymous: e === 'anonimo' }), { status: 200 })
  })
  return { f, apagados }
}

describe('limpeza de convidados inativos', () => {
  it('com Admin API: anônimo inativo há 30+ dias é apagado no Supabase, com contadores e registro', async () => {
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste'
    await convidadoVisto('velho-anon', 31)
    await convidadoVisto('recente-anon', 5)
    const { f, apagados } = adminFalso({ 'velho-anon': 'anonimo', 'recente-anon': 'anonimo' })

    const r = await limpeza.limparConvidadosInativos({ agora: AGORA, fetch: f })

    expect(r).toMatchObject({ removidos: 1, usuariosApagados: 1, convertidos: 0, falhas: 0 })
    expect(apagados).toEqual(['velho-anon'])
    expect(await repo.ler('velho-anon')).toBeUndefined()
    expect(await repo.lerContador('velho-anon', 'stt_seconds', '2026-11')).toBe(0)
    // O recente fica intacto.
    expect(await repo.ler('recente-anon')).toBeTruthy()
    expect(await repo.lerContador('recente-anon', 'stt_seconds', '2026-11')).toBe(30)
  })

  it('id que virou conta (conversão mantém o id): só o registro de convidado sai, os contadores ficam', async () => {
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste'
    await convidadoVisto('virou-conta', 40)
    const { f, apagados } = adminFalso({ 'virou-conta': 'conta' })

    const r = await limpeza.limparConvidadosInativos({ agora: AGORA, fetch: f })

    expect(r.convertidos).toBe(1)
    expect(apagados).toEqual([])
    expect(await repo.ler('virou-conta')).toBeUndefined()
    expect(await repo.lerContador('virou-conta', 'stt_seconds', '2026-11')).toBe(30)
  })

  it('Admin API fora do ar: nada é apagado e a passada não entra em laço', async () => {
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste'
    await convidadoVisto('admin-fora', 45)
    const { f } = adminFalso({ 'admin-fora': 'erro' })

    const r = await limpeza.limparConvidadosInativos({ agora: AGORA, fetch: f, lote: 10, maxLotes: 5 })

    expect(r.falhas).toBe(1)
    expect(f).toHaveBeenCalledTimes(1)
    expect(await repo.ler('admin-fora')).toBeTruthy()
    await repo.apagarComContadores(['admin-fora'])
  })

  it('sem Admin API: apaga o registro e só os contadores de meses anteriores', async () => {
    await convidadoVisto('sem-admin', 60)
    const f = vi.fn()

    const r = await limpeza.limparConvidadosInativos({ agora: AGORA, fetch: f })

    expect(r.semAdmin).toBe(1)
    expect(f).not.toHaveBeenCalled()
    expect(await repo.ler('sem-admin')).toBeUndefined()
    expect(await repo.lerContador('sem-admin', 'stt_seconds', '2026-10')).toBe(0)
    expect(await repo.lerContador('sem-admin', 'stt_seconds', '2026-11')).toBe(30)
  })

  it('poda os contadores diários (IP pseudonimizado e pool) de mais de 2 dias', async () => {
    await counters.increment('convidado-ip:abc', 'gasto_micro_usd', '2026-11-10', 100)
    await counters.increment('convidado-ip:abc', 'gasto_micro_usd', '2026-11-14', 100)
    await counters.increment('pool-gratuito', 'gasto_micro_usd', '2026-11-01', 100)

    await limpeza.limparConvidadosInativos({ agora: AGORA, fetch: vi.fn() })

    expect(await repo.lerContador('convidado-ip:abc', 'gasto_micro_usd', '2026-11-10')).toBe(0)
    expect(await repo.lerContador('convidado-ip:abc', 'gasto_micro_usd', '2026-11-14')).toBe(100)
    expect(await repo.lerContador('pool-gratuito', 'gasto_micro_usd', '2026-11-01')).toBe(0)
  })
})

describe('CSP do Turnstile', () => {
  it('sem VITE_TURNSTILE_SITE_KEY, o host do Cloudflare não entra', () => {
    const d = diretivasDeCsp({} as NodeJS.ProcessEnv)
    expect(d.scriptSrc).not.toContain(HOST_DO_TURNSTILE)
    expect(d.connectSrc).not.toContain(HOST_DO_TURNSTILE)
    expect(d.frameSrc).toBeUndefined()
  })

  it('com a chave, script, conexão e frame liberam challenges.cloudflare.com', () => {
    const d = diretivasDeCsp({ VITE_TURNSTILE_SITE_KEY: '0x4AAA' } as NodeJS.ProcessEnv)
    expect(d.scriptSrc).toContain(HOST_DO_TURNSTILE)
    expect(d.connectSrc).toContain(HOST_DO_TURNSTILE)
    expect(d.frameSrc).toEqual(["'self'", HOST_DO_TURNSTILE])
  })
})
