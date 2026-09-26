/**
 * O LIMITADOR DE FALHAS DE AUTH SOB CONCORRÊNCIA (auditoria de prontidão 2026-09-25, fase 2 §2.5).
 *
 * O limitador anterior era um `express-rate-limit` com `skipSuccessfulRequests`: ele CONTAVA cada
 * requisição na entrada e ESTORNAVA na saída quando a resposta não era 401. Medido na auditoria:
 * com mais de 30 requisições simultâneas do mesmo IP (uma escola atrás de NAT), 88–100% recebiam
 * 429 — todas somavam antes de qualquer estorno — e o contador ficava PRESO em 30, de modo que
 * depois disso até uma conexão sozinha recebia 429 por 15 minutos. E todo request, inclusive os
 * bem-sucedidos, fazia duas escritas no SQLite.
 *
 * Os três casos abaixo são o contrato do limitador novo: sucesso não escreve nada e nunca é
 * barrado; 401 repetido acaba em 429; e o bloqueio é do IP, não do servidor.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
let trustProxyAnterior: string | undefined

const IP_DA_ESCOLA = '198.51.100.10'
const IP_ATACANTE = '198.51.100.20'
const IP_VIZINHO = '198.51.100.30'

/** Linhas do balde de auth no banco — o limitador novo só pode escrever quando há 401. */
async function linhasDoBaldeDeAuth(): Promise<number> {
  const { client } = await s.load('../../server/db/db')
  const r = await client.execute(`select count(*) as n from usage_counters where metric = 'ratelimit:auth'`)
  return Number(r.rows[0]?.n ?? 0)
}

beforeAll(async () => {
  trustProxyAnterior = process.env.TRUST_PROXY
  process.env.TRUST_PROXY = '1'
  s = await subirApp({ modo: 'publico' })
}, 60_000)

afterAll(async () => {
  await s.encerrar()
  if (trustProxyAnterior === undefined) delete process.env.TRUST_PROXY
  else process.env.TRUST_PROXY = trustProxyAnterior
})

describe('limitador de falhas de auth', () => {
  it('200 requisições simultâneas autenticadas do mesmo IP: nenhum 429 e nenhuma escrita no contador', async () => {
    const token = await s.token('aluno-da-escola')
    const respostas = await Promise.all(
      Array.from({ length: 200 }, () =>
        s.chamar('GET', '/api/me', {
          headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': IP_DA_ESCOLA },
        }),
      ),
    )
    const barradas = respostas.filter((r) => r.status === 429).length
    expect(barradas, 'sucesso não pode consumir o balde de falhas').toBe(0)
    expect(await linhasDoBaldeDeAuth(), 'sucesso não pode escrever no contador').toBe(0)

    // E depois da rajada, uma conexão sozinha continua livre (o contador não ficou preso).
    const depois = await s.chamar('GET', '/api/me', {
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': IP_DA_ESCOLA },
    })
    expect(depois.status).not.toBe(429)
  }, 60_000)

  it('401 repetido do mesmo IP: a 31ª ou 32ª tentativa recebe 429, no envelope de erro e com Retry-After', async () => {
    let primeira429 = 0
    let resposta429: Response | undefined
    for (let i = 1; i <= 40; i++) {
      const r = await s.chamar('GET', '/api/me', {
        headers: { authorization: 'Bearer token-inventado', 'x-forwarded-for': IP_ATACANTE },
      })
      if (r.status === 429) {
        primeira429 = i
        resposta429 = r
        break
      }
      expect(r.status, `a tentativa ${i} ainda está dentro do teto`).toBe(401)
    }
    expect(primeira429, 'o teto declarado é 30 falhas').toBeGreaterThanOrEqual(31)
    expect(primeira429).toBeLessThanOrEqual(32)

    const retry = Number(resposta429?.headers.get('retry-after'))
    expect(retry).toBeGreaterThan(0)
    expect(retry).toBeLessThanOrEqual(15 * 60)
    const corpo = await resposta429?.json()
    expect(typeof corpo.error).toBe('string')
    expect(corpo.code).toBe('muitas_falhas_de_autenticacao')
  }, 60_000)

  it('estourado o balde de um IP, outro IP continua livre', async () => {
    const token = await s.token('vizinho')
    const r = await s.chamar('GET', '/api/me', {
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': IP_VIZINHO },
    })
    expect(r.status).toBe(200)
    const falha = await s.chamar('GET', '/api/me', {
      headers: { authorization: 'Bearer outro-inventado', 'x-forwarded-for': IP_VIZINHO },
    })
    expect(falha.status).toBe(401)
  })
})
