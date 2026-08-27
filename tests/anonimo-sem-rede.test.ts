// @vitest-environment jsdom
/**
 * Fatia 5 / passo 3 — O TESTE-SENTINELA: sem conta, NENHUMA requisição sai para a rede.
 *
 * O `fetch` global LANÇA se for chamado. O roteiro abaixo é o que uma pessoa sem conta faz
 * (captura → salva → cartões → jogos → preferências), passando pelas MESMAS funções de
 * `data/api.ts` que as telas usam. Se qualquer uma delas tocar `fetch`, o teste cai com a URL.
 *
 * Falha-antes: `createSession` lançava "REDE PROIBIDA: /api/sessions".
 */
import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null,
}))

import { definirIdentidade } from '../src/lib/identidade'
import { carregarEntitlements } from '../src/lib/entitlements'
import { fecharStore, limparTudo } from '../src/data/efemero/store'
import * as api from '../src/data/api'

const rede = vi.fn((url: unknown) => { throw new Error(`REDE PROIBIDA: ${String(url)}`) })

const CAMPOS_DE_METRICAS = [
  'sessions', 'wordsCaptured', 'deckSize', 'newCards', 'dueToday', 'reviews', 'correctReviews',
  'drillItems', 'drillCorrect', 'accuracy', 'accuracyConfidence', 'streakDays', 'seedsGastas',
  'avgStability', 'avgRetention', 'avgRetentionConfidence', 'vocabByWeek', 'speakingMs', 'wpm',
  'wpmConfidence', 'uniqueWords', 'levelDistribution', 'levelConfidence', 'asOf', 'escopo', 'base',
]

