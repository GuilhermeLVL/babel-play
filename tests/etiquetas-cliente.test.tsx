// @vitest-environment jsdom
/**
 * AS ETIQUETAS DE PALAVRAS NO CLIENTE: as rotas (ETag, 501, teto da nota), o modo convidado CONTRA O SERVIDOR SEM CONTA
 * DE VERDADE (o efêmero responde 501 e o cliente fica sem índice), o índice da página (snapshot estável, palavra
 * fichada agora) e a pintura (atributo na palavra, descrição na linha, Faixa sem o ponto, desligar remove).
 */
import 'fake-indexeddb/auto'

import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({
  supabase: null,
  authRequired: true,
  carregarSupabase: async () => null,
  getAccessToken: async () => null,
}))

import LinhaDaLegenda, { type LegendaAoVivo } from '../src/components/views/captura/legendas/LinhaDaLegenda'
import HistoricoDoPrototipo from '../src/components/views/captura/quest/HistoricoDoPrototipo'
import { SESSOES_MINIMAS_PARA_NOVA } from '../src/core/vocabulario/etiquetas'
import * as api from '../src/data/api'
import { CODIGO_EXIGE_CONTA, servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../src/data/efemero/store'
import { esquecerAjustesDoAssistente, mudarAjustesDoAssistente } from '../src/lib/assistente/ajustesDoAssistente'
import type { SpeechSegment } from '../src/lib/captura/tiposDaFala'
import {
  carregarCaderno,
  esquecerIndiceDeEtiquetas,
  lerSnapshotDasEtiquetas,
  marcarSalva,
  pedirVistas,
  renovarVistas,
  useEtiquetador,
} from '../src/lib/etiquetas/indiceDeEtiquetas'
import { definirIdentidade } from '../src/lib/identidade'

const json = (corpo: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init })

/** Uma linha do baralho como o servidor a manda (o mínimo que `rowToVocabCard` lê). */
const linha = (word: string, srcLang: string, fase: 'nova' | 'aprendendo') => ({
  id: `c-${word}`,
  word,
  back: 'x',
  sentence: null,
  srcLang,
  tgtLang: 'pt',
  clozePrompt: null,
  clozeAnswer: null,
  box: 1,
  dueAt: Date.now() + 86_400_000,
  stability: fase === 'nova' ? null : 2,
  difficulty: 5,
  reps: fase === 'nova' ? 0 : 1,
  lastReview: Date.now(),
  sessionId: null,
  inDeck: 1,
  cefrLevel: null,
  cefrConfidence: null,
})

/** A rede de uma conta: o baralho, as vistas (com ETag) e a lista de sessões. */
function redeDaConta(o: { vistas?: unknown; status?: number; sessoes?: number } = {}) {
  const pedidos: Array<{ url: string; init?: RequestInit }> = []
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init })
    if (url === '/api/vocab') return json([linha('report', 'en', 'aprendendo'), linha('Água', 'pt', 'nova')])
    if (url.startsWith('/api/vocab/vistas')) {
      if (o.status) return json({ codigo: 'x' }, { status: o.status })
      const etag = new Headers(init?.headers).get('If-None-Match')
      if (etag === '"v1"') return new Response(null, { status: 304 })
      return json(o.vistas ?? { lang: 'en', chaves: ['report', 'answer'], truncado: false }, {
        headers: { etag: '"v1"' },
      })
    }
    if (url === '/api/sessions')
      return json(
        Array.from({ length: o.sessoes ?? SESSOES_MINIMAS_PARA_NOVA }, (_, i) => ({
          id: `s${i}`,
          title: 'S',
          createdAt: Date.now(),
          durationMs: 1000,
          wordCount: 10,
          kind: 'live',
          status: 'done',
          meta: null,
          sourceLang: 'en-US',
        })),
      )
    if (url.includes('/nota')) return json({ id: 'c1', nota: 'ok' })
    return json({}, { status: 404 })
  })
  return { fetch, pedidos }
}

const segmento = (id: string, originalText: string, translatedText = ''): SpeechSegment =>
  ({ id, timestamp: '10:00', originalText, translatedText, lang: 'en', isPartial: false }) as SpeechSegment

