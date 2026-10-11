/**
 * O CONTEÚDO ESCOLHIDO, NOS CARTÕES (`lib/conteudo/cartoes.ts`): o predicado da fila de revisão e da
 * lista de Palavras, e o "resumo filtrado" da aba Hoje. O que o catálogo contou é o que a tela mostra.
 */
import { describe, expect, it } from 'vitest'

import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { ERROS_DE_DIFICIL, type ResumoDosCartoes } from '../src/core/learning/resumoDosCartoes'
import { hojeDosCartoes, semanaComTeto, semanaDeEstudo } from '../src/lib/cartoes/estadoDeHoje'
import {
  type CartaoDaFonte,
  cartaoDificil,
  cartoesDoConteudo,
  hojeDaFonte,
  idiomaAplicado,
  somaDaFila,
} from '../src/lib/conteudo/cartoes'
import { ERROS_ATE_O_AVISO } from '../src/lib/revisao/enxuta'

type C = CartaoDaFonte & { id: string }
const c = (id: string, o: Partial<C> = {}): C => ({ id, srcLang: 'en', inDeck: true, ...o })

const BARALHO: C[] = [
  c('reuniao-1', { sourceSessionId: 's1' }),
  c('reuniao-2', { sourceSessionId: 's1', lapses: 9 }),
  c('podcast', { sourceSessionId: 's2', lapses: 7 }),
  c('anki-pv', { daAnki: true, baralhosAnki: ['dA'] } as Partial<C>),
  c('anki-es', { srcLang: 'es', baralhosAnki: ['dE'], lapses: 8 }),
  c('trilha', { daTrilha: true }),
  c('aula', { srcLang: 'es-ES', sourceSessionId: 's3' }),
  c('suspensa', { inDeck: false, sourceSessionId: 's1' }),
]
const ids = (l: C[]) => l.map((x) => x.id)

describe('"difícil" tem uma régua só', () => {
  it('errada 8 vezes ou mais, na tela Cartões, no catálogo e no aviso da revisão', () => {
    expect(ERROS_DE_DIFICIL).toBe(8)
    expect(ERROS_ATE_O_AVISO).toBe(ERROS_DE_DIFICIL)
    expect(cartaoDificil({ lapses: 7 })).toBe(false)
    expect(cartaoDificil({ lapses: 8 })).toBe(true)
    expect(cartaoDificil({ lapses: null })).toBe(false)
  })
})

describe('os cartões do conteúdo (a fila da revisão e a lista de Palavras)', () => {
  it('com dois idiomas, o idioma é o primeiro nível: "Tudo" é tudo em inglês', () => {
    expect(idiomaAplicado(BARALHO, 'en')).toBe('en')
    expect(ids(cartoesDoConteudo(BARALHO, { idioma: 'en', fonte: { tipo: 'tudo' } }))).toEqual([
      'reuniao-1',
      'reuniao-2',
      'podcast',
      'anki-pv',
      'trilha',
      'suspensa',
    ])
    expect(ids(cartoesDoConteudo(BARALHO, { idioma: 'es', fonte: { tipo: 'tudo' } }))).toEqual(['anki-es', 'aula'])
  })

  it('o idioma que não existe (ou ainda não decidido) cai no maior da conta', () => {
    expect(idiomaAplicado(BARALHO, '')).toBe('en')
    expect(idiomaAplicado(BARALHO, 'fr')).toBe('en')
  })

  it('com um idioma só nada é filtrado por idioma: o cartão sem idioma continua contando', () => {
    const um = [c('a'), c('b', { srcLang: undefined }), c('x', { srcLang: 'es', inDeck: false })]
    expect(idiomaAplicado(um, 'en')).toBe('')
    expect(ids(cartoesDoConteudo(um, { idioma: 'en', fonte: { tipo: 'tudo' } }))).toEqual(['a', 'b', 'x'])
  })

  it('sessão → nascido dela; Anki → do baralho; Trilha → da Trilha; Difíceis → 8 erros ou mais', () => {
    const de = (fonte: Parameters<typeof cartoesDoConteudo>[1]['fonte'], idioma = 'en') =>
      ids(cartoesDoConteudo(BARALHO, { idioma, fonte }))
    expect(de({ tipo: 'sessao', id: 's1', nome: '' })).toEqual(['reuniao-1', 'reuniao-2', 'suspensa'])
    expect(de({ tipo: 'anki', id: 'dA', nome: '' })).toEqual(['anki-pv'])
    expect(de({ tipo: 'trilha' })).toEqual(['trilha'])
    expect(de({ tipo: 'dificeis' })).toEqual(['reuniao-2'])
    /* Sempre o idioma do conteúdo: as difíceis em espanhol são outras. */
    expect(de({ tipo: 'dificeis' }, 'es')).toEqual(['anki-es'])
  })
})

