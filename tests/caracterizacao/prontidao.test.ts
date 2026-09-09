/**
 * CARACTERIZAÇÃO de `GET /api/ready` — a forma da resposta, congelada.
 *
 * A rota nasceu na Fase 5 e entra na rede de segurança pelo mesmo motivo que as outras: ela é
 * consumida por INFRAESTRUTURA (o `HEALTHCHECK` do `Dockerfile` e o `healthcheck` do
 * `docker-compose.yml` passaram a apontar para ela), e um campo que some ou muda de nome não
 * quebra nenhum teste de unidade — quebra o deploy, em silêncio, no dia seguinte.
 *
 * O snapshot guarda a FORMA (chaves e tipos), nunca os valores: `at` muda a cada chamada.
 *
 * Modo PÚBLICO de propósito: é onde o `authMiddleware` de verdade está montado, e a coisa que
 * precisa continuar valendo é que a probe passa por ele sem token. No self-host todo mundo passa,
 * então o teste não provaria nada.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, resposta, subirApp } from './_app'

let s: AppDeTeste

beforeAll(async () => {
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  await s.encerrar()
})

describe('prontidao (modo publico)', () => {
  it('/api/ready e publico: 200 sem token, com a forma conhecida', async () => {
    const r = await s.get('/api/ready')
    expect(r.status).toBe(200)
    expect(r.headers.get('x-request-id')).toBeTruthy()
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/ready.get.json')
  })

  it('health e ready sao rotas DIFERENTES, com respostas diferentes', async () => {
    // Se um dia alguem apontar as duas para o mesmo handler, este teste cai — e essa e a intencao:
    // liveness e readiness respondendo igual e o defeito que a Fase 5 desfez.
    const health = (await (await s.get('/api/health')).json()) as Record<string, unknown>
    const ready = (await (await s.get('/api/ready')).json()) as Record<string, unknown>
    expect(Object.keys(health).sort()).not.toEqual(Object.keys(ready).sort())
    expect(ready).toHaveProperty('migracoes')
    expect(health).not.toHaveProperty('migracoes')
  })
})
