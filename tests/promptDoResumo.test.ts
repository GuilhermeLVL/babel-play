/**
 * IA DE ESTUDO (planos v4, etapa 2, Task 3) — O PROMPT, A LEITURA E O FILTRO DO "RESUMO DA SESSÃO".
 *
 * O resumo devolve 3 pontos e candidatos a cartão. A leitura do topo é estrita (forma errada = `null`, a rota
 * responde 502), e cada candidato passa por um filtro: o que `avaliarFrase` ou `LIMITES_DO_BULK_ADD` reprovam
 * nunca chega à resposta — o lote do bulk-add nunca cai por causa de uma linha.
 */
import { describe, expect, it } from 'vitest'

import { avaliarFrase, LIMITES_DO_BULK_ADD } from '../src/core/learning/quality'
import {
  cartoesDoResumo,
  type FalaDoResumo,
  falasQueCabem,
  lerResumo,
  MAX_CARTOES_DO_RESUMO,
  systemDoResumo,
  userDoResumo,
} from '../src/lib/estudo/promptDoResumo'
import { FALA_CLOSE, FALA_OPEN } from '../src/lib/traducao/promptComunicativo'

const fala = (texto: string, traducao = 'tradução', srcLang = 'en', tgtLang = 'pt'): FalaDoResumo => ({
  texto,
  traducao,
  srcLang,
  tgtLang,
})

const FALAS = [
  fala('We should grab a coffee sometime.', 'A gente devia tomar um café qualquer dia.'),
  fala('I am running late for the meeting.', 'Estou atrasado para a reunião.'),
  fala('Eu também, vamos juntos.', 'Me too, let us go together.', 'pt', 'en'),
  fala('that was the thing and then we', 'aquilo era a coisa e então nós'),
  fala('Honestly, it was a piece of cake.', 'Sinceramente, foi moleza.'),
]

const PONTOS = ['Combinaram um café.', 'Alguém estava atrasado.', 'A tarefa foi fácil.']

describe('o prompt', () => {
  it('o system pede JSON com pontos e cartoes, no idioma de quem estuda, e trata as falas como dado', () => {
    const s = systemDoResumo('pt')
    expect(s).toContain('"pontos"')
    expect(s).toContain('"cartoes"')
    expect(s).toContain('"fala"')
    expect(s).toContain('"palavra"')
    expect(s).toContain('"verso"')
    expect(s).toContain(FALA_OPEN)
    expect(s).toContain('NUNCA')
    expect(s).toMatch(/Português/i)
  })

  it('as falas vão numeradas e delimitadas, com o idioma de cada uma', () => {
    const u = userDoResumo(FALAS.slice(0, 2))
    expect(u).toContain(`1. [inglês] ${FALA_OPEN}We should grab a coffee sometime.${FALA_CLOSE}`)
    expect(u).toContain(`= ${FALA_OPEN}Estou atrasado para a reunião.${FALA_CLOSE}`)
    expect(u).toMatch(/^2\. /m)
  })

  it('falasQueCabem: com folga, todas; sem folga, as ÚLTIMAS que cabem, na ordem', () => {
    expect(falasQueCabem(FALAS, 12_000)).toEqual(FALAS)
    const teto = userDoResumo(FALAS.slice(-2)).length
    const cabem = falasQueCabem(FALAS, teto)
    expect(cabem).toEqual(FALAS.slice(-2))
    expect(userDoResumo(cabem).length).toBeLessThanOrEqual(teto)
  })

  it('falasQueCabem: uma fala enorme é cortada, nunca derruba o resumo inteiro', () => {
    const enorme = [...FALAS, fala('x '.repeat(20_000))]
    const cabem = falasQueCabem(enorme, 12_000)
    expect(cabem.length).toBeGreaterThan(1)
    expect(userDoResumo(cabem).length).toBeLessThanOrEqual(12_000)
  })
})

describe('lerResumo (estrita no topo)', () => {
  it('lê os 3 pontos e a lista de candidatos', () => {
    const r = lerResumo(JSON.stringify({ pontos: PONTOS, cartoes: [{ fala: 1, palavra: 'coffee', verso: 'café' }] }))
    expect(r).toEqual({ pontos: PONTOS, candidatos: [{ fala: 1, palavra: 'coffee', verso: 'café' }] })
  })

  it('aceita a resposta em bloco de código', () => {
    const r = lerResumo('```json\n' + JSON.stringify({ pontos: PONTOS, cartoes: [] }) + '\n```')
    expect(r?.pontos).toEqual(PONTOS)
  })

  for (const [nome, bruto] of [
    ['sem JSON', 'Desculpe.'],
    ['2 pontos', JSON.stringify({ pontos: PONTOS.slice(0, 2), cartoes: [] })],
    ['4 pontos', JSON.stringify({ pontos: [...PONTOS, 'mais um'], cartoes: [] })],
    ['ponto vazio', JSON.stringify({ pontos: ['a', ' ', 'c'], cartoes: [] })],
    ['ponto não texto', JSON.stringify({ pontos: ['a', 2, 'c'], cartoes: [] })],
    ['sem cartoes', JSON.stringify({ pontos: PONTOS })],
    ['cartoes não lista', JSON.stringify({ pontos: PONTOS, cartoes: {} })],
    ['campo a mais', JSON.stringify({ pontos: PONTOS, cartoes: [], oferta: 'assine' })],
  ] as const) {
    it(`${nome}: null`, () => expect(lerResumo(bruto)).toBeNull())
  }
})

