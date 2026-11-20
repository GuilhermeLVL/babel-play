// @vitest-environment jsdom
/**
 * SEM CONTA, A IA DE ESTUDO PEDE PARA ENTRAR (pedido do dono, 24/10/2026). Sem sessão, `apiFetch` não vai à
 * rede: quem responde é o servidor em memória, com 501 `EXIGE_CONTA`. Antes isto caía em "indisponivel", e a
 * folha dizia "Não deu para explicar agora". Aqui o servidor em memória é o DE VERDADE.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/funil', async (orig) => {
  const { servidorEfemero } = await import('../src/data/efemero/servidor')
  return {
    ...(await orig<typeof import('../src/data/funil')>()),
    apiFetch: (input: string, init?: RequestInit) => servidorEfemero(input, init ?? {}),
  }
})

import { explicarFrase, resumirSessao } from '../src/data/apiDoEstudo'

describe('IA de estudo sem conta', () => {
  it('explicar: o 501 EXIGE_CONTA do servidor em memória vira "sem_conta"', async () => {
    const r = await explicarFrase({ texto: 'Hello.', traducao: 'Olá.', lang: 'en', langDaTraducao: 'pt-BR' })
    expect(r).toMatchObject({ ok: false, motivo: 'sem_conta' })
  })

  it('resumir: o mesmo ramo, o mesmo motivo', async () => {
    const r = await resumirSessao({ sessionId: 's1', lang: 'pt-BR' })
    expect(r).toMatchObject({ ok: false, motivo: 'sem_conta' })
  })
})
