/**
 * O TEMPO DO CLIENTE NA EXPLICAÇÃO (revisão de 25/10/2026). O servidor fecha a cascata da explicação em 30 s
 * (`PRAZO_TOTAL_MS`); o cliente desiste em 35 s, DEPOIS dele, e a desistência vira o mesmo `indisponivel` de
 * qualquer falha de rede — a folha diz "Não deu para explicar agora." e nada lança.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../src/data/funil', async (orig) => ({
  ...(await orig<typeof import('../src/data/funil')>()),
  apiFetch: (input: string, init?: unknown) => apiFetch(input, init),
}))

import { PRAZO_TOTAL_MS } from '../server/ai/nucleo/explicarFrase'
import { explicarFrase, TEMPO_DA_EXPLICACAO_MS } from '../src/data/apiDoEstudo'

const pedido = { texto: 'Hello.', traducao: 'Olá.', lang: 'en', langDaTraducao: 'pt-BR' }

afterEach(() => apiFetch.mockReset())

describe('explicarFrase no cliente: o tempo de espera', () => {
  it('espera 35 s — mais que o prazo total do servidor (30 s)', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 502 }))
    await explicarFrase(pedido)
    expect(TEMPO_DA_EXPLICACAO_MS).toBe(35_000)
    expect(TEMPO_DA_EXPLICACAO_MS).toBeGreaterThan(PRAZO_TOTAL_MS)
    expect(apiFetch.mock.calls[0][1]).toMatchObject({ timeoutMs: TEMPO_DA_EXPLICACAO_MS })
  })

  it('o tempo esgotado (abort) vira "indisponivel", sem lançar', async () => {
    apiFetch.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'))
    await expect(explicarFrase(pedido)).resolves.toEqual({ ok: false, motivo: 'indisponivel', status: 0 })
  })

  it('o corpo que não chega a tempo (abort no meio da leitura) também vira "indisponivel"', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')),
    })
    await expect(explicarFrase(pedido)).resolves.toEqual({ ok: false, motivo: 'indisponivel', status: 200 })
  })
})
