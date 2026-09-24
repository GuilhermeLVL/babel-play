/**
 * GAP-015 — o corpo JSON de 5 MB era aceito ANTES do login.
 *
 * `app.use(express.json({ limit: '5mb' }))` ficava no topo da pilha: qualquer visitante, sem token,
 * fazia o processo ler e fazer parse de 5 MB por requisição — o 401 só vinha depois. Oito dessas
 * em paralelo ocupam dezenas de MB de heap numa máquina de 1 GB.
 *
 * O contrato novo, cobrado aqui pela montagem REAL (`criarApp()` via harness):
 *   1. antes do auth, o teto é pequeno (100 KB) em toda rota;
 *   2. as poucas rotas que precisam de corpo grande NÃO leem o corpo antes do auth — sem token,
 *      recebem 401 sem que o servidor gaste parse nenhum;
 *   3. depois do auth, só essas rotas aceitam até 5 MB;
 *   4. corpo acima do teto responde 413 (e não o 500 genérico do `erroGlobal`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

/** Um JSON válido com `n` bytes aproximados. */
const corpoDe = (bytes: number) => JSON.stringify({ lixo: 'x'.repeat(bytes) })

describe('limites de corpo por rota (GAP-015)', () => {
  let s: AppDeTeste
  let token: string

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    token = await s.token('usuario-limites')
  }, 60_000)
  afterAll(async () => {
    await s.encerrar()
  })

  const cru = (caminho: string, corpo: string, comToken: boolean, metodo = 'POST') =>
    s.chamar(metodo, caminho, {
      raw: corpo,
      token: comToken ? token : undefined,
      headers: { 'content-type': 'application/json' },
    })

  it('rota pública antes do auth recusa corpo acima de 100 KB com 413', async () => {
    const r = await cru('/api/rank/memoria', corpoDe(200_000), false)
    expect(r.status).toBe(413)
    const corpo = await r.json()
    expect(corpo.code).toBe('corpo_grande_demais')
  })

  it('rota comum SEM token: 413 antes do auth (o corpo passa do teto pequeno)', async () => {
    const r = await cru('/api/settings', corpoDe(200_000), false, 'PUT')
    expect(r.status).toBe(413)
  })

  it('rota de corpo grande SEM token: 401, sem ler o corpo', async () => {
    const r = await cru('/api/sessions', corpoDe(1_000_000), false)
    expect(r.status).toBe(401)
  })

  it('rota comum COM token continua limitada a 100 KB', async () => {
    const r = await cru('/api/settings', corpoDe(200_000), true, 'PUT')
    expect(r.status).toBe(413)
  })

  it('rota de corpo grande COM token aceita 1 MB (o parse acontece depois do auth)', async () => {
    const falas = Array.from({ length: 200 }, (_, i) => ({
      idx: i,
      sourceText: 'palavra '.repeat(600),
      translatedText: 'word '.repeat(300),
    }))
    const corpo = JSON.stringify({ title: 'grande', utterances: falas })
    expect(corpo.length).toBeGreaterThan(900_000)
    const r = await cru('/api/sessions', corpo, true)
    expect(r.status).toBe(200)
  })

  it('rota de corpo grande COM token recusa acima de 5 MB com 413', async () => {
    const r = await cru('/api/sessions', corpoDe(6_000_000), true)
    expect(r.status).toBe(413)
  })

  it('JSON malformado responde 400, não 500', async () => {
    const r = await cru('/api/settings', '{"ui":', true, 'PUT')
    expect(r.status).toBe(400)
  })
})
