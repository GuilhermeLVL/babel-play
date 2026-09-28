// @vitest-environment jsdom
/**
 * O ESPELHO SEM CONTA NO FIM DA CAPTURA (relato do dono, 2026-09-28: "encerrar trava e eu fico
 * preso na tela").
 *
 * Três garantias do lado do IndexedDB:
 *  - o teto é o da EDIÇÃO (`tetoAnonimoDa`): 5 na completa, 20 na estática;
 *  - reenviar a MESMA captura (mesmo `origemLocalId`) devolve a que já existe, inclusive quando o
 *    acervo já está no teto — a gravação que acabou de entrar é justamente a quinta, e o reenvio de
 *    uma tentativa que caiu no meio não pode virar um 507;
 *  - as falas entram em LOTES (`POST /api/sessions/:id/utterances`), e repetir um lote substitui a
 *    mesma faixa de `idx` em vez de duplicar.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function servidor() {
  const { servidorEfemero } = await import('../src/data/efemero/servidor')
  const { limparTudo } = await import('../src/data/efemero/store')
  await limparTudo()
  return async (metodo: string, caminho: string, corpo?: unknown) => {
    const res = await servidorEfemero(caminho, {
      method: metodo,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
}

const sessao = (i: number, extra: Record<string, unknown> = {}) => ({
  title: `s${i}`,
  kind: 'live',
  sourceLang: 'en',
  targetLang: 'pt',
  status: 'done',
  utterances: [{ idx: 0, source: 'system', sourceText: `fala ${i}` }],
  ...extra,
})

afterEach(async () => {
  const { fecharStore } = await import('../src/data/efemero/store')
  await fecharStore()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('teto por edição no espelho', () => {
  it('edição completa: a 6ª gravação recebe 507 TETO_ANONIMO com o texto do teto', async () => {
    const pedir = await servidor()
    for (let i = 0; i < 5; i++) expect((await pedir('POST', '/api/sessions', sessao(i))).status).toBe(200)
    const sexta = await pedir('POST', '/api/sessions', sessao(5))
    expect(sexta.status).toBe(507)
    expect(sexta.body).toMatchObject({ codigo: 'TETO_ANONIMO', recurso: 'sessoes', teto: 5 })
    expect(sexta.body.error).toContain('5 gravações')
  })

  it('edição estática: cabem 20; a 21ª recebe 507', async () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    vi.resetModules()
    const pedir = await servidor()
    for (let i = 0; i < 20; i++) expect((await pedir('POST', '/api/sessions', sessao(i))).status).toBe(200)
    const r = await pedir('POST', '/api/sessions', sessao(20))
    expect(r.status).toBe(507)
    expect(r.body.teto).toBe(20)
    expect(r.body.error).toContain('20 gravações')
  })
})

describe('reenvio da mesma captura', () => {
  it('no teto, o mesmo origemLocalId devolve a sessão que já entrou (não um 507)', async () => {
    const pedir = await servidor()
    for (let i = 0; i < 4; i++) await pedir('POST', '/api/sessions', sessao(i))
    const quinta = await pedir('POST', '/api/sessions', sessao(4, { origemLocalId: 'captura-00000005' }))
    expect(quinta.status).toBe(200)
    const reenvio = await pedir('POST', '/api/sessions', sessao(4, { origemLocalId: 'captura-00000005' }))
    expect(reenvio.status).toBe(200)
    expect(reenvio.body).toMatchObject({ id: quinta.body.id, jaExistia: true })
  })
})

describe('falas em lotes', () => {
  it('POST /:id/utterances acrescenta; repetir o lote não duplica; a contagem acompanha', async () => {
    const pedir = await servidor()
    const criada = await pedir('POST', '/api/sessions', sessao(0, { utterances: [{ idx: 0, sourceText: 'um dois' }] }))
    const id = criada.body.id as string
    const lote = { utterances: [{ idx: 1, sourceText: 'três' }, { idx: 2, sourceText: 'quatro cinco' }] }
    const a = await pedir('POST', `/api/sessions/${id}/utterances`, lote)
    expect(a.status).toBe(200)
    expect(a.body.wordCount).toBe(5)
    const b = await pedir('POST', `/api/sessions/${id}/utterances`, lote)
    expect(b.status).toBe(200)
    expect(b.body.wordCount).toBe(5)
    const lida = await pedir('GET', `/api/sessions/${id}`)
    expect(lida.body.utterances.map((u: { idx: number }) => u.idx)).toEqual([0, 1, 2])
  })

  it('sessão que não existe: 404', async () => {
    const pedir = await servidor()
    const r = await pedir('POST', '/api/sessions/nao-existe/utterances', { utterances: [{ idx: 0 }] })
    expect(r.status).toBe(404)
  })
})

beforeEach(() => {
  vi.resetModules()
})
