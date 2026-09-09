/**
 * A métrica que vai julgar a qualidade da tradução, testada onde ela é fácil de errar.
 *
 * O ponto de escolher chrF++ em vez de BLEU é degradar SUAVEMENTE em frases curtas — que é tudo o
 * que este produto traduz. Os testes abaixo verificam justamente essa propriedade, além da conta
 * de repetição, que é a assinatura da alucinação.
 */
import { describe, expect,it } from 'vitest'

import { agregarChrf, agregarPorCategoria, type CasoDeTraducao,chrf } from '../src/core/eval/chrf'

describe('chrF++', () => {
  it('tradução idêntica dá 1', () => {
    expect(chrf('o gato dorme', 'o gato dorme').chrf).toBe(1)
  })

  it('tradução sem nenhuma relação dá nota baixa', () => {
    expect(chrf('o gato dorme', 'zebra xilofone').chrf).toBeLessThan(0.2)
  })

  it('DEGRADA SUAVEMENTE — é a razão de existir desta escolha', () => {
    // Uma palavra trocada em quatro: BLEU-4 zeraria vários n-gramas de uma vez; chrF++ deve
    // reconhecer que a frase está quase certa.
    const quase = chrf('o gato preto dorme', 'o gato preto dormia').chrf
    expect(quase).toBeGreaterThan(0.6)
    expect(quase).toBeLessThan(1)
  })

  it('distingue erro de FLEXÃO de erro de SENTIDO', () => {
    // "dormia" erra a flexão; "corria" erra o verbo. A primeira tem de pontuar mais.
    const flexao = chrf('o gato dorme', 'o gato dormia').chrf
    const sentido = chrf('o gato dorme', 'o gato corria').chrf
    expect(flexao).toBeGreaterThan(sentido)
  })

  it('repetir palavra certa NÃO infla a nota — a assinatura da alucinação', () => {
    const certo = chrf('muito bom', 'muito bom').chrf
    const repetido = chrf('muito bom', 'muito muito muito bom').chrf
    expect(repetido).toBeLessThan(certo)
  })

  it('o acento conta: em português ele muda a palavra', () => {
    expect(chrf('ele está aqui', 'ele esta aqui').chrf).toBeLessThan(1)
  })

  it('frase muito curta não é punida por falta de n-gramas longos', () => {
    // Em "oi" não existe 6-grama de caractere nem 2-grama de palavra. Os níveis vazios são
    // ignorados; contá-los como zero daria nota baixa a uma tradução perfeita.
    expect(chrf('oi', 'oi').chrf).toBe(1)
  })

  it('hipótese vazia dá zero, e as duas vazias dão 1', () => {
    expect(chrf('alguma coisa', '').chrf).toBe(0)
    expect(chrf('', '').chrf).toBe(1)
  })

  it('recall pesa mais que precisão (β=2): omitir é pior que acrescentar', () => {
    const omitiu = chrf('o gato preto dorme na cama', 'o gato dorme').chrf
    const acrescentou = chrf('o gato dorme', 'o gato preto dorme na cama').chrf
    expect(omitiu).toBeLessThan(acrescentou)
  })
})

describe('agregação e quebra por categoria', () => {
  const casos: CasoDeTraducao[] = [
    { id: '1', categoria: 'pronome', origem: 'I saw it', referencia: 'eu a vi', hipotese: 'eu a vi' },
    { id: '2', categoria: 'pronome', origem: 'I saw it', referencia: 'eu a vi', hipotese: 'eu o vi' },
    { id: '3', categoria: 'idiomatico', origem: 'break a leg', referencia: 'boa sorte', hipotese: 'quebre uma perna' },
  ]

  it('casos sem hipótese não entram na conta', () => {
    const semTraducao = [...casos, { id: '4', categoria: 'pronome', origem: 'x', referencia: 'y' }]
    expect(agregarChrf(semTraducao).casos).toBe(3)
  })

  it('a quebra por categoria mostra o que a média esconde', () => {
    const porCat = agregarPorCategoria(casos)
    // O sistema vai razoavelmente em pronome (um acerto, um quase) e mal em idiomático — que é
    // exatamente a forma da queixa "traduz ao pé da letra".
    expect(porCat.pronome.chrf).toBeGreaterThan(porCat.idiomatico.chrf)
    expect(porCat.pronome.casos).toBe(2)
    expect(porCat.idiomatico.casos).toBe(1)
  })

  it('lista vazia não divide por zero', () => {
    expect(agregarChrf([]).chrf).toBe(0)
  })
})
