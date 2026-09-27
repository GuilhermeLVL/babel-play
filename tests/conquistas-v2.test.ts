/**
 * CONQUISTAS v2 (recompensas v2, onda 5 — spec 9).
 *
 * ~40 conquistas em 4 pilares, ícone lucide no lugar do emoji, bronze/prata/ouro onde a série faz
 * sentido, até 3 secretas, todas conferidas no servidor e no espelho, nenhuma por tempo de tela, e
 * o ouro entrega moldura ou título. Os 14 ids antigos continuam: quem já tinha, continua tendo.
 */
import { describe, expect, it } from 'vitest'

import { ICONE_DA_CONQUISTA } from '../src/components/iconesDaConquista'
import {
  CONQUISTAS_CONFERIVEIS,
  contextoConferivelDeConquistas,
  progressoNoServidor,
} from '../src/core/economiaAutoridade'
import {
  CONQUISTAS,
  type ContextoDeConquistas,
  PILARES_DE_CONQUISTA,
  progressoDasConquistas,
} from '../src/core/learning/conquistas'
import type { AppMetrics } from '../src/core/learning/contract'
import { CATALOGO_DA_LOJA } from '../src/core/loja'

const IDS_ANTIGOS = [
  'primeira-captura',
  'ouvinte',
  'caderno-cheio',
  'revisor',
  'sem-erro',
  'perfeccionista',
  'maratonista',
  'constante',
  'colecionador',
  'poliglota',
  'duelista',
  'cliente',
  'nivel-5',
  'nivel-10',
]

function metricas(p: Partial<AppMetrics> = {}): AppMetrics {
  return {
    sessions: 0, wordsCaptured: 0, reviews: 0, correctReviews: 0, drillItems: 0, drillCorrect: 0,
    seedsGastas: 0, streakDays: 0, dueToday: 0, newCards: 0, deckSize: 0, uniqueWords: 0,
    speakingMs: 0, wpm: 0, wpmConfidence: 0, accuracy: 0, accuracyConfidence: 0, avgStability: 0,
    avgRetention: 0, avgRetentionConfidence: 0, levelConfidence: 0, levelDistribution: [], vocabByWeek: [],
    asOf: 0, escopo: 'global', base: { considerados: 0, total: 0 }, ...p,
  }
}
function ctx(p: Partial<AppMetrics> = {}, extra: Partial<ContextoDeConquistas> = {}): ContextoDeConquistas {
  return { metricas: metricas(p), nivel: 0, melhorComboPorJogo: {}, eventosVistos: 0, totalDeEventos: 11, idiomas: 0, compras: 0, ...extra }
}
const feitas = (c: ContextoDeConquistas) =>
  progressoDasConquistas(c).filter((p) => p.conquistada).map((p) => p.conquista.id)

describe('catálogo v2', () => {
  it('~40 conquistas, ids únicos, 4 pilares com pelo menos 8 cada', () => {
    expect(CONQUISTAS.length).toBeGreaterThanOrEqual(38)
    expect(CONQUISTAS.length).toBeLessThanOrEqual(42)
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length)
    expect(PILARES_DE_CONQUISTA.map((p) => p.id)).toEqual(['vocabulario', 'escuta', 'jogos', 'constancia'])
    for (const p of PILARES_DE_CONQUISTA) {
      expect(CONQUISTAS.filter((c) => c.pilar === p.id).length, p.id).toBeGreaterThanOrEqual(8)
    }
  })

  it('nenhuma conquista tem emoji; todo ícone é um nome lucide mapeado', () => {
    for (const c of CONQUISTAS) {
      expect(c, c.id).not.toHaveProperty('emoji')
      expect(ICONE_DA_CONQUISTA[c.icone], `${c.id} → ${c.icone}`).toBeTruthy()
    }
  })

  it('os 14 ids antigos continuam no catálogo', () => {
    const ids = new Set(CONQUISTAS.map((c) => c.id))
    for (const id of IDS_ANTIGOS) expect(ids.has(id), id).toBe(true)
  })

  it('toda conquista é conferida no servidor', () => {
    expect(CONQUISTAS.map((c) => c.id).filter((id) => !CONQUISTAS_CONFERIVEIS.has(id))).toEqual([])
  })

  it('secretas: no máximo 3, e cada uma com dica vaga', () => {
    const secretas = CONQUISTAS.filter((c) => c.secreta)
    expect(secretas.length).toBeGreaterThan(0)
    expect(secretas.length).toBeLessThanOrEqual(3)
    for (const c of secretas) expect(c.dica, c.id).toBeTruthy()
  })

  it('ouro dá moldura ou título exclusivo, sem preço e sem nível', () => {
    const ouros = CONQUISTAS.filter((c) => c.nivel === 'ouro')
    expect(ouros.length).toBeGreaterThanOrEqual(4)
    for (const c of ouros) {
      const item = CATALOGO_DA_LOJA.find((i) => i.id === c.recompensa.cosmetico)
      expect(item, c.id).toBeTruthy()
      expect(['moldura', 'titulo']).toContain(item!.tipo)
      expect(item!.exclusivoDe).toBe(c.id)
      expect(item!.precoSeeds).toBeUndefined()
      expect(item!.precoCreditos).toBeUndefined()
      expect(item!.nivel).toBeUndefined()
    }
  })

  it('toda conquista paga Seeds, e o total de uma vez fica abaixo de 25 dias do perfil típico', () => {
    for (const c of CONQUISTAS) expect(c.recompensa.seeds, c.id).toBeGreaterThan(0)
    const total = CONQUISTAS.reduce((n, c) => n + c.recompensa.seeds, 0)
    expect(total).toBeLessThanOrEqual(Math.round(25 * 149.9))
  })
})

