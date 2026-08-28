// @vitest-environment jsdom
/**
 * Economia v2 no servidor efêmero: presença idempotente por dia, crédito idempotente por id, e as
 * métricas novas (minutos premiados com teto, rodadas perfeitas, marcos de sequência) — pelas
 * MESMAS rotas que a tela usa.
 */
import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it } from 'vitest'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore } from '../src/data/efemero/store'
import { diaLocal } from '../src/core/learning/economia'

afterAll(() => fecharStore())

const post = (rota: string, corpo: unknown) => servidorEfemero(rota, { method: 'POST', body: JSON.stringify(corpo) })
const metricas = async () => (await (await servidorEfemero('/api/metrics/profile')).json()) as Record<string, number>

describe('presença e créditos', () => {
  it('presença do dia é idempotente e devolve a sequência', async () => {
    const hoje = diaLocal(Date.now())
    const a = await (await post('/api/metrics/presenca', { dia: hoje - 1 })).json()
    const b = await (await post('/api/metrics/presenca', { dia: hoje })).json()
    const c = await (await post('/api/metrics/presenca', { dia: hoje })).json()
    expect(a.jaExistia).toBe(false)
    expect(b).toMatchObject({ jaExistia: false, streakPresenca: 2 })
    expect(c).toMatchObject({ jaExistia: true, streakPresenca: 2 })
    const m = await metricas()
    expect(m.presencas).toBe(2)
    expect(m.streakPresenca).toBe(2)
    expect(m.maiorSequenciaPresenca).toBe(2)
  })

  it('crédito por conquista: o mesmo creditoId não soma duas vezes', async () => {
    const a = await (await post('/api/metrics/seeds/creditar', { creditoId: 'conquista-x', amount: 25, xp: 30, reason: 'conquista:x' })).json()
    const b = await (await post('/api/metrics/seeds/creditar', { creditoId: 'conquista-x', amount: 25, xp: 30, reason: 'conquista:x' })).json()
    expect(a).toMatchObject({ jaExistia: false, seedsCreditadas: 25, xpCreditado: 30 })
    expect(b).toMatchObject({ jaExistia: true, seedsCreditadas: 25, xpCreditado: 30 })
    const m = await metricas()
    expect(m.seedsCreditadas).toBe(25)
    expect(m.xpCreditado).toBe(30)
  })

  it('sem creditoId ou com valor negativo, recusa', async () => {
    expect((await post('/api/metrics/seeds/creditar', { amount: 5 })).status).toBe(400)
    expect((await post('/api/metrics/seeds/creditar', { creditoId: 'k', amount: -5 })).status).toBe(400)
  })
})

describe('métricas novas', () => {
  it('minutos de captura: total sem teto, premiados com teto de 30/dia', async () => {
    // duas sessões hoje: 25 + 25 min = 50 min no dia → 30 premiados
    await post('/api/sessions', { title: 'a', durationMs: 25 * 60_000, sourceLang: 'en' })
    await post('/api/sessions', { title: 'b', durationMs: 25 * 60_000, sourceLang: 'es' })
    const m = await metricas()
    expect(m.capturaMinutos).toBe(50)
    expect(m.capturaMinutosPremiados).toBe(30)
    expect(m.idiomas).toBe(2)
  })

  it('rodada perfeita exige todos certos E o mínimo de itens do jogo', async () => {
    const rodada = (roundId: string, itens: Array<0 | 1>) => post('/api/exercises/rodada', {
      roundId, exerciseKind: 'blitz', origem: 'baralho', score: 10, melhorSequencia: 1,
      itens: itens.map((c, i) => ({ itemRef: 'w' + i, correct: c, attempts: 1, ms: 500, hinted: 0, kind: 'drill' })),
    })
    await rodada('p1', [1, 1, 1, 1, 1])   // perfeita
    await rodada('p2', [1, 1, 0, 1, 1])   // um erro
    await rodada('p3', [1])               // curta demais para contar
    const m = await metricas()
    expect(m.rodadasPerfeitas).toBe(1)
  })
})