beforeEach(() => {
  localStorage.clear()
  esquecerAjustesDoAssistente()
  esquecerIndiceDeEtiquetas()
  api.esquecerPalavrasVistas()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('as rotas do histórico da palavra (com conta)', () => {
  beforeEach(() => definirIdentidade('conta'))

  it('vistas: o ETag volta no If-None-Match e o 304 reaproveita a lista', async () => {
    const r = redeDaConta()
    vi.stubGlobal('fetch', r.fetch)
    const a = await api.fetchPalavrasVistas('en')
    expect(a).toEqual({ lang: 'en', chaves: ['report', 'answer'], truncado: false })
    const b = await api.fetchPalavrasVistas('en')
    expect(b).toEqual(a)
    const vistas = r.pedidos.filter((p) => p.url.startsWith('/api/vocab/vistas'))
    expect(new Headers(vistas[1].init?.headers).get('If-None-Match')).toBe('"v1"')
  })

  it('vistas: 501 (sem conta), 404 e erro de rede viram null', async () => {
    for (const status of [501, 404]) {
      api.esquecerPalavrasVistas()
      vi.stubGlobal('fetch', redeDaConta({ status }).fetch)
      expect(await api.fetchPalavrasVistas('en')).toBeNull()
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('rede'))),
    )
    expect(await api.fetchPalavrasVistas('en')).toBeNull()
  })

  it('vistas sem o campo truncado (servidor antigo) contam como parciais: nenhum ponto errado', async () => {
    vi.stubGlobal('fetch', redeDaConta({ vistas: { lang: 'en', chaves: ['a'] } }).fetch)
    expect((await api.fetchPalavrasVistas('en'))?.truncado).toBe(true)
  })

  it('nota: PUT com o corpo cortado em 500 caracteres', async () => {
    const r = redeDaConta()
    vi.stubGlobal('fetch', r.fetch)
    expect(await api.salvarNotaDoCartao('c1', 'x'.repeat(620))).toBe(true)
    const pedido = r.pedidos.find((p) => p.url === '/api/vocab/c1/nota')!
    expect(pedido.init?.method).toBe('PUT')
    expect(JSON.parse(String(pedido.init?.body)).nota).toHaveLength(api.TETO_DA_NOTA)
  })
})

describe('convidado: o servidor sem conta de verdade', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: unknown) => {
        throw new Error(`REDE PROIBIDA: ${String(url)}`)
      }),
    )
    definirIdentidade('anonimo')
    await limparTudo()
  })
  afterAll(async () => {
    await fecharStore()
  })

  it('as três rotas respondem 501 exige_conta no servidor efêmero', async () => {
    for (const [rota, method] of [
      ['/api/vocab/vistas?lang=en', 'GET'],
      ['/api/vocab/palavra?lang=en&chave=report', 'GET'],
      ['/api/vocab/c1/nota', 'PUT'],
    ] as const) {
      const res = await servidorEfemero(rota, { method, body: method === 'PUT' ? '{"nota":"x"}' : undefined })
      expect(res.status, rota).toBe(501)
      expect(((await res.json()) as { codigo?: string }).codigo).toBe(CODIGO_EXIGE_CONTA)
    }
  })

  it('o cliente fica sem índice (sem ponto) e o caderno local ainda pinta', async () => {
    expect(await api.fetchPalavrasVistas('en')).toBeNull()
    expect(await api.fetchHistoricoDaPalavra('en', 'report')).toBeNull()
    expect(await api.salvarNotaDoCartao('c1', 'x')).toBe(false)
    await api.bulkAddCards([{ word: 'report', back: 'relatório', srcLang: 'en', tgtLang: 'pt' }])
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] }))
    await waitFor(() => expect(lerSnapshotDasEtiquetas().caderno).not.toBeNull())
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')).toBeNull())
    expect(result.current?.etiqueta('report', 'en')).toBe('salva')
    expect(result.current?.etiqueta('answer', 'en')).toBeUndefined()
  })
})

