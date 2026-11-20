/**
 * AS TRAVAS DE BOOT NO WORKER (`server/boot/portaoDoWorker.ts`). No Worker não há processo para encerrar:
 * enquanto `validarBoot()` tiver achado que aborta, o `worker.ts` responde 503 `boot_falhou` em toda `/api/*`
 * e confere de novo na requisição seguinte. Aqui, com o Node no papel do Worker (`BABEL_RUNTIME=worker`):
 * `SECRET_KEY` ausente em produção trava, nenhuma chave é derivada, e o conserto vale sem reciclar o isolate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dubleDoR2 } from '../harness/workers/r2Duble'

const CHAVES = [
  'SUPABASE_URL',
  'BABEL_RUNTIME',
  'NODE_ENV',
  'AUTH_REQUIRED',
  'SECRET_KEY',
  'IA_PROVEDORES',
  'IA_PROVEDORES_ARQUIVO',
]
const antes: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of CHAVES) antes[k] = process.env[k]
  vi.resetModules()
  process.env.BABEL_RUNTIME = 'worker'
  process.env.NODE_ENV = 'production'
  process.env.AUTH_REQUIRED = '1'
  delete process.env.SECRET_KEY
  delete process.env.IA_PROVEDORES
  delete process.env.IA_PROVEDORES_ARQUIVO
})

afterEach(async () => {
  const { ligarBucketDoR2 } = await import('../../server/lib/armazenamentoR2')
  ligarBucketDoR2(null)
  for (const k of CHAVES) {
    if (antes[k] === undefined) delete process.env[k]
    else process.env[k] = antes[k]
  }
})

async function carregar() {
  const { ligarBucketDoR2 } = await import('../../server/lib/armazenamentoR2')
  ligarBucketDoR2(dubleDoR2())
  const { conferirBootDoWorker } = await import('../../server/boot/portaoDoWorker')
  const { obterChave } = await import('../../server/crypto')
  return { conferirBootDoWorker, obterChave }
}

describe('portão de boot do Worker', () => {
  it('SECRET_KEY ausente em produção: trava, não deriva chave e passa quando a chave chega', async () => {
    const { conferirBootDoWorker, obterChave } = await carregar()
    const achados = conferirBootDoWorker()
    expect(achados?.map((a) => a.texto).join(' ')).toMatch(/SECRET_KEY ausente em produção/)
    expect(() => obterChave()).toThrow(/SECRET_KEY/) // o fracasso não deixou chave nenhuma guardada
    expect(conferirBootDoWorker()).not.toBeNull() // e não foi memoizado como "passou"

    process.env.SECRET_KEY = 'a'.repeat(64)
    expect(conferirBootDoWorker()).toBeNull()
    expect(obterChave()).toHaveLength(32)
  })

  it('SECRET_KEY=hkdf:abc (malformada): o portão aborta e a /api/* recebe o 503 boot_falhou', async () => {
    process.env.SECRET_KEY = 'hkdf:abc'
    const { conferirBootDoWorker } = await carregar()
    const achados = conferirBootDoWorker()
    expect(achados?.some((a) => a.nivel === 'aborta' && /hkdf/.test(a.texto))).toBe(true)
    expect(conferirBootDoWorker()).not.toBeNull() // continua travado; não cai no scrypt

    vi.doMock('cloudflare:node', () => ({ httpServerHandler: () => ({ fetch: vi.fn() }) })) // só existe no runtime
    const { default: worker } = await import('../../worker')
    const assets = vi.fn(async () => new Response('spa'))
    const r = await worker.fetch(
      new Request('https://app.test/api/me'),
      { HYPERDRIVE: { connectionString: 'postgres://x' }, MIDIA: dubleDoR2(), ASSETS: { fetch: assets } },
      { waitUntil: () => undefined },
    )
    expect(r.status).toBe(503)
    expect(await r.json()).toMatchObject({ code: 'boot_falhou' })
    expect(assets).not.toHaveBeenCalled()
  })

  it('IA_PROVEDORES_ARQUIVO no Worker trava com o motivo (não há disco; só IA_PROVEDORES)', async () => {
    process.env.SECRET_KEY = 'a'.repeat(64)
    process.env.IA_PROVEDORES_ARQUIVO = 'ops/ia-provedores.json'
    const { conferirBootDoWorker } = await carregar()
    expect(
      conferirBootDoWorker()
        ?.map((a) => a.texto)
        .join(' '),
    ).toMatch(/IA_PROVEDORES_ARQUIVO não vale no Worker/)
  })

  it('variável impede-servico ausente no Worker → /api/health boot degraded com o nome dela', async () => {
    process.env.SECRET_KEY = 'a'.repeat(64)
    delete process.env.SUPABASE_URL
    const { conferirBootDoWorker } = await carregar()
    expect(conferirBootDoWorker()).toBeNull() // falta de configuração não derruba: degrada
    const { healthHandler } = await import('../../server/routes/health')
    let corpo: Record<string, unknown> = {}
    const res = {
      status: () => res,
      json: (c: Record<string, unknown>) => {
        corpo = c
      },
    }
    await healthHandler({} as never, res as never)
    expect(corpo.boot).toBe('degraded')
    expect(corpo.bootErros).toContain('configuracao')
  })

  it('relatarConfiguracao roda uma vez por isolate', async () => {
    process.env.SECRET_KEY = 'a'.repeat(64)
    const eventos: string[] = []
    const espia = vi.spyOn(console, 'log').mockImplementation((l: unknown) => {
      try {
        eventos.push(JSON.parse(String(l)).event)
      } catch {
        /* linha que não é do logger */
      }
    })
    const { conferirBootDoWorker } = await carregar()
    expect(conferirBootDoWorker()).toBeNull()
    expect(conferirBootDoWorker()).toBeNull()
    espia.mockRestore()
    expect(eventos.filter((e) => e === 'configuracao')).toHaveLength(1)
  })

  it('relatarConfiguracao que lança não vira 500 em toda /api/*: loga e libera o isolate', async () => {
    process.env.SECRET_KEY = 'a'.repeat(64)
    vi.doMock('../../server/boot/validar', async (original) => ({
      ...(await original<typeof import('../../server/boot/validar')>()),
      relatarConfiguracao: () => {
        throw new Error('relatório quebrou')
      },
    }))
    const eventos: string[] = []
    const espia = vi.spyOn(console, 'error').mockImplementation((l: unknown) => {
      try {
        eventos.push(JSON.parse(String(l)).event)
      } catch {
        /* linha que não é do logger */
      }
    })
    try {
      const { conferirBootDoWorker } = await carregar()
      expect(conferirBootDoWorker()).toBeNull()
      expect(conferirBootDoWorker()).toBeNull()
    } finally {
      espia.mockRestore()
      vi.doUnmock('../../server/boot/validar')
    }
    expect(eventos.filter((e) => e === 'configuracao_falhou')).toHaveLength(1)
  })
})
