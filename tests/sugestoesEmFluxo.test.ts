/**
 * O LEITOR INCREMENTAL do "Como respondo?" em fluxo (`src/lib/estudo/sugestoesEmFluxo.ts`): cada sugestão sai assim
 * que o objeto dela fecha no texto do modelo, pelo MESMO leitor defensivo da resposta inteira, e o que sai é sempre um
 * prefixo do que `lerSugestoes` lê do texto final — qualquer que seja o corte dos pedaços.
 */
import { describe, expect, it } from 'vitest'

import { lerSugestoes, type SugestaoDeResposta } from '../src/lib/estudo/promptDoAssistente'
import { criarLeitorDeSugestoesEmFluxo, ITEM_ILEGIVEL, ItensDaListaEmFluxo } from '../src/lib/estudo/sugestoesEmFluxo'

const S1 = { texto: 'Sure, Thursday works.', traducao: 'Claro, quinta funciona.', tom: 'neutro' }
const S2 = { texto: 'Yeah, no problem!', traducao: 'Sim, sem problema!', tom: 'informal' }
const S3 = { texto: 'Certainly, Thursday is fine.', traducao: 'Certamente, quinta está bem.', tom: 'formal' }
const RESPOSTA = JSON.stringify({ sugestoes: [S1, S2, S3] })

/** Alimenta o leitor com o texto cortado nos pontos dados e devolve, por pedaço, as sugestões novas. */
function emPedacos(texto: string, cortes: number[]): SugestaoDeResposta[][] {
  const leitor = criarLeitorDeSugestoesEmFluxo()
  const saidas: SugestaoDeResposta[][] = []
  for (const fim of [...cortes, texto.length]) saidas.push(leitor.alimentar(texto.slice(0, fim)))
  return saidas
}

describe('ItensDaListaEmFluxo: os objetos completos da lista, à medida que o texto cresce', () => {
  it('cada item sai no pedaço em que fecha, nem antes nem depois', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    const fimDoPrimeiro = RESPOSTA.indexOf('}') + 1
    expect(itens.alimentar(RESPOSTA.slice(0, fimDoPrimeiro - 1))).toEqual([])
    expect(itens.alimentar(RESPOSTA.slice(0, fimDoPrimeiro))).toEqual([S1])
    expect(itens.alimentar(RESPOSTA.slice(0, fimDoPrimeiro + 5))).toEqual([])
    expect(itens.alimentar(RESPOSTA)).toEqual([S2, S3])
    expect(itens.alimentar(`${RESPOSTA} {"sugestoes":[{"a":1}]}`)).toEqual([]) // depois do objeto raiz, nada
  })

  it('caractere a caractere dá o mesmo que de uma vez', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    const saidos: unknown[] = []
    for (let i = 1; i <= RESPOSTA.length; i++) saidos.push(...itens.alimentar(RESPOSTA.slice(0, i)))
    expect(saidos).toEqual([S1, S2, S3])
  })

  it('ignora a cerca ```json e o espaço antes do objeto raiz', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    expect(itens.alimentar('```json\n' + RESPOSTA + '\n```')).toEqual([S1, S2, S3])
  })

  it('chave, colchete e aspas escapadas DENTRO de strings não contam como estrutura', () => {
    const esquisito = { texto: 'a } ] { [ "quoted" \\ ok', traducao: 'b "}" c', tom: 'neutro' }
    const itens = new ItensDaListaEmFluxo('sugestoes')
    expect(itens.alimentar(JSON.stringify({ sugestoes: [esquisito, S2] }))).toEqual([esquisito, S2])
  })

  it('só a lista da chave pedida, direto no objeto raiz', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    expect(itens.alimentar(JSON.stringify({ respostas: [S1], x: { sugestoes: [S2] }, sugestoes: [S3] }))).toEqual([S3])
    const outra = new ItensDaListaEmFluxo('sugestoes')
    expect(outra.alimentar(JSON.stringify({ nota: 'sugestoes', lista: [S1] }))).toEqual([])
  })

  it('objeto aninhado dentro do item fica dentro do item', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    const comFilho = { ...S1, extra: { a: [1, { b: 2 }] } }
    expect(itens.alimentar(JSON.stringify({ sugestoes: [comFilho] }))).toEqual([comFilho])
  })

  it('item que fecha mas não é JSON vira ITEM_ILEGIVEL', () => {
    const itens = new ItensDaListaEmFluxo('sugestoes')
    expect(itens.alimentar('{"sugestoes":[{"texto": "a" "traducao": "b"}')).toEqual([ITEM_ILEGIVEL])
  })
})

