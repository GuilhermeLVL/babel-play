/**
 * CARACTERIZAÇÃO — idioma e preferências (`/api/settings`), por HTTP, no modo self-host.
 *
 * Grava o comportamento ATUAL (rodada de saneamento, Fase 1) do fluxo que guarda o idioma
 * praticado (`targetLanguage`) e o blob de preferências de UI (`ui`). O `ui` entra como objeto e
 * SAI como string JSON — o snapshot congela essa assimetria de propósito: a fase que mexer no
 * contrato precisa ver este teste quebrar. Um `expect` marcado com `// caracterizacao:` descreve o
 * que acontece hoje, não o que deveria acontecer.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste,resposta, subirApp } from './_app'

describe('idioma e preferencias (self-host)', () => {
  let s: AppDeTeste
  beforeAll(async () => { s = await subirApp({ modo: 'self-host' }) })
  afterAll(async () => { await s.encerrar() })

  it('GET /api/settings cria a linha do dono local e devolve a forma conhecida', async () => {
    const r = await s.get('/api/settings')
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/get.settings.json')
  })

  it('PUT /api/settings {targetLanguage} persiste e o GET seguinte reflete', async () => {
    const r = await s.put('/api/settings', { targetLanguage: 'es' })
    expect(r.status).toBe(200)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/put.settings.json')
    const lido = await (await s.get('/api/settings')).json()
    expect(lido.targetLanguage).toBe('es')
  })

  it('PUT /api/settings {ui} grava o blob e o devolve como STRING JSON', async () => {
    const r = await s.put('/api/settings', { ui: { uiLang: 'en' } })
    expect(r.status).toBe(200)
    const corpo = await r.json()
    // caracterizacao: comportamento atual, nao desejado — `ui` entra como objeto e volta como string
    // serializada; o cliente e quem faz o JSON.parse.
    expect(typeof corpo.ui).toBe('string')
    expect(JSON.parse(corpo.ui)).toEqual({ uiLang: 'en' })
    const lido = await (await s.get('/api/settings')).json()
    expect(JSON.parse(lido.ui).uiLang).toBe('en')
    // O targetLanguage do teste anterior nao e tocado por um patch que so manda `ui`.
    expect(lido.targetLanguage).toBe('es')
  })

  it('PUT com targetLanguage acima de 20 caracteres responde 400 com o envelope de erro', async () => {
    const r = await s.put('/api/settings', { targetLanguage: 'a'.repeat(21) })
    expect(r.status).toBe(400)
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot('__snapshots__/put.settings.400.json')
  })

  it('PUT com `ui` acima de 64000 caracteres responde 400', async () => {
    const r = await s.put('/api/settings', { ui: { texto: 'x'.repeat(64_100) } })
    expect(r.status).toBe(400)
    const corpo = await r.json()
    expect(String(corpo.error)).toContain('ui')
    // O blob anterior continua intacto depois da recusa.
    const lido = await (await s.get('/api/settings')).json()
    expect(JSON.parse(lido.ui)).toEqual({ uiLang: 'en' })
  })
})
