/**
 * AS TRÊS CONQUISTAS QUE NUNCA DISPARAVAM NA CONTA LOGADA (auditoria de 07/09, achado A18).
 *
 * `ouvinte` lê `capturaMinutos`, `poliglota` lê `idiomas` e `duelista` lê `melhorComboPorJogo`.
 * Nenhum dos três existia do lado do servidor:
 *
 *  - `computeProfile` emitia só `capturaMinutosPremiados` (o total com teto diário), então
 *    `m.capturaMinutos` chegava indefinido e "some 60 minutos" ficava preso em zero;
 *  - `idiomas` não era calculado, apesar de `sessions.source_lang` estar gravado desde sempre;
 *  - o combo era MEDIDO pelo cliente e ENVIADO em `POST /exercises/rodada`, e `rodadaSchema` o
 *    descartava por não declarar o campo — não havia nem coluna para recebê-lo.
 *
 * O sintoma era silencioso: a conquista simplesmente não acontecia, e ninguém tinha como saber se
 * era porque a pessoa não jogou o suficiente ou porque o número nunca chegou.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { CONQUISTAS_CONFERIVEIS } from '../../src/core/economiaAutoridade'
import { CONQUISTAS } from '../../src/core/learning/conquistas'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let computeProfile: any
let economiaDoUsuario: any
let exerciseResultsRepo: any
let sessionsRepo: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u: string) => ({ userId: asUserId(u), body, requestId: 'req-cb', path: '/x' })

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ computeProfile, economiaDoUsuario } = (await h.load('../../server/db/repositories/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  ;({ sessionsRepo } = (await h.load('../../server/db/repositories/sessions')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('o combo chega ao banco', () => {
  it('a rodada grava o combo e o recorde o devolve', async () => {
    const u = 'u-combo'
    await exerciseResultsRepo.addRodada(asUserId(u), {
      roundId: 'c-1', exerciseKind: 'blitz', origem: 'baralho', score: 900, melhorSequencia: 17,
      itens: Array.from({ length: 20 }, (_, i) => ({ itemRef: `p${i}`, correct: 1, kind: 'drill' })),
    })
    /* Uma rodada pior no MESMO jogo: o recorde é o máximo, não o último. */
    await exerciseResultsRepo.addRodada(asUserId(u), {
      roundId: 'c-2', exerciseKind: 'blitz', origem: 'baralho', score: 100, melhorSequencia: 3,
      itens: [{ itemRef: 'p0', correct: 0, kind: 'drill' }],
    })

    const recordes = await exerciseResultsRepo.listarRecordes(asUserId(u))
    const blitz = recordes.find((r: any) => r.exerciseKind === 'blitz')
    expect(blitz).toMatchObject({ melhorPontos: 900, melhorCombo: 17, rodadas: 2 })
    /* 20 acertos em 21 itens respondidos = 95%. `precisao` era declarada no cliente e nunca vinha. */
    expect(blitz.precisao).toBe(95)
    expect(blitz.ultimaEm).toBeGreaterThan(0)

    expect(await exerciseResultsRepo.melhorComboPorJogo(asUserId(u))).toEqual({ blitz: 17 })
  })

  it('rodada sem combo não rebaixa o recorde para zero', async () => {
    const u = 'u-combo-nulo'
    await exerciseResultsRepo.addRodada(asUserId(u), {
      roundId: 'n-1', exerciseKind: 'blitz', origem: 'baralho', score: 500, melhorSequencia: 12,
      itens: [{ itemRef: 'a', correct: 1, kind: 'drill' }],
    })
    /* Uma rodada como as ~1.500 anteriores à migração 0025: sem o campo. `MAX` ignora NULL —
       um `COALESCE(combo, 0)` diria que essa rodada teve combo zero e apagaria o recorde. */
    await exerciseResultsRepo.addRodada(asUserId(u), {
      roundId: 'n-2', exerciseKind: 'blitz', origem: 'baralho', score: 500,
      itens: [{ itemRef: 'b', correct: 1, kind: 'drill' }],
    })
    expect((await exerciseResultsRepo.melhorComboPorJogo(asUserId(u))).blitz).toBe(12)
  })
})

