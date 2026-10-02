/**
 * `operacao.cjs conta …` (`server/operacao/contas.ts`) contra o banco efêmero.
 *
 * O PRIMEIRO ADMIN: até aqui o papel `admin` só nascia de um `UPDATE` à mão no SQLite — a rota
 * `PATCH /api/admin/users/:id` exige um admin, e não havia nenhum. A CLI é a porta de fora.
 *
 * O que fica travado: só conta EXISTENTE recebe papel ou plano (nada de pré-provisionar privilégio
 * para um id que nunca entrou); o e-mail é resolvido pelo banco e, sem ele lá, pela Admin API do
 * Supabase; uso errado sai com 2 e falha com 1; a listagem não imprime e-mail.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

type Modulo = typeof import('../../server/operacao/contas')

let h: EphemeralDb
let comando: Modulo['comandoDeContas']
let usersRepo: typeof import('../../server/db/repositories/users').usersRepo
let subscriptionsRepo: typeof import('../../server/db/repositories/subscriptions').subscriptionsRepo
let asUserId: typeof import('../../server/lib/authContext').asUserId

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const NUNCA_ENTROU = '99999999-9999-4999-8999-999999999999'

const ENV_SEM_ADMIN = { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } as NodeJS.ProcessEnv
const ENV_COM_ADMIN = {
  SUPABASE_URL: 'https://projeto.supabase.co/',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico',
} as NodeJS.ProcessEnv

beforeAll(async () => {
  h = await setupEphemeralDb()
  comando = (await h.load<Modulo>('../../server/operacao/contas')).comandoDeContas
  usersRepo = (await h.load<typeof import('../../server/db/repositories/users')>('../../server/db/repositories/users'))
    .usersRepo
  subscriptionsRepo = (
    await h.load<typeof import('../../server/db/repositories/subscriptions')>(
      '../../server/db/repositories/subscriptions',
    )
  ).subscriptionsRepo
  asUserId = (await h.load<typeof import('../../server/lib/authContext')>('../../server/lib/authContext')).asUserId
  await usersRepo.ensure(asUserId(ANA))
  await usersRepo.ensure(asUserId(BIA), 'Bia@Exemplo.com')
})
afterAll(async () => {
  await h.cleanup()
})
beforeEach(async () => {
  await usersRepo.setRole(asUserId(ANA), 'user')
  await usersRepo.setRole(asUserId(BIA), 'user')
})

async function rodar(args: string[], deps: Parameters<Modulo['comandoDeContas']>[2] = { env: ENV_SEM_ADMIN }) {
  const out: string[] = []
  const err: string[] = []
  const codigo = await comando(args, { out: (l) => out.push(l), err: (l) => err.push(l) }, deps)
  return { codigo, out: out.join('\n'), err: err.join('\n') }
}

/** A Admin API do Supabase de mentira: `GET /auth/v1/admin/users` paginado. */
function adminFalso(paginas: Array<Array<{ id: string; email: string }>>, status = 200) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = new URL(String(url))
    const pagina = Number(u.searchParams.get('page') ?? '1')
    return new Response(JSON.stringify({ users: paginas[pagina - 1] ?? [] }), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
}

