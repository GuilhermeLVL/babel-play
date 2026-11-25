/**
 * SIMULADOR DE EXIBIÇÃO DO PARCIAL VIVO (ciclo 3): `simularExibicao` (core, puro), o gravador de hipóteses do app e o
 * `simular-exibicao.mjs` da bancada, sobre uma gravação SINTÉTICA (sem navegador). Os tempos são os da bancada de teste:
 * bipe do arquivo em 1 s e âncora da página em 3000 ms, então 3,6 s do arquivo = 5600 ms da página.
 */
import { describe, expect, it } from 'vitest'

import * as hip from '../scripts/perf/latencia-legenda/hipoteses-da-fala.mjs'
import * as sim from '../scripts/perf/latencia-legenda/simular-exibicao.mjs'
import { type EventoDeHipotese, type PoliticaDeExibicao, simularExibicao } from '../src/core/legendas/exibicaoDoParcial'
import { criarGravadorDeHipoteses, gravarHipotesesLigado } from '../src/lib/captura/gravadorDeHipoteses'

const S = sim as any
const H = hip as any

const decode = (t: number, d: number, texto: string): EventoDeHipotese => ({
  tipo: 'decode',
  t,
  seq: 1,
  decode: d,
  tIni: t - 300,
  audioMs: 1000 * (d + 1),
  texto,
})
const token = (t: number, d: number, texto: string): EventoDeHipotese => ({
  tipo: 'token',
  t,
  seq: 1,
  decode: d,
  texto,
})
const fechada = (t: number): EventoDeHipotese => ({ tipo: 'fechada', t, seq: 1 })
const final = (t: number, texto: string): EventoDeHipotese => ({ tipo: 'final', t, seq: 1, texto })

const EVENTOS: EventoDeHipotese[] = [
  decode(5800, 0, 'nos'),
  decode(6400, 1, 'nos lagos'),
  decode(7000, 2, 'nos lagos iate'),
  fechada(7100),
  final(7500, 'nos lagos iate'),
]
const pol = (p: Partial<PoliticaDeExibicao>): PoliticaDeExibicao => ({
  modo: 'acrescenta-decode',
  mascara: 2,
  intervaloMs: 0,
  subamostra: 1,
  ...p,
})
const quadros = (e: EventoDeHipotese[], p: Partial<PoliticaDeExibicao>) =>
  simularExibicao(e, pol(p)).quadros.map((q) => [q.t, q.texto])

describe('simularExibicao (as mesmas funções puras do pipeline)', () => {
  it('acrescenta-decode com máscara 2: só acrescenta o que já está confirmado; o final entra direto', () => {
    expect(quadros(EVENTOS, {})).toEqual([
      [6400, 'nos'],
      [7000, 'nos lagos'],
      [7500, 'nos lagos iate'],
    ])
  })

  it('máscara 0 mostra a hipótese inteira do decode (sem esperar a confirmação)', () => {
    expect(quadros(EVENTOS, { mascara: 0 }).map((q) => q[1])).toEqual([
      'nos',
      'nos lagos',
      'nos lagos iate',
      'nos lagos iate',
    ])
  })

  it('sem-cauda mostra só o confirmado; cauda-decode mostra a hipótese de cada decode', () => {
    expect(quadros(EVENTOS, { modo: 'sem-cauda' }).map((q) => q[1])).toEqual(['nos', 'nos lagos', 'nos lagos iate'])
    expect(quadros(EVENTOS, { modo: 'cauda-decode' })).toEqual([
      [5800, 'nos'],
      [6400, 'nos lagos'],
      [7000, 'nos lagos iate'],
      [7500, 'nos lagos iate'],
    ])
  })

  it('os modos de decode ignoram os tokens; os modos de token os pintam', () => {
    const comTokens = [token(5700, 0, 'nos la'), ...EVENTOS]
    expect(quadros(comTokens, { modo: 'cauda-decode' })).toEqual(quadros(EVENTOS, { modo: 'cauda-decode' }))
    expect(quadros(comTokens, { modo: 'cauda-token' })[0]).toEqual([5700, 'nos la'])
  })

  it('o limitador junta o que chega dentro do intervalo e solta o último no vencimento', () => {
    const e = [decode(1000, 0, 'a'), decode(1050, 1, 'a b'), decode(1100, 2, 'a b c'), final(2000, 'a b c')]
    expect(quadros(e, { modo: 'cauda-decode', intervaloMs: 125 })).toEqual([
      [1000, 'a'],
      [1125, 'a b c'],
      [2000, 'a b c'],
    ])
    expect(quadros(e, { modo: 'cauda-decode', intervaloMs: 0 }).length).toBe(4)
  })

  it('o final cancela o que o limitador segurava e o que vem depois da fala fechar não é pintado', () => {
    const e = [
      decode(1000, 0, 'a'),
      decode(1050, 1, 'a b'),
      fechada(1060),
      decode(1070, 2, 'a b c'),
      final(1500, 'a b c d'),
    ]
    expect(quadros(e, { modo: 'cauda-decode', intervaloMs: 125 })).toEqual([
      [1000, 'a'],
      [1500, 'a b c d'],
    ])
  })

  it('subamostragem x2 descarta decodes alternados (a LocalAgreement só vê os que ficaram)', () => {
    const r = simularExibicao(EVENTOS, pol({ modo: 'cauda-decode', subamostra: 2 }))
    expect(r.quadros.map((q) => q.texto)).toEqual(['nos', 'nos lagos iate', 'nos lagos iate'])
  })

  it('o final (hora e texto) é o mesmo em qualquer política', () => {
    const finais = S.politicasDe().map((p: PoliticaDeExibicao) => {
      const r = simularExibicao(EVENTOS, p)
      return `${r.finalEm}|${r.textoFinal}`
    })
    expect(new Set(finais)).toEqual(new Set(['7500|nos lagos iate']))
  })
})

