/**
 * OS GOLDS DA IA PAGA (Fase A) — leitura, validação e o que cada conjunto PRECISA cobrir.
 *
 * O gold é o gabarito do juiz: um campo faltando mediria o modelo contra nada. E a cobertura é cobrada aqui, não
 * lembrada: frases SEM gíria (pegam a gíria inventada), injeção e perfil menor têm de existir, nos tamanhos do plano.
 */
import { describe, expect, it } from 'vitest'

import * as funcoes from '../../scripts/eval-ia/funcoes.mjs'
import * as golds from '../../scripts/eval-ia/golds.mjs'
import { avaliarFrase } from '../../src/core/learning/quality'

/** O .mjs não tem tipos (o tsc infere do JS): a borda é `any`, como em `bancada-decisao.test.ts`. */
const { amostrar, carregarGold, lerJsonl, validarGold } = golds as any
const { lerComoAProducao, pedidoDaProducao, experienciaDoCaso, idiomaProvavel } = funcoes as any

describe('golds: leitura e validação', () => {
  it('lê JSONL ignorando linha em branco e acusa a linha inválida pelo número', () => {
    expect(lerJsonl('{"id":"a"}\n\n{"id":"b"}\n')).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(() => lerJsonl('{"id":"a"}\n{quebrado')).toThrow(/linha 2/)
  })

  it('acusa campo faltando, id repetido e semGiria incoerente — todos de uma vez', () => {
    const ok = {
      id: 'x',
      texto: 'Hi.',
      traducao: 'Oi.',
      lang: 'en',
      langDaTraducao: 'pt-BR',
      contexto: [],
      perfil: 'adulto',
      esperado: { sentido: 's', gramatica: 'g', registro: 'neutro', girias: [], semGiria: true },
    }
    expect(validarGold('explicacao', [ok])).toEqual([])
    const problemas = validarGold('explicacao', [
      ok,
      { ...ok },
      { ...ok, id: 'y', esperado: { ...ok.esperado, semGiria: false } },
      { ...ok, id: 'z', perfil: 'crianca' },
    ])
    expect(problemas).toContain('x: id repetido')
    expect(problemas.some((p: string) => p.startsWith('y: esperado.semGiria incoerente'))).toBe(true)
    expect(problemas).toContain('z: perfil')
  })

  it('função desconhecida é erro de uso', () => {
    expect(() => validarGold('tutor', [])).toThrow(/função desconhecida/)
  })
})

describe('golds versionados: tamanhos e cobertura do plano', () => {
  const exp = carregarGold('explicacao')
  const res = carregarGold('resumo')
  const alt = carregarGold('alternativas')
  const leg = carregarGold('legenda')

  it('60 explicações, 15 sessões de 8 a 30 falas, 40 alternativas, 60 legendas', () => {
    expect(exp).toHaveLength(60)
    expect(res).toHaveLength(15)
    for (const s of res) expect(s.falas.length).toBeGreaterThanOrEqual(8)
    for (const s of res) expect(s.falas.length).toBeLessThanOrEqual(30)
    expect(alt).toHaveLength(40)
    expect(leg).toHaveLength(60)
  })

  it('explicação: inglês e espanhol, frases sem gíria, injeção e perfil menor', () => {
    expect(exp.filter((c: any) => c.lang === 'en').length).toBeGreaterThanOrEqual(30)
    expect(exp.filter((c: any) => c.lang === 'es').length).toBeGreaterThanOrEqual(15)
    expect(exp.filter((c: any) => c.esperado.semGiria).length).toBeGreaterThanOrEqual(10)
    expect(exp.filter((c: any) => c.categoria === 'injecao').length).toBeGreaterThanOrEqual(3)
    expect(exp.filter((c: any) => c.perfil === 'menor').length).toBeGreaterThanOrEqual(3)
  })

  it('resumo e alternativas têm casos adversariais; o resumo tem perfil menor e sessão bilíngue', () => {
    expect(res.some((c: any) => c.categoria === 'injecao')).toBe(true)
    expect(res.some((c: any) => c.perfil === 'menor')).toBe(true)
    expect(res.some((c: any) => new Set(c.falas.map((f: any) => f.srcLang)).size > 1)).toBe(true)
    expect(alt.filter((c: any) => c.categoria === 'injecao').length).toBeGreaterThanOrEqual(3)
    expect(alt.filter((c: any) => c.registro).length).toBeGreaterThanOrEqual(6)
  })

  it('as falas cabem no teto de entrada e passam na régua de cartão (senão o filtro jogaria fora o gabarito)', () => {
    for (const s of res) {
      expect(pedidoDaProducao('resumo', s).falas).toHaveLength(s.falas.length)
      for (const f of s.falas)
        expect(avaliarFrase(f.texto, { traducao: f.traducao }).serve, `${s.id}: ${f.texto}`).toBe(true)
    }
  })

  it('amostra estratificada por categoria e determinística', () => {
    const a = amostrar(exp, 12)
    expect(a).toHaveLength(12)
    expect(new Set(a.map((c: any) => c.categoria)).size).toBeGreaterThanOrEqual(6)
    expect(amostrar(exp, 12)).toEqual(a)
    expect(amostrar(exp, 0)).toBe(exp)
  })
})

describe('o pedido e a leitura são os da produção', () => {
  const caso = carregarGold('explicacao').find((c: any) => c.perfil === 'menor')

  it('perfil menor leva a instrução de segurança no fim do system', () => {
    const p = pedidoDaProducao('explicacao', caso)
    expect(p.mensagens[0].content).toContain('[SEGURANÇA — PÚBLICO MENOR]')
    const adulto = pedidoDaProducao('explicacao', { ...caso, perfil: 'adulto' })
    expect(adulto.mensagens[0].content).not.toContain('PÚBLICO MENOR')
    expect(p.maxTokens).toBe(1200)
  })

  it('resposta fora do formato é o 502 da tela (null); a válida vira o objeto da tela', () => {
    expect(lerComoAProducao('explicacao', caso, 'desculpe, não posso')).toBeNull()
    const lido = lerComoAProducao(
      'explicacao',
      caso,
      '{"porQue":"A pessoa está empolgada com o jogo.","gramatica":"is so + adjetivo.","registro":"Informal.","girias":[{"termo":"OP","sentido":"apelão"}]}',
    )
    expect(lido.girias).toEqual([{ termo: 'OP', sentido: 'apelão' }])
    const exp = experienciaDoCaso('explicacao', caso, lido)
    expect(exp.valida).toBe(true)
    expect(exp.cabeSemRolar).toBe(true)
    expect(experienciaDoCaso('explicacao', caso, null)).toEqual({ valida: false })
  })

  it('idioma provável distingue pt, en e es pelas palavras funcionais', () => {
    expect(idiomaProvavel('A frase é informal e mostra que você está animado com isso.')).toBe('pt')
    expect(idiomaProvavel('This sentence is informal and shows that the speaker is excited.')).toBe('en')
    expect(idiomaProvavel('La frase es muy informal y muestra que el hablante está contento.')).toBe('es')
    expect(idiomaProvavel('ok')).toBeNull()
  })
})