describe('anônimo sem rede', () => {
  let sessaoId = ''
  let cartaoId = ''

  beforeAll(async () => {
    vi.stubGlobal('fetch', rede)
    definirIdentidade('anonimo')
    await limparTudo()
  })
  afterAll(async () => { await fecharStore(); vi.unstubAllGlobals() })

  it('salva uma sessão com falas e a lê de volta', async () => {
    const rec = await api.createSession({
      title: 'Aula', kind: 'live', sourceLang: 'pt', targetLang: 'en', status: 'done', durationMs: 65_000,
      utterances: [
        { idx: 0, sourceText: 'hello there friend', translatedText: 'olá amigo', tStartMs: 0, tEndMs: 2000 },
        { idx: 1, sourceText: 'how are you', translatedText: 'como vai', tStartMs: 2000, tEndMs: 3500 },
      ],
    })
    sessaoId = rec.id
    expect(rec.title).toBe('Aula')
    expect(rec.wordCount).toBe(6)
    expect(rec.date).toBe('Hoje')
    const lista = await api.fetchSessions()
    expect(lista.map((r) => r.id)).toEqual([sessaoId])
    const t = await api.fetchSessionTranscript(sessaoId)
    expect(t.utterances).toHaveLength(2)
    expect(t.utterances[1].translatedText).toBe('como vai')
  })

  it('capa, título e áudio ficam no navegador e voltam iguais', async () => {
    const comCapa = await api.patchSessionMeta(sessaoId, { imageUrl: 'https://x/capa.jpg' })
    expect(comCapa?.imageUrl).toBe('https://x/capa.jpg')
    const renomeada = await api.updateSession(sessaoId, { title: 'Aula 1' })
    expect(renomeada?.title).toBe('Aula 1')
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const url = await api.uploadSessionAudio(sessaoId, new Blob([bytes], { type: 'audio/webm' }))
    expect(url).toBe(`/api/sessions/${sessaoId}/audio`)
    const res = await api.apiFetch(url!)
    expect(res.ok).toBe(true)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
    expect((await api.fetchSessions())[0].audioUrl).toBe(url)
  })

  it('cartões deduplicam por palavra+idioma e a revisão aplica FSRS', async () => {
    const r = await api.bulkAddCards([
      { word: 'friend', back: 'amigo', srcLang: 'en', tgtLang: 'pt', sessionId: sessaoId },
      { word: 'Friend', back: 'amigo', srcLang: 'en', tgtLang: 'pt', sessionId: sessaoId },
      { word: 'hello', back: 'olá', srcLang: 'en', tgtLang: 'pt', sessionId: sessaoId },
      { word: '', srcLang: 'en' },
    ])
    expect(r.cards).toHaveLength(2)
    expect(r.skipped).toHaveLength(1)
    const deck = await api.fetchDeck()
    expect(deck).toHaveLength(2)
    cartaoId = deck.find((c) => c.word === 'friend')!.id
    expect(deck.find((c) => c.word === 'friend')!.fsrsState).toBe('New')
    const revisado = await api.reviewCard(cartaoId, 3)
    expect(revisado.fsrsState).toBe('Learning')
    expect(revisado.fsrsStability).toBeGreaterThan(0)
    const arquivado = await api.updateCard(cartaoId, { inDeck: false })
    expect(arquivado.inDeck).toBe(false)
    await api.updateCard(cartaoId, { inDeck: true })
  })

  it('as métricas têm TODOS os campos do contrato e refletem o que foi feito', async () => {
    const m = await api.fetchMetrics()
    expect(m).not.toBeNull()
    for (const k of CAMPOS_DE_METRICAS) expect(m, `faltou ${k}`).toHaveProperty(k)
    expect(m!.sessions).toBe(1)
    expect(m!.deckSize).toBe(2)
    expect(m!.reviews).toBe(1)
    expect(m!.correctReviews).toBe(1)
    expect(m!.streakDays).toBe(1)
    expect(m!.speakingMs).toBe(3500)
    expect(m!.escopo).toBe('global')
    const daSessao = await api.fetchMetrics(sessaoId)
    expect(daSessao!.escopo).toBe('sessao')
  })

  it('preferências persistem e o patch mescla em vez de sobrescrever', async () => {
    expect(await api.fetchSettings()).not.toBeNull()
    await api.patchUiSettings({ onboarded: true })
    await api.patchUiSettings({ theme: 'noite' })
    const s = await api.fetchSettings()
    expect(JSON.parse(s!.ui!)).toEqual({ onboarded: true, theme: 'noite' })
  })

  it('rodadas, histórico, recordes e seeds (idempotente) funcionam sem conta', async () => {
    const g = await api.salvarRodada({
      roundId: 'r1', exerciseKind: 'termo', origem: 'baralho', score: 80,
      itens: [{ itemRef: 'friend', correct: 1, attempts: 1, ms: 900 }, { itemRef: 'hello', correct: 0, attempts: 2, ms: 1800 }],
    })
    expect(g.ok).toBe(true)
    expect(await api.fetchExerciseResults(undefined, { origem: 'baralho' })).toHaveLength(2)
    const hist = await api.fetchHistoricoDeItens({ origem: 'baralho' })
    expect(hist.find((h) => h.itemRef === 'hello')).toMatchObject({ vezes: 1, erros: 1, ultimoAcerto: false })
    const rec = await api.fetchRecordes({ origem: 'baralho' })
    expect(rec).toEqual([{ exerciseKind: 'termo', melhorPontos: 80, melhorEm: expect.any(Number), rodadas: 1, melhorCombo: expect.any(Number), precisao: expect.any(Number), ultimaEm: expect.any(Number) }])
    const a = await api.gastarSeeds({ spendId: 'compra-0001', amount: 5, reason: 'dica' })
    const b = await api.gastarSeeds({ spendId: 'compra-0001', amount: 5, reason: 'dica' })
    expect(a).toMatchObject({ jaExistia: false, seedsGastas: 5 })
    expect(b).toMatchObject({ jaExistia: true, seedsGastas: 5 })
    expect((await api.fetchMetrics())!.seedsGastas).toBe(5)
  })

  it('o plano do anônimo é "sem conta", tudo fechado', async () => {
    const e = await carregarEntitlements()
    expect(e.plan).toBe('anonimo')
    expect(e.managedCloudStt).toBe(false)
    expect(e.youtubeImport).toBe(false)
  })

  it('o que exige conta responde "conta necessária" — e ainda assim nada vai à rede', async () => {
    await expect(api.importYoutube('https://youtu.be/x')).rejects.toThrow(/conta/)
    expect(await api.searchImages('cat')).toEqual([])
    expect(await api.listCredentials()).toEqual([])
  })

  it('apagar remove sessão, falas e áudio', async () => {
    expect(await api.deleteSession(sessaoId)).toBe(true)
    expect(await api.fetchSessions()).toEqual([])
    await expect(api.fetchSessionTranscript(sessaoId)).rejects.toThrow()
    expect((await api.apiFetch(`/api/sessions/${sessaoId}/audio`)).status).toBe(404)
  })

  it('SENTINELA: nenhuma requisição sai, exceto a busca de imagem opt-in (Openverse)', () => {
    /* A ÚNICA exceção documentada (2026-08-27): a busca de imagem do popover de palavra vai
       direto ao Openverse quando não há servidor — sai só a PALAVRA pesquisada, num gesto
       explícito do usuário. Nada da sessão, nada de identificador. Qualquer outra URL derruba. */
    for (const chamada of rede.mock.calls) {
      const url = String(chamada[0])
      expect(url.startsWith('https://api.openverse.org/'), `URL inesperada: ${url}`).toBe(true)
    }
  })
})