describe('conta papel', () => {
  it('pelo id: promove a admin e diz o que mudou', async () => {
    const r = await rodar(['papel', ANA, 'admin'])
    expect(r.codigo).toBe(0)
    expect(r.out).toContain(ANA)
    expect(r.out).toMatch(/user\s*→\s*admin/)
    expect(await usersRepo.getRole(asUserId(ANA))).toBe('admin')
  })

  it('id que nunca entrou no app: falha com 1 e NÃO cria a conta', async () => {
    const r = await rodar(['papel', NUNCA_ENTROU, 'admin'])
    expect(r.codigo).toBe(1)
    expect(r.err).toMatch(/não encontrada/)
    expect(await usersRepo.get(asUserId(NUNCA_ENTROU))).toBeUndefined()
  })

  it('pelo e-mail guardado no banco (sem diferenciar maiúsculas), sem ir à rede', async () => {
    const f = adminFalso([])
    const r = await rodar(['papel', 'bia@exemplo.com', 'support'], { env: ENV_COM_ADMIN, fetch: f })
    expect(r.codigo).toBe(0)
    expect(f).not.toHaveBeenCalled()
    expect(await usersRepo.getRole(asUserId(BIA))).toBe('support')
  })

  it('e-mail que o banco não tem: resolve pela Admin API do Supabase, com a chave de serviço', async () => {
    const outros = Array.from({ length: 200 }, (_, i) => ({ id: `outro-${i}`, email: `outro${i}@exemplo.com` }))
    const f = adminFalso([outros, [{ id: ANA, email: 'Ana@Exemplo.com' }]])
    const r = await rodar(['papel', 'ana@exemplo.com', 'admin'], { env: ENV_COM_ADMIN, fetch: f })
    expect(r.codigo).toBe(0)
    expect(await usersRepo.getRole(asUserId(ANA))).toBe('admin')
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    expect(String(url)).toMatch(/^https:\/\/projeto\.supabase\.co\/auth\/v1\/admin\/users\?/)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer chave-de-servico')
    // A chave nunca aparece na saída.
    expect(r.out + r.err).not.toContain('chave-de-servico')
  })

  it('e-mail do Supabase cuja conta nunca entrou no app: falha e não provisiona', async () => {
    const f = adminFalso([[{ id: NUNCA_ENTROU, email: 'novo@exemplo.com' }]])
    const r = await rodar(['papel', 'novo@exemplo.com', 'admin'], { env: ENV_COM_ADMIN, fetch: f })
    expect(r.codigo).toBe(1)
    expect(r.err).toMatch(/ainda não entrou/)
    expect(await usersRepo.get(asUserId(NUNCA_ENTROU))).toBeUndefined()
  })

  it('e-mail desconhecido no Supabase, ou só parecido: falha com 1', async () => {
    const f = adminFalso([[{ id: ANA, email: 'ana@exemplo.com.br' }]])
    const r = await rodar(['papel', 'ana@exemplo.com', 'admin'], { env: ENV_COM_ADMIN, fetch: f })
    expect(r.codigo).toBe(1)
    expect(r.err).toMatch(/nenhuma conta com esse e-mail/)
    expect(await usersRepo.getRole(asUserId(ANA))).toBe('user')
  })

  it('e-mail fora do banco e sem Admin API configurada: explica e pede o id', async () => {
    const r = await rodar(['papel', 'ana@exemplo.com', 'admin'])
    expect(r.codigo).toBe(1)
    expect(r.err).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    expect(r.err).toMatch(/id/)
  })

  it('Admin API respondendo erro: falha com 1, sem alterar nada', async () => {
    const r = await rodar(['papel', 'ana@exemplo.com', 'admin'], { env: ENV_COM_ADMIN, fetch: adminFalso([], 401) })
    expect(r.codigo).toBe(1)
    expect(r.err).toMatch(/401/)
  })

  it('tirar o último admin avisa (e faz: a CLI é a porta de volta)', async () => {
    await usersRepo.setRole(asUserId(ANA), 'admin')
    const r = await rodar(['papel', ANA, 'user'])
    expect(r.codigo).toBe(0)
    expect(r.err).toMatch(/nenhum admin/i)
    expect(await usersRepo.getRole(asUserId(ANA))).toBe('user')
  })

  it('papel inválido ou argumento faltando: uso errado, sai com 2', async () => {
    expect((await rodar(['papel', ANA, 'dono'])).codigo).toBe(2)
    expect((await rodar(['papel', ANA])).codigo).toBe(2)
    expect((await rodar(['papel'])).codigo).toBe(2)
    expect((await rodar([])).codigo).toBe(2)
    expect((await rodar(['inventado'])).codigo).toBe(2)
    expect(await usersRepo.getRole(asUserId(ANA))).toBe('user')
  })
})

describe('conta plano', () => {
  it('concede o Premium como a rota admin: assinatura ativa, sem provedor', async () => {
    const r = await rodar(['plano', ANA, 'premium'])
    expect(r.codigo).toBe(0)
    expect(r.out).toMatch(/premium/)
    const s = await subscriptionsRepo.getActive(asUserId(ANA))
    expect(s).toMatchObject({ plan: 'premium', status: 'active', provider: null })
  })

  it('volta para o free', async () => {
    await rodar(['plano', ANA, 'premium'])
    const r = await rodar(['plano', ANA, 'free'])
    expect(r.codigo).toBe(0)
    expect((await subscriptionsRepo.getActive(asUserId(ANA)))!.plan).toBe('free')
  })

  it('plano desconhecido sai com 2; conta inexistente, com 1 e sem assinatura criada', async () => {
    expect((await rodar(['plano', ANA, 'vitalicio'])).codigo).toBe(2)
    const r = await rodar(['plano', NUNCA_ENTROU, 'premium'])
    expect(r.codigo).toBe(1)
    expect(await subscriptionsRepo.getActive(asUserId(NUNCA_ENTROU))).toBeNull()
  })
})

describe('conta listar', () => {
  it('mostra id, papel, status e plano — e nenhum e-mail', async () => {
    await usersRepo.setRole(asUserId(ANA), 'admin')
    await rodar(['plano', ANA, 'premium'])
    const r = await rodar(['listar'])
    expect(r.codigo).toBe(0)
    const linhaDaAna = r.out.split('\n').find((l) => l.includes(ANA))!
    expect(linhaDaAna).toMatch(/admin\s+active\s+premium/)
    const linhaDaBia = r.out.split('\n').find((l) => l.includes(BIA))!
    expect(linhaDaBia).toMatch(/user\s+active\s+free/)
    expect(r.out).not.toMatch(/@/)
  })
})
