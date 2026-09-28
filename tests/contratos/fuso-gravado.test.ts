// @vitest-environment jsdom
/**
 * O FUSO É DO SERVIDOR, NÃO DO PEDIDO — NAS DUAS PONTAS (revisão de 27/09, P1 e P2).
 *
 * O fuso vinha em cada pedido e valia o que viesse: trocar de fuso a cada chamada inventava um dia
 * novo — mais três baús, outra meta do dia, outras missões. E a ofensiva usava o fuso do PROCESSO.
 * Agora: o fuso é gravado no primeiro uso e só troca uma vez a cada 24 h (`decidirFuso`, core); o
 * teto do baú vale também numa janela MÓVEL de 24 h; a ofensiva conta no fuso gravado.
 *
 * O relógio é falso (só `Date`): a carência e a virada do dia são o que se prova.
 */
import 'fake-indexeddb/auto'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { BAUS_POR_DIA, decidirBau, situacaoDoBau } from '../../src/core/economiaAutoridade'
import { CARENCIA_DO_FUSO_MS, decidirFuso, diaNoFuso, FUSO_PADRAO } from '../../src/core/learning/economia'
import { fusoDoUsuarioLocal } from '../../src/data/efemero/fuso'
import { perfilEfemero } from '../../src/data/efemero/rotas/metricas'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let exerciseResultsRepo: any
let computeProfile: any
let fusoDoUsuario: (u: any, pedido?: string) => Promise<string>

const H = 3_600_000

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}

async function creditarExpress(u: string, corpo: Record<string, unknown>) {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === '/seeds/creditar' && l.route?.methods?.post)
  const res = fakeRes()
  await camada.route.stack[0].handle({ userId: asUserId(u), body: corpo, path: '/seeds/creditar', requestId: 'r' }, res)
  return { status: res.statusCode, body: res.body }
}

async function creditarEfemero(corpo: Record<string, unknown>) {
  const res = await servidorEfemero('/api/metrics/seeds/creditar', { method: 'POST', body: JSON.stringify(corpo) })
  return { status: res.status, body: await res.json() }
}

