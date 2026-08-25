/**
 * F4 — modelo de dificuldade COLD-START POR CONSTRUÇÃO.
 *
 * Duas medições da Fase 0/F2a definem o desenho:
 *  - o FSRS cobre **152 de 2.126 cartões (7,1%)** — não há retrievability para 93% do deck;
 *  - o CEFR real cobre **11,4%** depois da troca pela wordlist.
 *
 * Ou seja: "cartão sem sinal forte" é o caso COMUM, não a exceção. Estes testes tratam o deck frio
 * como caminho principal, e o cartão revisado como o caso que se soma depois.
 */
import { describe, it, expect } from 'vitest'
import {
  calcularDificuldade, faixaDe, cortesDoDeck, CORTE_FACIL, CORTE_DIFICIL,
  PESO_MAXIMO_RETRIEVABILITY, REVISOES_PARA_PESO_CHEIO,
  type SinaisDoCartao,
} from '../src/core/learning/dificuldade'

const AGORA = 1_786_200_000_000
const DIA = 86_400_000

/** Cartão mínimo: sem CEFR, sem revisões, visto uma vez. O perfil de 93% do deck. */
function frio(over: Partial<SinaisDoCartao> = {}): SinaisDoCartao {
  return { word: 'exemplo', cefrLevel: null, cefrSource: 'ausente', occurrences: 1, lastSeenAt: AGORA - DIA, reps: 0, lapses: 0, stability: null, lastReview: null, acertos: 0, tentativas: 0, agora: AGORA, ...over }
}

describe('cartão SEM revisões — o caminho principal', () => {
  it('calcula dificuldade mesmo sem CEFR e sem FSRS', () => {
    const d = calcularDificuldade(frio())
    expect(d.score).toBeGreaterThan(0)
    expect(d.score).toBeLessThanOrEqual(1)
    expect(d.componentes.retrievability).toBeUndefined()
    expect(d.componentes.lexical).toBeUndefined()
  })

  it('declara em quais sinais se baseou — nunca finge cobertura que não tem', () => {
    const d = calcularDificuldade(frio())
    expect(d.sinaisUsados).toContain('familiaridade')
    expect(d.sinaisUsados).not.toContain('lexical')
    expect(d.sinaisUsados).not.toContain('retrievability')
    expect(d.confianca).toBeLessThan(0.6)   // pouca base ⇒ pouca confiança, e isso é dito
  })

  it('mais repetições ⇒ MENOS difícil', () => {
    const pouco = calcularDificuldade(frio({ occurrences: 1 }))
    const muito = calcularDificuldade(frio({ occurrences: 8 }))
    expect(muito.score).toBeLessThan(pouco.score)
  })

  it('visto há muito tempo ⇒ MAIS difícil que visto ontem', () => {
    const recente = calcularDificuldade(frio({ lastSeenAt: AGORA - DIA }))
    const antigo = calcularDificuldade(frio({ lastSeenAt: AGORA - 120 * DIA }))
    expect(antigo.score).toBeGreaterThan(recente.score)
  })

  it('CEFR ausente é OMITIDO, não tratado como nível médio', () => {
    // Tratar ausência como 0,5 empurraria 93% do deck para o meio da escala e apagaria os sinais
    // reais. O peso é renormalizado sobre o que existe.
    const semNivel = calcularDificuldade(frio({ cefrSource: 'ausente', cefrLevel: null }))
    const comA1 = calcularDificuldade(frio({ cefrSource: 'wordlist', cefrLevel: 'A1' }))
    const comC2 = calcularDificuldade(frio({ cefrSource: 'wordlist', cefrLevel: 'C2' }))
    expect(comA1.score).toBeLessThan(semNivel.score)
    expect(comC2.score).toBeGreaterThan(semNivel.score)
  })
})

describe('transição de frio para revisado', () => {
  it('o peso da retrievability CRESCE com o número de revisões', () => {
    const base = { cefrSource: 'wordlist' as const, cefrLevel: 'B1', stability: 2, lastReview: AGORA - 30 * DIA }
    const pesos = [1, 2, 3, 5].map((reps) => calcularDificuldade(frio({ ...base, reps })).pesos.retrievability ?? 0)
    expect(pesos[0]).toBeLessThan(pesos[1])
    expect(pesos[1]).toBeLessThan(pesos[2])
    // Satura: depois de N revisões o peso não cresce mais.
    expect(pesos[3]).toBe(pesos[2])
    expect(pesos[3]).toBeCloseTo(PESO_MAXIMO_RETRIEVABILITY, 5)
  })

  it('UMA revisão não domina o escore — é justamente o que o banco real tem', () => {
    // Medido: os 152 cartões revisados têm reps=1 e stability idêntica (1,18). Uma revisão só não
    // distingue nada, e deixá-la mandar no escore seria dar peso total a um sinal indistinguível.
    const d = calcularDificuldade(frio({ reps: 1, stability: 1.18, lastReview: AGORA - 10 * DIA }))
    expect(d.pesos.retrievability).toBeCloseTo(PESO_MAXIMO_RETRIEVABILITY / REVISOES_PARA_PESO_CHEIO, 5)
    expect(d.pesos.retrievability!).toBeLessThan(d.pesos.familiaridade!)
  })

  it('retrievability baixa (esqueceu) empurra para difícil', () => {
    const lembra = calcularDificuldade(frio({ reps: 4, stability: 100, lastReview: AGORA - DIA }))
    const esqueceu = calcularDificuldade(frio({ reps: 4, stability: 1, lastReview: AGORA - 90 * DIA }))
    expect(esqueceu.score).toBeGreaterThan(lembra.score)
  })
})