describe('gravador de hipóteses', () => {
  it('só liga com o valor exato 1', () => {
    expect(gravarHipotesesLigado('1')).toBe(true)
    for (const v of [null, undefined, '', '0', 'true', 'sim']) expect(gravarHipotesesLigado(v)).toBe(false)
  })

  it('desligado, não grava nada e não devolve gravação de decode', () => {
    const saida: EventoDeHipotese[] = []
    const g = criarGravadorDeHipoteses(
      () => null,
      () => 1,
      saida,
    )
    expect(g.decode(1, 1000)).toBeNull()
    g.fechada(1)
    g.final(1, 'x')
    expect(saida).toEqual([])
  })

  it('ligado, registra tokens, decodes, o fechamento e o final com o índice do decode por fala', () => {
    const saida: EventoDeHipotese[] = []
    let agora = 100
    const g = criarGravadorDeHipoteses(
      () => '1',
      () => (agora += 10),
      saida,
    )
    const d0 = g.decode(7, 1500)
    d0?.token('ol')
    d0?.fim('olá')
    g.decode(7, 2500)?.fim('olá mundo')
    g.fechada(7)
    g.final(7, 'Olá, mundo.')
    g.final(9, 'sem decode: ignorado')
    expect(saida.map((e) => [e.tipo, e.seq, 'decode' in e ? e.decode : null])).toEqual([
      ['token', 7, 0],
      ['decode', 7, 0],
      ['decode', 7, 1],
      ['fechada', 7, null],
      ['final', 7, null],
    ])
    expect(saida[1]).toMatchObject({ tIni: 110, audioMs: 1500, texto: 'olá' })
  })
})

// ───────────────────────── gravação sintética de uma rodada, pelo simulador da bancada ─────────────────────────

const ROTEIRO = {
  bipeS: 1,
  falas: [
    {
      k: 0,
      iniS: 3,
      fimS: 5,
      referencia: 'nos lagos iate',
      palavras: [
        { t: 'nos', fimS: 3.6 },
        { t: 'lagos', fimS: 4.2 },
        { t: 'iate', fimS: 5 },
      ],
    },
  ],
}
const gravacao = (politicaGravada: PoliticaDeExibicao, reais: unknown[]) => ({
  versao: 1,
  rotulo: 'v7-pt.desktop.r1',
  politicaGravada,
  ancoraMs: 3000,
  bipeS: 1,
  falas: [{ ...ROTEIRO.falas[0], seq: 1, eventos: EVENTOS, reais }],
})
// A tela real da rodada: o que a política gravada mostra, com ~16 ms de quadro a mais.
const reaisDe = (p: PoliticaDeExibicao) =>
  simularExibicao(EVENTOS, p).quadros.map((q) => ({ t: q.t, tf: q.t + 16, o: '', tr: q.texto }))

