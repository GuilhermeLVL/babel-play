/**
 * "MAIS UMA · PALAVRAS NOVAS" PRECISA ENTREGAR PALAVRAS NOVAS.
 *
 * O DEFEITO, medido no banco real (6 rodadas gravadas, `trilha:A1`): duas correntes emendadas
 * devolveram 5 das 7 mesmas palavras, e a simulação com o dado real da trilha mostra que da
 * TERCEIRA rodada em diante a repetição é de 7/7 — para sempre.
 *
 * A CAUSA. `buildItems` trata `evitar` como EXCLUSÃO quando sobra material (`excluirEvitadas`),
 * e só cai para demoção quando excluir deixaria a rodada abaixo do mínimo. O Termo nunca recebeu
 * essa distinção: lá `evitar` sempre foi demoção pura. Como `rodadasDaEscada` dimensiona a escada
 * por `contarJogaveisMulti(cards)` — que ignora `evitar` —, ela pede SEMPRE as 7 palavras da
 * piscina cheia, e a demoção apenas reordena as mesmas 7. O caminho honesto (`montarRodada`
 * devolve `null` → `semMaterial` → a raspadinha esconde o "mais uma") ficava inalcançável.
 *
 * A piscina abaixo é a REAL: as 9 palavras de 5 letras da etapa 1 do A1 (`mesmoTamanho` reduz o
 * material ao maior grupo de mesmo comprimento, e é ele que a escada consome).
 */
import { describe, expect,it } from 'vitest'

import { buildItems } from '../src/core/minigames/itemSource'
import { rodadasDaEscada } from '../src/core/minigames/termo'
import type { VocabCard } from '../src/types'

const PISCINA_A1: Array<[string, string]> = [
  ['about', 'cerca de'], ['above', 'acima'], ['again', 'de novo'], ['agree', 'concordar'],
  ['alone', 'sozinho'], ['angry', 'bravo'], ['apple', 'maçã'], ['april', 'abril'], ['apron', 'avental'],
]
const carta = ([word, translation]: [string, string]): VocabCard =>
  ({ id: word, word, translation, sentence: null, inDeck: true, srcLang: 'en' } as unknown as VocabCard)

/* Palavras de 5 letras com traduções sem dígito: `avaliarCartao` reprova pista com número, e um
   fixture reprovado esvaziaria a rodada por um motivo que nada tem a ver com o que se mede aqui. */
const LETRAS = 'bcdfghjklmnpqrstvwxz'
function palavrasSinteticas(n: number): VocabCard[] {
  return Array.from({ length: n }, (_, i) => {
    const a = LETRAS[i % LETRAS.length]
    const b = LETRAS[Math.floor(i / LETRAS.length) % LETRAS.length]
    return carta([`${a}a${b}ro`, `traduzida ${a}${b}`])
  })
}

const diaDe = (ts: number) => Math.floor(ts / 86_400_000)
const AGORA = Date.UTC(2026, 8, 1, 12)
const semente = String(diaDe(AGORA))

/**
 * Emenda N rodadas como `continuarSequencia` faz — e MODELA a composição de `montarRodada`:
 * o que caiu na corrente é cortado do MATERIAL (regra dura) antes de o construtor ser chamado,
 * e o mesmo conjunto segue também como `evitar` (a demoção macia dos construtores).
 */
function corrente(
  cartas: VocabCard[],
  montar: (cartas: VocabCard[], evitar: Set<string>) => string[],
  rodadas: number,
): string[][] {
  const jaCaiu = new Set<string>()
  const saida: string[][] = []
  for (let i = 0; i < rodadas; i++) {
    const material = cartas.filter((c) => !jaCaiu.has((c.word ?? '').trim()))
    const ws = montar(material, jaCaiu)
    saida.push(ws)
    ws.forEach((w) => jaCaiu.add(w))
  }
  return saida
}

const termo = (faixa: 'facil' | 'medio' | 'dificil') => (cartas: VocabCard[], evitar: Set<string>) =>
  rodadasDaEscada(cartas, { evitar, memoria: new Map(), semente, diaDe, faixa, now: AGORA }).map((x) => x.palavra)

describe('a corrente do Termo não recicla o que acabou de cair', () => {
  const cartas = PISCINA_A1.map(carta)

  it('numa piscina de 9, duas rodadas seguidas NÃO compartilham palavra', () => {
    const [r1, r2] = corrente(cartas, termo('dificil'), 2)
    const repetidas = r2.filter((w) => r1.includes(w))
    expect(repetidas).toEqual([])
  })

  it('a escada ENCURTA quando o material acaba, em vez de reciclar', () => {
    const rodadas = corrente(cartas, termo('dificil'), 3)
    // 9 palavras: a 1ª leva 7, sobram 2 — que não formam escada (mínimo 3 = degraus [1,2]).
    expect(rodadas[0]).toHaveLength(7)
    expect(rodadas[1]).toEqual([])
  })

  it('no médio (escada 1+2+2 = 5), a segunda rodada usa as 4 restantes e a terceira acaba', () => {
    const rodadas = corrente(cartas, termo('medio'), 3)
    expect(rodadas[0]).toHaveLength(5)
    // Sobram 4: cabem os degraus [1,2] = 3 palavras, escada curta e honesta.
    expect(rodadas[1].length).toBeGreaterThanOrEqual(3)
    expect(rodadas[1].filter((w) => rodadas[0].includes(w))).toEqual([])
    // Agora não há mais material fresco: a rodada não existe, e é isso que destrava `semMaterial`.
    expect(rodadas[2]).toEqual([])
  })

  it('numa corrente longa com piscina grande, nenhuma palavra cai duas vezes', () => {
    const grande = palavrasSinteticas(40)
    const rodadas = corrente(grande, termo('dificil'), 4)
    const todas = rodadas.flat()
    expect(todas.length).toBeGreaterThan(20)
    expect(new Set(todas).size).toBe(todas.length)
  })
})

/** A régua que o Termo não tinha — fixada aqui para as duas não voltarem a divergir. */
describe('buildItems já exclui o que caiu (a referência do conserto)', () => {
  it('quatro rodadas de memória não repetem palavra', () => {
    const cartas = palavrasSinteticas(40)
    const rodadas = corrente(
      cartas,
      (cs, evitar) =>
        buildItems('memory', cs, { evitar, memoria: new Map(), semente, diaDe, excluirEvitadas: true, now: AGORA })
          .map((i) => i.answer),
      4,
    )
    const todas = rodadas.flat()
    expect(new Set(todas).size).toBe(todas.length)
  })
})
