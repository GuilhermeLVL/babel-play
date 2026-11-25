/**
 * A FORÇA NA LEGENDA (openspec `status-da-palavra-na-legenda`): o mapa força -> etiqueta, o índice com força, a glosa do
 * leitor por força, a promoção sem escrita e a concordância com o catálogo. Tudo puro, sem relógio.
 */
import { describe, expect, it } from 'vitest'

import { deckSintetico, MAPAS, simular } from '../scripts/etiquetas/simular-forca'
import { type Forca, forcaDoCartao, LIMIAR_FAMILIAR_DIAS, LIMIAR_FIRME_DIAS } from '../src/core/learning/forcaDoCartao'
import {
  etiquetaDaChave,
  etiquetaDaForca,
  etiquetaSilenciosa,
  FORCA_QUE_APAGA_A_GLOSA,
  forcaNoCaderno,
  montarIndiceDeForcas,
  montarIndiceDoCaderno,
  type OpcoesDaEtiqueta,
} from '../src/core/vocabulario/etiquetas'
import { chavesConhecidas, chavesConhecidasPorForca, contarConhecidas } from '../src/core/vocabulario/marcadas'
import { cartoesParaOIndice } from '../src/lib/etiquetas/indiceDeEtiquetas'
import type { VocabCard } from '../src/types'

const SEM_NOVA: OpcoesDaEtiqueta = { nova: false }

/** Um cartão do cliente no formato mínimo que o índice lê. */
const cartao = (word: string, stability: number | null, reps: number, lapses = 0): VocabCard =>
  ({
    word,
    srcLang: 'en',
    inDeck: true,
    fsrsState: stability == null ? 'New' : reps < 2 ? 'Learning' : 'Review',
    fsrsStability: stability ?? undefined,
    stability: stability ?? undefined,
    reps,
    lapses,
    lastReview: 0,
  }) as unknown as VocabCard

/** O que a legenda pinta para uma palavra, com a flag ligada (forças) ou desligada. */
function etiquetaDe(c: VocabCard, comForca: boolean, agora = Date.now()) {
  const lidos = cartoesParaOIndice([c], agora)
  const caderno = montarIndiceDoCaderno(lidos)
  const forcas = comForca ? montarIndiceDeForcas(lidos) : null
  return etiquetaDaChave(c.word.toLowerCase(), 'en', caderno, { ...SEM_NOVA, forcas })
}

describe('etiquetaDaForca: o mapa 1 / 2-3 / 4', () => {
  it('1 salva, 2 e 3 aprendendo, 4 silenciosa', () => {
    expect(etiquetaDaForca(1)).toBe('salva')
    expect(etiquetaDaForca(2)).toBe('aprendendo')
    expect(etiquetaDaForca(3)).toBe('aprendendo')
    expect(etiquetaDaForca(4)).toBe('dominada')
    expect(etiquetaSilenciosa(etiquetaDaForca(4))).toBe(true)
    expect(etiquetaSilenciosa(etiquetaDaForca(3))).toBe(false)
  })

  it('faixas do spec: estabilidade 0, 2,9, 3, 20,9 e 21 dias', () => {
    const e = (s: number | null, reps = 3) => etiquetaDe(cartao('word', s, s == null ? 0 : reps), true)
    expect(e(null)).toBe('salva')
    expect(e(2.9)).toBe('aprendendo')
    expect(e(3)).toBe('aprendendo')
    expect(e(20.9)).toBe('aprendendo')
    expect(e(21)).toBe('dominada')
  })

  it('3 esquecimentos rebaixam: estabilidade 40 com 3 lapses é força 3 e `aprendendo`', () => {
    const c = cartao('word', 40, 8, 3)
    expect(forcaDoCartao(c)).toBe(3)
    expect(etiquetaDe(c, true)).toBe('aprendendo')
  })

  it('passar o tempo sem revisar não muda a etiqueta (a régua antiga oscilava)', () => {
    const c = cartao('word', 25, 6)
    const hoje = Date.now()
    const e60 = etiquetaDe({ ...c, lastReview: hoje } as VocabCard, true, hoje + 60 * 86_400_000)
    expect(etiquetaDe({ ...c, lastReview: hoje } as VocabCard, true, hoje)).toBe(e60)
    expect(e60).toBe('dominada')
  })
})