describe('o índice da página', () => {
  beforeEach(() => definirIdentidade('conta'))

  it('caderno e vistas: tintas pelo estado, o ponto onde o índice não viu, e o snapshot estável', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    const { result, rerender } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt-BR', idiomas: ['en-US'] }))
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')).toBeTruthy())
    const e = result.current!
    expect(e.etiqueta('Report.', 'en')).toBe('aprendendo')
    expect(e.etiqueta('agua', 'pt')).toBe('salva')
    expect(e.etiqueta('answer', 'en')).toBeUndefined()
    expect(e.etiqueta('scrutinize', 'en')).toBe('nova-para-voce')
    expect(e.semNova().etiqueta('scrutinize', 'en')).toBeUndefined()
    /* Nada mudou: o mesmo etiquetador (as linhas `memo` não repintam). */
    const antes = lerSnapshotDasEtiquetas()
    rerender()
    expect(result.current).toBe(e)
    expect(lerSnapshotDasEtiquetas()).toBe(antes)
  })

  it(`com menos de ${SESSOES_MINIMAS_PARA_NOVA} sessões no idioma, nenhum ponto`, async () => {
    vi.stubGlobal('fetch', redeDaConta({ sessoes: SESSOES_MINIMAS_PARA_NOVA - 1 }).fetch)
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] }))
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')).toBeTruthy())
    expect(result.current?.etiqueta('scrutinize', 'en')).toBeUndefined()
  })

  it('índice truncado: nenhum ponto', async () => {
    vi.stubGlobal('fetch', redeDaConta({ vistas: { lang: 'en', chaves: [], truncado: true } }).fetch)
    pedirVistas('en')
    await carregarCaderno()
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')?.truncado).toBe(true))
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] }))
    expect(result.current?.etiqueta('scrutinize', 'en')).toBeUndefined()
  })

  it('a palavra fichada agora pinta como salva antes de o caderno ser relido', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    await carregarCaderno()
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: [] }))
    expect(result.current?.etiqueta('checked', 'en')).toBeUndefined()
    act(() => marcarSalva('Checked'))
    expect(result.current?.etiqueta('checked', 'en')).toBe('salva')
    expect(result.current?.salva('CHECKED!', 'en')).toBe(true)
  })

  it('"Etiquetas de palavras" desligado: nenhum etiquetador; o sub-ajuste só tira o ponto', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] }))
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')).toBeTruthy())
    act(() => mudarAjustesDoAssistente({ etiquetaNova: false }))
    expect(result.current?.etiqueta('scrutinize', 'en')).toBeUndefined()
    expect(result.current?.etiqueta('report', 'en')).toBe('aprendendo')
    act(() => mudarAjustesDoAssistente({ etiquetas: false }))
    expect(result.current).toBeNull()
  })
})

