// @vitest-environment jsdom
/**
 * O servidor em memória responde 501 EXIGE_CONTA para tudo que precisa de conta e NUNCA cai no
 * fetch real por engano — inclusive para rota inventada. Mas só AÇÕES da pessoa avisam o App:
 * sondas automáticas recebem o 501 em silêncio (senão o convite vira ruído a cada tela).
 *
 * Única exceção ao "nada sai": `/api/audio/loopback/*`, capacidade do servidor LOCAL (sem banco,
 * sem dado de usuário) — o servidor real decide se existe.
 */
import 'fake-indexeddb/auto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { CODIGO_EXIGE_CONTA, EVENTO_EXIGE_CONTA, servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore } from '../src/data/efemero/store'

const ACOES: Array<[string, string]> = [
  ['POST', '/api/import/youtube'], ['POST', '/api/import/web'], ['POST', '/api/import/document'],
  ['POST', '/api/import/anki'], ['POST', '/api/import/anki/export'],
  ['POST', '/api/ai/credentials'], ['POST', '/api/ai/providers/test'], ['POST', '/api/gemini/chat'],
  ['POST', '/api/sessions/utterances/relabel'], ['POST', '/api/vocab/relabel'],
  ['PATCH', '/api/me'], ['DELETE', '/api/me'],
]
const SONDAS: Array<[string, string]> = [
  ['GET', '/api/ai/stt/available'], ['POST', '/api/ai/stt'], ['POST', '/api/ai/mt'], ['POST', '/api/ai/llm/chat/completions'],
  ['GET', '/api/ai/credentials'], ['GET', '/api/images/search?q=x'], ['GET', '/api/sessions/utterances/all'],
  ['GET', '/api/me'], ['GET', '/api/admin/users'], ['GET', '/api/inventada'],
]

async function chamar(metodo: string, rota: string) {
  const eventos: string[] = []
  const ouvir = (ev: Event) => eventos.push((ev as CustomEvent<{ rota: string }>).detail.rota)
  window.addEventListener(EVENTO_EXIGE_CONTA, ouvir)
  const res = await servidorEfemero(rota, { method: metodo, body: '{}' })
  window.removeEventListener(EVENTO_EXIGE_CONTA, ouvir)
  return { res, eventos }
}

describe('rotas do servidor efêmero', () => {
  afterAll(async () => { await fecharStore() })
  afterEach(() => vi.unstubAllGlobals())

  it.each(ACOES)('AÇÃO %s %s → 501 EXIGE_CONTA e AVISA o App', async (metodo, rota) => {
    const { res, eventos } = await chamar(metodo, rota)
    expect(res.status).toBe(501)
    expect(await res.json()).toMatchObject({ codigo: CODIGO_EXIGE_CONTA })
    expect(eventos).toHaveLength(1)
  })

  it.each(SONDAS)('SONDA %s %s → 501 em SILÊNCIO', async (metodo, rota) => {
    const { res, eventos } = await chamar(metodo, rota)
    expect(res.status).toBe(501)
    expect(await res.json()).toMatchObject({ codigo: CODIGO_EXIGE_CONTA })
    expect(eventos).toHaveLength(0)
  })

  it('rota suportada NÃO dispara o evento', async () => {
    const { res, eventos } = await chamar('GET', '/api/sessions')
    expect(res.status).toBe(200)
    expect(eventos).toHaveLength(0)
  })

  it('id inexistente é 404, não 501', async () => {
    expect((await servidorEfemero('/api/sessions/nao-existe')).status).toBe(404)
    expect((await servidorEfemero('/api/vocab/nao-existe/review', { method: 'POST', body: '{"grade":3}' })).status).toBe(404)
  })

  it('captura do sistema pelo servidor LOCAL passa direto ao servidor real (única exceção)', async () => {
    const real = vi.fn(async () => new Response('{"supported":true}', { status: 200 }))
    vi.stubGlobal('fetch', real)
    const res = await servidorEfemero('/api/audio/loopback/support')
    expect(real).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    // e NADA mais passa:
    await servidorEfemero('/api/sessions')
    await servidorEfemero('/api/inventada')
    expect(real).toHaveBeenCalledTimes(1)
  })
})
