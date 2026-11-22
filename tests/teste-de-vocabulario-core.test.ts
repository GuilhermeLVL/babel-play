/**
 * O TESTE RÁPIDO DE VOCABULÁRIO (openspec `teste-de-vocabulario`): montagem determinística, parada adaptativa,
 * correção pelo chute (pseudopalavras) e o que semeia.
 */
import { describe, expect, it } from 'vitest'

import { palavrasPorNivel } from '../src/core/learning/cefrWordlist'
import { chaveDaPalavra } from '../src/core/texto/palavra'
import { PSEUDOPALAVRAS } from '../src/core/vocabulario/pseudopalavras'
import {
  andamentoDoTeste,
  FAIXAS_DO_TESTE,
  idiomaTemTeste,
  montarTeste,
  PALAVRAS_POR_FAIXA,
  PSEUDOS_POR_FAIXA,
  resultadoDoTeste,
  type TesteDeVocabulario,
} from '../src/core/vocabulario/testeDeVocabulario'

const teste = montarTeste('en', 'semente-1')!

/** Responde segundo uma regra: `(item) => sei?`, até o teste acabar. */
function responder(t: TesteDeVocabulario, regra: (i: TesteDeVocabulario['itens'][number]) => boolean): boolean[] {
  const r: boolean[] = []
  for (;;) {
    const a = andamentoDoTeste(t, r)
    if (a.terminou || !a.proximo) return r
    r.push(regra(a.proximo))
  }
}

describe('montarTeste', () => {
  it('só há teste onde há lista confiável (inglês); outros idiomas dão null', () => {
    expect(idiomaTemTeste('en-US')).toBe(true)
    expect(idiomaTemTeste('fr')).toBe(false)
    expect(montarTeste('fr', 'x')).toBeNull()
    expect(montarTeste('', 'x')).toBeNull()
  })

  it('é determinístico pela semente e muda com outra', () => {
    expect(montarTeste('en', 'semente-1')).toEqual(teste)
    expect(montarTeste('en', 'outra')!.itens).not.toEqual(teste.itens)
  })

  it('tem ~10 palavras reais e 3 pseudopalavras por faixa, na ordem A1 → C2, sem repetir', () => {
    for (const f of FAIXAS_DO_TESTE) {
      const da = teste.itens.filter((i) => i.faixa === f)
      expect(da.filter((i) => !i.pseudo)).toHaveLength(PALAVRAS_POR_FAIXA)
      expect(da.filter((i) => i.pseudo)).toHaveLength(PSEUDOS_POR_FAIXA)
    }
    const ordem = teste.itens.map((i) => FAIXAS_DO_TESTE.indexOf(i.faixa))
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b))
    expect(new Set(teste.itens.map((i) => i.palavra)).size).toBe(teste.itens.length)
    const pct = teste.itens.filter((i) => i.pseudo).length / teste.itens.length
    expect(pct).toBeGreaterThan(0.15)
    expect(pct).toBeLessThan(0.3)
  })

  it('as reais são da faixa certa da lista e nenhuma pseudopalavra existe na lista', () => {
    const lista = palavrasPorNivel('en')
    for (const i of teste.itens.filter((x) => !x.pseudo)) expect(lista[i.faixa]).toContain(i.palavra)
    const todas = new Set(FAIXAS_DO_TESTE.flatMap((f) => lista[f]))
    for (const p of PSEUDOPALAVRAS.en!) expect(todas.has(chaveDaPalavra(p))).toBe(false)
    expect(new Set(PSEUDOPALAVRAS.en).size).toBe(PSEUDOPALAVRAS.en!.length)
  })
})

describe('andamentoDoTeste (parada adaptativa)', () => {
  it('quem sabe tudo e não chuta vai até o fim', () => {
    const r = responder(teste, (i) => !i.pseudo)
    expect(r).toHaveLength(teste.itens.length)
    const a = andamentoDoTeste(teste, r)
    expect(a).toMatchObject({ terminou: true, motivoDoFim: 'completo', proximo: null })
  })

  it('quem não sabe a maioria de uma faixa para nela, sem mostrar o resto', () => {
    const r = responder(teste, (i) => !i.pseudo && (i.faixa === 'A1' || i.faixa === 'A2'))
    const a = andamentoDoTeste(teste, r)
    expect(a.motivoDoFim).toBe('parou')
    expect(r.length).toBeLessThan(teste.itens.length)
    const ultimo = teste.itens[r.length - 1]!
    expect(ultimo.faixa).toBe('B1')
    /* 6 "não sei" em palavras reais fecham a faixa (não dá mais para chegar a 50%). */
    const naoSeiB1 = teste.itens.slice(0, r.length).filter((i, k) => i.faixa === 'B1' && !i.pseudo && !r[k])
    expect(naoSeiB1).toHaveLength(6)
  })

  it('o próximo item é o seguinte da lista, e responder pseudopalavra "não sei" não para nada', () => {
    expect(andamentoDoTeste(teste, []).proximo).toEqual(teste.itens[0])
    expect(andamentoDoTeste(teste, [true]).proximo).toEqual(teste.itens[1])
    expect(andamentoDoTeste(teste, [true]).faixaAtual).toBe(0)
  })
})

