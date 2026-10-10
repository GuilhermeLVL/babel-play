/**
 * OS TEMPOS LIMITE DO SERVIDOR HTTP SÃO DEFINIDOS, E NÃO CORTAM O QUE É LONGO POR NATUREZA
 * (auditoria de desempenho do servidor de 10/10/2026, achado A6; recomendação 4 da Fase 4).
 *
 * O `server.ts` só chamava `app.listen`: valiam os padrões do Node, e o `keepAliveTimeout` padrão
 * (5 s) é MENOR que o ocioso do proxy do Fly (60 s). O servidor fechava um socket parado no mesmo
 * instante em que o proxy o reusava, e a requisição virava erro de conexão (a suíte de carga viu de
 * 8 a 149 repetições por minuto).
 *
 * Três coisas travadas aqui:
 *  1. os valores: ocioso do servidor ACIMA do ocioso do proxy, cabeçalhos acima do ocioso;
 *  2. a variável de ambiente ajusta, e valor inválido cai no padrão em vez de zerar;
 *  3. uma resposta em streaming que dura mais que os três tempos chega inteira: nenhum deles mede
 *     a duração da RESPOSTA.
 */
import { readFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { aplicarTemposLimite, OCIOSO_DO_PROXY_DO_FLY_MS, temposLimiteHttp } from '../../server/http/temposLimite'

describe('tempos limite do servidor HTTP', () => {
  const abertos: http.Server[] = []
  afterEach(async () => {
    for (const s of abertos.splice(0)) {
      s.closeAllConnections()
      await new Promise((r) => s.close(r))
    }
  })

  it('o padrão deixa o socket ocioso viver mais que o proxy, e os cabeçalhos mais que o ocioso', () => {
    const t = temposLimiteHttp({})
    expect(OCIOSO_DO_PROXY_DO_FLY_MS).toBe(60_000)
    expect(t.keepAliveTimeout).toBeGreaterThan(OCIOSO_DO_PROXY_DO_FLY_MS)
    expect(t.headersTimeout).toBeGreaterThan(t.keepAliveTimeout)
    /* O Node recusa `headersTimeout` acima de `requestTimeout`, e o corpo de um upload de 25 MB
       numa rede ruim leva minutos: o teto do pedido inteiro fica em minutos, não em segundos. */
    expect(t.requestTimeout).toBeGreaterThanOrEqual(300_000)
    expect(t.requestTimeout).toBeGreaterThan(t.headersTimeout)
  })

  it('a variável de ambiente ajusta; valor inválido cai no padrão em vez de zerar', () => {
    const padrao = temposLimiteHttp({})
    expect(temposLimiteHttp({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '75000' }).keepAliveTimeout).toBe(75_000)
    expect(temposLimiteHttp({ HTTP_REQUEST_TIMEOUT_MS: '600000' }).requestTimeout).toBe(600_000)
    for (const ruim of ['0', '-1', 'depois', '']) {
      expect(temposLimiteHttp({ HTTP_KEEP_ALIVE_TIMEOUT_MS: ruim })).toEqual(padrao)
      expect(temposLimiteHttp({ HTTP_REQUEST_TIMEOUT_MS: ruim })).toEqual(padrao)
    }
  })

  it('os cabeçalhos sempre ficam acima do ocioso e nunca acima do pedido inteiro', () => {
    const t = temposLimiteHttp({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '120000', HTTP_REQUEST_TIMEOUT_MS: '90000' })
    expect(t.headersTimeout).toBeGreaterThan(t.keepAliveTimeout)
    expect(t.requestTimeout).toBeGreaterThanOrEqual(t.headersTimeout)
  })

  it('aplica os três valores no servidor', () => {
    const servidor = http.createServer()
    abertos.push(servidor)
    const t = aplicarTemposLimite(servidor, {})
    expect(servidor.keepAliveTimeout).toBe(t.keepAliveTimeout)
    expect(servidor.headersTimeout).toBe(t.headersTimeout)
    expect(servidor.requestTimeout).toBe(t.requestTimeout)
    /* O relógio de inatividade do SOCKET continua desligado: é ele que derrubaria um SSE calado. */
    expect(servidor.timeout).toBe(0)
  })

  it('o server.ts aplica os tempos no servidor que escuta', () => {
    const fonte = readFileSync('server.ts', 'utf8')
    expect(fonte).toMatch(/aplicarTemposLimite\(server\)/)
  })

  it('uma resposta em streaming mais longa que os três tempos chega inteira', async () => {
    const PEDACOS = 16
    /* O Node confere os relógios a cada 30 s por padrão; com 50 ms, um corte indevido apareceria
       dentro da duração deste teste. */
    const servidor = http.createServer({ connectionsCheckingInterval: 50 }, (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      let i = 0
      const relogio = setInterval(() => {
        res.write(`data: ${i}\n\n`)
        if (++i === PEDACOS) {
          clearInterval(relogio)
          res.end()
        }
      }, 100)
    })
    abertos.push(servidor)
    /* Tempos curtos de propósito: ocioso de 100 ms, cabeçalhos e pedido inteiro em 1,1 s. A
       resposta dura 1,6 s, mais que todos eles. */
    aplicarTemposLimite(servidor, {
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '100',
      HTTP_REQUEST_TIMEOUT_MS: '150',
    })
    expect(servidor.requestTimeout).toBe(1100)
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
    const { port } = servidor.address() as AddressInfo
    const t0 = Date.now()
    const r = await fetch(`http://127.0.0.1:${port}/`)
    const texto = await r.text()
    expect(r.status).toBe(200)
    expect(texto.match(/data: /g)).toHaveLength(PEDACOS)
    expect(Date.now() - t0).toBeGreaterThan(1400)
  })
})
