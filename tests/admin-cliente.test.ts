/**
 * O CLIENTE FINO DA ADMINISTRAÇÃO (`src/lib/admin.ts`) e o controle de visibilidade da tela.
 *
 * A decisão de quem pode é do servidor (403). Aqui se trava o que o cliente promete: cada função
 * fala com a rota certa, com o método certo e o corpo certo; erro vira dado (nunca lança); o 403 do
 * segundo fator é reconhecido; e o item de menu e a rota `/admin` só existem para quem tem papel admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
let semRede = false
vi.mock('../src/data/funil', () => ({
  apiFetch: (...a: unknown[]) => (semRede ? Promise.reject(new TypeError('Failed to fetch')) : apiFetch(...a)),
  lerErro: async (res: Response) => {
    const c = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    return { status: res.status, error: c.error ?? `o servidor respondeu ${res.status}`, code: c.code }
  },
}))

import { ITEM_ADMIN } from '../src/components/shell/navItems'
import * as admin from '../src/lib/admin'
import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  apiFetch.mockReset()
  semRede = false
})

describe('leituras', () => {
  it('lê o resumo, o orçamento de IA, as contas, as pendências, os erros e as flags nas rotas certas', async () => {
    apiFetch.mockImplementation(async () => resposta(200, []))
    await admin.lerResumo()
    await admin.lerOrcamentoDeIa()
    await admin.listarContas()
    await admin.listarPendencias()
    await admin.lerErros(50)
    await admin.listarFlags()
    expect(apiFetch.mock.calls.map((c) => c[0])).toEqual([
      '/api/admin/resumo',
      '/api/admin/ia',
      '/api/admin/users',
      '/api/admin/billing/pendentes',
      '/api/admin/erros?limite=50',
      '/api/admin/flags',
    ])
  })

  it('devolve os dados quando o servidor responde 200', async () => {
    apiFetch.mockResolvedValue(resposta(200, { usuarios: 3 }))
    expect(await admin.lerResumo()).toEqual({ ok: true, dados: { usuarios: 3 } })
  })

  it('o id da conta vai codificado no caminho', async () => {
    apiFetch.mockResolvedValue(resposta(200, { user: {}, subscription: null }))
    await admin.lerConta('a/b c')
    expect(apiFetch.mock.calls[0][0]).toBe('/api/admin/users/a%2Fb%20c')
  })
})

describe('escritas', () => {
  it('troca papel e status com PATCH e só os campos informados', async () => {
    apiFetch.mockResolvedValue(resposta(200, {}))
    await admin.alterarConta('u1', { status: 'suspended' })
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/admin/users/u1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'suspended' })
  })

  it('concede o plano em /plan', async () => {
    apiFetch.mockResolvedValue(resposta(200, {}))
    await admin.concederPlano('u1', 'premium')
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/admin/users/u1/plan')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ plan: 'premium' })
  })

  it('reprocessa uma pendência com POST', async () => {
    apiFetch.mockResolvedValue(resposta(200, { ok: true, estado: 'aplicado' }))
    const r = await admin.reprocessar('evt_1')
    expect(apiFetch.mock.calls[0][0]).toBe('/api/admin/billing/reprocessar/evt_1')
    expect(apiFetch.mock.calls[0][1].method).toBe('POST')
    expect(r).toEqual({ ok: true, dados: { ok: true, estado: 'aplicado' } })
  })

  it('a flag é gravada com PUT, só com `habilitada`', async () => {
    apiFetch.mockResolvedValue(resposta(200, {}))
    await admin.alterarFlag('voz_natural', true)
    const [url, init] = apiFetch.mock.calls[0]
    expect(url).toBe('/api/admin/flags/voz_natural')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ habilitada: true })
  })
})

describe('erros', () => {
  it('a recusa vira dado com a mensagem do servidor', async () => {
    apiFetch.mockResolvedValue(resposta(400, { error: 'não é possível remover o próprio acesso de admin' }))
    expect(await admin.alterarConta('eu', { status: 'suspended' })).toEqual({
      ok: false,
      status: 400,
      erro: 'não é possível remover o próprio acesso de admin',
      segundoFator: false,
    })
  })

  it('reconhece o 403 do segundo fator', async () => {
    apiFetch.mockResolvedValue(resposta(403, { error: 'confirme o código', code: 'aal2_requerido' }))
    const r = await admin.listarContas()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.segundoFator).toBe(true)
  })

  it('403 de papel (sem o código) não é pedido de segundo fator', async () => {
    apiFetch.mockResolvedValue(resposta(403, { error: 'acesso restrito' }))
    const r = await admin.listarContas()
    if (!r.ok) expect(r.segundoFator).toBe(false)
  })

  it('falha de rede não lança', async () => {
    semRede = true
    const r = await admin.listarContas()
    expect(r.ok).toBe(false)
    expect(r.status).toBe(0)
  })
})

describe('visibilidade', () => {
  it('só o papel admin vê a administração', () => {
    expect(admin.ehAdmin({ role: 'admin' })).toBe(true)
    expect(admin.ehAdmin({ role: 'support' })).toBe(false)
    expect(admin.ehAdmin({ role: 'user' })).toBe(false)
    expect(admin.ehAdmin(null)).toBe(false)
  })

  it('o item de menu aponta para a view admin', () => {
    expect(ITEM_ADMIN.id).toBe('admin')
  })

  it('/admin é uma rota de ida e volta', () => {
    expect(urlParaEstado('/admin')).toEqual({ view: 'admin' })
    expect(estadoParaUrl({ view: 'admin' })).toBe('/admin')
  })
})
