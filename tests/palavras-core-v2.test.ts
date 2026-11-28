/**
 * As regras puras da frente `palavras` (flag `estudo_palavras_v2`): definições das métricas, agrupamento por fonte, busca
 * ampliada, pergunta ao tutor, contagens das abas e baralhos do Anki desativados.
 */
import { describe, expect, it } from 'vitest'

import type { ContagensDeConteudo } from '../src/core/learning/contagensDeConteudo'
import { buscarItens, itensDaBuscaAmpliada } from '../src/core/palavras/buscaAmpliada'
import { baralhosDoAnkiDesativados, contagensDasAbasDePraticar } from '../src/core/palavras/contagensDasAbas'
import {
  BASE_MINIMA_DA_RETENCAO,
  definicaoDaMetrica,
  DEFINICOES_DAS_METRICAS,
  porcentoComBase,
} from '../src/core/palavras/definicoesDasMetricas'
import type { MemoriaPorBaralho } from '../src/core/palavras/memoriaDoBaralho'
import { perguntaSobreAPalavra, podePerguntarAoTutor } from '../src/core/palavras/perguntaAoTutor'
import { agruparPorFonte } from '../src/core/palavras/porFonte'

const DIA = 86_400_000
const conteudo: ContagensDeConteudo = {
  agora: 100 * DIA,
  idioma: '',
  idiomas: [{ id: 'en', palavras: 90 }],
  tudo: { palavras: 90, frases: 40, paraHoje: 12 },
  dificeis: { palavras: 3, frases: 1, paraHoje: 3 },
  sessoes: [
    {
      id: 's1',
      nome: 'Reunião de produto',
      tipo: 'live',
      quando: 1,
      duracaoMs: null,
      palavras: 30,
      frases: 10,
      paraHoje: 5,
    },
  ],
  anki: [
    { id: 'dA', nome: 'Verbos', tipo: null, quando: 1, duracaoMs: null, palavras: 50, frases: 20, paraHoje: 6 },
    { id: 'dB', nome: 'Cozinha', tipo: null, quando: 1, duracaoMs: null, palavras: 10, frases: 5, paraHoje: 1 },
  ],
  trilha: { palavras: 8, frases: 2, paraHoje: 1 },
}

describe('definições das métricas (modelo-do-aluno 4.1)', () => {
  it('toda métrica tem nome e definição de uma frase', () => {
    expect(DEFINICOES_DAS_METRICAS.length).toBeGreaterThanOrEqual(9)
    for (const d of DEFINICOES_DAS_METRICAS) {
      expect(d.nome.length).toBeGreaterThan(2)
      expect(d.definicao.length).toBeGreaterThan(20)
      expect(definicaoDaMetrica(d.id)).toBe(d)
    }
  })
  it('percentual só com a base mínima', () => {
    expect(BASE_MINIMA_DA_RETENCAO).toBe(20)
    expect(porcentoComBase({ total: 19, lembradas: 19 })).toBeNull()
    expect(porcentoComBase({ total: 20, lembradas: 17 })).toBe(85)
    expect(porcentoComBase({ total: 5, lembradas: 5 }, 5)).toBe(100)
    expect(definicaoDaMetrica('retencaoReal').baseMinima).toBe(20)
  })
})

describe('agrupamento por fonte (modelo-do-aluno 4.3)', () => {
  const memoria: MemoriaPorBaralho = {
    agora: 100 * DIA,
    janelaDias: 90,
    baralhos: [
      { tipo: 'anki', id: 'dA', revisoes: 40, lembradas: 30, proximaRevisao: 101 * DIA },
      { tipo: 'anki', id: 'dB', revisoes: 4, lembradas: 4, proximaRevisao: null },
      { tipo: 'sessao', id: 'fora-do-catalogo', revisoes: 99, lembradas: 99, proximaRevisao: null },
    ],
  }
  it('as palavras de cada fonte são as do catálogo, e só as fontes do catálogo entram', () => {
    const g = agruparPorFonte(conteudo, memoria, 100 * DIA)
    expect(g.map((x) => x.grupo)).toEqual(['sessao', 'anki', 'trilha'])
    const linhas = g.flatMap((x) => x.linhas)
    expect(linhas.map((l) => [l.id, l.palavras, l.paraHoje])).toEqual([
      ['s1', 30, 5],
      ['dA', 50, 6],
      ['dB', 10, 1],
      ['trilha', 8, 1],
    ])
    expect(linhas.some((l) => l.id === 'fora-do-catalogo')).toBe(false)
  })
  it('retenção só com 20 ou mais revisões e a volta vem da memória', () => {
    const l = agruparPorFonte(conteudo, memoria, 100 * DIA).flatMap((x) => x.linhas)
    expect(l.find((x) => x.id === 'dA')).toMatchObject({ retencao: 75, volta: { quando: 'amanha' } })
    expect(l.find((x) => x.id === 'dB')).toMatchObject({ retencao: null, volta: { quando: 'nenhuma' } })
    expect(l.find((x) => x.id === 's1')).toMatchObject({ revisoes: 0, retencao: null })
  })
  it('sem memória (flag desligada ou erro) as contagens continuam', () => {
    const l = agruparPorFonte(conteudo, null, 100 * DIA).flatMap((x) => x.linhas)
    expect(l).toHaveLength(4)
    expect(l.every((x) => x.retencao === null)).toBe(true)
  })
})