describe('os campos de perfil que faltavam', () => {
  it('capturaMinutos é o total sem teto; capturaMinutosPremiados tem o teto do dia', async () => {
    const u = 'u-ouvinte'
    /* Duas sessões de 40 minutos no MESMO dia: 80 minutos gravados, 30 premiados (teto diário).
       A conquista "Ouvinte" pede 60 minutos GRAVADOS — com o premiado ela nunca fecharia. */
    for (const lang of ['en', 'en']) {
      await sessionsRepo.create(asUserId(u), { title: 'aula', durationMs: 40 * 60_000, sourceLang: lang })
    }
    const m = await computeProfile(asUserId(u))
    expect(m.capturaMinutos).toBe(80)
    expect(m.capturaMinutosPremiados).toBe(30)
  })

  it('idiomas conta os idiomas distintos das sessões', async () => {
    const u = 'u-poliglota'
    for (const lang of ['en', 'es', 'en', 'ja']) {
      await sessionsRepo.create(asUserId(u), { title: 'aula', durationMs: 60_000, sourceLang: lang })
    }
    expect((await computeProfile(asUserId(u))).idiomas).toBe(3)
  })
})

describe('as conquistas que dependiam desses números', () => {
  it('duelista: recusada sem o combo, creditada com ele', async () => {
    const u = 'u-duelista'
    const recusa = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-duelista' }, u), recusa)
    expect(recusa.statusCode).toBe(400)
    expect(recusa.body).toMatchObject({ code: 'conquista_nao_cumprida' })
    expect(recusa.body.detalhes).toMatchObject({ atual: 0, meta: 15 })

    await exerciseResultsRepo.addRodada(asUserId(u), {
      roundId: 'd-1', exerciseKind: 'blitz', origem: 'baralho', score: 900, melhorSequencia: 15,
      itens: [{ itemRef: 'x', correct: 1, kind: 'drill' }],
    })
    const ok = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-duelista' }, u), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toMatchObject({ jaExistia: false, seedsCreditadas: 50, xpCreditado: 80 })
  })

  it('poliglota: recusada com um idioma, creditada com dois', async () => {
    const u = 'u-poli2'
    await sessionsRepo.create(asUserId(u), { title: 'a', durationMs: 60_000, sourceLang: 'en' })
    const recusa = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-poliglota' }, u), recusa)
    expect(recusa.statusCode).toBe(400)
    expect(recusa.body.detalhes).toMatchObject({ atual: 1, meta: 2 })

    await sessionsRepo.create(asUserId(u), { title: 'b', durationMs: 60_000, sourceLang: 'fr' })
    const ok = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-poliglota' }, u), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toMatchObject({ seedsCreditadas: 40, xpCreditado: 60 })
  })

  it('ouvinte: 60 minutos gravados bastam, mesmo com o teto diário comendo o premiado', async () => {
    const u = 'u-ouvinte2'
    await sessionsRepo.create(asUserId(u), { title: 'longa', durationMs: 70 * 60_000, sourceLang: 'en' })
    const { metricas } = await economiaDoUsuario(asUserId(u))
    expect(metricas.capturaMinutos).toBe(70)
    expect(metricas.capturaMinutosPremiados).toBe(30)

    const ok = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-ouvinte' }, u), ok)
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toMatchObject({ seedsCreditadas: 60 })
  })

  it('só `colecionador` fica de fora da conferência do servidor', async () => {
    /* A lista existe porque três conquistas dependiam de estado que só o navegador tinha. Duas
       delas passaram a ser conferíveis; se uma quarta sair da lista sem que o dado exista, este
       teste é o lugar onde isso aparece. */
    const fora = CONQUISTAS.map((c) => c.id).filter((id) => !CONQUISTAS_CONFERIVEIS.has(id))
    expect(fora).toEqual(['colecionador'])
  })
})
