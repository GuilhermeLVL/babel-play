// @vitest-environment jsdom
/**
 * O CENÁRIO DA SESSÃO no `meta` (E3 da Fase E): a captura do modo intérprete é salva com
 * `scenario: 'interprete'`. Trava-se aqui:
 *  - o `PATCH /meta` aceita só os cenários conhecidos (o resto é recusado pelo schema);
 *  - o servidor sem conta (IndexedDB) guarda o cenário como o Express;
 *  - a gravação lida de volta traz o `cenario`;
 *  - o salvamento da captura manda o cenário só quando o rascunho o traz.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { patchMetaSchema } from '../server/validation'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore } from '../src/data/efemero/store'
import { sessionToRecording } from '../src/data/rotas/sessoes'

const api = vi.hoisted(() => ({
  criarSessaoEmLotes: vi.fn(),
  substituirFalasEmLotes: vi.fn(),
  updateSession: vi.fn(async () => null),
  patchSessionMeta: vi.fn(async () => null),
  uploadSessionAudio: vi.fn(async () => null),
  bulkAddCards: vi.fn(async (cards: unknown[]) => ({ cards, skipped: [] })),
}))
/* Só o salvamento usa a API falsa; o servidor sem conta e a leitura da gravação são os reais. */
vi.mock('../src/data/api', async (original) => {
  const real = await original<typeof import('../src/data/api')>()
  return { ...real, ...api }
})

describe('patchMetaSchema: o cenário', () => {
  it('aceita os cenários conhecidos', () => {
    for (const scenario of ['media', 'conversation', 'mic', 'interprete'] as const)
      expect(patchMetaSchema.parse({ scenario })).toEqual({ scenario })
  })

  it('recusa cenário inventado', () => {
    expect(patchMetaSchema.safeParse({ scenario: 'qualquer' }).success).toBe(false)
  })
})

describe('sessionToRecording: o cenário', () => {
  const linha = (meta: string | null) => ({
    id: 's1',
    title: 'x',
    kind: 'live',
    createdAt: Date.now(),
    durationMs: 1000,
    wordCount: 2,
    status: 'done',
    sourceLang: 'pt',
    targetLang: 'en',
    meta,
  })

  it('lê o cenário do meta', () => {
    expect(sessionToRecording(linha(JSON.stringify({ scenario: 'interprete' })) as never).cenario).toBe('interprete')
  })

  it('sem cenário (ou inválido) fica ausente', () => {
    expect(sessionToRecording(linha(null) as never).cenario).toBeUndefined()
    expect(sessionToRecording(linha(JSON.stringify({ scenario: 42 })) as never).cenario).toBeUndefined()
  })
})

describe('servidor sem conta: o cenário no meta', () => {
  afterAll(() => fecharStore())

  it('guarda o cenário e mantém a capa', async () => {
    const criada = await servidorEfemero('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Conversa', kind: 'live', status: 'done', utterances: [] }),
    })
    const { id } = (await criada.json()) as { id: string }
    await servidorEfemero(`/api/sessions/${id}/meta`, {
      method: 'PATCH',
      body: JSON.stringify({ imageUrl: 'https://x/capa.jpg' }),
    })
    const res = await servidorEfemero(`/api/sessions/${id}/meta`, {
      method: 'PATCH',
      body: JSON.stringify({ scenario: 'interprete' }),
    })
    const sessao = (await res.json()) as { meta: string }
    expect(JSON.parse(sessao.meta)).toMatchObject({ scenario: 'interprete', imageUrl: 'https://x/capa.jpg' })
  })

  it('ignora cenário inventado', async () => {
    const criada = await servidorEfemero('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Outra', kind: 'live', status: 'done', utterances: [] }),
    })
    const { id } = (await criada.json()) as { id: string }
    const res = await servidorEfemero(`/api/sessions/${id}/meta`, {
      method: 'PATCH',
      body: JSON.stringify({ scenario: 'qualquer' }),
    })
    const sessao = (await res.json()) as { meta: string }
    expect(JSON.parse(sessao.meta).scenario).toBeUndefined()
  })
})

describe('salvarCaptura: o cenário', () => {
  const REC = {
    id: 's9',
    title: 'Conversa',
    date: 'Hoje',
    durationStr: '0:10',
    wordCount: 3,
    type: 'audio' as const,
    tags: [],
    status: 'Processado' as const,
  }
  const rascunho = (id: string, cenario?: 'interprete') => ({
    origemLocalId: id,
    resumeId: null,
    titulo: 'Conversa',
    capa: '',
    durationMs: 10_000,
    sourceLang: 'pt',
    targetLang: 'en',
    parConfigurado: { sourceLang: 'pt-BR', targetLang: 'en' },
    utterances: [{ idx: 0, source: 'mic', sourceLang: 'pt', sourceText: 'bom dia', translatedText: 'good morning' }],
    criadoEm: 1,
    ...(cenario ? { cenario } : {}),
  })

  beforeEach(() => {
    localStorage.clear()
    for (const f of Object.values(api)) f.mockClear()
    api.criarSessaoEmLotes.mockResolvedValue(REC)
  })

  it('a captura do intérprete leva scenario: interprete ao meta', async () => {
    const { salvarCaptura } = await import('../src/lib/captura/trabalhoDeSalvar')
    await salvarCaptura({
      origemLocalId: 'captura-cena0001',
      titulo: 'Conversa',
      preparar: async () => ({ rascunho: rascunho('captura-cena0001', 'interprete') }),
      audio: Promise.resolve(null),
      traduzir: vi.fn(async () => ({ text: 'x' })),
      aoSalvar: vi.fn(),
    })
    expect(api.patchSessionMeta).toHaveBeenCalledWith('s9', { scenario: 'interprete' })
  })

  it('a captura de sempre não mexe no meta', async () => {
    const { salvarCaptura } = await import('../src/lib/captura/trabalhoDeSalvar')
    await salvarCaptura({
      origemLocalId: 'captura-cena0002',
      titulo: 'Conversa',
      preparar: async () => ({ rascunho: rascunho('captura-cena0002') }),
      audio: Promise.resolve(null),
      traduzir: vi.fn(async () => ({ text: 'x' })),
      aoSalvar: vi.fn(),
    })
    expect(api.patchSessionMeta).not.toHaveBeenCalled()
  })
})
