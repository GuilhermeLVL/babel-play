/**
 * F9-01 — a conta se recriava sozinha depois da exclusão.
 *
 * `DELETE /api/me` apagava as 17 tabelas, mas quem ainda tivesse JWT válido do Supabase
 * reprovisionava uma conta nova e VAZIA na requisição seguinte (`usersRepo.ensure` no GET de
 * entitlements). O dado saía; o vínculo de login, não.
 *
 * O que este arquivo amarra:
 *  1. sem `SUPABASE_SERVICE_ROLE_KEY`, a resposta NÃO finge sucesso — diz que o vínculo sobreviveu
 *     e por quê (mesma doutrina do P1-9: confirmar o que não aconteceu é o pior desfecho);
 *  2. com a variável, o servidor chama a Admin API por `fetch` (sem `@supabase/supabase-js`), no
 *     endpoint e com os cabeçalhos certos;
 *  3. em self-host (`AUTH_REQUIRED` desligado) não existe vínculo externo e a resposta é `ok`.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let router: any
let usersRepo: any

const ENV = {
  AUTH_REQUIRED: process.env.AUTH_REQUIRED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ meRouter: router } = await h.load('../../server/routes/me'))
  ;({ usersRepo } = await h.load('../../server/db/repositories/users'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => {
  vi.restoreAllMocks()
  for (const [k, v] of Object.entries(ENV)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  r.setHeader = () => r
  return r
}
async function excluir(userId: string) {
  const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.delete)
  const res = fakeRes()
  await layer.route.stack[0].handle({ path: '/', userId: asUserId(userId), body: { confirmar: true } } as any, res)
  return res
}

describe('DELETE /api/me — vínculo de login (F9-01)', () => {
  it('modo público SEM a service role key: avisa que o login sobreviveu, não finge sucesso', async () => {
    process.env.AUTH_REQUIRED = '1'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await usersRepo.ensure(asUserId('f9-sem-chave'))

    const res = await excluir('f9-sem-chave')

    expect(res.statusCode).toBe(500)
    expect(res.body.ok).toBe(false)
    expect(res.body.login.desvinculado).toBe(false)
    expect(String(res.body.login.motivo)).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
    // O aviso precisa dizer o que acontece de fato: entrar de novo recria uma conta VAZIA.
    expect(String(res.body.login.aviso)).toMatch(/vazia/i)
    expect(String(res.body.error)).toMatch(/vínculo de login sobreviveu/i)
    // E o dado, esse SAIU — o relatório por tabela continua sendo devolvido.
    expect(res.body.totalDeLinhas).toBeGreaterThan(0)
  })

  it('com a URL mas sem a chave, também avisa (configuração pela metade não vale)', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    await usersRepo.ensure(asUserId('f9-meia-config'))

    const res = await excluir('f9-meia-config')

    expect(res.statusCode).toBe(500)
    expect(res.body.login.desvinculado).toBe(false)
  })

  it('configurado: chama a Admin API por fetch, no endpoint e com os cabeçalhos certos', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.SUPABASE_URL = 'https://projeto.supabase.co/'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste'
    await usersRepo.ensure(asUserId('f9-ok'))

    const espiao = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const res = await excluir('f9-ok')

    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.login).toEqual({ desvinculado: true })

    expect(espiao).toHaveBeenCalledTimes(1)
    const [url, init] = espiao.mock.calls[0] as [string, RequestInit]
    // A barra final da SUPABASE_URL não pode virar `//auth/v1`.
    expect(url).toBe('https://projeto.supabase.co/auth/v1/admin/users/f9-ok')
    expect(init.method).toBe('DELETE')
    const hdr = init.headers as Record<string, string>
    expect(hdr.Authorization).toBe('Bearer service-role-de-teste')
    expect(hdr.apikey).toBe('service-role-de-teste')
  })

  it('404 na Admin API = o usuário já não existe lá; o vínculo está desfeito', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    await usersRepo.ensure(asUserId('f9-404'))

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    const res = await excluir('f9-404')

    expect(res.statusCode).toBe(200)
    expect(res.body.login.desvinculado).toBe(true)
  })

  it('Admin API recusando (401) é reportado, não engolido', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-errada'
    await usersRepo.ensure(asUserId('f9-401'))

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    const res = await excluir('f9-401')

    expect(res.statusCode).toBe(500)
    expect(res.body.login.desvinculado).toBe(false)
    expect(String(res.body.login.motivo)).toMatch(/401/)
  })

  it('rede fora do ar também é reportado', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    await usersRepo.ensure(asUserId('f9-rede'))

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await excluir('f9-rede')

    expect(res.statusCode).toBe(500)
    expect(String(res.body.login.motivo)).toMatch(/ECONNREFUSED/)
  })

  it('self-host (sem AUTH_REQUIRED): não há vínculo externo, e nenhuma chamada é feita', async () => {
    delete process.env.AUTH_REQUIRED
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    await usersRepo.ensure(asUserId('f9-local'))

    const espiao = vi.spyOn(globalThis, 'fetch')
    const res = await excluir('f9-local')

    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.login).toEqual({ desvinculado: true })
    expect(espiao).not.toHaveBeenCalled()
  })
})
