// @vitest-environment jsdom
/**
 * Economia v2 no servidor efêmero: presença idempotente por dia (só estatística desde as
 * recompensas v2), crédito idempotente por id, meta do dia conferida, e as métricas novas (palavras
 * salvas com teto, rodadas perfeitas, marcos de prática) — pelas MESMAS rotas que a tela usa.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { diaLocal, diaNoFuso, META_DIARIA_ACERTOS } from '../src/core/learning/economia'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../src/data/efemero/store'
import { rodadaDoColecionador } from './harness/colecionador'

afterAll(() => fecharStore())

const post = (rota: string, corpo: unknown) => servidorEfemero(rota, { method: 'POST', body: JSON.stringify(corpo) })
const metricas = async () => (await (await servidorEfemero('/api/metrics/profile')).json()) as Record<string, number>

describe('presença e créditos', () => {
  it('presença do dia é idempotente, mas não estende a ofensiva (recompensas v2)', async () => {
    const hoje = diaLocal(Date.now())
    const a = await (await post('/api/metrics/presenca', { dia: hoje - 1 })).json()
    const b = await (await post('/api/metrics/presenca', { dia: hoje })).json()
    const c = await (await post('/api/metrics/presenca', { dia: hoje })).json()
    expect(a.jaExistia).toBe(false)
    expect(b).toMatchObject({ jaExistia: false, streakPresenca: 2 })
    expect(c).toMatchObject({ jaExistia: true, streakPresenca: 2 })
    const m = await metricas()
    expect(m.presencas).toBe(2)
    // Abrir o app não é prática: a ofensiva conta revisão, rodada ou palavra salva.
    expect(m.streakPresenca).toBe(0)
    expect(m.maiorSequenciaPresenca).toBe(0)
    expect(m.streakDays).toBe(0)
  })

  /* `conquista-x` NÃO EXISTE, e por isso este teste passava dizendo pouco: ele provava que o
     servidor gravava 25 Seeds porque o corpo pedia 25 Seeds. Desde 07/09 o `creditoId` tem de
     resolver no catálogo e o valor vem DELE — `colecionador` (100 Seeds, 120 XP). Desde 27/09 a
     condição dele também é conferida: sem a rodada que cumpre os pré-requisitos, é 400. */
  it('crédito por conquista: o mesmo creditoId não soma duas vezes, e o valor é o da regra', async () => {
    const sem = await post('/api/metrics/seeds/creditar', { creditoId: 'conquista-colecionador' })
    expect(sem.status).toBe(400)
    await post('/api/exercises/rodada', rodadaDoColecionador())
    const a = await (
      await post('/api/metrics/seeds/creditar', { creditoId: 'conquista-colecionador', amount: 9_999, xp: 9_999 })
    ).json()
    const b = await (await post('/api/metrics/seeds/creditar', { creditoId: 'conquista-colecionador' })).json()
    expect(a).toMatchObject({ jaExistia: false, seedsCreditadas: 100, xpCreditado: 120 })
    expect(b).toMatchObject({ jaExistia: true, seedsCreditadas: 100, xpCreditado: 120 })
    const m = await metricas()
    /* O `amount: 9.999` do primeiro pedido foi IGNORADO — é o ponto do teste. */
    expect(m.seedsCreditadas).toBe(100)
    expect(m.xpCreditado).toBe(120)
  })

  it('sem creditoId ou com valor negativo, recusa', async () => {
    expect((await post('/api/metrics/seeds/creditar', { amount: 5 })).status).toBe(400)
    expect((await post('/api/metrics/seeds/creditar', { creditoId: 'k', amount: -5 })).status).toBe(400)
  })
})

describe('métricas novas', () => {
  // Parte limpa: a rodada do Colecionador (acima) é uma rodada perfeita e contaria aqui.
  beforeAll(() => limparTudo())

  it('minutos de captura: só o total, sem prêmio por tempo', async () => {
    await post('/api/sessions', { title: 'a', durationMs: 25 * 60_000, sourceLang: 'en' })
    await post('/api/sessions', { title: 'b', durationMs: 25 * 60_000, sourceLang: 'es' })
    const m = await metricas()
    expect(m.capturaMinutos).toBe(50)
    expect(m).not.toHaveProperty('capturaMinutosPremiados')
    expect(m.idiomas).toBe(2)
  })

  it('palavra salva da captura rende com teto diário e conta como dia de prática', async () => {
    const sessao = (await (await post('/api/sessions', { title: 'c', sourceLang: 'en' })).json()) as { id: string }
    const cards = Array.from({ length: 35 }, (_, i) => ({
      word: `palavra${i}`, translation: `tradução${i}`, srcLang: 'en', tgtLang: 'pt', sessionId: sessao.id,
    }))
    await post('/api/vocab/bulk-add', { cards })
    const m = await metricas()
    expect(m.palavrasSalvasPremiadas).toBe(30)
    expect(m.streakDays).toBe(1)
  })

  it('rodada perfeita exige todos certos E o mínimo de itens do jogo', async () => {
    const rodada = (roundId: string, itens: Array<0 | 1>) =>
      post('/api/exercises/rodada', {
        roundId,
        exerciseKind: 'blitz',
        origem: 'baralho',
        score: 10,
        melhorSequencia: 1,
        itens: itens.map((c, i) => ({ itemRef: 'w' + i, correct: c, attempts: 1, ms: 500, hinted: 0, kind: 'drill' })),
      })
    await rodada('p1', [1, 1, 1, 1, 1]) // perfeita
    await rodada('p2', [1, 1, 0, 1, 1]) // um erro
    await rodada('p3', [1]) // curta demais para contar
    const m = await metricas()
    expect(m.rodadasPerfeitas).toBe(1)
  })
})

