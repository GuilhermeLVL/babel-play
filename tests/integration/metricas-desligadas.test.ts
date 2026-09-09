/**
 * COM `METRICS_ENABLED` DESLIGADO, `/metrics` NÃO EXISTE — e existir "respondendo 403" seria pior.
 *
 * A diferença é sobre o que a resposta CONTA a quem sonda. Uma rota sempre montada devolvendo 403
 * confirma três coisas de uma vez: que o endpoint existe, que este servidor é instrumentado, e que
 * há um segredo a adivinhar. Uma rota não montada devolve o mesmo 404 de qualquer caminho
 * inexistente e não conta nada — que é a resposta certa para quem não deveria estar perguntando.
 *
 * Por isso a decisão é de MONTAGEM (`server/http/app.ts`) e não de handler, e por isso este teste
 * precisa do `criarApp()` de verdade: um handler testado solto nunca provaria a ausência da rota.
 *
 * Arquivo separado do `metricas-prometheus.test.ts` por imposição do harness — `subirApp` fecha o
 * cliente libsql no `encerrar()` e o módulo `server/db/db` fica cacheado no worker do vitest, então
 * um segundo `subirApp` no mesmo arquivo encontraria o cliente fechado (ver `_app.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const original = process.env.METRICS_ENABLED

beforeAll(async () => {
  delete process.env.METRICS_ENABLED
  s = await subirApp({ modo: 'self-host' })
})

afterAll(async () => {
  await s.encerrar()
  if (original === undefined) delete process.env.METRICS_ENABLED
  else process.env.METRICS_ENABLED = original
})

describe('/metrics com METRICS_ENABLED ausente (o default)', () => {
  it('responde 404, e não 403 — a rota não foi montada', async () => {
    const r = await s.get('/metrics')
    expect(r.status).toBe(404)
  })

  it('`METRICS_ENABLED=0` também deixa a rota inexistente', async () => {
    // `0` e `false` são as formas que um operador escreve para DESLIGAR, e as duas são strings não
    // vazias: um teste de truthiness ligaria a rota justamente para quem pediu para desligá-la.
    // A montagem já aconteceu no beforeAll, então o que se confere aqui é a decisão pura.
    const { metricasHabilitadas } = await import('../../server/lib/config')
    expect(metricasHabilitadas({ METRICS_ENABLED: '0' })).toBe(false)
    expect(metricasHabilitadas({ METRICS_ENABLED: 'false' })).toBe(false)
    expect(metricasHabilitadas({})).toBe(false)
    expect(metricasHabilitadas({ METRICS_ENABLED: '1' })).toBe(true)
  })

  it('/api/metrics (negócio) continua existindo — as duas rotas são coisas diferentes', async () => {
    expect((await s.get('/api/metrics/xp')).status).toBe(200)
  })
})
