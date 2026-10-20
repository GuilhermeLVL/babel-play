/**
 * Fumaça remota (Fase 4, T6): `scripts/cloudflare/fumaca-remota.mjs` confere um Worker publicado
 * (`/api/ready` 200 e `/api/health` com a versão do commit). Aqui, contra um servidor HTTP falso.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import { verificarRemoto } from '../scripts/cloudflare/fumaca-remota.mjs'

const SHA = 'abcdef0123456789abcdef0123456789abcdef01'
let servidor: Server | undefined

async function subir(tratar: (url: string, n: number) => { status: number; corpo?: unknown }) {
  let n = 0
  servidor = createServer((req, res) => {
    const { status, corpo } = tratar(req.url ?? '', ++n)
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corpo ?? {}))
  })
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok))
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
}

const opcoes = { tentativas: 3, esperaMs: 10 }
const saudavel = { status: 'ok', versao: '0.1.0+abcdef0' }

afterEach(async () => {
  await new Promise((ok) => (servidor ? servidor.close(ok) : ok(undefined)))
  servidor = undefined
})

describe('verificarRemoto', () => {
  it('passa com /api/ready 200 e versão terminando no sha de 7 caracteres', async () => {
    const base = await subir((u) => ({ status: 200, corpo: u.startsWith('/api/health') ? saudavel : { ready: true } }))
    await expect(verificarRemoto(base, SHA, opcoes)).resolves.toMatchObject({ versao: '0.1.0+abcdef0' })
  })

  it('falha quando a versão é de outro commit', async () => {
    const base = await subir((u) => ({
      status: 200,
      corpo: u.startsWith('/api/health') ? { status: 'ok', versao: '0.1.0+1234567' } : {},
    }))
    await expect(verificarRemoto(base, SHA, opcoes)).rejects.toThrow(/versão.*1234567.*abcdef0/s)
  })

  it('tenta de novo depois de um 503 e passa', async () => {
    const base = await subir((u, n) =>
      u.startsWith('/api/ready') && n === 1 ? { status: 503 } : { status: 200, corpo: saudavel },
    )
    await expect(verificarRemoto(base, SHA, opcoes)).resolves.toBeTruthy()
  })

  it('falha se /api/ready nunca responde 200', async () => {
    const base = await subir(() => ({ status: 503 }))
    await expect(verificarRemoto(base, SHA, opcoes)).rejects.toThrow(/\/api\/ready.*503/s)
  })

  it('falha com status degraded', async () => {
    const base = await subir((u) => ({
      status: 200,
      corpo: u.startsWith('/api/health') ? { status: 'degraded', versao: '0.1.0+abcdef0' } : {},
    }))
    await expect(verificarRemoto(base, SHA, opcoes)).rejects.toThrow(/degraded/)
  })
})