describe('cartoesDoResumo (o filtro antes de propor)', () => {
  it('a palavra tem de estar INTEIRA na frase: "an" dentro de "and" é descartado; "an" sozinho passa', () => {
    const falas = [fala('Bread and butter for an old friend.', 'Pão com manteiga para um velho amigo.')]
    expect(
      cartoesDoResumo([{ fala: 1, palavra: 'an', verso: 'um' }], [fala('Bread and butter, please.')], 'pt'),
    ).toEqual([])
    expect(cartoesDoResumo([{ fala: 1, palavra: 'an', verso: 'um' }], falas, 'pt').map((x) => x.word)).toEqual(['an'])
    expect(cartoesDoResumo([{ fala: 1, palavra: 'butter', verso: 'manteiga' }], falas, 'pt')).toHaveLength(1)
  })

  const c = (falaN: number, palavra: string, verso: string) => ({ fala: falaN, palavra, verso })

  it('o candidato bom vira cartão com a frase da cena (do banco) e os idiomas da fala e de quem estuda', () => {
    expect(cartoesDoResumo([c(1, 'grab a coffee', 'tomar um café')], FALAS, 'pt')).toEqual([
      {
        word: 'grab a coffee',
        back: 'tomar um café',
        sentence: 'We should grab a coffee sometime.',
        srcLang: 'en',
        tgtLang: 'pt',
      },
    ])
  })

  it('descarta o que avaliarFrase ou LIMITES_DO_BULK_ADD reprovam, e o que não é da sessão', () => {
    expect(avaliarFrase(FALAS[3].texto).serve).toBe(false)
    const longa = 'w'.repeat(LIMITES_DO_BULK_ADD.max + 1)
    const candidatos: unknown[] = [
      c(4, 'thing', 'coisa'), // frase cortada (avaliarFrase reprova)
      c(1, 'a', 'um'), // curta demais para o bulk-add
      c(1, longa, 'x'), // longa demais para o bulk-add
      c(1, 'banana', 'banana-fruta'), // a palavra não está na frase
      c(1, 'sho', 'deveria'), // pedaço de palavra ("sho" dentro de "should"): não é a palavra
      c(5, 'Hones', 'sincera'), // idem, no começo da frase
      c(9, 'coffee', 'café'), // fala inexistente
      c(0, 'coffee', 'café'),
      c(1.5, 'coffee', 'café'),
      c(1, 'coffee', ''), // verso vazio
      c(1, 'coffee', 'coffee'), // verso igual à palavra
      c(3, 'também', 'too'), // a fala é do idioma de quem estuda
      { fala: 1, palavra: 'coffee' }, // campo faltando
      { fala: 1, palavra: 'coffee', verso: 'café', extra: 1 }, // campo a mais
      'coffee',
      null,
      [1, 'coffee', 'café'],
      c(2, 'running late', 'atrasado'), // o único bom
    ]
    const cartoes = cartoesDoResumo(candidatos, FALAS, 'pt')
    expect(cartoes.map((x) => x.word)).toEqual(['running late'])
    for (const k of cartoes) {
      expect(k.word.length).toBeGreaterThanOrEqual(LIMITES_DO_BULK_ADD.min)
      expect(k.word.length).toBeLessThanOrEqual(LIMITES_DO_BULK_ADD.max)
      expect(avaliarFrase(k.sentence).serve).toBe(true)
    }
  })

  it('sem repetidas e no máximo 10', () => {
    const muitos = Array.from({ length: 30 }, (_, i) => c(1 + (i % 2) * 4, i % 2 ? 'piece of cake' : 'coffee', 'x' + i))
    const palavrasDistintas = ['We', 'should', 'grab', 'coffee', 'sometime'].map((p) => c(1, p, 'v-' + p))
    const outras = ['Honestly', 'piece', 'cake', 'was'].map((p) => c(5, p, 'v-' + p))
    const mais = ['running', 'late', 'meeting', 'for'].map((p) => c(2, p, 'v-' + p))
    const cartoes = cartoesDoResumo([...muitos, ...palavrasDistintas, ...outras, ...mais], FALAS, 'pt')
    expect(cartoes.length).toBe(MAX_CARTOES_DO_RESUMO)
    expect(new Set(cartoes.map((x) => x.word.toLowerCase())).size).toBe(cartoes.length)
  })
})