describe('criarLeitorDeSugestoesEmFluxo: o leitor defensivo, item a item', () => {
  it('entrega cada sugestão uma vez, na ordem, e o total é o que lerSugestoes lê', () => {
    const saidas = emPedacos(RESPOSTA, [10, RESPOSTA.indexOf('}') + 1, RESPOSTA.lastIndexOf('{')])
    expect(saidas.flat()).toEqual(lerSugestoes(RESPOSTA))
    expect(saidas[0]).toEqual([])
    expect(saidas[1]).toEqual([S1])
  })

  it('qualquer corte dos pedaços entrega um prefixo de lerSugestoes (e o todo no fim)', () => {
    let semente = 7
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const texto = '```json\n' + JSON.stringify({ sugestoes: [S1, { ...S2, texto: '  Yeah,   no <<<problem>>>!' }, S3] })
    const final = lerSugestoes(texto)!
    expect(final).toHaveLength(3)
    for (let rodada = 0; rodada < 50; rodada++) {
      const cortes = Array.from({ length: 1 + Math.floor(aleatorio() * 8) }, () =>
        Math.floor(aleatorio() * texto.length),
      )
      const saidas = emPedacos(
        texto,
        cortes.sort((a, b) => a - b),
      )
      expect(saidas.flat()).toEqual(final)
    }
  })

  it('limpa como a resposta inteira: espaço colapsado e sem os delimitadores do prompt', () => {
    const leitor = criarLeitorDeSugestoesEmFluxo()
    const sujo = { texto: '  <<<Sure,   Thursday>>> works. ', traducao: 'Claro >>>', tom: 'neutro' }
    expect(leitor.alimentar(JSON.stringify({ sugestoes: [sujo] }))).toEqual([
      { texto: 'Sure, Thursday works.', traducao: 'Claro', tom: 'neutro' },
    ])
  })

  it('pula a repetida e a vazia; para em 3', () => {
    const leitor = criarLeitorDeSugestoesEmFluxo()
    const vazia = { texto: '   ', traducao: 'nada', tom: 'neutro' }
    const repetida = { ...S1, texto: 'SURE,  thursday works.' }
    const quarta = { texto: 'Works for me.', traducao: 'Por mim tudo bem.', tom: 'informal' }
    const saida = leitor.alimentar(JSON.stringify({ sugestoes: [S1, vazia, repetida, S2, S3, quarta] }))
    expect(saida).toEqual([S1, S2, S3])
    expect(leitor.entregues).toBe(3)
    expect(leitor.foraDoFormato).toBe(false)
  })

  for (const [nome, item] of [
    ['chave a mais', { ...S2, falante: 'Ana' }],
    ['chave a menos', { texto: 'Hi', tom: 'neutro' }],
    ['tom fora do enum', { ...S2, tom: 'irônico' }],
    ['tipo errado', { ...S2, texto: 42 }],
  ] as const)
    it(`item fora do formato (${nome}): para de entregar, e lerSugestoes recusa o todo`, () => {
      const texto = JSON.stringify({ sugestoes: [S1, item, S3] })
      const leitor = criarLeitorDeSugestoesEmFluxo()
      expect(leitor.alimentar(texto)).toEqual([S1])
      expect(leitor.foraDoFormato).toBe(true)
      expect(leitor.alimentar(`${texto} `)).toEqual([])
      expect(lerSugestoes(texto)).toBeNull()
    })

  it('item ilegível também para o leitor', () => {
    const leitor = criarLeitorDeSugestoesEmFluxo()
    expect(leitor.alimentar(`{"sugestoes":[${JSON.stringify(S1)},{"texto": "a" "x": 1}`)).toEqual([S1])
    expect(leitor.foraDoFormato).toBe(true)
  })
})