describe('resultadoDoTeste', () => {
  const lista = palavrasPorNivel('en')

  it('quem sabe até B1 e para: nível B1, semeia as faixas altas inteiras e as marcadas', () => {
    const regra = (i: { faixa: string; pseudo: boolean }) => !i.pseudo && ['A1', 'A2', 'B1'].includes(i.faixa)
    const r = responder(teste, regra)
    const res = resultadoDoTeste(teste, r)
    expect(res).toMatchObject({ motivo: 'ok', confiavel: true, nivel: 'B1', taxaDeChute: 0 })
    for (const f of ['A1', 'A2', 'B1'] as const) {
      for (const p of lista[f]) expect(res.aMarcar).toContain(chaveDaPalavra(p))
    }
    expect(res.aMarcar).not.toContain(chaveDaPalavra(lista.B2[0]!))
    expect(res.palavrasEstimadas).toBeGreaterThan(1900)
    expect(new Set(res.aMarcar).size).toBe(res.aMarcar.length)
  })

  it('faixa de acerto médio semeia só o que a pessoa marcou, não a faixa inteira', () => {
    /* A1 inteira; A2 com 6 de 10 (não é "alto"). */
    let conhecidasA2 = 0
    const r = responder(teste, (i) => {
      if (i.pseudo) return false
      if (i.faixa === 'A1') return true
      if (i.faixa === 'A2' && conhecidasA2 < 6) return ++conhecidasA2 > 0
      return false
    })
    const res = resultadoDoTeste(teste, r)
    expect(res.nivel).toBe('A2')
    const marcadasA2 = teste.itens.filter((i, k) => i.faixa === 'A2' && !i.pseudo && r[k]).map((i) => i.palavra)
    expect(marcadasA2).toHaveLength(6)
    for (const p of marcadasA2) expect(res.aMarcar).toContain(p)
    const naoMarcadas = lista.A2.filter((p) => !marcadasA2.includes(p))
    expect(naoMarcadas.some((p) => res.aMarcar.includes(p))).toBe(false)
    for (const p of lista.A1) expect(res.aMarcar).toContain(chaveDaPalavra(p))
  })

  it('chute alto (muitas pseudopalavras "sei") não semeia nada e dá o motivo', () => {
    const r = responder(teste, () => true)
    const res = resultadoDoTeste(teste, r)
    expect(res).toMatchObject({ motivo: 'chute', confiavel: false, aMarcar: [], palavrasEstimadas: 0 })
    expect(res.taxaDeChute).toBe(1)
  })

  it('chute moderado corrige a taxa e tira as marcadas das faixas fracas', () => {
    /* Marca "sei" em 1 de cada 6 pseudopalavras (~17%: acima da tolerância, abaixo do corte). */
    let n = 0
    const r = responder(teste, (i) => (i.pseudo ? n++ % 6 === 0 : i.faixa === 'A1'))
    const res = resultadoDoTeste(teste, r)
    expect(res.taxaDeChute).toBeGreaterThan(0.15)
    expect(res.taxaDeChute).toBeLessThan(0.4)
    expect(res.motivo).toBe('ok')
    const a1 = res.faixas.find((f) => f.nivel === 'A1')!
    expect(a1.taxaCorrigida).toBeLessThan(a1.taxa + 1e-9)
    expect(a1.taxaCorrigida).toBeGreaterThan(0.9)
    /* Moderado: só as marcadas entram, nunca a faixa inteira. */
    const marcadas = teste.itens.filter((i, k) => !i.pseudo && r[k]).map((i) => i.palavra)
    expect(res.aMarcar.sort()).toEqual([...new Set(marcadas)].sort())
    expect(res.aMarcar.length).toBeLessThan(PALAVRAS_POR_FAIXA + 1)
  })

  it('moderado com todas as reais "sei": só as vistas, não as 2.784', () => {
    let n = 0
    const r = responder(teste, (i) => (i.pseudo ? n++ % 4 === 0 : true))
    const res = resultadoDoTeste(teste, r)
    expect(res.taxaDeChute).toBeGreaterThan(0.15)
    expect(res.taxaDeChute).toBeLessThan(0.4)
    expect(res.aMarcar.length).toBeLessThanOrEqual(PALAVRAS_POR_FAIXA * 6)
  })

  it('palavra real respondida "não sei" nunca entra, nem numa faixa semeada inteira', () => {
    let nao = 0
    const naoSei: string[] = []
    const r = responder(teste, (i) => {
      if (i.pseudo) return false
      if (i.faixa === 'A1' && nao < 2) {
        nao++
        naoSei.push(i.palavra)
        return false
      }
      return i.faixa === 'A1' || i.faixa === 'A2'
    })
    const res = resultadoDoTeste(teste, r)
    expect(res.faixas[0]!.taxaCorrigida).toBeGreaterThanOrEqual(0.8)
    expect(naoSei).toHaveLength(2)
    for (const p of naoSei) expect(res.aMarcar).not.toContain(chaveDaPalavra(p))
    expect(res.aMarcar).toContain(chaveDaPalavra(palavrasPorNivel('en').A1.find((p) => !naoSei.includes(p))!))
  })

  it('sem nenhuma resposta: sem dados e nada a marcar', () => {
    expect(resultadoDoTeste(teste, [])).toMatchObject({ motivo: 'sem_dados', confiavel: false, aMarcar: [] })
  })

  it('não saber nada em A1: nível nulo, estimativa baixa e só nada (ou quase) a marcar', () => {
    const r = responder(teste, () => false)
    const res = resultadoDoTeste(teste, r)
    expect(res.nivel).toBeNull()
    expect(res.aMarcar).toEqual([])
    expect(res.motivo).toBe('ok')
  })
})