describe('meta do dia — `meta:<AAAA-MM-DD>` = as três missões do dia (recompensas v2, onda 5)', () => {
  beforeAll(() => limparTudo())
  const fuso = 'America/Sao_Paulo'
  const hoje = () => diaNoFuso(Date.now(), fuso)
  const rodadaCom = (roundId: string, certos: number, exerciseKind = 'blitz') =>
    post('/api/exercises/rodada', {
      roundId,
      exerciseKind,
      origem: 'baralho',
      score: certos,
      melhorSequencia: 1,
      itens: Array.from({ length: certos }, (_, i) => ({ itemRef: 'm' + i, correct: 1, attempts: 1, ms: 500, hinted: 0, kind: 'drill' })),
    })
  const missoes = async () =>
    (await (await servidorEfemero(`/api/metrics/missoes?fuso=${encodeURIComponent(fuso)}`)).json()) as {
      dia: string
      missoes: Array<{ tipo: string; alvo: number; atual: number }>
      metaConcluida: boolean
      metaCreditada: boolean
    }

  it('os 20 acertos da regra provisória não bastam mais: recusa com as missões', async () => {
    await rodadaCom('meta-1', META_DIARIA_ACERTOS)
    const r = await post('/api/metrics/seeds/creditar', { creditoId: `meta:${hoje()}`, fuso })
    expect(r.status).toBe(400)
    const corpo = await r.json()
    expect(corpo.code).toBe('meta_nao_cumprida')
    expect(corpo.detalhes.missoes).toHaveLength(3)
  })

  it('GET /api/metrics/missoes conta o que está gravado; com as três fechadas credita 15 Seeds uma vez só', async () => {
    const antes = await missoes()
    expect(antes.dia).toBe(hoje())
    expect(antes.missoes).toHaveLength(3)
    expect(antes.metaConcluida).toBe(false)

    // Cumpre o teto de cada tipo: 5 palavras salvas, 20 revisões, 2 rodadas boas em jogos novos.
    const sessao = (await (await post('/api/sessions', { title: 'meta', sourceLang: 'en' })).json()) as { id: string }
    const cards = Array.from({ length: 5 }, (_, i) => ({ word: `meta${i}`, translation: `meta${i}`, srcLang: 'en', tgtLang: 'pt', sessionId: sessao.id }))
    await post('/api/vocab/bulk-add', { cards })
    const [cartao] = (await (await servidorEfemero('/api/vocab')).json()) as Array<{ id: string }>
    for (let i = 0; i < 20; i++) await post(`/api/vocab/${cartao.id}/review`, { grade: 3 })
    await rodadaCom('meta-2', 10, 'termo')
    await rodadaCom('meta-3', 10, 'memory')

    const depois = await missoes()
    expect(depois.metaConcluida).toBe(true)
    expect(depois.metaCreditada).toBe(false)
    const a = await (await post('/api/metrics/seeds/creditar', { creditoId: `meta:${hoje()}`, fuso })).json()
    const b = await (await post('/api/metrics/seeds/creditar', { creditoId: `meta:${hoje()}`, fuso })).json()
    expect(a).toMatchObject({ jaExistia: false, seedsCreditadas: 15 })
    expect(b).toMatchObject({ jaExistia: true, seedsCreditadas: 15 })
    expect((await missoes()).metaCreditada).toBe(true)
  })

  it('dia fora da janela (anteontem ou amanhã) é recusado', async () => {
    const anteontem = diaNoFuso(Date.now() - 2 * 86_400_000, fuso)
    const r = await post('/api/metrics/seeds/creditar', { creditoId: `meta:${anteontem}`, fuso })
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe('dia_fora_da_janela')
  })
})