describe('a pintura', () => {
  beforeEach(() => definirIdentidade('conta'))

  function Legenda({ falas }: { falas: SpeechSegment[] }) {
    const etiquetador = useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] })
    return (
      <HistoricoDoPrototipo falas={falas} escala={1} idiomaPadrao="en" aoTocar={() => {}} etiquetador={etiquetador} />
    )
  }

  it('legenda da captura: atributo na palavra (mesmo texto) e a descrição na linha, sem nó novo', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    const falas = [segmento('1', 'The report was a scrutinize answer', 'O relatório…')]
    const { container } = render(<Legenda falas={falas} />)
    await waitFor(() =>
      expect(container.querySelector('.q-o [data-etiqueta="nova-para-voce"]')?.textContent).toBe('scrutinize'),
    )
    expect(container.querySelector('.q-o')?.textContent).toBe('The report was a scrutinize answer')
    expect(container.querySelector('.q-o [data-etiqueta="aprendendo"]')?.textContent).toBe('report')
    /* "the", "a", "was": palavras-função não ganham ponto; "answer" o índice já viu. */
    expect([...container.querySelectorAll('.q-o [data-etiqueta]')].map((e) => e.textContent)).toEqual([
      'report',
      'scrutinize',
    ])
    expect(container.querySelector('.q-fala')?.getAttribute('aria-description')).toBe(
      'Aprendendo: report. Novas para você: scrutinize.',
    )
  })

  it('falas novas chegando NÃO pedem o índice de novo; renovar (janela aberta, captura encerrada) pede', async () => {
    const r = redeDaConta()
    vi.stubGlobal('fetch', r.fetch)
    const pedidasDasVistas = () => r.pedidos.filter((p) => p.url.startsWith('/api/vocab/vistas')).length
    const falas = [segmento('1', 'The report was a scrutinize answer', 'O relatório…')]
    const { container, rerender } = render(<Legenda falas={falas} />)
    await waitFor(() => expect(container.querySelector('[data-etiqueta="nova-para-voce"]')).not.toBeNull())
    expect(pedidasDasVistas()).toBe(1)
    /* Vinte falas chegando, uma a uma, com parciais no meio. */
    let agora = falas
    for (let i = 2; i <= 21; i++) {
      agora = [...agora, { ...segmento(String(i), `Bring the report number ${i}`), isPartial: true }]
      rerender(<Legenda falas={agora} />)
      agora = agora.map((f) => (f.id === String(i) ? { ...f, isPartial: false, translatedText: 'Traga…' } : f))
      rerender(<Legenda falas={agora} />)
    }
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 50))
    })
    expect(pedidasDasVistas()).toBe(1)
    /* A janela abriu ou a captura acabou: uma revalidação, com o ETag (304, sem a lista). */
    act(() => renovarVistas(['en']))
    await waitFor(() => expect(pedidasDasVistas()).toBe(2))
    const ultima = r.pedidos.filter((p) => p.url.startsWith('/api/vocab/vistas'))[1]
    expect(new Headers(ultima.init?.headers).get('If-None-Match')).toBe('"v1"')
    /* Renovar duas vezes seguidas não empilha pedidos. */
    act(() => {
      renovarVistas(['en'])
      renovarVistas(['en'])
    })
    await waitFor(() => expect(pedidasDasVistas()).toBe(3))
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 30))
    })
    expect(pedidasDasVistas()).toBe(3)
  })

  it('desligar remove as etiquetas da legenda', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    const falas = [segmento('1', 'The report was fine', 'O relatório…')]
    const { container } = render(<Legenda falas={falas} />)
    await waitFor(() => expect(container.querySelector('[data-etiqueta]')).not.toBeNull())
    act(() => mudarAjustesDoAssistente({ etiquetas: false }))
    expect(container.querySelector('[data-etiqueta]')).toBeNull()
    expect(container.querySelector('.q-fala')?.hasAttribute('aria-description')).toBe(false)
  })

  it('janela flutuante: a Faixa fica com a tinta e sem o ponto', async () => {
    vi.stubGlobal('fetch', redeDaConta().fetch)
    const { result } = renderHook(() => useEtiquetador({ langDaPessoa: 'pt', idiomas: ['en'] }))
    await waitFor(() => expect(lerSnapshotDasEtiquetas().vistas.get('en')).toBeTruthy())
    const f: LegendaAoVivo = {
      id: '1',
      quem: 'Outros',
      original: 'The report, scrutinize!',
      traducao: '',
      lado: 'eles',
      lang: 'en',
    }
    const montar = (etiquetador: typeof result.current) =>
      render(
        <LinhaDaLegenda
          fala={f}
          modo="jogo"
          modoDaTraducao="sempre"
          traducaoVisivel
          emFoco
          aoTocarPalavra={() => {}}
          aoCopiar={() => {}}
          etiquetador={etiquetador}
        />,
      )
    const cheia = montar(result.current)
    expect(cheia.container.querySelector('[data-palavra="scrutinize"]')?.getAttribute('data-etiqueta')).toBe(
      'nova-para-voce',
    )
    cheia.unmount()
    const faixa = montar(result.current!.semNova())
    expect(faixa.container.querySelector('[data-palavra="report"]')?.getAttribute('data-etiqueta')).toBe('aprendendo')
    expect(faixa.container.querySelector('[data-palavra="scrutinize"]')?.hasAttribute('data-etiqueta')).toBe(false)
    expect(faixa.container.querySelector('.leg-o')?.textContent).toBe('The report, scrutinize!')
  })
})

void React