describe('flag desligada: idêntico à régua de hoje', () => {
  it('sem índice de forças, a etiqueta é a do estado do caderno', () => {
    const caderno = montarIndiceDoCaderno([
      { palavra: 'new', lang: 'en', estado: 'nova' },
      { palavra: 'mid', lang: 'en', estado: 'aprendendo' },
      { palavra: 'top', lang: 'en', estado: 'dominada' },
    ])
    const sem = (k: string) => etiquetaDaChave(k, 'en', caderno, { ...SEM_NOVA, forcas: null })
    const antigo = (k: string) => etiquetaDaChave(k, 'en', caderno, SEM_NOVA)
    for (const k of ['new', 'mid', 'top', 'fora']) expect(sem(k)).toBe(antigo(k))
    expect([antigo('new'), antigo('mid'), antigo('top'), antigo('fora')]).toEqual([
      'salva',
      'aprendendo',
      'dominada',
      undefined,
    ])
  })

  it('o índice do cliente carrega a força mas só pinta por ela com a flag', () => {
    /* estabilidade 10 dias, última revisão há 100 dias: hoje é `aprendendo` (retenção caiu), por força é força 3 */
    const c = { ...cartao('word', 10, 5), lastReview: Date.now() - 100 * 86_400_000 } as VocabCard
    expect(etiquetaDe(c, false)).toBe('aprendendo')
    expect(etiquetaDe(c, true)).toBe('aprendendo')
    /* estabilidade 30 dias, revisada ontem: hoje `dominada`; sem relógio também força 4 */
    const firme = { ...cartao('word', 30, 5), lastReview: Date.now() - 86_400_000 } as VocabCard
    expect(etiquetaDe(firme, false)).toBe('dominada')
    expect(etiquetaDe(firme, true)).toBe('dominada')
    /* o caso que muda: estabilidade 5 dias, revisada ontem: hoje `dominada` (retenção alta); por força é 3 e pinta */
    const recente = { ...cartao('word', 5, 4), lastReview: Date.now() - 86_400_000 } as VocabCard
    expect(etiquetaDe(recente, false)).toBe('dominada')
    expect(etiquetaDe(recente, true)).toBe('aprendendo')
  })
})

describe('índice de forças', () => {
  it('chave repetida em dois cartões vale a maior força; sem idioma vale para todos', () => {
    const f = montarIndiceDeForcas([
      { palavra: 'Twice!', lang: 'en', forca: 2 },
      { palavra: 'twice', lang: 'en-US', forca: 4 },
      { palavra: 'twice', lang: 'en', forca: 1 },
      { palavra: 'gato', forca: 3 },
    ])
    expect(forcaNoCaderno(f, 'twice', 'en')).toBe(4)
    expect(forcaNoCaderno(f, 'gato', 'pt')).toBe(3)
    expect(forcaNoCaderno(f, 'nada', 'en')).toBeUndefined()
    expect(forcaNoCaderno(null, 'twice', 'en')).toBeUndefined()
  })

  it('palavra marcada sem cartão continua `conhecida` e a força não entra', () => {
    const forcas = montarIndiceDeForcas([])
    const marcadas = new Map([['en', new Map([['known', 'conhecida' as const]])]])
    expect(etiquetaDaChave('known', 'en', montarIndiceDoCaderno([]), { ...SEM_NOVA, marcadas, forcas })).toBe(
      'conhecida',
    )
  })
})

describe('promoção automática: só leitura, nenhuma escrita', () => {
  it('estabilidade 2,9 -> 3,1: a força vai de 2 para 3 e a etiqueta continua `aprendendo`', () => {
    const antes = cartao('word', 2.9, 3)
    const depois = cartao('word', 3.1, 4)
    expect(forcaDoCartao(antes)).toBe(2)
    expect(forcaDoCartao(depois)).toBe(3)
    expect(etiquetaDe(antes, true)).toBe('aprendendo')
    expect(etiquetaDe(depois, true)).toBe('aprendendo')
  })

  it('20,9 -> 21 some a tinta; esquecer (cai abaixo de 21) volta a pintar', () => {
    expect(etiquetaDe(cartao('word', 20.9, 6), true)).toBe('aprendendo')
    expect(etiquetaDe(cartao('word', 21, 7), true)).toBe('dominada')
    expect(etiquetaDe(cartao('word', 8, 8, 1), true)).toBe('aprendendo')
  })

  it('a conversão do caderno do cliente é pura: não toca nos cartões', () => {
    const c = cartao('word', 3.1, 4)
    const copia = JSON.stringify(c)
    cartoesParaOIndice([c])
    expect(JSON.stringify(c)).toBe(copia)
  })
})

