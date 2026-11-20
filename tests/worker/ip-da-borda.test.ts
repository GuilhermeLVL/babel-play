/**
 * O IP DO CLIENTE NO WORKER (`server/http/ipDaBorda.ts`): o `X-Forwarded-For` que o cliente manda é apagado e
 * substituído pelo `CF-Connecting-IP` da borda, o único valor em que o app (trust proxy = 1 no Worker) confia.
 * A fumaça (`scripts/worker/fumaca.mjs`) prova o efeito nos baldes do limitador.
 */
import { describe, expect, it } from 'vitest'

import { comIpDaBorda } from '../../server/http/ipDaBorda'

describe('comIpDaBorda', () => {
  it('troca o X-Forwarded-For forjado pelo CF-Connecting-IP', () => {
    const r = comIpDaBorda(
      new Request('https://app.test/api/me', {
        headers: {
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '198.51.100.9, 10.0.0.1',
          'x-real-ip': '198.51.100.9',
          forwarded: 'for=198.51.100.9',
          authorization: 'Bearer x',
        },
      }),
    )
    expect(r.headers.get('x-forwarded-for')).toBe('203.0.113.7')
    expect(r.headers.get('x-real-ip')).toBeNull()
    expect(r.headers.get('forwarded')).toBeNull()
    expect(r.headers.get('authorization')).toBe('Bearer x')
  })

  it('sem CF-Connecting-IP, nenhum X-Forwarded-For sobra', () => {
    const r = comIpDaBorda(new Request('https://app.test/api/me', { headers: { 'x-forwarded-for': '198.51.100.9' } }))
    expect(r.headers.get('x-forwarded-for')).toBeNull()
  })

  it('preserva método e corpo', async () => {
    const r = comIpDaBorda(
      new Request('https://app.test/api/sessions', {
        method: 'POST',
        body: '{"a":1}',
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      }),
    )
    expect(r.method).toBe('POST')
    expect(await r.text()).toBe('{"a":1}')
  })
})