describe('nenhuma condição por tempo de tela', () => {
  it('tempo de sessão, fala, escuta e presença enormes não fazem conquista nenhuma andar', () => {
    const c = ctx({
      capturaMinutos: 1e6,
      speakingMs: 1e12,
      listeningMs: 1e12,
      presencas: 1e5,
    })
    const andou = progressoDasConquistas(c).filter((p) => p.atual > 0).map((p) => p.conquista.id)
    expect(andou).toEqual([])
  })
})

describe('condições', () => {
  it('séries: 50/300/1.000 palavras; 100/500/2.000 revisões', () => {
    expect(feitas(ctx({ deckSize: 300 }))).toEqual(expect.arrayContaining(['primeira-palavra', 'caderno-cheio', 'caderno-300']))
    expect(feitas(ctx({ deckSize: 999 }))).not.toContain('caderno-1000')
    expect(feitas(ctx({ correctReviews: 2000 }))).toEqual(expect.arrayContaining(['revisor', 'revisor-500', 'revisor-2000']))
  })

  it('ouvinte conta sessões gravadas, não minutos', () => {
    expect(feitas(ctx({ sessions: 5 }))).toContain('ouvinte')
    expect(feitas(ctx({ sessions: 4, capturaMinutos: 600 }))).not.toContain('ouvinte')
  })

  it('escuta pela maestria dos jogos de escuta', () => {
    expect(feitas(ctx({}, { maestria: { escuta: 1 } }))).toContain('ouvido-afiado')
    expect(feitas(ctx({}, { maestria: { escuta: 2, ditado: 2 } }))).not.toContain('ouvido-treinado')
    expect(feitas(ctx({}, { maestria: { escuta: 3, ditado: 3, karaoke: 3 } }))).toEqual(
      expect.arrayContaining(['ouvido-treinado', 'ouvido-absoluto']),
    )
  })

  it('jogos: bronze em 4/8/12 jogos e Mestre num jogo', () => {
    const maestria = Object.fromEntries(
      ['memory', 'wordsearch', 'blitz', 'termo', 'scramble', 'karaoke', 'escuta', 'ditado', 'conectores', 'karuta', 'tenis', 'koffer'].map((j) => [j, 1]),
    )
    expect(feitas(ctx({}, { maestria }))).toEqual(expect.arrayContaining(['primeiro-bronze', 'explorador', 'versatil', 'arcade']))
    expect(feitas(ctx({}, { maestria: { termo: 5 } }))).toContain('mestre-de-um')
  })

  it('secretas: mira fina exige volume E precisão; imparável é o combo 20; inabalável são 100 dias', () => {
    expect(feitas(ctx({ reviews: 200, correctReviews: 190 }))).toContain('mira-fina')
    expect(feitas(ctx({ reviews: 200, correctReviews: 189 }))).not.toContain('mira-fina')
    expect(feitas(ctx({ reviews: 199, correctReviews: 199 }))).not.toContain('mira-fina')
    expect(feitas(ctx({}, { melhorComboPorJogo: { blitz: 20 } }))).toEqual(expect.arrayContaining(['duelista', 'imparavel']))
    expect(feitas(ctx({ maiorSequenciaPresenca: 100 }))).toEqual(
      expect.arrayContaining(['tres-dias', 'maratonista', 'constante', 'inabalavel']),
    )
  })

  it('constância: marcos de 7 dias e nível 25', () => {
    expect(feitas(ctx({ sequencias7: 12 }))).toEqual(expect.arrayContaining(['ritmo', 'habito']))
    expect(feitas(ctx({}, { nivel: 25 }))).toEqual(expect.arrayContaining(['nivel-5', 'nivel-10', 'nivel-25']))
  })
})

describe('a régua do servidor', () => {
  it('é a da própria conquista, exceto o Colecionador', () => {
    const c = ctx({ deckSize: 60, sessions: 7, rodadasPerfeitas: 3 }, { maestria: { escuta: 2 }, nivel: 6, compras: 1 })
    for (const q of CONQUISTAS) {
      if (q.id === 'colecionador') continue
      expect(progressoNoServidor(q, c), q.id).toEqual(q.progresso(c))
    }
  })

  it('o contexto conferível soma a maestria das linhas gravadas e zera o que só o navegador vê', () => {
    const linhas = Array.from({ length: 20 }, (_, i) => ({
      exerciseKind: 'escuta',
      roundId: `r${Math.floor(i / 10)}`,
      correct: 1,
      combo: 10,
      createdAt: Math.floor(i / 10),
    }))
    const c = contextoConferivelDeConquistas({
      metricas: metricas({ idiomas: 2, itensComprados: ['tema-x'] }),
      nivel: 3,
      melhorComboPorJogo: { blitz: 4 },
      linhasDeMaestria: linhas,
    })
    expect(c.maestria?.escuta).toBe(1)
    expect(c).toMatchObject({ nivel: 3, idiomas: 2, compras: 1, eventosVistos: 0, totalDeEventos: 0 })
  })
})
