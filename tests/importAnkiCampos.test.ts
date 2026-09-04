/**
 * O CAMPO CERTO É ESCOLHIDO PELO NOME — não pela posição.
 *
 * O DEFEITO, com o baralho "4000 Essential English Words" do AnkiWeb (3.871 notas, 214 MB): a
 * frente vinha de `flds[0]` e o verso de `flds[1]`, fixos. Naquele baralho os dois primeiros
 * campos do tipo de nota principal são `№` e `IMG` — um número de ordem e uma tag `<img>`. Depois
 * de `limparCampo` a imagem vira vazio, o par nasce sem verso, e as 3.871 notas caíam todas no
 * descarte. O importador dizia "0 notas lidas" sobre um baralho perfeitamente válido.
 *
 * O parser JÁ LIA os nomes dos campos e já os usava para achar o exemplo; só nunca os usou para
 * os dois campos que decidem se a nota existe.
 */
import { describe, it, expect } from 'vitest'
import { indicePorNome, PADRAO_FRENTE, PADRAO_VERSO } from '../server/import/anki'

/** Os dois tipos de nota REAIS do baralho que falhou. */
const EEW = ['Word', 'Image', 'Sound', 'Sound_Meaning', 'Sound_Example', 'Meaning', 'Example', 'IPA']
const EEW_EXTRA = ['№', 'IMG', 'English', 'Transcription', 'Audio', 'BrTranscription', 'AmTranscription', 'Am&BrTranscription']

describe('a escolha de campo do baralho que não subia', () => {
  it('no tipo principal, acha Word e Meaning — não № e IMG', () => {
    expect(indicePorNome(EEW, PADRAO_FRENTE)).toBe(0)   // Word
    expect(indicePorNome(EEW, PADRAO_VERSO)).toBe(5)    // Meaning
  })

  /**
   * `Sound_Meaning` (índice 3) CONTÉM "meaning" e é um ÁUDIO. Casar por conteúdo antes de casar
   * por igualdade escolheria o campo errado e o cartão nasceria com um marcador de som no verso.
   */
  it('prefere o nome EXATO: Meaning, e não Sound_Meaning', () => {
    expect(indicePorNome(EEW, PADRAO_VERSO)).not.toBe(3)
  })

  it('no tipo só de pronúncia, acha a palavra mas NÃO inventa um verso', () => {
    expect(indicePorNome(EEW_EXTRA, PADRAO_FRENTE)).toBe(2)  // English
    // Não há significado nenhum neste tipo de nota — e é certo que ele seja descartado.
    expect(indicePorNome(EEW_EXTRA, PADRAO_VERSO)).toBe(-1)
  })

  it('o baralho comum de dois campos sem nome continua no posicional', () => {
    expect(indicePorNome([], PADRAO_FRENTE)).toBe(-1)
    expect(indicePorNome(['', ''], PADRAO_VERSO)).toBe(-1)
  })

  it('reconhece os nomes que os baralhos de verdade usam, em português e inglês', () => {
    for (const nomes of [['Front', 'Back'], ['Frente', 'Verso'], ['Termo', 'Definição'], ['Expression', 'Translation'], ['Palavra', 'Tradução']]) {
      expect(indicePorNome(nomes, PADRAO_FRENTE), nomes.join('/')).toBe(0)
      expect(indicePorNome(nomes, PADRAO_VERSO), nomes.join('/')).toBe(1)
    }
  })

  it('Word ganha de Front quando o baralho tem os dois — Front costuma ser o template', () => {
    expect(indicePorNome(['Front', 'Word', 'Back'], PADRAO_FRENTE)).toBe(1)
  })
})
