/**
 * O ROTEAMENTO DE `/api` NO WORKER (ruling R26, AAL2). O Express roteia com caixa sensível: `/API/me` é 404
 * no Node. No Worker, sem tratamento explícito, esse caminho cairia no `ASSETS` (SPA) e voltaria o
 * `index.html` com 200. Aqui o `fetch` do `worker.ts` roda com o Express e o `ASSETS` como espiões:
 * `/API/me` e variantes dão 404 JSON sem tocar em nenhum dos dois; `/api/me` segue para o app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const expressFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))

vi.mock('cloudflare:node', () => ({ httpServerHandler: () => ({ fetch: expressFetch }) }))
vi.mock('node:http', () => ({ createServer: () => ({ listen: () => undefined }) }))
vi.mock('../../server/http/app', () => ({ criarApp: () => ({ use: () => undefined }) }))
vi.mock('../../server/boot/portaoDoWorker', () => ({ conferirBootDoWorker: () => null }))
vi.mock('../../server/db/manutencao', () => ({ schemaPresente: async () => true }))
vi.mock('../../server/db/clientePorRequisicao', () => ({ abrirClienteDoHyperdrive: async () => ({}) }))
vi.mock('../../server/lib/escopoDaRequisicao', () => ({
  rodarNoEscopoDaRequisicao: async (_e: unknown, _c: unknown, fn: () => Promise<[unknown, Promise<void>]>) =>
    (await fn())[0],
}))

const assetsFetch = vi.fn(async () => new Response('<html>spa</html>', { status: 200 }))
const env = {
  HYPERDRIVE: { connectionString: 'postgres://x' },
  MIDIA: {} as never,
  ASSETS: { fetch: assetsFetch },
}
const ctx = { waitUntil: () => undefined }

beforeEach(() => {
  expressFetch.mockClear()
  assetsFetch.mockClear()
})

async function chamar(caminho: string) {
  const { default: worker } = await import('../../worker')
  return worker.fetch(new Request(`https://app.test${caminho}`), env, ctx)
}

describe('roteamento de /api no Worker', () => {
  it.each(['/API/me', '/Api/me', '/API', '/api'])('%s: 404 JSON, sem Express e sem SPA', async (caminho) => {
    const r = await chamar(caminho)
    expect(r.status).toBe(404)
    expect(r.headers.get('content-type')).toMatch(/application\/json/)
    expect(await r.json()).toEqual({ error: 'rota inexistente', code: 'rota_inexistente' })
    expect(expressFetch).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('/api/me segue para o app Express (nem 404 nem SPA)', async () => {
    const r = await chamar('/api/me')
    expect(r.status).toBe(200)
    expect(expressFetch).toHaveBeenCalledTimes(1)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('caminho da SPA continua no ASSETS', async () => {
    await chamar('/jogos')
    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(expressFetch).not.toHaveBeenCalled()
  })
})
