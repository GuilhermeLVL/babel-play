// @vitest-environment jsdom
/**
 * REPARO LOCAL (modo sem conta / edição estática): a sessão em português gravada com cartões `en`
 * é consertada no IndexedDB antes da primeira leitura — e a leitura já sai certa.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null,
}))

import { chaveDedup } from '../src/core/texto/palavra'
import { esquecerReparoDeIdiomas, repararIdiomasLocais } from '../src/data/efemero/reparoDeIdioma'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { abrirStore, fecharStore, limparTudo } from '../src/data/efemero/store'

const FALA = 'Eu não sei se você vai conseguir terminar o trabalho hoje, porque a reunião atrasou muito.'

async function semear() {
  const db = await abrirStore()
  const agora = Date.now()
  await db.put('sessoes', {
    id: 's1', title: 'Captura', kind: 'live', createdAt: agora, updatedAt: agora, durationMs: 1000, wordCount: 16,
    sourceLang: 'pt-BR', targetLang: 'en-US', status: 'done', meta: null,
  })
  await db.put('falas', {
    id: 'f1', sessionId: 's1', idx: 0, speakerName: null, source: 'system', sourceLang: 'en', sourceText: FALA,
    targetLang: 'pt-BR', translatedText: '', tStartMs: 0, tEndMs: 1000, engine: 'whisper-local', confidence: null,
  })
  const base = {
    back: null, clozePrompt: null, clozeAnswer: null, box: 1, dueAt: agora, stability: null, difficulty: null,
    reps: null, lapses: null, lastReview: null, inDeck: 1, cefrLevel: null, cefrConfidence: null, createdAt: agora, occurrences: 1,
  }
  await db.put('cartoes', { ...base, id: 'c1', word: 'reunião', normKey: chaveDedup('reunião', 'en-US'), sentence: FALA, srcLang: 'en-US', tgtLang: 'pt-BR', sessionId: 's1' })
  await db.put('cartoes', { ...base, id: 'c2', word: 'trabalho', normKey: chaveDedup('trabalho', 'en-US'), sentence: FALA, srcLang: 'en-US', tgtLang: 'pt-BR', sessionId: 's1' })
  // A mesma palavra já fichada DEPOIS da correção, em português: o antigo não pode colidir com ela.
  await db.put('cartoes', { ...base, id: 'c3', word: 'trabalho', normKey: chaveDedup('trabalho', 'pt-BR'), sentence: FALA, srcLang: 'pt-BR', tgtLang: 'en-US', sessionId: 's1' })
}

describe('reparo local do idioma', () => {
  beforeEach(async () => {
    await limparTudo()
    esquecerReparoDeIdiomas()
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterAll(async () => {
    await fecharStore()
  })

  it('reetiqueta fala e cartão, troca a chave e respeita o cartão que já existe', async () => {
    await semear()
    const r = await repararIdiomasLocais()
    expect(r).toEqual({ falas: 1, cartoes: 1, sessoes: 0, conflitos: 1 })
    const db = await abrirStore()
    expect((await db.get('falas', 'f1'))?.sourceLang).toBe('pt')
    const c1 = await db.get('cartoes', 'c1')
    expect(c1).toMatchObject({ srcLang: 'pt', tgtLang: 'en-US', normKey: chaveDedup('reunião', 'pt') })
    // Conflito: fica como estava (nada apagado, nada fundido).
    expect(await db.get('cartoes', 'c2')).toMatchObject({ srcLang: 'en-US' })
    expect(await db.count('cartoes')).toBe(3)
  })

  it('é idempotente: a segunda passada não muda nada além do conflito já relatado', async () => {
    await semear()
    await repararIdiomasLocais()
    expect(await repararIdiomasLocais()).toEqual({ falas: 0, cartoes: 0, sessoes: 0, conflitos: 1 })
  })

  it('a leitura pela rota (GET /api/vocab) já devolve o cartão em português', async () => {
    await semear()
    const res = await servidorEfemero('/api/vocab')
    const cartoes = (await res.json()) as Array<{ id: string; srcLang: string }>
    expect(cartoes.find((c) => c.id === 'c1')?.srcLang).toBe('pt')
  })
})
