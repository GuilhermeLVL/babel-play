/**
 * D7 / F5-04 — o request que ficava PENDURADO.
 *
 * No Express 4 (o deste projeto; o 5 mudou isso), a rejeição de um handler `async` não vira 500:
 * vira promise rejeitada que ninguém trata, e o request fica aberto até o cliente desistir. Havia
 * rotas sem `try/catch` — `sessions.ts:151` e todo o `admin.ts`.
 *
 * O teste sobe um Express de verdade com as MESMAS duas peças do `server.ts` e prova o
 * comportamento nos dois lados: sem elas pendura, com elas responde 500.
 *
 * Um teste que só verificasse "o handler existe" não provaria nada — o valor está em o request
 * TERMINAR, e é isso que o timeout abaixo mede.
 */
import { describe, it, expect } from 'vitest'
import express, { Router } from 'express'
import type { AddressInfo } from 'node:net'
import { erroGlobal, capturarAssincrono } from '../../server/lib/erroGlobal'

/** Sobe um app efêmero e devolve a URL base + como derrubá-lo. */
async function subir(montar: (app: express.Express) => void) {
  const app = express()
  montar(app)
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((r) => servidor.once('listening', r))
  const { port } = servidor.address() as AddressInfo
  return { base: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => servidor.close(r)) }
}

/** `fetch` com prazo: é o que distingue "respondeu 500" de "pendurou". */
async function comPrazo(url: string, ms: number) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    return { status: r.status, corpo: await r.text() }
  } catch {
    return { status: null, corpo: null } // abortado = pendurou
  } finally {
    clearTimeout(t)
  }
}

function rotaQueRejeita(): Router {
  const r = Router()
  // Sem try/catch, exatamente como sessions.ts:151 e admin.ts.
  r.get('/explode', async () => {
    throw Object.assign(new Error('falhou a consulta'), { cause: new Error('SQLITE_BUSY: database is locked') })
  })
  return r
}

/**
 * A MESMA rota, com a rejeição OBSERVADA — e observar não é tratar.
 *
 * O primeiro teste monta a rota deliberadamente sem `capturarAssincrono` e sem `erroGlobal`, para
 * demonstrar que o request pendura. A rejeição escapar é o defeito sob exame, não um acidente. Só
 * que ela escapava também para o PROCESSO: os 3 testes passavam, o relatório dizia "3 passed", e o
 * vitest saía 1. Somado ao caso da síntese de voz, isso fazia `npm test` sair 1 com 1737 testes
 * verdes — ou seja, o CI ficaria vermelho sem nenhum teste falho, e ler a contagem em vez do
 * código de saída escondia isso. Foi `rastrear --provar` que denunciou.
 *
 * A correção NÃO enfraquece o teste, e a razão é precisa: o Express ignora o valor de retorno do
 * handler, seja ele uma promessa rejeitada ou `undefined`. Continuar sem chamar `res` nem `next` é
 * o que faz o request pendurar, e isso não mudou. O `.catch` aqui é do teste sobre a sua própria
 * promessa; ele não intercepta nada no caminho do Express, que nunca teve acesso a essa promessa
 * para começo de conversa.
 */
function rotaQueRejeitaObservada(vazamentos: unknown[]): Router {
  const r = Router()
  r.get('/explode', () => {
    const promessa = (async () => {
      throw Object.assign(new Error('falhou a consulta'), { cause: new Error('SQLITE_BUSY: database is locked') })
    })()
    vazamentos.push(promessa.catch((e) => e))
    // Nada de `res` nem `next`: é exatamente o que o handler original faz do ponto de vista do Express.
  })
  return r
}

describe('D7 — error handler global', () => {
  it('SEM as duas peças, o request pendura (é o defeito que se está consertando)', async () => {
    const vazamentos: unknown[] = []
    const { base, fechar } = await subir((app) => { app.use('/api', rotaQueRejeitaObservada(vazamentos)) })
    try {
      const r = await comPrazo(`${base}/api/explode`, 1200)
      expect(r.status, 'sem o handler o request deveria pendurar').toBeNull()
    } finally { await fechar() }
    // A rejeição TEM de ter acontecido: se ela sumisse, o teste passaria por pendurar por outro
    // motivo qualquer e deixaria de descrever o defeito que nomeia.
    const capturadas = await Promise.all(vazamentos)
    expect(capturadas).toHaveLength(1)
    expect(String((capturadas[0] as Error).message)).toContain('falhou a consulta')
  }, 20_000)

  it('COM as duas peças, responde 500 com envelope estável', async () => {
    const { base, fechar } = await subir((app) => {
      app.use('/api', capturarAssincrono(rotaQueRejeita()))
      app.use(erroGlobal)
    })
    try {
      const r = await comPrazo(`${base}/api/explode`, 5000)
      expect(r.status).toBe(500)
      const corpo = JSON.parse(r.corpo!)
      expect(corpo.error.code).toBe('erro_interno')
      // A causa NUNCA vai na resposta: carrega nome de coluna, caminho e às vezes o valor.
      expect(r.corpo).not.toMatch(/SQLITE_BUSY|falhou a consulta/)
    } finally { await fechar() }
  }, 20_000)

  it('não atrapalha a rota que funciona', async () => {
    const r = Router()
    r.get('/ok', async (_req, res) => { res.json({ ok: true }) })
    const { base, fechar } = await subir((app) => {
      app.use('/api', capturarAssincrono(r))
      app.use(erroGlobal)
    })
    try {
      const resp = await comPrazo(`${base}/api/ok`, 5000)
      expect(resp.status).toBe(200)
      expect(JSON.parse(resp.corpo!)).toEqual({ ok: true })
    } finally { await fechar() }
  }, 20_000)
})