describe('glosa do leitor por força', () => {
  const caderno = montarIndiceDoCaderno([
    { palavra: 'f1', lang: 'en', estado: 'nova' },
    { palavra: 'f2', lang: 'en', estado: 'aprendendo' },
    { palavra: 'f3', lang: 'en', estado: 'aprendendo' },
    { palavra: 'f4', lang: 'en', estado: 'dominada' },
  ])
  const forcas = montarIndiceDeForcas(
    ([1, 2, 3, 4] as Forca[]).map((forca) => ({ palavra: `f${forca}`, lang: 'en', forca })),
  )
  const marcadas = new Map([['en', new Map([['ja', 'conhecida' as const]])]])

  it('força 2 mantém a glosa, 3 apaga, "Já sei" apaga na hora', () => {
    expect(FORCA_QUE_APAGA_A_GLOSA).toBe(3)
    const c = chavesConhecidasPorForca(caderno, forcas, marcadas, 'en')
    expect([...c].sort()).toEqual(['f3', 'f4', 'ja'])
  })

  it('a régua de hoje (e a contagem de conhecidas) NÃO mudam', () => {
    expect([...chavesConhecidas(caderno, marcadas, 'en')].sort()).toEqual(['f2', 'f3', 'f4', 'ja'])
    expect(contarConhecidas(caderno, marcadas, 'en')).toBe(4)
  })
})

describe('legenda e catálogo concordam (1.000 cartões sintéticos)', () => {
  it('a faixa de cada cartão é a mesma, e os limiares vêm do módulo da força', () => {
    expect(LIMIAR_FAMILIAR_DIAS).toBe(3)
    expect(LIMIAR_FIRME_DIAS).toBe(21)
    for (const c of deckSintetico(1000, 3)) {
      const forca = forcaDoCartao({ stability: c.stability, reps: c.reps, lapses: c.lapses })
      /* o catálogo mostra `forca`; a legenda mostra `etiquetaDaForca(forca)`: mesma faixa nas duas telas */
      const legenda = etiquetaDe(cartao('w', c.stability, c.reps, c.lapses), true)
      expect(legenda).toBe(etiquetaDaForca(forca))
    }
  })
})

describe('simulação offline do mapa', () => {
  it('nenhum dos mapas oscila em 30 dias e o escolhido é o primeiro da lista', () => {
    const rel = simular(deckSintetico(2000, 1))
    expect(Object.keys(MAPAS)[0]).toContain('escolhido')
    expect(rel[0].oscilamHoje).toBeGreaterThan(0)
    for (const r of rel) expect(r.oscilamMapa).toBe(0)
    expect(rel[0].total).toBe(2000)
  })

  it('é determinística para a mesma semente', () => {
    expect(simular(deckSintetico(500, 9))).toEqual(simular(deckSintetico(500, 9)))
  })
})

describe('desempenho do índice', () => {
  it('monta o índice (estado + força) de 20.000 cartões em bem menos de 1 s', () => {
    const cartas = Array.from({ length: 20_000 }, (_, i) => cartao(`palavra${i}`, (i % 50) + 0.5, 1 + (i % 7), i % 4))
    const t0 = performance.now()
    const lidos = cartoesParaOIndice(cartas)
    const caderno = montarIndiceDoCaderno(lidos)
    const forcas = montarIndiceDeForcas(lidos)
    const ms = performance.now() - t0
    expect(caderno.get('en')?.size).toBe(20_000)
    expect(forcas.get('en')?.size).toBe(20_000)
    expect(ms).toBeLessThan(1000)
  })
})
