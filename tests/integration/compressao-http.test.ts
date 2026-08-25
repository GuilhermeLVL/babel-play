/**
 * C3 — COMPRESSÃO HTTP.
 *
 * A medição de performance encontrou LCP entre 10,7 s e 23,3 s em TODAS as rotas, com o limiar
 * "ruim" do Google em 4 s. O diagnóstico não foi "o código é grande": dos 4,1 MB transferidos
 * numa carga, **2,9 MB eram JSON de API** — `/api/vocab` sozinho mandava 1,65 MB (o baralho
 * inteiro, 1.902 cartões) e `/api/sessions` 1,07 MB.
 *
 * E o servidor não tinha compressão nenhuma. JSON é texto altamente redundante — chaves
 * repetidas em cada objeto do array — e é o caso em que gzip rende mais.
 *
 * Este teste exercita o middleware DE VERDADE (mesma versão, mesmo Node) em vez de conferir que
 * uma linha existe no arquivo: prova que uma resposta grande volta comprimida e que o cliente que
 * não pede compressão continua recebendo texto puro. A segunda parte trava a ORDEM de montagem
 * no `server.ts` — compressão depois do `helmet` e ANTES dos routers, senão ela não alcança as
 * respostas que importam.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import compression from 'compression'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { request as httpRequest, type Server } from 'node:http'

/** Payload com a forma real do problema: array de objetos com chaves repetidas. */
const CARGA = Array.from({ length: 2000 }, (_, i) => ({
  id: `card-${i}`, term: `palavra${i}`, translation: `traducao${i}`,
  inDeck: true, leitnerBox: (i % 5) + 1, stability: 1.5, difficulty: 5.2,
  sourceSessionId: 'sessao-exemplo', createdAt: 1786000000000 + i,
}))

let servidor: Server
let base: string
let porta: number

/** Conta os bytes CRUS do corpo, sem descompressão automática. */
function bytesNaRede(caminho: string, encoding: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: porta, path: caminho, headers: { 'accept-encoding': encoding } },
      (res) => {
        let n = 0
        res.on('data', (c: Buffer) => { n += c.length })
        res.on('end', () => resolve(n))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  const app = express()
  app.use(compression())
  app.get('/api/vocab', (_req, res) => { res.json(CARGA) })
  await new Promise<void>((r) => { servidor = app.listen(0, '127.0.0.1', () => r()) })
  const addr = servidor.address()
  porta = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${porta}`
})

afterAll(async () => {
  await new Promise<void>((r) => servidor.close(() => r()))
})

describe('respostas grandes de API voltam comprimidas', () => {
  it('declara content-encoding quando o cliente aceita gzip', async () => {
    const res = await fetch(`${base}/api/vocab`, { headers: { 'accept-encoding': 'gzip' } })
    expect(res.headers.get('content-encoding')).toBe('gzip')
  })

  it('o corpo comprimido é uma fração do original', async () => {
    // `fetch` descomprime sozinho e o gzip usa `transfer-encoding: chunked`, então NÃO existe
    // `content-length` para consultar. Para medir o que de fato trafega é preciso contar os
    // bytes crus do socket — daí o `node:http` em vez do `fetch`.
    const naRede = await bytesNaRede('/api/vocab', 'gzip')
    const original = Buffer.byteLength(JSON.stringify(CARGA))
    expect(naRede).toBeGreaterThan(0)
    // Margem folgada de propósito: o que importa é a ordem de grandeza, não um número exato que
    // quebraria a cada ajuste do zlib.
    expect(naRede).toBeLessThan(original / 4)
  })

  it('quem não pede compressão continua recebendo o corpo íntegro', async () => {
    const res = await fetch(`${base}/api/vocab`, { headers: { 'accept-encoding': 'identity' } })
    expect(res.headers.get('content-encoding')).toBeNull()
    expect((await res.json())).toHaveLength(CARGA.length)
  })
})

describe('a ordem de montagem no servidor real', () => {
  const src = readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8')
  const posicao = (re: RegExp) => src.search(re)

  it('server.ts monta a compressão', () => {
    expect(posicao(/app\.use\(compression\(/)).toBeGreaterThan(-1)
  })

  it('monta ANTES dos routers de API — depois deles não alcançaria as respostas', () => {
    const comp = posicao(/app\.use\(compression\(/)
    const primeiroRouter = posicao(/app\.use\("\/api\/(ai|sessions|vocab)"/)
    expect(comp).toBeGreaterThan(-1)
    expect(primeiroRouter).toBeGreaterThan(-1)
    expect(comp).toBeLessThan(primeiroRouter)
  })
})