const resumo = (o: Partial<ResumoDosCartoes> = {}) =>
  ({
    total: 422,
    hoje: { novas: 5, aprendendo: 3, revisar: 18 },
    baralhos: {
      idiomas: [
        { id: 'en', total: 318, novas: 4, aprendendo: 3, revisar: 15 },
        { id: 'es', total: 104, novas: 1, aprendendo: 0, revisar: 3 },
      ],
      sessoes: [{ id: 's1', total: 37, novas: 3, aprendendo: 2, revisar: 4 }],
      anki: [{ id: 'dA', total: 120, novas: 0, aprendendo: 0, revisar: 2 }],
      trilha: { total: 60, novas: 1, aprendendo: 0, revisar: 1 },
    },
    ...o,
  }) as ResumoDosCartoes

const contagens = (o: Partial<ContagensDeConteudo> = {}): ContagensDeConteudo => ({
  agora: 0,
  idioma: 'en',
  idiomas: [
    { id: 'en', palavras: 318 },
    { id: 'es', palavras: 104 },
  ],
  tudo: { palavras: 318, frases: 236, paraHoje: 22 },
  dificeis: { palavras: 5, frases: 5, paraHoje: 2 },
  sessoes: [
    { id: 's1', nome: 'Reunião', tipo: 'live', quando: 1, duracaoMs: null, palavras: 37, frases: 31, paraHoje: 9 },
    { id: 's9', nome: 'Antiga', tipo: 'audio', quando: 0, duracaoMs: null, palavras: 12, frases: 9, paraHoje: 4 },
  ],
  anki: [{ id: 'dA', nome: 'Phrasal', tipo: null, quando: 0, duracaoMs: null, palavras: 120, frases: 96, paraHoje: 2 }],
  trilha: { palavras: 60, frases: 0, paraHoje: 2 },
  ...o,
})

describe('o resumo filtrado: o total e a fila de hoje da fonte', () => {
  it('"Tudo" com dois idiomas é a linha do idioma; com um só, a conta inteira', () => {
    const en = hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'tudo' } }, contagens())
    expect(en).toEqual({ total: 318, fila: { novas: 4, aprendendo: 3, revisar: 15 }, porFase: true })
    expect(somaDaFila(en.fila)).toBe(22)
    const um = hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'tudo' } }, contagens({ idioma: '' }))
    expect(um).toEqual({ total: 422, fila: { novas: 5, aprendendo: 3, revisar: 18 }, porFase: true })
  })

  it('sessão, Anki e Trilha: as três fases do resumo e o total do catálogo', () => {
    const k = contagens()
    expect(hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'sessao', id: 's1', nome: '' } }, k)).toEqual({
      total: 37,
      fila: { novas: 3, aprendendo: 2, revisar: 4 },
      porFase: true,
    })
    expect(hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'anki', id: 'dA', nome: '' } }, k).fila.revisar).toBe(2)
    expect(hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'trilha' } }, k).total).toBe(60)
  })

  it('a sessão que o resumo não lista (além das 60): o que vence entra em "a rever", e a tela sabe', () => {
    const r = hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'sessao', id: 's9', nome: '' } }, contagens())
    expect(r).toEqual({ total: 12, fila: { novas: 0, aprendendo: 0, revisar: 4 }, porFase: false })
  })

  it('Difíceis: quem errou 8 vezes está em revisão; o número é o do catálogo', () => {
    const r = hojeDaFonte(resumo(), { idioma: 'en', fonte: { tipo: 'dificeis' } }, contagens())
    expect(r).toEqual({ total: 5, fila: { novas: 0, aprendendo: 0, revisar: 2 }, porFase: true })
  })
})

