// @vitest-environment jsdom
/**
 * excluirConta() encerra a sessão SÓ neste aparelho (`scope: 'local'`) e SÓ quando a conta sumiu.
 *
 * Com a exclusão confirmada, o token ainda vale até expirar e qualquer chamada recriaria uma linha
 * vazia: por isso o signOut. Com falha (a conta continua existindo), sair seria esconder do titular
 * que a exclusão não aconteceu. Lacuna achada na auditoria: nada cobria nenhum dos dois lados.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => ({ signOut: vi.fn(async () => ({})) }))
const api = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: supa }, authRequired: true }))
vi.mock('../src/data/funil', () => ({ apiFetch: api.apiFetch }))

import { excluirConta } from '../src/data/rotas/conta'

const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status })

beforeEach(() => {
  supa.signOut.mockClear()
  api.apiFetch.mockReset()
})

describe('excluirConta e o signOut', () => {
  it('resposta ok: chama signOut({ scope: "local" }) uma vez, e nunca o global', async () => {
    api.apiFetch.mockResolvedValue(json(200, { ok: true, totalDeLinhas: 3 }))
    const r = await excluirConta()
    expect(r.ok).toBe(true)
    expect(supa.signOut).toHaveBeenCalledTimes(1)
    expect(supa.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('HTTP não ok: NÃO chama signOut', async () => {
    api.apiFetch.mockResolvedValue(json(500, { error: 'falhou' }))
    const r = await excluirConta()
    expect(r.ok).toBe(false)
    expect(supa.signOut).not.toHaveBeenCalled()
  })

  it('HTTP 200 mas corpo com ok:false (exclusão pela metade): NÃO chama signOut', async () => {
    api.apiFetch.mockResolvedValue(json(200, { ok: false, login: { desvinculado: false } }))
    const r = await excluirConta()
    expect(r.ok).toBe(false)
    expect(supa.signOut).not.toHaveBeenCalled()
  })

  it('falha de rede: NÃO chama signOut e devolve o erro', async () => {
    api.apiFetch.mockRejectedValue(new Error('sem rede'))
    const r = await excluirConta()
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('sem rede') })
    expect(supa.signOut).not.toHaveBeenCalled()
  })

  it('o signOut que rejeita não derruba o resultado de uma exclusão que deu certo', async () => {
    api.apiFetch.mockResolvedValue(json(200, { ok: true }))
    supa.signOut.mockRejectedValueOnce(new Error('auth fora do ar'))
    expect((await excluirConta()).ok).toBe(true)
  })
})
