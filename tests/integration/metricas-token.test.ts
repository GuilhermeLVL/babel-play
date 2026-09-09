/**
 * A GUARDA DE `GET /metrics` — as duas camadas, e por que elas são duas.
 *
 * Um scrape descreve a superfície inteira do servidor: os nomes de todas as rotas, o volume de
 * cada uma e a taxa de erro por status. Isso é reconhecimento gratuito para quem sonda, e o custo
 * de vazar é assimétrico — o operador não perde nada por proteger, e perde o mapa do servidor por
 * não proteger.
 *
 *   1. `METRICS_ENABLED` decide MONTAR (coberto em `metricas-desligadas.test.ts`, porque a
 *      pergunta ali é sobre a montagem e exige o `criarApp()` inteiro);
 *   2. `METRICS_TOKEN`, quando definida, exige `Authorization: Bearer <token>` — é o que este
 *      arquivo exercita, com o handler montado solto para o caso ficar sobre a GUARDA e não sobre
 *      a montagem.
 *
 * A comparação é em TEMPO CONSTANTE (`timingSafeEqual`), pelo mesmo motivo escrito em
 * `server/routes/billing.ts:294` para o token do Asaas: igualdade de string vaza o tamanho do
 * prefixo certo, e um token de métricas é adivinhável byte a byte com paciência suficiente.
 * Tempo constante não se prova por teste de relógio (a medição seria ruído de máquina); o que se
 * prova aqui é o CONTRATO — token errado, token de outro tamanho e ausência de header recusam
 * todos igual.
 */
import type { Server } from 'node:http'

import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { esquecerMetricas, handlerDeMetricas } from '../../server/http/metricas'

let servidor: Server
let base: string
const original = process.env.METRICS_TOKEN

beforeAll(async () => {
  const app = express()
  app.get('/metrics', handlerDeMetricas())
  await new Promise<void>((r) => {
    servidor = app.listen(0, '127.0.0.1', () => r())
  })
  const addr = servidor.address()
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
})

afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()))
  esquecerMetricas()
})

afterEach(() => {
  if (original === undefined) delete process.env.METRICS_TOKEN
  else process.env.METRICS_TOKEN = original
})

const pedir = (headers: Record<string, string> = {}) => fetch(`${base}/metrics`, { headers })

describe('METRICS_TOKEN definida', () => {
  beforeAll(() => {
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
  })

  it('aceita o Bearer correto', async () => {
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
    const r = await pedir({ authorization: 'Bearer segredo-do-scraper' })
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('# TYPE')
  })

  it('recusa sem header, e diz COMO se autenticar', async () => {
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
    const r = await pedir()
    expect(r.status).toBe(401)
    // Sem isto o scraper adivinharia entre header, query e cookie.
    expect(r.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('recusa token errado do MESMO tamanho — o caso que a comparação ingênua encurta', async () => {
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
    expect((await pedir({ authorization: 'Bearer Segredo-do-scrapeR' })).status).toBe(401)
  })

  it('recusa token de outro tamanho sem estourar o `timingSafeEqual`', async () => {
    // `timingSafeEqual` LANÇA com buffers de tamanhos diferentes; sem a checagem de tamanho antes,
    // um token curto viraria 500 em vez de 401 — e um 500 aqui é um oráculo de tamanho.
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
    expect((await pedir({ authorization: 'Bearer x' })).status).toBe(401)
  })

  it('recusa esquema que não é Bearer', async () => {
    process.env.METRICS_TOKEN = 'segredo-do-scraper'
    expect((await pedir({ authorization: 'Basic segredo-do-scraper' })).status).toBe(401)
  })
})

describe('METRICS_TOKEN ausente', () => {
  it('scrape aberto — é o caso do self-host e da rede interna fechada', async () => {
    delete process.env.METRICS_TOKEN
    expect((await pedir()).status).toBe(200)
  })

  it('token só com espaços conta como AUSENTE, não como segredo vazio', async () => {
    // Um segredo vazio tratado como segredo autenticaria qualquer requisição sem `Authorization` —
    // o pior dos dois mundos: parece protegido e não está.
    process.env.METRICS_TOKEN = '   '
    expect((await pedir()).status).toBe(200)
  })
})
