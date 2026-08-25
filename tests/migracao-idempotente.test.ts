// @vitest-environment jsdom
/**
 * Fatia 5 / passo 7 — a migração sem conta → conta sobe UMA vez e deixa o navegador limpo.
 *
 * O "servidor" aqui é um Map por `origemLocalId` que imita o contrato real (200 + jaExistia no
 * reenvio; vocab deduplicado por palavra). O que o teste prova é o CLIENTE: repetir a migração não
 * duplica, falha de áudio não perde a sessão, falha de sessão a mantém local para a próxima vez.
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null, authRequired: true, carregarSupabase: async () => null, getAccessToken: async () => null,
}))

import { definirIdentidade } from '../src/lib/identidade'
import { abrirStore, fecharStore, limparTudo } from '../src/data/efemero/store'
import { migrarParaConta, inventarioLocal } from '../src/data/migracao'
import * as api from '../src/data/api'

interface Servidor {
  sessoes: Map<string, { id: string; origemLocalId: string; title: string; falas: number }>
  audios: Map<string, number>
  cartoes: Set<string>
  recusarAudio: boolean
  recusarSessao: boolean
  chamadas: string[]
}

function servidorFalso(): Servidor {
  const s: Servidor = { sessoes: new Map(), audios: new Map(), cartoes: new Set(), recusarAudio: false, recusarSessao: false, chamadas: [] }
  const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { 'content-type': 'application/json' } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    s.chamadas.push(`${metodo} ${url}`)
    if (metodo === 'POST' && url === '/api/sessions') {
      if (s.recusarSessao) return json({ error: 'indisponível' }, 503)
      const p = JSON.parse(String(init!.body)) as { origemLocalId: string; title: string; utterances: unknown[] }
      const existente = [...s.sessoes.values()].find((x) => x.origemLocalId === p.origemLocalId)
      if (existente) return json({ ...existente, jaExistia: true })
      const nova = { id: `srv-${s.sessoes.size + 1}`, origemLocalId: p.origemLocalId, title: p.title, falas: p.utterances.length }
      s.sessoes.set(nova.id, nova)
      return json(nova)
    }
    const audio = url.match(/^\/api\/sessions\/([^/]+)\/audio$/)
    if (metodo === 'POST' && audio) {
      if (s.recusarAudio) return json({ error: 'quota' }, 507)
      s.audios.set(audio[1], (init!.body as ArrayBuffer).byteLength)
      return json({ ok: true })
    }
    if (metodo === 'POST' && url === '/api/vocab/bulk-add') {
      const p = JSON.parse(String(init!.body)) as { cards: Array<{ word: string; sessionId?: string }> }
      const novos = p.cards.filter((c) => !s.cartoes.has(c.word))
      for (const c of p.cards) s.cartoes.add(c.word)
      return json({ cards: novos.map((c) => ({ id: `c-${c.word}`, word: c.word, sessionId: c.sessionId ?? null })), skipped: [] })
    }
    return json({ error: `rota não prevista: ${metodo} ${url}` }, 500)
  }))
  return s
}

async function semearLocal() {
  definirIdentidade('anonimo')
  const a = await api.createSession({ title: 'Aula 1', kind: 'live', utterances: [{ idx: 0, sourceText: 'one two' }] })
  const b = await api.createSession({ title: 'Aula 2', kind: 'live', utterances: [{ idx: 0, sourceText: 'three' }] })
  await api.uploadSessionAudio(a.id, new Blob([new Uint8Array(16)], { type: 'audio/webm' }))
  await api.bulkAddCards([{ word: 'one', srcLang: 'en', sessionId: a.id }, { word: 'three', srcLang: 'en', sessionId: b.id }, { word: 'solo', srcLang: 'en' }])
  await api.salvarRodada({ roundId: 'r1', exerciseKind: 'termo', itens: [{ itemRef: 'one', correct: 1 }] })
  return { a, b }
}

describe('migração sem conta → conta', () => {
  beforeEach(async () => { await limparTudo() })
  afterEach(async () => { vi.unstubAllGlobals() })

  it('sobe sessões, áudio e cartões; repetir não duplica; o navegador fica limpo', async () => {
    const { a } = await semearLocal()
    expect(await inventarioLocal()).toEqual({ sessoes: 2, cartoes: 3, comAudio: 1, rodadas: 1 })
    const srv = servidorFalso()
    definirIdentidade('conta')

    const r1 = await migrarParaConta()
    expect(r1).toMatchObject({ sessoes: 2, jaExistiam: 0, audios: 1, audiosPendentes: 0, cartoes: 3, falhas: [] })
    expect([...srv.sessoes.values()].map((s) => s.origemLocalId).sort()).toContain(a.id)
    expect(srv.audios.size).toBe(1)
    expect(await inventarioLocal()).toEqual({ sessoes: 0, cartoes: 0, comAudio: 0, rodadas: 0 })

    const r2 = await migrarParaConta()
    expect(r2).toMatchObject({ sessoes: 0, jaExistiam: 0, audios: 0, cartoes: 0, falhas: [] })
    expect(srv.sessoes.size).toBe(2)
  })

  it('se a sessão já estava na conta (reenvio), o servidor diz jaExistia e nada duplica', async () => {
    const { a } = await semearLocal()
    const srv = servidorFalso()
    srv.sessoes.set('srv-antiga', { id: 'srv-antiga', origemLocalId: a.id, title: 'Aula 1', falas: 1 })
    definirIdentidade('conta')
    const r = await migrarParaConta()
    expect(r.jaExistiam).toBe(1)
    expect(r.sessoes).toBe(1)
    expect(srv.sessoes.size).toBe(2)
    expect(srv.audios.has('srv-antiga')).toBe(true)
  })

  it('áudio recusado pelo plano NÃO segura a sessão: ela sobe, o áudio fica pendente no navegador', async () => {
    const { a } = await semearLocal()
    const srv = servidorFalso()
    srv.recusarAudio = true
    definirIdentidade('conta')
    const r = await migrarParaConta()
    expect(r).toMatchObject({ sessoes: 2, audios: 0, audiosPendentes: 1 })
    const db = await abrirStore()
    const local = await db.get('sessoes', a.id)
    expect(local?.audioPendente).toBe(true)
    expect(local?.idServidor).toMatch(/^srv-/)
    expect(await db.count('audios')).toBe(1)
    expect(await db.count('cartoes')).toBe(0)
  })

  it('servidor fora: nada é apagado, a falha é contada, e a próxima tentativa completa', async () => {
    await semearLocal()
    const srv = servidorFalso()
    srv.recusarSessao = true
    definirIdentidade('conta')
    const r1 = await migrarParaConta()
    expect(r1.falhas).toHaveLength(2)
    expect(r1.falhas[0].etapa).toBe('sessao')
    // As duas sessões (e os cartões DELAS) ficam; o cartão avulso é unidade própria e subiu.
    expect(await inventarioLocal()).toEqual({ sessoes: 2, cartoes: 2, comAudio: 1, rodadas: 1 })
    expect(r1.cartoes).toBe(1)

    srv.recusarSessao = false
    const r2 = await migrarParaConta()
    expect(r2).toMatchObject({ sessoes: 2, cartoes: 2, falhas: [] })
    expect(await inventarioLocal()).toEqual({ sessoes: 0, cartoes: 0, comAudio: 0, rodadas: 0 })
  })

  it('recusa rodar sem identidade de conta (senão copiaria o local para ele mesmo)', async () => {
    definirIdentidade('anonimo')
    await expect(migrarParaConta()).rejects.toThrow(/conta/)
  })
})

afterEach(async () => { await fecharStore() })
