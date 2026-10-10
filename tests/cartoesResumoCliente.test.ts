/**
 * O cliente de `GET /api/vocab/resumo`: guarda o último corpo com o ETag, manda `If-None-Match` e,
 * no 304, devolve o que guardou. Falha vira `null`, nunca um resumo inventado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('../src/data/funil', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { esquecerResumoDosCartoes, lerResumoDosCartoes } from '../src/data/rotas/cartoes'

const HOJE = Date.UTC(2026, 9, 5, 3, 0, 0)
const corpo = (total: number) => ({ agora: HOJE + 1000, inicioDoDia: HOJE, total })
const ok = (total: number, etag?: string) =>
  new Response(JSON.stringify(corpo(total)), { status: 200, headers: etag ? { etag } : {} })
const naoMudou = () => new Response(null, { status: 304 })
const cabecalhos = (chamada: number) =>
  (apiFetch.mock.calls[chamada][1] as { headers?: Record<string, string> } | undefined)?.headers

describe('lerResumoDosCartoes', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    esquecerResumoDosCartoes()
  })

  it('200: devolve o corpo e pede a rota com o começo do dia', async () => {
    apiFetch.mockResolvedValueOnce(ok(7, 'W/"v1"'))
    expect(await lerResumoDosCartoes(HOJE)).toEqual(corpo(7))
    expect(apiFetch.mock.calls[0][0]).toBe(`/api/vocab/resumo?inicioDoDia=${HOJE}`)
    expect(cabecalhos(0)).toBeUndefined()
  })

  it('304: manda o ETag guardado e devolve o corpo guardado', async () => {
    apiFetch.mockResolvedValueOnce(ok(7, 'W/"v1"')).mockResolvedValueOnce(naoMudou())
    await lerResumoDosCartoes(HOJE)
    expect(await lerResumoDosCartoes(HOJE)).toEqual(corpo(7))
    expect(cabecalhos(1)).toEqual({ 'If-None-Match': 'W/"v1"' })
  })

  it('200 depois de guardar: troca o guardado pelo novo', async () => {
    apiFetch
      .mockResolvedValueOnce(ok(7, 'W/"v1"'))
      .mockResolvedValueOnce(ok(8, 'W/"v2"'))
      .mockResolvedValueOnce(naoMudou())
    await lerResumoDosCartoes(HOJE)
    expect((await lerResumoDosCartoes(HOJE))?.total).toBe(8)
    expect((await lerResumoDosCartoes(HOJE))?.total).toBe(8)
    expect(cabecalhos(2)).toEqual({ 'If-None-Match': 'W/"v2"' })
  })

  it('a memória vale por começo de dia: outro dia não manda o ETag do anterior', async () => {
    apiFetch.mockResolvedValueOnce(ok(7, 'W/"v1"')).mockResolvedValueOnce(ok(9, 'W/"v3"'))
    await lerResumoDosCartoes(HOJE)
    expect((await lerResumoDosCartoes(HOJE + 86_400_000))?.total).toBe(9)
    expect(apiFetch.mock.calls[1][0]).toBe(`/api/vocab/resumo?inicioDoDia=${HOJE + 86_400_000}`)
    expect(cabecalhos(1)).toBeUndefined()
  })

  it('sem ETag na resposta não guarda nada', async () => {
    apiFetch.mockResolvedValueOnce(ok(7)).mockResolvedValueOnce(ok(7))
    await lerResumoDosCartoes(HOJE)
    await lerResumoDosCartoes(HOJE)
    expect(cabecalhos(1)).toBeUndefined()
  })

  it('falha do servidor devolve null, e a memória continua valendo depois', async () => {
    apiFetch
      .mockResolvedValueOnce(ok(7, 'W/"v1"'))
      .mockResolvedValueOnce(new Response('{"error":"x"}', { status: 500 }))
      .mockResolvedValueOnce(naoMudou())
    await lerResumoDosCartoes(HOJE)
    expect(await lerResumoDosCartoes(HOJE)).toBeNull()
    expect((await lerResumoDosCartoes(HOJE))?.total).toBe(7)
  })

  it('rede fora do ar devolve null', async () => {
    apiFetch.mockRejectedValueOnce(new Error('sem rede'))
    expect(await lerResumoDosCartoes(HOJE)).toBeNull()
  })

  it('304 sem nada guardado é falha, não um resumo vazio', async () => {
    apiFetch.mockResolvedValueOnce(naoMudou())
    expect(await lerResumoDosCartoes(HOJE)).toBeNull()
  })

  it('sem argumento usa a meia-noite local de hoje', async () => {
    apiFetch.mockResolvedValueOnce(ok(1))
    await lerResumoDosCartoes()
    const meiaNoite = new Date()
    meiaNoite.setHours(0, 0, 0, 0)
    expect(apiFetch.mock.calls[0][0]).toBe(`/api/vocab/resumo?inicioDoDia=${meiaNoite.getTime()}`)
  })

  it('esquecerResumoDosCartoes zera a memória', async () => {
    apiFetch.mockResolvedValueOnce(ok(7, 'W/"v1"')).mockResolvedValueOnce(ok(7, 'W/"v1"'))
    await lerResumoDosCartoes(HOJE)
    esquecerResumoDosCartoes()
    await lerResumoDosCartoes(HOJE)
    expect(cabecalhos(1)).toBeUndefined()
  })
})