describe('simular-exibicao.mjs', () => {
  const gravada = pol({ intervaloMs: 125 })

  it('mede atraso por palavra, erasure e final com as funções da bancada e confirma que o final não muda', () => {
    const g = gravacao(gravada, reaisDe(gravada))
    const res = S.simularGrupo([g], [pol({ intervaloMs: 0 }), pol({ modo: 'cauda-decode' })])
    expect(res.finalIdentico).toBe(true)
    const acrescenta = res.linhas.find((l: any) => l.politica.modo === 'acrescenta-decode')
    expect(acrescenta).toMatchObject({ atrasoP50Ms: 800, erasure: 0, finalP50Ms: 500, palavrasNoCalculo: 3 })
    const cauda = res.linhas.find((l: any) => l.politica.modo === 'cauda-decode')
    expect(cauda).toMatchObject({ atrasoP50Ms: 200, erasure: 0 })
  })

  it('o placar põe primeiro quem cumpre a erasure e tem o menor atraso p50; quem passa do limite vai depois', () => {
    const linhas = [
      { nome: 'a', atrasoP50Ms: 100, atrasoP90Ms: 300, erasure: 0.9 },
      { nome: 'b', atrasoP50Ms: 500, atrasoP90Ms: 800, erasure: 0.3 },
      { nome: 'c', atrasoP50Ms: 400, atrasoP90Ms: 900, erasure: 0.5 },
      { nome: 'd', atrasoP50Ms: 400, atrasoP90Ms: 700, erasure: 0.1 },
    ]
    const o = S.ordenarPeloPlacar(linhas, 0.5)
    expect(o.map((l: any) => [l.nome, l.estado])).toEqual([
      ['d', 'ok'],
      ['c', 'ok'],
      ['b', 'ok'],
      ['a', 'acima da erasure'],
    ])
  })

  it('o produto cartesiano varia a máscara só nos modos acrescenta-*', () => {
    const todas = S.politicasDe()
    expect(todas.length).toBe((4 * 2 + 3) * 3 * 3)
    expect(todas.filter((p: any) => p.modo === 'sem-cauda').every((p: any) => p.mascara === 0)).toBe(true)
  })

  it('validação: a política gravada reproduz a tela real da mesma rodada; uma tela real diferente é apontada', () => {
    const boa = S.validarContraAReal([gravacao(gravada, reaisDe(gravada))])
    expect(boa).toMatchObject({ falas: 1, sequenciaIgual: 1, deslocamentoMedianoMs: 16, ok: true })
    expect(boa.erasure.diferenca).toBe(0)
    // Tela real com um texto a mais (uma palavra trocada no meio): a sequência diverge.
    const outra = [{ t: 6400, tf: 6416, o: '', tr: 'nas' }, ...reaisDe(gravada)]
    const ruim = S.validarContraAReal([gravacao(gravada, outra)])
    expect(ruim.sequenciaIgual).toBe(0)
    expect(ruim.ok).toBe(false)
  })

  it('liga os eventos do app à fala do roteiro pelo texto final e pela janela de tempo', () => {
    const tDoArquivo = (s: number) => 3000 + (s - 1) * 1000
    const outroSeq = [token(900, 0, 'xx'), { ...final(950, 'outra coisa'), seq: 1 }].map((e) => ({ ...e, seq: 2 }))
    const porFala = H.eventosDeCadaFala([...EVENTOS, ...outroSeq], ROTEIRO.falas, tDoArquivo)
    expect(porFala.get(0).seq).toBe(1)
    expect(porFala.get(0).lista.length).toBe(EVENTOS.length)
  })

  it('a política gravada sai das chaves de laboratório do alvo (ausentes valem os padrões do código)', () => {
    expect(H.politicaDasChaves({})).toEqual({ modo: 'acrescenta-decode', mascara: 2, intervaloMs: 125, subamostra: 1 })
    expect(
      H.politicaDasChaves({ 'babel.lab.parciaisModo': 'sem-cauda', 'babel.lab.parciaisMascara': '3' }),
    ).toMatchObject({
      modo: 'sem-cauda',
      mascara: 3,
    })
  })
})
