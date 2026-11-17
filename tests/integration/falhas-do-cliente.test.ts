/**
 * `POST /api/erros-do-cliente/falha` — o CONTADOR ANÔNIMO de falhas de preparo do visitante (change
 * `modelos-confiaveis-e-offline`, DISP-06, opção "a" do dono).
 *
 * O contrato preso: só `{ tipo, aparelho, modelo }` de listas fechadas; qualquer campo extra (um `texto`, um id)
 * é 400 e não conta; sem token funciona (o visitante sem conta é quem mais precisa ser visto); a contagem sai
 * agregada em `cliente_falha_total`. Sobe no modo PÚBLICO: é lá que o resto de `/api` responde 401.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

const valido = () => ({ tipo: 'modelo-corrompido', aparelho: 'desktop-sem-gpu', modelo: 'moonshine-tiny' })

describe('POST /api/erros-do-cliente/falha na montagem real (modo público)', () => {
  let s: AppDeTeste
  const salvos: Record<string, string | undefined> = {}

  beforeAll(async () => {
    for (const k of ['METRICS_ENABLED', 'METRICS_TOKEN']) salvos[k] = process.env[k]
    process.env.METRICS_ENABLED = '1'
    delete process.env.METRICS_TOKEN
    s = await subirApp({ modo: 'publico' })
  }, 60_000)
  afterAll(async () => {
    await s.encerrar()
    const { esquecerMetricas } = await import('../../server/http/metricas')
    esquecerMetricas()
    for (const [k, v] of Object.entries(salvos)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('visitante sem conta: 204 e a métrica sobe 1', async () => {
    const r = await s.post('/api/erros-do-cliente/falha', valido())
    expect(r.status).toBe(204)
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).toMatch(
      /cliente_falha_total\{tipo="modelo-corrompido",aparelho="desktop-sem-gpu",modelo="moonshine-tiny"\} 1/,
    )
  })

  it('campo extra (texto, id, pathname): 400, e não conta', async () => {
    for (const extra of [{ texto: 'protobuf parsing failed' }, { id: 'u-1' }, { tela: '/app/capturar' }]) {
      const r = await s.post('/api/erros-do-cliente/falha', { ...valido(), tipo: 'sem-internet', ...extra })
      expect(r.status, JSON.stringify(extra)).toBe(400)
    }
    const corpo = await (await s.get('/metrics')).text()
    expect(corpo).not.toMatch(/cliente_falha_total\{tipo="sem-internet"/)
  })

  it('valor fora das listas fechadas: 400', async () => {
    expect((await s.post('/api/erros-do-cliente/falha', { ...valido(), tipo: 'qualquer' })).status).toBe(400)
    expect(
      (await s.post('/api/erros-do-cliente/falha', { ...valido(), modelo: 'onnx-community/whisper-base' })).status,
    ).toBe(400)
    expect((await s.post('/api/erros-do-cliente/falha', { ...valido(), aparelho: 'iphone 15' })).status).toBe(400)
  })

  it('corpo acima de 8 KB: 413', async () => {
    const r = await s.chamar('POST', '/api/erros-do-cliente/falha', {
      raw: JSON.stringify({ ...valido(), lixo: 'x'.repeat(9_000) }),
      headers: { 'content-type': 'application/json' },
    })
    expect(r.status).toBe(413)
  })

  it('o resto de /api/erros-do-cliente continua exigindo conta (401 sem token)', async () => {
    const r = await s.post('/api/erros-do-cliente', { id: 'abc123', mensagem: 'x', tipo: 'render' })
    expect(r.status).toBe(401)
  })
})
