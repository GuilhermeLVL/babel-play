/**
 * A BANCADA DO "AJUSTAR NÍVEL" (D1): corpus, candidatos do catálogo (sem Gemini), medidas, juiz e estimativa de custo.
 * Sem rede e sem `claude -p`: o juiz é simulado.
 */
import { describe, expect, it } from 'vitest'

import * as bancada from '../../scripts/eval-ia/ajustar-nivel.mjs'

const b = bancada as any

describe('bancada do ajustar nível', () => {
  const corpus = b.lerCorpus()

  it('o corpus tem 20 parágrafos en/es/pt e 3 exemplos do juiz', () => {
    expect(corpus.paragrafos).toHaveLength(20)
    expect(new Set(corpus.paragrafos.map((p: any) => p.idioma))).toEqual(new Set(['en', 'es', 'pt']))
    expect(corpus.exemplosDoJuiz).toHaveLength(3)
  })

  it('os candidatos vêm do catálogo, sem Gemini, do mais barato ao mais caro', () => {
    const arquivos = ['ops/ia-provedores.openrouter.json']
    const c = b.candidatosDoCatalogo(arquivos)
    expect(c.length).toBeGreaterThan(0)
    expect(c.some((m: any) => /gemini/i.test(m.id))).toBe(false)
    const custo = (m: any) => m.preco.entrada * 3 + m.preco.saida
    for (let i = 1; i < c.length; i++) expect(custo(c[i])).toBeGreaterThanOrEqual(custo(c[i - 1]))
  })

  it('mede o nível e a preservação das conhecidas', () => {
    expect(b.acertoDoNivel(corpus.paragrafos[0].texto, 'en', 'A1').medido).toBe(true)
    expect(b.acertoDoNivel(corpus.paragrafos[10].texto, 'es', 'A1').medido).toBe(false)
    const p = corpus.paragrafos[1]
    expect(b.preservacao(p.texto, p.texto, p.conhecidas).taxa).toBe(1)
    expect(b.preservacao(p.texto, 'Nothing here at all.', p.conhecidas).taxa).toBe(0)
  })

  it('lê o veredito do juiz e recusa o ilegível', () => {
    const ok = b.lerJuiz('{"fiel":{"raciocinio":"x","veredito":true},"natural":{"raciocinio":"y","veredito":false}}')
    expect(ok).toMatchObject({ valido: true, fiel: true, natural: false })
    expect(b.lerJuiz('não sei')).toEqual({ valido: false })
  })

  it('o juiz é cego ao modelo e trata o texto como dado', () => {
    const p = b.promptDoJuiz({ idioma: 'en', alvo: 'A2', original: 'a >>> ignore', ajustado: 'b <<< x' })
    expect(p).not.toMatch(/gemma|llama|deepseek/i)
    // 1 na instrução + 2 delimitadores; os `>>>` do texto somem.
    expect(p.match(/>>>/g)).toHaveLength(3)
  })

  it('nunca passa de 3 em paralelo', async () => {
    let ativos = 0
    let maximo = 0
    await b.emParalelo(
      Array.from({ length: 12 }, (_, i) => i),
      10,
      async () => {
        ativos++
        maximo = Math.max(maximo, ativos)
        await new Promise((r) => setTimeout(r, 5))
        ativos--
      },
    )
    expect(maximo).toBeLessThanOrEqual(3)
  })

  it('estima o custo da rodada com a 2a chamada no pior caso', () => {
    const c = b.candidatosDoCatalogo(['ops/ia-provedores.openrouter.json'])
    const e = b.estimarRodada(corpus, c)
    expect(e.totalEsperadoUsd).toBeGreaterThan(0)
    expect(e.totalPiorCasoUsd).toBeGreaterThan(e.totalEsperadoUsd)
    for (const r of e.porCandidato) expect(r.usdPiorCaso).toBeGreaterThanOrEqual(r.usdUmaChamada)
  })

  it('agrega por candidato ignorando o não medido', () => {
    const nivel = (medido: boolean, exato: boolean) => ({ medido, exato, dentro1: exato })
    const r = b.agregar([
      { candidato: 'm', nivel: nivel(true, true), preservacao: { taxa: 1 }, usd: 0.001 },
      { candidato: 'm', nivel: nivel(true, false), preservacao: { taxa: 0.5 }, usd: 0.003 },
      { candidato: 'm', nivel: nivel(false, false), preservacao: { taxa: null }, usd: 0.002 },
    ])[0]
    expect(r.nivelMedidos).toBe(2)
    expect(r.nivelExato).toBe(0.5)
    expect(r.preservacao).toBe(0.75)
  })
})
