/**
 * `POST /api/import/youtube` FOI APOSENTADA (Task 10 da Fase 2): o yt-dlp é um subprocesso, que não existe
 * num Worker (e a rota já respondia 403 em produção). Agora a rota responde 410 no envelope de erro do
 * projeto, em QUALQUER modo e para QUALQUER corpo — sem checar plano, sem validar a URL, sem tocar disco.
 *
 * Este arquivo substitui os testes do comportamento antigo (yt-dlp, legenda, reserva de cota).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
})
afterAll(async () => {
  await s.encerrar()
})

describe('POST /api/import/youtube', () => {
  it('responde 410 rota_removida no envelope de erro', async () => {
    const r = await s.post('/api/import/youtube', { url: 'https://www.youtube.com/watch?v=abcdefghijk' })
    expect(r.status).toBe(410)
    const corpo = (await r.json()) as { error?: string; code?: string }
    expect(corpo.code).toBe('rota_removida')
    expect(typeof corpo.error).toBe('string')
  })

  it('responde 410 também para corpo inválido (não valida nada: a rota não existe mais)', async () => {
    const r = await s.post('/api/import/youtube', {})
    expect(r.status).toBe(410)
    expect(((await r.json()) as { code?: string }).code).toBe('rota_removida')
  })

  it('o resto da importação segue de pé: /api/import/web continua validando', async () => {
    const r = await s.post('/api/import/web', {})
    expect(r.status).toBe(400)
  })
})
