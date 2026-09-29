// @vitest-environment jsdom
/**
 * O CLIENTE DAS SESSÕES NO FIM DA CAPTURA (relato do dono, 2026-09-28).
 *
 * `createSession` lançava `'falha ao salvar a sessão'` para QUALQUER recusa — o 507 do teto sem
 * conta ("esta edição guarda até N gravações…") chegava à tela como uma frase genérica, e a tela
 * reabria o Encerrar num laço sem saída. Aqui se trava:
 *  - o erro carrega o TEXTO do servidor, o código (`TETO_ANONIMO`) e o status;
 *  - a captura longa vai em lotes (o primeiro no POST, o resto em `POST /:id/utterances`), e nenhum
 *    pedido passa de `LOTE_DE_FALAS`;
 *  - uma retomada troca as falas em lotes também, e recusa lança em vez de devolver `null` calado.
 */
import 'fake-indexeddb/auto'

import { afterEach, describe, expect, it, vi } from 'vitest'

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

const SESSAO = { id: 's1', title: 't', kind: 'live', createdAt: 1, durationMs: 1, wordCount: 1, sourceLang: 'en', targetLang: 'pt', status: 'done', meta: null }

const falas = (n: number) => Array.from({ length: n }, (_, i) => ({ idx: i, source: 'system', sourceText: `fala ${i}` }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('createSession propaga a recusa do servidor', () => {
  it('507 TETO_ANONIMO: a mensagem, o código e o status chegam em ErroDeSessao', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => resposta(507, { error: 'Sem conta dá para guardar 5 gravações neste navegador.', codigo: 'TETO_ANONIMO', recurso: 'sessoes', teto: 5, usado: 5 })),
    )
    const { createSession, ErroDeSessao } = await import('../src/data/rotas/sessoes')
    const erro = await createSession({ title: 'x' }).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeSessao)
    expect(erro).toMatchObject({ status: 507, codigo: 'TETO_ANONIMO', message: 'Sem conta dá para guardar 5 gravações neste navegador.' })
  })

  it('400 do zod: o texto do servidor, não a frase genérica', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => resposta(400, { error: 'corpo inválido', code: 'validacao' })))
    const { createSession } = await import('../src/data/rotas/sessoes')
    await expect(createSession({ title: 'x' })).rejects.toMatchObject({ status: 400, codigo: 'validacao', message: 'corpo inválido' })
  })

  it('sem resposta (rede caiu): ErroDeSessao com status 0, nunca um throw cru', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { createSession, ErroDeSessao } = await import('../src/data/rotas/sessoes')
    const erro = await createSession({ title: 'x' }).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(ErroDeSessao)
    expect((erro as { status: number }).status).toBe(0)
  })
})

describe('criarSessaoEmLotes', () => {
  it('1.200 falas: POST com 500, depois dois lotes; nenhum pedido passa do lote', async () => {
    const chamadas: Array<{ url: string; n: number }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const corpo = JSON.parse(String(init?.body ?? '{}')) as { utterances?: unknown[] }
        chamadas.push({ url, n: corpo.utterances?.length ?? 0 })
        return resposta(200, SESSAO)
      }),
    )
    const { criarSessaoEmLotes, LOTE_DE_FALAS } = await import('../src/data/rotas/sessoes')
    const progresso: number[] = []
    const r = await criarSessaoEmLotes({ title: 't', origemLocalId: 'captura-0001', utterances: falas(1200) }, (f) => progresso.push(f))
    expect(r.id).toBe('s1')
    expect(chamadas).toEqual([
      { url: '/api/sessions', n: 500 },
      { url: '/api/sessions/s1/utterances', n: 500 },
      { url: '/api/sessions/s1/utterances', n: 200 },
    ])
    expect(Math.max(...chamadas.map((c) => c.n))).toBeLessThanOrEqual(LOTE_DE_FALAS)
    expect(progresso.at(-1)).toBe(1200)
  })

  it('lote que falha no meio: o erro sobe com o texto; repetir reusa o origemLocalId', async () => {
    let primeira = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/utterances') && primeira) {
          primeira = false
          return resposta(503, { error: 'banco ocupado' })
        }
        return resposta(200, url === '/api/sessions' && !primeira ? { ...SESSAO, jaExistia: true } : SESSAO)
      }),
    )
    const { criarSessaoEmLotes } = await import('../src/data/rotas/sessoes')
    const payload = { title: 't', origemLocalId: 'captura-0002', utterances: falas(700) }
    await expect(criarSessaoEmLotes(payload)).rejects.toMatchObject({ status: 503, message: 'banco ocupado' })
    const r = await criarSessaoEmLotes(payload)
    expect(r.id).toBe('s1')
  })

  it('no espelho sem conta (edição estática): 1.200 falas entram inteiras e em ordem', async () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    vi.resetModules()
    const { limparTudo } = await import('../src/data/efemero/store')
    await limparTudo()
    const { criarSessaoEmLotes, fetchSessionTranscript } = await import('../src/data/rotas/sessoes')
    const r = await criarSessaoEmLotes({ title: 'longa', origemLocalId: 'captura-0003', utterances: falas(1200) })
    const lida = await fetchSessionTranscript(r.id)
    expect(lida.utterances).toHaveLength(1200)
    expect(lida.utterances.at(-1)?.sourceText).toBe('fala 1199')
  })
})

describe('substituirFalasEmLotes (retomada)', () => {
  it('PUT com o primeiro lote e o resto acrescentado; recusa lança', async () => {
    const chamadas: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push(`${init?.method} ${url}`)
        return resposta(200, SESSAO)
      }),
    )
    const { substituirFalasEmLotes } = await import('../src/data/rotas/sessoes')
    await substituirFalasEmLotes('s1', falas(600))
    expect(chamadas).toEqual(['PUT /api/sessions/s1/utterances', 'POST /api/sessions/s1/utterances'])

    vi.stubGlobal('fetch', vi.fn(async () => resposta(404, { error: 'sessão não encontrada' })))
    await expect(substituirFalasEmLotes('s1', falas(3))).rejects.toMatchObject({ status: 404 })
  })
})
