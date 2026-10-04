/**
 * CARACTERIZAÇÃO — `GET /api/abertura`, as portas de emergência (`CHECKOUT_ENABLED` e
 * `SIGNUP_ENABLED`), por HTTP, no modo público.
 *
 * A rota é PÚBLICA de propósito: a tela de login a lê antes de existir sessão, para esconder
 * "Criar conta" quando o cadastro está fechado (`src/data/rotas/idade.ts`, `lerAbertura`). As duas
 * chaves são lidas em TEMPO DE CHAMADA — o operador desliga e a próxima requisição já vê — e
 * nascem abertas: só `0`/`false` fecha.
 *
 * O efeito do cadastro fechado também fica gravado aqui, porque é ele que a rota anuncia: conta que
 * o banco ainda não conhece recebe 403 `cadastro_fechado`; conta existente continua entrando.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, resposta, subirApp } from './_app'

describe('GET /api/abertura (modo publico)', () => {
  let s: AppDeTeste
  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
  })
  afterEach(() => {
    delete process.env.CHECKOUT_ENABLED
    delete process.env.SIGNUP_ENABLED
    delete process.env.ANUAL_ENABLED
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('e publica: 200 sem token, sem cache, e as portas nascem abertas (o anual tambem)', async () => {
    const r = await s.get('/api/abertura')
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(await r.clone().json()).toEqual({ cadastro: true, checkout: true, anual: true })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.abertura.json')
  })

  it('CHECKOUT_ENABLED=0 fecha so a venda', async () => {
    process.env.CHECKOUT_ENABLED = '0'
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: true, checkout: false, anual: true })
  })

  it('SIGNUP_ENABLED=false fecha so o cadastro', async () => {
    process.env.SIGNUP_ENABLED = 'false'
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: false, checkout: true, anual: true })
  })

  it('ANUAL_ENABLED=0 tira so o anual da venda (cadastro e checkout seguem abertos)', async () => {
    process.env.ANUAL_ENABLED = '0'
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: true, checkout: true, anual: false })
  })

  it('qualquer outro valor deixa a porta aberta (so 0/false fecham)', async () => {
    process.env.CHECKOUT_ENABLED = '1'
    process.env.SIGNUP_ENABLED = 'sim'
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: true, checkout: true, anual: true })
  })

  it('a leitura e em tempo de chamada: fechar e reabrir sem reiniciar', async () => {
    process.env.SIGNUP_ENABLED = '0'
    expect((await (await s.get('/api/abertura')).json()).cadastro).toBe(false)
    delete process.env.SIGNUP_ENABLED
    expect((await (await s.get('/api/abertura')).json()).cadastro).toBe(true)
  })

  it('com o cadastro fechado, conta nova recebe 403 cadastro_fechado e conta existente segue', async () => {
    const antiga = await s.token('conta-antiga')
    expect((await s.get('/api/me', antiga)).status, 'provisiona com o cadastro aberto').toBe(200)

    process.env.SIGNUP_ENABLED = '0'
    const nova = await s.get('/api/me', await s.token('conta-nova'))
    expect(nova.status).toBe(403)
    expect((await nova.json()).code).toBe('cadastro_fechado')
    expect((await s.get('/api/me', antiga)).status).toBe(200)
    // A propria rota continua respondendo a quem nao tem conta: e ela que explica a porta fechada.
    expect((await s.get('/api/abertura')).status).toBe(200)
  })
})
