/**
 * EXPORTAR UM BARALHO OU UMA SELEÇÃO (openspec `cartoes` 4.4): o recorte pela fonte (`cartoesDoConteudo`, o mesmo que
 * "Exportar" do menu da fonte usa) vai para o `.apkg` do navegador (`montarApkg`) e volta pelo leitor (`lerApkg`) só com as
 * notas do baralho pedido. Cartão sem verso fica de fora, como no diálogo.
 */
import { describe, expect, it } from 'vitest'

import { montarApkg } from '../src/lib/anki/montarApkg'
import { cartoesDoConteudo } from '../src/lib/conteudo/cartoes'
import type { VocabCard } from '../src/types'
import { abrirSqlite, lerApkg } from './harness/lerApkgNode'

const cartao = (word: string, translation: string, baralhosAnki: string[], inDeck = true): VocabCard =>
  ({
    id: `id-${word}`,
    word,
    translation,
    srcLang: 'en',
    baralhosAnki,
    daAnki: baralhosAnki.length > 0,
    inDeck,
    phonetics: '',
    explanation: '',
  }) as unknown as VocabCard

const ida = async (cartoes: VocabCard[]) => {
  const saem = cartoes.filter((c) => c.inDeck && c.translation.trim())
  const arquivo = await montarApkg(
    saem.map((c) => ({ frente: c.word, verso: c.translation, etiquetas: c.etiquetas })),
    'Baralho',
    abrirSqlite,
  )
  return lerApkg(arquivo)
}

describe('exportar um baralho', () => {
  const deck = [
    cartao('harvest', 'colheita', ['A']),
    cartao('garden', 'jardim', ['A']),
    cartao('river', 'rio', ['B']),
    cartao('window', 'janela', ['B', 'A']),
    cartao('quiet', '', ['A']),
    cartao('paused', 'pausada', ['A'], false),
  ]

  it('só as notas do baralho pedido, ida e volta no leitor', async () => {
    const doA = cartoesDoConteudo(deck, { idioma: '', fonte: { tipo: 'anki', id: 'A', nome: 'A' } })
    const lido = await ida(doA)
    expect(lido.notas.map((n) => n.frente).sort()).toEqual(['garden', 'harvest', 'window'])
    const doB = cartoesDoConteudo(deck, { idioma: '', fonte: { tipo: 'anki', id: 'B', nome: 'B' } })
    expect((await ida(doB)).notas.map((n) => n.frente).sort()).toEqual(['river', 'window'])
  })

  it('uma seleção qualquer sai inteira e nada além dela', async () => {
    const selecao = deck.filter((c) => ['river', 'garden'].includes(c.word))
    const lido = await ida(selecao)
    expect(lido.notas.map((n) => [n.frente, n.verso]).sort()).toEqual([
      ['garden', 'jardim'],
      ['river', 'rio'],
    ])
  })
})