/** Uma rodada de 5 acertos (três estrelas): rende baú. Gravada nas duas pontas. */
async function rodada(u: string, roundId: string) {
  const r = {
    roundId,
    exerciseKind: 'termo',
    origem: 'baralho',
    score: 100,
    melhorSequencia: 5,
    itens: Array.from({ length: 5 }, (_, i) => ({ itemRef: `${roundId}-${i}`, correct: 1, kind: 'drill' })),
  }
  await exerciseResultsRepo.addRodada(asUserId(u), r)
  await servidorEfemero('/api/exercises/rodada', { method: 'POST', body: JSON.stringify(r) })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  ;({ computeProfile } = (await h.load('../../server/db/repositories/metrics')) as any)
  ;({ fusoDoUsuario } = (await h.load('../../server/lib/fusoDoUsuario')) as any)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

describe('decidirFuso — a régua pura', () => {
  it('primeiro uso grava; troca só depois da carência; pedido inválido não conta', () => {
    const t = 1_000_000_000_000
    expect(decidirFuso({ fuso: null, desde: null }, 'Asia/Tokyo', t)).toEqual({ fuso: 'Asia/Tokyo', gravar: { fuso: 'Asia/Tokyo', desde: t } })
    expect(decidirFuso({ fuso: null, desde: null }, 'Marte/Olimpo', t)).toEqual({ fuso: FUSO_PADRAO, gravar: null })
    const gravado = { fuso: 'Asia/Tokyo', desde: t }
    expect(decidirFuso(gravado, 'America/Sao_Paulo', t + CARENCIA_DO_FUSO_MS - 1)).toEqual({ fuso: 'Asia/Tokyo', gravar: null })
    expect(decidirFuso(gravado, 'America/Sao_Paulo', t + CARENCIA_DO_FUSO_MS).gravar).toEqual({
      fuso: 'America/Sao_Paulo',
      desde: t + CARENCIA_DO_FUSO_MS,
    })
    expect(decidirFuso(gravado, undefined, t + 10 * CARENCIA_DO_FUSO_MS)).toEqual({ fuso: 'Asia/Tokyo', gravar: null })
  })

  it('o teto do baú vale na janela móvel de 24 h, além do dia local', () => {
    const agora = Date.UTC(2026, 9, 10, 3, 10) // 00:10 de 10/10 em São Paulo
    const baus = [0, 10, 20].map((m) => ({ em: Date.UTC(2026, 9, 10, 2, m), reason: 'bau:repetido:comum' })) // 23:00–23:20 de 09/10
    const diaDe = (t: number) => diaNoFuso(t, 'America/Sao_Paulo')
    const s = situacaoDoBau(baus, diaDe(agora), diaDe, agora)
    expect(s.bausHoje).toBe(0)
    expect(s.bausNas24h).toBe(BAUS_POR_DIA)
    expect(decidirBau({ estrelas: 3, ...s, sorteio: 0.1, elegiveis: [] })).toEqual({ tipo: 'sem-bau', motivo: 'teto' })
  })
})

describe('o fuso gravado, nas duas pontas', () => {
  it('grava no primeiro uso e ignora outro fuso dentro de 24 h; aceita depois', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = Date.UTC(2026, 9, 5, 12)
    vi.setSystemTime(t0)
    const u = asUserId('fuso-u1')
    expect(await fusoDoUsuario(u, 'Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(fusoDoUsuarioLocal('Asia/Tokyo')).toBe('Asia/Tokyo')
    vi.setSystemTime(t0 + 23 * H)
    expect(await fusoDoUsuario(u, 'America/Sao_Paulo')).toBe('Asia/Tokyo')
    expect(fusoDoUsuarioLocal('America/Sao_Paulo')).toBe('Asia/Tokyo')
    vi.setSystemTime(t0 + 25 * H)
    expect(await fusoDoUsuario(u, 'America/Sao_Paulo')).toBe('America/Sao_Paulo')
    expect(fusoDoUsuarioLocal('America/Sao_Paulo')).toBe('America/Sao_Paulo')
  })

  it('baú: três às 23h e o quarto às 00:10 do dia seguinte bate no teto — e trocar o fuso do pedido não abre outro', async () => {
    await limparTudo()
    try { localStorage.clear() } catch { /* sem storage */ }
    vi.useFakeTimers({ toFake: ['Date'] })
    const u = 'fuso-bau'
    const SP = 'America/Sao_Paulo'
    for (let n = 0; n < 3; n++) {
      vi.setSystemTime(Date.UTC(2026, 9, 10, 2, n * 10)) // 23:00, 23:10, 23:20 de 09/10 em São Paulo
      await rodada(u, `termo-fuso-${n}`)
      const e = await creditarExpress(u, { creditoId: `drop:termo-fuso-${n}`, fuso: SP })
      const l = await creditarEfemero({ creditoId: `drop:termo-fuso-${n}`, fuso: SP })
      expect(e.body.semBau, `express ${n}`).toBeUndefined()
      expect(l.body.semBau, `espelho ${n}`).toBeUndefined()
    }
    vi.setSystemTime(Date.UTC(2026, 9, 10, 3, 10)) // 00:10 de 10/10 em São Paulo: dia novo, janela cheia
    await rodada(u, 'termo-fuso-3')
    const e = await creditarExpress(u, { creditoId: 'drop:termo-fuso-3', fuso: SP })
    const l = await creditarEfemero({ creditoId: 'drop:termo-fuso-3', fuso: SP })
    expect(e.body).toMatchObject({ semBau: 'teto', item: null })
    expect(l.body).toMatchObject({ semBau: 'teto', item: null })

    // Um fuso "adiantado" no pedido, dentro da carência, não muda nada.
    await rodada(u, 'termo-fuso-4')
    expect((await creditarExpress(u, { creditoId: 'drop:termo-fuso-4', fuso: 'Pacific/Kiritimati' })).body.semBau).toBe('teto')
    expect((await creditarEfemero({ creditoId: 'drop:termo-fuso-4', fuso: 'Pacific/Kiritimati' })).body.semBau).toBe('teto')
  })

  it('a ofensiva conta no fuso GRAVADO, não no do processo', async () => {
    await limparTudo()
    try { localStorage.clear() } catch { /* sem storage */ }
    vi.useFakeTimers({ toFake: ['Date'] })
    const u = asUserId('fuso-ofensiva')
    // A prática: 14:00 UTC de 09/10 — 11:00 de 09/10 em São Paulo, 23:00 de 09/10 em Tóquio.
    vi.setSystemTime(Date.UTC(2026, 9, 9, 14))
    await rodada(u, 'termo-ofensiva-1')
    /* A leitura: 16:00 UTC de 10/10 — 13:00 de 10/10 em São Paulo (a prática foi ONTEM: a ofensiva
       segue viva, hoje ainda não acabou), 01:00 de 11/10 em Tóquio (10/10 passou em branco). */
    vi.setSystemTime(Date.UTC(2026, 9, 10, 16))
    await fusoDoUsuario(u, 'America/Sao_Paulo')
    fusoDoUsuarioLocal('America/Sao_Paulo')
    expect((await computeProfile(u)).streakDays).toBe(1)
    expect((await perfilEfemero(null)).streakDays).toBe(1)

    // Em Tóquio, 10/10 passou sem prática e não há congelamento: a ofensiva quebrou.
    const t = asUserId('fuso-ofensiva-toquio')
    vi.setSystemTime(Date.UTC(2026, 9, 9, 14))
    await exerciseResultsRepo.addRodada(t, {
      roundId: 'termo-ofensiva-t',
      exerciseKind: 'termo',
      origem: 'baralho',
      score: 100,
      melhorSequencia: 5,
      itens: Array.from({ length: 5 }, (_, i) => ({ itemRef: `t-${i}`, correct: 1, kind: 'drill' })),
    })
    vi.setSystemTime(Date.UTC(2026, 9, 10, 16))
    await fusoDoUsuario(t, 'Asia/Tokyo')
    expect((await computeProfile(t)).streakDays).toBe(0)
  })
})
