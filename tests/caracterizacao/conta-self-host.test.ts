/**
 * CARACTERIZAÇÃO — conta no modo self-host (`AUTH_REQUIRED=0`): todo request é o dono local.
 * Arquivo próprio porque o harness sobe um app por arquivo (ver `_app.ts`).
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste,resposta, subirApp } from './_app'

describe('modo self-host (AUTH_REQUIRED=0)', () => {
  let s: AppDeTeste
  beforeAll(async () => { s = await subirApp({ modo: 'self-host' }) })
  afterAll(async () => { await s.encerrar() })

  it('sem token, toda requisicao e o dono local', async () => {
    const r = await s.get('/api/me')
    expect(r.status).toBe(200)
    expect((await r.json()).id).toBe('local-owner')
  })

  it('um token qualquer e ignorado: continua sendo o dono local', async () => {
    // caracterizacao: no self-host o header Authorization nao e verificado nem recusado
    const r = await s.get('/api/me', 'Bearer.lixo.qualquer')
    expect(r.status).toBe(200)
    expect((await r.json()).id).toBe('local-owner')
  })

  it('DELETE /api/me exige confirmacao explicita', async () => {
    const r = await s.chamar('DELETE', '/api/me', { body: {} })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/me.delete-sem-confirmacao.json')
  })

  it('GET /api/me/exportar devolve a conta inteira num JSON com a forma conhecida', async () => {
    const r = await s.get('/api/me/exportar')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/me.exportar.get.json')
  })
})