describe('busca ampliada (cartoes 9.2)', () => {
  const itens = itensDaBuscaAmpliada({
    conteudo,
    cartoes: [
      { id: 'c1', word: 'harvest', translation: 'colheita', inDeck: true },
      { id: 'c2', word: 'garden', translation: 'jardim', inDeck: true },
      { id: 'c3', word: 'cozinhar', translation: 'to cook', inDeck: false },
    ],
  })
  it('acha uma palavra pela palavra e pela tradução, sem acento', () => {
    expect(buscarItens(itens, 'harv')[0].alvo).toEqual({ tipo: 'palavra', id: 'c1' })
    expect(buscarItens(itens, 'JARDIM')[0].alvo).toEqual({ tipo: 'palavra', id: 'c2' })
  })
  it('palavra suspensa não aparece', () => {
    expect(buscarItens(itens, 'cozinhar').some((i) => i.alvo.tipo === 'palavra')).toBe(false)
  })
  it('acha ações de estudo', () => {
    expect(buscarItens(itens, 'exportar')[0].alvo).toEqual({ tipo: 'acao', acao: 'exportar' })
    expect(buscarItens(itens, 'importar')[0].alvo).toEqual({ tipo: 'acao', acao: 'trazer-anki' })
    expect(
      buscarItens(itens, 'dificeis').some((i) => i.alvo.tipo === 'acao' && i.alvo.acao === 'revisar-dificeis'),
    ).toBe(true)
  })
  it('acha baralhos (sessão, Anki e Trilha) e as telas de dentro de Cartões', () => {
    expect(buscarItens(itens, 'verbos')[0].alvo).toEqual({
      tipo: 'baralho',
      fonte: { tipo: 'anki', id: 'dA', nome: 'Verbos' },
    })
    expect(buscarItens(itens, 'reuniao')[0].alvo).toMatchObject({
      tipo: 'baralho',
      fonte: { tipo: 'sessao', id: 's1' },
    })
    expect(buscarItens(itens, 'trilha')[0].alvo).toEqual({ tipo: 'baralho', fonte: { tipo: 'trilha' } })
    expect(buscarItens(itens, 'memoria')[0].alvo).toEqual({ tipo: 'tela', aba: 'memoria' })
    expect(buscarItens(itens, 'retencao')[0].alvo).toEqual({ tipo: 'tela', aba: 'memoria' })
  })
  it('consulta vazia não devolve nada e o rótulo que começa com ela vem primeiro', () => {
    expect(buscarItens(itens, '   ')).toEqual([])
    const r = buscarItens(itens, 'cartoes')
    expect(r.every((i) => i.grupo === 'Telas de Cartões' || i.grupo === 'Ações de estudo')).toBe(true)
    expect(r[0].label.startsWith('Cartões')).toBe(true)
  })
})

describe('perguntar ao tutor (cartoes 6.3)', () => {
  const base = { edicaoEstatica: false, temConta: true, perfilProtegido: false, contaRestrita: false }
  it('adulto com conta pode; sem conta e edição estática não', () => {
    expect(podePerguntarAoTutor(base)).toBe(true)
    expect(podePerguntarAoTutor({ ...base, temConta: false })).toBe(false)
    expect(podePerguntarAoTutor({ ...base, edicaoEstatica: true })).toBe(false)
  })
  it('perfil protegido: com conta liberada vê o botão (a resposta passa pelo filtro do servidor); restrita, não', () => {
    expect(podePerguntarAoTutor({ ...base, perfilProtegido: true })).toBe(true)
    expect(podePerguntarAoTutor({ ...base, perfilProtegido: true, contaRestrita: true })).toBe(false)
  })
  it('a pergunta leva a palavra e a frase, com teto, sem quebra de linha', () => {
    const p = perguntaSobreAPalavra('harvest', 'We\nharvest  in autumn.')
    expect(p).toContain('“harvest”')
    expect(p).toContain('We harvest in autumn.')
    expect(perguntaSobreAPalavra('x'.repeat(500), 'y'.repeat(5000)).length).toBeLessThan(500)
    expect(perguntaSobreAPalavra('harvest', null)).toContain('exemplo')
  })
})

describe('contagens das abas de Praticar (cartoes 9.4) e baralhos desativados (7.4)', () => {
  it('Cartões mostra o que vence e Jogos o que há para jogar, da fonte escolhida', () => {
    expect(contagensDasAbasDePraticar(conteudo, { tipo: 'tudo' })).toEqual({ cartoes: 12, jogos: 90 })
    expect(contagensDasAbasDePraticar(conteudo, { tipo: 'anki', id: 'dA' })).toEqual({ cartoes: 6, jogos: 50 })
    expect(contagensDasAbasDePraticar(conteudo, { tipo: 'sessao', id: 's1' })).toEqual({ cartoes: 5, jogos: 30 })
    expect(contagensDasAbasDePraticar(conteudo, { tipo: 'dificeis' })).toEqual({ cartoes: 3, jogos: 3 })
  })
  it('sem catálogo ou com fonte que sumiu, sem número', () => {
    expect(contagensDasAbasDePraticar(null, { tipo: 'tudo' })).toBeNull()
    expect(contagensDasAbasDePraticar(conteudo, { tipo: 'anki', id: 'nao-existe' })).toBeNull()
    expect(contagensDasAbasDePraticar({ ...conteudo, trilha: null }, { tipo: 'trilha' })).toBeNull()
  })
  it('só os baralhos desativados', () => {
    const lista = [
      { id: 'a', nome: 'A', estado: 'ativo', total: 10 },
      { id: 'b', nome: 'B', estado: 'desativado', total: 20 },
    ]
    expect(baralhosDoAnkiDesativados(lista).map((b) => b.id)).toEqual(['b'])
    expect(baralhosDoAnkiDesativados([])).toEqual([])
  })
})
