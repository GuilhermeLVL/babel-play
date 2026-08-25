/**
 * A ÚNICA SAÍDA DESTE PROJETO QUE É UMA AFIRMAÇÃO SOBRE A PESSOA.
 *
 * Todo o resto do app conta fatos: quantas palavras, quantas revisões, quanto tempo. "Você sustenta
 * o A2" é diferente — é um juízo, e errá-lo custa mais do que atrasá-lo. Daí a regra ser exigente e
 * este arquivo travá-la em três frentes:
 *
 *  1. MONOTONICIDADE. CEFR é cumulativo; ninguém "tem" B1 falhando A2. Sem essa cláusula, cinco
 *     palavras B1 de sorte rotulariam alguém de B1 — e o número ao lado, na mesma tela, mostraria
 *     A2 em 31%. Um rótulo que a evidência ao lado contradiz é pior que rótulo nenhum.
 *  2. SILÊNCIO SOB POUCA EVIDÊNCIA. Abaixo do mínimo, a faixa não recebe número e o rótulo não sai.
 *  3. A BASE DECLARADA. O nível de cada palavra vem da lista curada, nunca da coluna do banco (que
 *     foi escrita por um estimador depreciado que media comprimento de string). Isso deixa a base
 *     pequena, e é `base`/`confianca` que dizem isso em voz alta.
 *
 * As palavras das fixtures são escolhidas CONSULTANDO `nivelCefr`, não fixadas na mão: a lista
 * curada é dado externo e pode discordar de qualquer nível que eu presumisse aqui.
 */
import { describe, it, expect } from 'vitest'
import {
  fluenciaDoBaralho, rotuloDeFluencia,
  MIN_CARTOES_POR_FAIXA, MIN_FAIXAS_COM_EVIDENCIA, RETENCAO_DE_DOMINIO,
} from '../src/core/learning/fluencia'
import { nivelCefr } from '../src/core/learning/cefrWordlist'
import { CORTE_DE_FEITA } from '../src/core/learning/etapas'
import trilhaEn from '../src/data/trilha/en.json'
import type { VocabCard } from '../src/types'
import type { CefrLevel } from '../src/core/learning/contract'

const AGORA = 1_700_000_000_000
const DIA = 86_400_000

/**
 * Palavras REAIS de cada faixa, tiradas do próprio dado da trilha e confirmadas por `nivelCefr`.
 * Assim a fixture não pode discordar da lista curada — se a lista mudar, o teste acompanha.
 */
function palavrasDaFaixa(nivel: CefrLevel, quantas: number): string[] {
  const dado = trilhaEn as unknown as { niveis: Partial<Record<CefrLevel, Array<[string, string]>>> }
  const achadas = (dado.niveis[nivel] ?? [])
    .map(par => par[0])
    .filter(w => nivelCefr(w, 'en').level === nivel)
    .slice(0, quantas)

  expect(achadas.length, `faltam palavras ${nivel} na lista curada para montar a fixture`).toBe(quantas)
  return achadas
}

/**
 * Um cartão com retenção CONTROLADA.
 *
 * `retrievability` cai com o tempo desde a última revisão e sobe com a estabilidade. Fixando
 * `lastReview = agora`, o tempo decorrido é zero e a retenção é 1 — o máximo. Para retenção baixa,
 * afastamos a última revisão com estabilidade pequena.
 */
function carta(word: string, opts: { estabilidade?: number | null; diasAtras?: number } = {}): VocabCard {
  const { estabilidade = 100, diasAtras = 0 } = opts
  return {
    id: `c-${word}`, word, phonetics: '', translation: `t-${word}`, explanation: '',
    srcLang: 'en', tgtLang: 'pt', frequency: 'medium',
    leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'Review',
    fsrsStability: estabilidade ?? 0,
    stability: estabilidade ?? undefined,
    fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: new Date(0).toISOString(),
    lastReview: estabilidade == null ? undefined : AGORA - diasAtras * DIA,
    inDeck: true,
  }
}

/** `n` cartões de uma faixa, todos com retenção alta (revisados agora, estabilidade grande). */
const faixaForte = (nivel: CefrLevel, n = MIN_CARTOES_POR_FAIXA) =>
  palavrasDaFaixa(nivel, n).map(w => carta(w, { estabilidade: 400, diasAtras: 0 }))

/** `n` cartões de uma faixa com retenção baixa: pouca estabilidade e muito tempo sem revisar. */
const faixaFraca = (nivel: CefrLevel, n = MIN_CARTOES_POR_FAIXA) =>
  palavrasDaFaixa(nivel, n).map(w => carta(w, { estabilidade: 1, diasAtras: 90 }))

const analisar = (cartas: VocabCard[]) => fluenciaDoBaralho(cartas, { agora: AGORA, lang: 'en' })

describe('a fixture mede o que diz medir', () => {
  it('faixa forte fica acima do corte e faixa fraca fica abaixo', () => {
    const forte = analisar(faixaForte('A1')).faixas[0]
    expect(forte.retencao!).toBeGreaterThanOrEqual(RETENCAO_DE_DOMINIO)

    const fraca = analisar(faixaFraca('A1')).faixas[0]
    expect(fraca.retencao!).toBeLessThan(RETENCAO_DE_DOMINIO)
  })
})

