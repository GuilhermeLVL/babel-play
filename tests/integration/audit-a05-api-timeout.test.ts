// @vitest-environment jsdom
/**
 * REGRESSÃO — A-05 (Alto): a camada de dados do cliente (`src/data/api.ts`) fazia 34 `fetch` SEM
 * timeout. Uma resposta que nunca chega deixava a UI presa em "carregando…" para sempre.
 * Correção: wrapper `apiFetch` injeta `AbortSignal.timeout` em todo request (rotas de import/upload
 * com teto folgado). Este teste prova, pelas funções públicas, que os requests carregam um signal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchSessions, importYoutube } from '../../src/data/api'

let captured: { signal: unknown } | null

function mockFetch(bodyJson: string) {
  captured = null
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url: string | URL | Request, opts?: RequestInit) => {
    captured = { signal: opts?.signal ?? null }
    return new Response(bodyJson, { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

afterEach(() => { vi.restoreAllMocks() })

const isAbortSignal = (s: unknown) => !!s && String((s as any)?.constructor?.name).includes('AbortSignal')

describe('A-05 — camada de dados com teto de tempo', () => {
  it('CORRIGIDO: um GET simples (fetchSessions) carrega um AbortSignal', async () => {
    mockFetch('[]')
    await fetchSessions()
    expect(captured?.signal).toBeTruthy()
    expect(isAbortSignal(captured?.signal)).toBe(true)
  })

  it('CORRIGIDO: uma rota longa (importYoutube) também carrega um AbortSignal', async () => {
    mockFetch('{"id":"x","needsClientStt":false,"captionKind":null}')
    await importYoutube('https://youtu.be/abc')
    expect(isAbortSignal(captured?.signal)).toBe(true)
  })
})
