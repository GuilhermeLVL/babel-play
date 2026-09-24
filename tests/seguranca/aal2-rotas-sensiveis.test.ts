/**
 * 2FA DE VERDADE (Fase 6) — quem ativou a verificação em duas etapas precisa de sessão AAL2 nas
 * rotas sensíveis.
 *
 * Até aqui o 2FA existia só na tela: o login com e-mail e senha entregava um token `aal1` e o
 * servidor aceitava esse token em tudo — assinar e cancelar plano, excluir e exportar a conta,
 * guardar chave de API. Quem roubasse a senha de uma conta com 2FA fazia tudo isso sem o segundo
 * fator. Agora o servidor lê o claim `aal` do JWT do Supabase e, se a conta tem fator TOTP
 * verificado, exige `aal2` nessas rotas. Contas sem 2FA seguem como antes.
 *
 * O "tem fator verificado?" vem da Admin API do Supabase; aqui ela é simulada interceptando o
 * `fetch` só para o host do projeto de teste.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp, URL_SUPABASE_TESTE } from '../caracterizacao/_app'

const COM_2FA = 'usuario-com-2fa'
const SEM_2FA = 'usuario-sem-2fa'
const ADMIN_FORA = 'usuario-admin-fora-do-ar'

let s: AppDeTeste
const fetchOriginal = globalThis.fetch
let consultasAdmin = 0
let chaveAnterior: string | undefined

beforeAll(async () => {
  chaveAnterior = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-teste'
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada)
    if (!url.startsWith(URL_SUPABASE_TESTE)) return fetchOriginal(entrada as RequestInfo, init)
    consultasAdmin += 1
    const m = /\/auth\/v1\/admin\/users\/([^/?]+)/.exec(url)
    const id = m ? decodeURIComponent(m[1]) : ''
    if (id === ADMIN_FORA) return new Response('erro', { status: 500 })
    const fatores = id === COM_2FA ? [{ id: 'f1', factor_type: 'totp', status: 'verified' }] : []
    return new Response(JSON.stringify({ id, factors: fatores }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  s = await subirApp({ modo: 'publico' })
}, 60_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await s.encerrar()
  if (chaveAnterior === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = chaveAnterior
})

/** `POST /api/billing/cancelar` sem assinatura responde 4xx de negócio — o que importa é não ser o 403 do AAL. */
const cancelar = (token: string) => s.chamar('POST', '/api/billing/cancelar', { token, body: {} })

describe('AAL2 nas rotas sensíveis', () => {
  it('conta COM 2FA e token aal1: cobrança recusada com 403 aal2_requerido', async () => {
    const r = await cancelar(await s.token(COM_2FA, { aal: 'aal1' }))
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('aal2_requerido')
  })

  it('conta COM 2FA e token aal1: exclusão de conta, exportação e credencial BYOK também', async () => {
    const t = await s.token(COM_2FA, { aal: 'aal1' })
    const excluir = await s.chamar('DELETE', '/api/me', { token: t, body: { confirmar: true } })
    const exportar = await s.chamar('GET', '/api/me/exportar', { token: t })
    const credencial = await s.chamar('POST', '/api/ai/credentials', { token: t, body: { label: 'x', secret: 'sk-x' } })
    expect([excluir.status, exportar.status, credencial.status]).toEqual([403, 403, 403])
  })

  it('conta COM 2FA e token aal2: passa', async () => {
    const r = await cancelar(await s.token(COM_2FA, { aal: 'aal2' }))
    expect(r.status).not.toBe(403)
  })

  it('conta SEM 2FA e token aal1: passa (nada muda para quem não ativou)', async () => {
    const r = await cancelar(await s.token(SEM_2FA, { aal: 'aal1' }))
    expect(r.status).not.toBe(403)
  })

  it('rota NÃO sensível não consulta nada e não exige aal2', async () => {
    const antes = consultasAdmin
    const r = await s.get('/api/settings', await s.token(COM_2FA, { aal: 'aal1' }))
    expect(r.status).toBe(200)
    expect(consultasAdmin).toBe(antes)
  })

  it('token aal2 nem consulta a Admin API', async () => {
    const antes = consultasAdmin
    await cancelar(await s.token('outra-conta-aal2', { aal: 'aal2' }))
    expect(consultasAdmin).toBe(antes)
  })

  it('Admin API fora do ar: falha FECHADA com 503 (não libera a rota sensível)', async () => {
    const r = await cancelar(await s.token(ADMIN_FORA, { aal: 'aal1' }))
    expect(r.status).toBe(503)
  })
})