describe('monotonicidade — a cláusula que torna a regra honesta', () => {
  it('A1 forte, A2 fraca, B1 forte → o rótulo é A1', () => {
    // O caso que a regra existe para impedir: sorte numa faixa alta não pula a que falhou embaixo.
    const f = analisar([...faixaForte('A1'), ...faixaFraca('A2'), ...faixaForte('B1')])

    expect(f.rotulo).toBe('A1')
    expect(f.faixas.find(x => x.nivel === 'B1')!.sustentada, 'B1 está sustentada — e mesmo assim não vira rótulo').toBe(true)
  })

  it('o rótulo jamais excede a faixa mais alta com evidência', () => {
    const f = analisar([...faixaForte('A1'), ...faixaForte('A2')])
    const maisAlta = f.faixas.filter(x => x.retencao !== null).at(-1)!.nivel
    expect(f.rotulo).toBe(maisAlta)
  })

  it('falhando na primeira faixa, não há rótulo — e o motivo diz qual falhou', () => {
    const f = analisar([...faixaFraca('A1'), ...faixaFraca('A2')])
    expect(f.rotulo).toBeNull()
    expect(f.motivo).toContain('A1')
  })

  it('sustentando tudo, o rótulo é a última faixa medida', () => {
    const f = analisar([...faixaForte('A1'), ...faixaForte('A2'), ...faixaForte('B1')])
    expect(f.rotulo).toBe('B1')
  })
})

describe('silêncio quando a evidência não sustenta', () => {
  it('faixa com menos que o mínimo não recebe número', () => {
    const f = analisar(faixaForte('A1', MIN_CARTOES_POR_FAIXA - 1))
    const a1 = f.faixas.find(x => x.nivel === 'A1')!

    expect(a1.retencao, 'inventou uma retenção com amostra insuficiente').toBeNull()
    expect(a1.sustentada).toBe(false)
    expect(a1.naFaixa, 'o cartão existe e precisa continuar sendo contado').toBe(MIN_CARTOES_POR_FAIXA - 1)
  })

  it('uma faixa só não basta para um rótulo — não há ordenação a verificar', () => {
    const f = analisar(faixaForte('A1'))
    expect(MIN_FAIXAS_COM_EVIDENCIA).toBeGreaterThan(1)
    expect(f.rotulo).toBeNull()
  })

  it('baralho sem nenhuma palavra na lista curada não afirma nada', () => {
    const inventadas = ['zzqx', 'wqxz', 'xqzw'].map(w => carta(w))
    const f = analisar(inventadas)

    expect(f.rotulo).toBeNull()
    expect(f.faixas).toEqual([])
    expect(f.semNivel).toBe(inventadas.length)
    expect(f.base.considerados).toBe(0)
  })

  it('o motivo NUNCA é vazio — é o que a tela mostra ao explicar o rótulo', () => {
    for (const cartas of [[], faixaForte('A1'), faixaFraca('A1'), [...faixaForte('A1'), ...faixaForte('A2')]]) {
      expect(analisar(cartas).motivo.trim()).not.toBe('')
    }
  })
})

describe('o que entra e o que não entra na conta', () => {
  it('cartão sem estabilidade conta na faixa e nunca na retenção', () => {
    const comEstabilidade = faixaForte('A1')
    const sem = palavrasDaFaixa('A2', 5).map(w => carta(w, { estabilidade: null }))
    const f = analisar([...comEstabilidade, ...sem])

    const a2 = f.faixas.find(x => x.nivel === 'A2')!
    expect(a2.naFaixa).toBe(5)
    expect(a2.medidos, 'cartão nunca revisado entrou na média de retenção').toBe(0)
    expect(a2.retencao).toBeNull()
  })

  it('cartão fora do baralho é ignorado por completo', () => {
    const arquivados = faixaForte('A1').map(c => ({ ...c, inDeck: false }))
    const f = analisar(arquivados)

    expect(f.faixas).toEqual([])
    expect(f.base.total, 'cartão arquivado inflou a base').toBe(0)
  })

  it('a base declara sobre o que a conta foi feita', () => {
    const f = analisar([...faixaForte('A1'), ...['zzqx', 'wqxz'].map(w => carta(w))])

    expect(f.base.total).toBe(MIN_CARTOES_POR_FAIXA + 2)
    expect(f.base.considerados).toBe(MIN_CARTOES_POR_FAIXA)
    expect(f.confianca).toBeCloseTo(MIN_CARTOES_POR_FAIXA / (MIN_CARTOES_POR_FAIXA + 2), 5)
  })

  it('a confiança cai quando a maior parte do baralho fica de fora', () => {
    // O caso real medido: 149 de 1.902 com nível conferido → 0,08, abaixo do limiar da UI.
    const f = analisar([...faixaForte('A1'), ...Array.from({ length: 500 }, (_, i) => carta(`zzq${i}`))])
    expect(f.confianca).toBeLessThan(0.5)
  })
})

describe('acordos com o resto do sistema', () => {
  it('o corte de domínio é o MESMO das etapas da trilha', () => {
    // Os dois decidem "isto está fechado". Se divergirem, o app diz que o nível terminou enquanto
    // as etapas dele seguem abertas.
    expect(RETENCAO_DE_DOMINIO).toBe(CORTE_DE_FEITA)
  })

  it('o rótulo curto cala quando não há afirmação a fazer', () => {
    expect(rotuloDeFluencia(analisar([]))).toBe('Ainda não dá para resumir num nível')
    expect(rotuloDeFluencia(analisar([...faixaForte('A1'), ...faixaForte('A2')]))).toContain('A2')
  })

  it('as faixas saem na ordem CEFR, não na ordem em que apareceram no baralho', () => {
    const f = analisar([...faixaForte('B1'), ...faixaForte('A1'), ...faixaForte('A2')])
    expect(f.faixas.map(x => x.nivel)).toEqual(['A1', 'A2', 'B1'])
  })
})