describe('o estado de Hoje com um conteúdo escolhido', () => {
  const conta = { total: 422, revisoesDeSempre: 600, hoje: { novas: 5, aprendendo: 3, revisar: 18 } }
  const opcoes = { novas: 20, revisoes: 200 }

  it('a fila é a da fonte: 9 vencem na sessão, não os 26 da conta', () => {
    expect(hojeDosCartoes(conta, opcoes, { novas: 3, aprendendo: 2, revisar: 4 })).toEqual({
      estado: 'normal',
      vencem: 9,
      rodada: 9,
    })
  })

  it('nada vence NA FONTE mas vence em outro lugar: normal com zero ("Nada vence aqui hoje"), não dia cumprido', () => {
    expect(hojeDosCartoes(conta, opcoes, { novas: 0, aprendendo: 0, revisar: 0 })).toEqual({
      estado: 'normal',
      vencem: 0,
      rodada: 0,
    })
    const emDia = { ...conta, hoje: { novas: 0, aprendendo: 0, revisar: 0 } }
    expect(hojeDosCartoes(emDia, opcoes, { novas: 0, aprendendo: 0, revisar: 0 }).estado).toBe('feito')
  })

  it('"vazio" e "primeiro" continuam sendo da conta', () => {
    expect(hojeDosCartoes({ ...conta, total: 0 }, opcoes, { novas: 0, aprendendo: 0, revisar: 0 }).estado).toBe('vazio')
    expect(hojeDosCartoes({ ...conta, revisoesDeSempre: 0 }, opcoes, { novas: 9, aprendendo: 0, revisar: 0 }).estado).toBe(
      'primeiro',
    )
  })
})

describe('a semana da sequência e a semana com teto', () => {
  it('os últimos sete dias, o último é hoje: estudou, sem estudo, hoje por estudar', () => {
    const sabado = new Date(2026, 9, 10).getTime()
    const calendario = [...Array.from({ length: 77 }, () => 0), 0, 4, 0, 2, 9, 1, 0]
    expect(semanaDeEstudo(calendario, sabado)).toEqual([
      { dia: 0, estado: 'fora' },
      { dia: 1, estado: 'feito' },
      { dia: 2, estado: 'fora' },
      { dia: 3, estado: 'feito' },
      { dia: 4, estado: 'feito' },
      { dia: 5, estado: 'feito' },
      { dia: 6, estado: 'hoje' },
    ])
    expect(semanaDeEstudo([...calendario.slice(0, -1), 3], sabado).at(-1)).toEqual({ dia: 6, estado: 'feito' })
  })

  it('com teto, cada dia leva o que sobrou de ontem mais o que volta, até o limite', () => {
    /* Hoje vencem 240 e o teto é 40: sobram 200, que escoam 40 por dia enquanto a previsão traz 8, 14, 21… */
    expect(semanaComTeto([240, 8, 14, 21, 9, 17, 12, 26], 40)).toEqual([40, 40, 40, 40, 40, 40, 40])
    /* Sem atraso, a semana é a previsão. */
    expect(semanaComTeto([20, 8, 14, 21, 9, 17, 12, 26], 100)).toEqual([8, 14, 21, 9, 17, 12, 26])
    /* O que passa do teto num dia entra no seguinte. */
    expect(semanaComTeto([0, 30, 5, 0, 0, 0, 0, 0], 20)).toEqual([20, 15, 0, 0, 0, 0, 0])
  })
})