describe('regra de precedência — erro repetido vence qualquer média', () => {
  it('2 lapsos ⇒ DIFÍCIL mesmo sendo A1 e muito vista', () => {
    const d = calcularDificuldade(frio({ cefrSource: 'wordlist', cefrLevel: 'A1', occurrences: 20, lapses: 2, reps: 3, stability: 50, lastReview: AGORA }))
    expect(d.faixa).toBe('dificil')
    expect(d.motivo).toBe('lapsos')
  })

  it('acerto abaixo de 40% em 3+ tentativas ⇒ DIFÍCIL', () => {
    const d = calcularDificuldade(frio({ cefrSource: 'wordlist', cefrLevel: 'A1', occurrences: 20, tentativas: 5, acertos: 1 }))
    expect(d.faixa).toBe('dificil')
    expect(d.motivo).toBe('desempenho')
  })

  it('1 erro em 1 tentativa NÃO dispara a regra — amostra de um não é padrão', () => {
    const d = calcularDificuldade(frio({ cefrSource: 'wordlist', cefrLevel: 'A1', occurrences: 20, tentativas: 1, acertos: 0 }))
    expect(d.motivo).not.toBe('desempenho')
  })
})

describe('faixas', () => {
  it('fatia o contínuo em três, com os cortes explícitos', () => {
    expect(faixaDe(0.1)).toBe('facil')
    expect(faixaDe(0.5)).toBe('medio')
    expect(faixaDe(0.9)).toBe('dificil')
  })

  it('deck 100% frio produz as três faixas — senão o filtro nasce inútil', () => {
    // Se todo cartão sem sinal caísse na mesma faixa, o seletor de dificuldade não separaria nada
    // para 93% do deck. Este é o teste que impede o modelo de ser decorativo.
    const faixas = new Set([
      calcularDificuldade(frio({ word: 'sun', occurrences: 12, lastSeenAt: AGORA - DIA })).faixa,
      calcularDificuldade(frio({ word: 'medium', occurrences: 3, lastSeenAt: AGORA - 20 * DIA })).faixa,
      calcularDificuldade(frio({ word: 'incomprehensible', occurrences: 1, lastSeenAt: AGORA - 200 * DIA })).faixa,
    ])
    expect(faixas.size).toBeGreaterThanOrEqual(2)
  })
})

describe('Z3 — cortes por quantil, relativos ao deck do usuário', () => {
  it('separa em terços quando o score é concentrado (o caso medido: 78% entre 0,55 e 0,70)', () => {
    // Medido no deck real: pico em 0,60–0,65 com 38% dos cartões. Cortes FIXOS (0,34/0,67)
    // colocavam 77,8% em "médio" porque o pico inteiro cai dentro dele.
    const scores = [
      ...Array.from({ length: 60 }, (_, i) => 0.60 + i * 0.0008),
      ...Array.from({ length: 20 }, (_, i) => 0.30 + i * 0.004),
      ...Array.from({ length: 20 }, (_, i) => 0.70 + i * 0.002),
    ]
    const c = cortesDoDeck(scores)
    const faixa = (s: number) => faixaDe(s, c)
    const conta = { facil: 0, medio: 0, dificil: 0 }
    for (const s of scores) conta[faixa(s)]++
    const maior = Math.max(...Object.values(conta)) / scores.length
    expect(maior).toBeLessThan(0.6)   // critério da Z3
  })

  it('deck PEQUENO cai para os cortes fixos — quantil sobre 5 itens é ruído', () => {
    const c = cortesDoDeck([0.1, 0.5, 0.9, 0.2, 0.6])
    expect(c.corte1).toBe(CORTE_FACIL)
    expect(c.corte2).toBe(CORTE_DIFICIL)
    expect(c.tipo).toBe('fixo')
  })

  it('deck grande usa quantil e DECLARA os cortes usados', () => {
    const scores = Array.from({ length: 300 }, (_, i) => 0.55 + (i % 50) * 0.002)
    const c = cortesDoDeck(scores)
    expect(c.tipo).toBe('quantil')
    expect(c.corte1).toBeLessThan(c.corte2)
    // Os cortes são dados, não constantes escondidas: a UI precisa poder explicar a mudança.
    expect(typeof c.corte1).toBe('number')
  })

  it('deck 100% homogêneo não finge separação: cai para fixo', () => {
    // 300 cartões com o MESMO score: dividir em três seria inventar uma distinção que o dado
    // não sustenta — exatamente o defeito do estimador CEFR antigo.
    const c = cortesDoDeck(Array.from({ length: 300 }, () => 0.62))
    expect(c.tipo).toBe('fixo')
    expect(c.motivo).toBe('sem-dispersao')
  })

  it('palavra que ganha ocorrências e acertos MUDA de faixa', () => {
    const cortes = cortesDoDeck(Array.from({ length: 300 }, (_, i) => 0.3 + (i / 300) * 0.5))
    const nova = calcularDificuldade(frio({ occurrences: 1, tentativas: 0, acertos: 0 }))
    const praticada = calcularDificuldade(frio({ occurrences: 8, tentativas: 6, acertos: 6, lastSeenAt: AGORA - DIA }))
    expect(faixaDe(praticada.score, cortes)).not.toBe(faixaDe(nova.score, cortes))
    expect(praticada.score).toBeLessThan(nova.score)
  })
})
