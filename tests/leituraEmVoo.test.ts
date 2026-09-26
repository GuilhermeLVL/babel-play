/**
 * `fetchDeck` e `fetchSettings` no cliente (fix/rotas-caras): quem pede junto recebe a MESMA
 * leitura, quem pede depois de uma escrita vai à rede de novo, e o baralho revalida com o ETag
 * que já tem — um 304 devolve o baralho guardado, idêntico ao de antes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ geracao: 0, chamadas: [] as Array<{ url: string; init?: RequestInit }> }))
let responder: (url: string, init?: RequestInit) => Response

vi.mock('../src/data/funil', () => ({
  geracaoDeEscritas: () => estado.geracao,
  apiFetch: vi.fn(async (url: string, init?: RequestInit) => {
    estado.chamadas.push({ url, init })
    await new Promise((r) => setTimeout(r, 5))
    return responder(url, init)
  }),
}))

const { fetchDeck } = await import('../src/data/rotas/vocabulario')
const { fetchSettings } = await import('../src/data/rotas/settings')

const LINHA = {
  id: 'c1',
  word: 'harvest',
  back: 'colheita',
  sentence: null,
  srcLang: 'en',
  tgtLang: 'pt',
  clozePrompt: null,
  clozeAnswer: null,
  box: 1,
  dueAt: null,
  stability: null,
  difficulty: null,
  reps: 0,
  lastReview: null,
  sessionId: null,
  inDeck: 1,
  cefrLevel: null,
  cefrConfidence: null,
  daTrilha: false,
  daAnki: true,
  baralhosAnki: ['deck-1'],
}

const json = (corpo: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json', ...headers } })

beforeEach(() => {
  estado.chamadas.length = 0
  estado.geracao++
})

describe('fetchDeck', () => {
  it('três telas pedindo ao mesmo tempo fazem UMA requisição, e cada uma recebe cartões seus', async () => {
    responder = () => json([LINHA], { etag: 'W/"vocab-a-1"' })
    const [a, b, c] = await Promise.all([fetchDeck(), fetchDeck(), fetchDeck()])
    expect(estado.chamadas).toHaveLength(1)
    expect(a).toEqual(b)
    expect(a).toEqual(c)
    expect(a[0]).not.toBe(b[0])
    expect(a[0].baralhosAnki).not.toBe(b[0].baralhosAnki)
    a[0].baralhosAnki!.push('mexido')
    expect(b[0].baralhosAnki).toEqual(['deck-1'])
  })

  it('a leitura seguinte manda o ETag; 304 devolve o mesmo baralho sem baixar de novo', async () => {
    responder = () => json([LINHA], { etag: 'W/"vocab-a-2"' })
    const primeiro = await fetchDeck()
    responder = (_u, init) => {
      expect(new Headers(init?.headers).get('if-none-match')).toBe('W/"vocab-a-2"')
      return new Response(null, { status: 304 })
    }
    const segundo = await fetchDeck()
    expect(segundo).toEqual(primeiro)
    expect(segundo[0].baralhosAnki).toEqual(['deck-1'])
  })

  it('quem pede DEPOIS de uma escrita não pega carona na leitura que começou antes dela', async () => {
    responder = () => json([LINHA], { etag: 'W/"vocab-a-3"' })
    const antes = fetchDeck()
    estado.geracao++ // uma revisão saiu pelo funil enquanto a leitura estava em voo
    const depois = fetchDeck()
    await Promise.all([antes, depois])
    expect(estado.chamadas).toHaveLength(2)
  })

  it('resposta de erro continua sendo baralho vazio', async () => {
    responder = () => new Response('{}', { status: 500 })
    expect(await fetchDeck()).toEqual([])
  })
})

describe('fetchSettings', () => {
  it('pedidos simultâneos viram uma requisição, com um objeto por chamador', async () => {
    responder = () => json({ id: 's', activeProfileId: null, targetLanguage: 'en', ui: '{}' })
    const [a, b] = await Promise.all([fetchSettings(), fetchSettings()])
    expect(estado.chamadas).toHaveLength(1)
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
  })

  it('pedidos em sequência vão à rede cada um (não é cache)', async () => {
    responder = () => json({ id: 's', activeProfileId: null, targetLanguage: 'en', ui: '{}' })
    await fetchSettings()
    await fetchSettings()
    expect(estado.chamadas).toHaveLength(2)
  })
})
