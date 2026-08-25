/**
 * O TESTE QUE FALTAVA — e o defeito de uma classe inteira que ele fecha.
 *
 * O Termo ficou inacessível: a carta liberava com 3 palavras do mesmo tamanho (`minItems`) e o
 * montador exigia 7 fixos, devolvendo lista VAZIA abaixo disso. Entre 3 e 6 a carta ficava verde e
 * o clique não fazia absolutamente nada. Nenhum teste pegou porque todos testavam UM lado:
 * `termoModos.test.ts` aprovava o tudo-ou-nada do construtor isoladamente, `termoEscada.test.ts`
 * aprovava `planoDaEscada` isoladamente, e `estadoDosJogos.test.ts` aprovava o gate isoladamente.
 * Os três estavam certos. O que ninguém verificou foi que eles CONCORDAM.
 *
 * A invariante travada aqui:
 *
 *     estadoDoJogo(id, entrada).ok === true  ⟹  a rodada monta e não é vazia
 *     estadoDoJogo(id, entrada).ok === false ⟹  a rodada NÃO monta
 *
 * Vale para os nove jogos, não só o Termo. Um gate que libera o que o montador recusa é a classe do
 * defeito, e é essa classe que a verificação cruzada cobre — inclusive no décimo jogo.
 */
import { describe, it, expect } from 'vitest'
import { estadoDoJogo, type EntradaDoEstado } from '../src/core/minigames/estadoDosJogos'
import { MINIGAMES, type MinigameId } from '../src/core/minigames/types'
import {
  rodadasDaEscada, consumoDaEscada, contarJogaveisMulti, planoDaEscada, DEGRAUS_MINIMOS,
  MIN_LETRAS, MAX_LETRAS,
} from '../src/core/minigames/termo'
import { buildItems } from '../src/core/minigames/itemSource'
import { buildScrambleRounds } from '../src/core/minigames/scramble'
import { buildRodadasEscuta, buildRodadasDitado, buildRodadasConectores } from '../src/core/minigames/escuta'
import type { VocabCard } from '../src/types'

function carta(word: string, translation: string): VocabCard {
  return {
    id: `c-${word}`, word, phonetics: '', translation, explanation: '',
    srcLang: 'en', tgtLang: 'pt', frequency: 'medium',
    leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5,
    fsrsPredictedRetention: 0, fsrsDueAt: new Date(0).toISOString(), inDeck: true,
  }
}

/**
 * `n` palavras de EXATAMENTE 5 letras, com traduções distintas e utilizáveis.
 *
 * Cinco letras está dentro de [MIN_LETRAS, MAX_LETRAS]; mesmo tamanho para todas, porque é assim
 * que o maior grupo do Termo fica sob controle do teste. Traduções distintas porque pista repetida
 * é descartada pelo construtor (dois cartões traduzidos igual tornam o degrau insolúvel).
 *
 * SEM DÍGITOS NA TRADUÇÃO. A primeira versão desta fixture usava `traducao-0`, `traducao-1`… e
 * `pistaUtil` reprova qualquer pista com número ("número no meio é ruído da captura",
 * `quality.ts:137`). O efeito foi pior do que um teste falhando: `contarJogaveisMulti` devolvia 0
 * para TODOS os tamanhos, os dois lados da comparação ficavam zerados, e o arquivo inteiro passava
 * sem verificar nada. Um teste vazio é pior que teste nenhum — ele dá licença.
 *
 * Daí a asserção logo abaixo: a fixture prova que É material jogável antes de ser usada.
 */
function palavrasIguais(n: number): VocabCard[] {
  const base = ['house', 'bread', 'table', 'chair', 'plant', 'water', 'green', 'stone', 'light', 'money', 'river', 'cloud']
  const TRAD = ['casa', 'pão', 'mesa', 'cadeira', 'planta', 'água', 'verde', 'pedra', 'luz', 'dinheiro', 'rio', 'nuvem']
  expect(base.length, 'fixture curta demais').toBeGreaterThanOrEqual(n)

  const cartas = base.slice(0, n).map((w, i) => {
    expect(w.length, `${w} precisa caber na janela do Termo`).toBeGreaterThanOrEqual(MIN_LETRAS)
    expect(w.length).toBeLessThanOrEqual(MAX_LETRAS)
    return carta(w, TRAD[i])
  })

  // A guarda que faltava: se a fixture não passar na triagem, o teste denuncia em vez de passar vazio.
  expect(contarJogaveisMulti(cartas), `fixture de ${n} cartas não é jogável — o teste passaria vazio`).toBe(n)
  return cartas
}

const FALAS = Array.from({ length: 12 }, (_, i) => ({
  id: `f${i}`,
  text: `But then she said that number ${i} again.`,
  translation: `Mas aí ela disse ${i} de novo.`,
  startMs: i * 4000, endMs: i * 4000 + 3000, lang: 'en',
}))

function entrada(cartas: VocabCard[], extra: Partial<EntradaDoEstado> = {}): EntradaDoEstado {
  return { cartas, frases: FALAS, temAudio: true, temVoz: true, fonteId: 'sessao', lang: 'en', ...extra }
}

/**
 * O montador, na versão do lobby — o mesmo caminho que `Play.montarRodada` percorre.
 *
 * Só os ramos que dependem de MATERIAL entram aqui. É deliberadamente uma reimplementação enxuta:
 * o que se verifica é o acordo entre o gate e o construtor de cada família, e uma cópia que
 * divergisse do `Play.tsx` real seria pega pelo próprio teste ao contradizer o gate.
 */
function montaRodada(id: MinigameId, e: EntradaDoEstado): number {
  if (id === 'termo') return rodadasDaEscada(e.cartas).length
  const def = MINIGAMES[id]

  if (def.modalidade === 'palavra') return buildItems(id, e.cartas).length

  if (e.fonteId === 'trilha') {
    if (!def.aceitaPalavraFalada) return 0
    return e.temVoz ? Math.min(e.cartas.length, def.maxItems) : 0
  }
  if (id === 'scramble') return buildScrambleRounds(e.frases, { quantidade: def.maxItems }).length
  if (id === 'escuta') return e.temAudio ? buildRodadasEscuta(e.frases, { quantidade: def.maxItems }).length : 0
  if (id === 'ditado') return e.temAudio ? buildRodadasDitado(e.frases, { quantidade: def.maxItems }).length : 0
  if (id === 'conectores') return buildRodadasConectores(e.frases, { lang: e.lang, quantidade: def.maxItems }).length
  // karaokê: as falas com áudio real
  return e.temAudio ? e.frases.filter(f => f.endMs > f.startMs && f.text.trim()).length : 0
}

const IDS = Object.keys(MINIGAMES) as MinigameId[]

describe('gate × builder — a carta liberada sempre abre', () => {
  /**
   * A zona morta do Termo era {3,4,5,6}. A varredura vai de 0 a 10 para cobrir os dois lados de
   * cada degrau da escada (o piso 3, o salto para o quarteto em 7) e o excedente.
   */
  describe.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 10])('com %i palavras do mesmo tamanho', (n) => {
    const e = entrada(palavrasIguais(n))

    it('o Termo abre se e somente se a carta diz que abre', () => {
      const gate = estadoDoJogo('termo', e)
      const itens = montaRodada('termo', e)

      expect(itens > 0, gate.ok
        ? `carta liberada com ${n} palavras mas a rodada veio vazia — é o defeito original`
        : `carta bloqueada com ${n} palavras mas a rodada montou`,
      ).toBe(gate.ok)
    })

    it('o tamanho anunciado é o que a rodada entrega', () => {
      const gate = estadoDoJogo('termo', e)
      if (!gate.ok) return
      expect(gate.tamanhoDaRodada).toBe(montaRodada('termo', e))
    })
  })

  it('a rodada consome 3 ou 7, nunca 4, 5 ou 6', () => {
    // O que tornava "5 palavras prontas" uma promessa impossível de cumprir.
    expect([3, 4, 5, 6].map(n => consumoDaEscada(n))).toEqual([3, 3, 3, 3])
    expect([7, 8, 100].map(n => consumoDaEscada(n))).toEqual([7, 7, 7])
  })

  it('um degrau só não é escada — 1 e 2 palavras não montam rodada', () => {
    /* `consumoDaEscada(1)` é 1 e está aritmeticamente certo; o que não existe é o JOGO com um
       tabuleiro só. É `DEGRAUS_MINIMOS` que separa as duas coisas, e é ele que faz o construtor
       fechar com o `minItems` da carta. */
    expect(planoDaEscada(1)).toEqual([1])
    expect(planoDaEscada(1).length).toBeLessThan(DEGRAUS_MINIMOS)
    expect(rodadasDaEscada(palavrasIguais(1))).toHaveLength(0)
    expect(rodadasDaEscada(palavrasIguais(2))).toHaveLength(0)
  })

  it('o teto declarado do Termo é a escada completa', () => {
    // Sem isto, a carta volta a poder prometer menos do que a rodada consome.
    expect(MINIGAMES.termo.maxItems).toBe(consumoDaEscada(Number.MAX_SAFE_INTEGER))
  })

  it('o piso do gate é exatamente o menor degrau jogável da escada', () => {
    expect(planoDaEscada(MINIGAMES.termo.minItems)).toEqual([1, 2])
    expect(planoDaEscada(MINIGAMES.termo.minItems).length).toBe(DEGRAUS_MINIMOS)
    expect(planoDaEscada(MINIGAMES.termo.minItems - 1).length).toBeLessThan(DEGRAUS_MINIMOS)
  })

  it('rodadasDaEscada nunca devolve um tamanho que a escada não consome', () => {
    for (let n = 0; n <= 10; n++) {
      const r = rodadasDaEscada(palavrasIguais(n))
      expect(consumoDaEscada(r.length), `${n} palavras → ${r.length} rodadas`).toBe(r.length)
    }
  })

  it('o gate do Termo mede o mesmo que o construtor', () => {
    // As duas contas são `maiorGrupoPorTamanho(...).length`. Se divergirem, a zona morta volta.
    const cartas = [...palavrasIguais(5), carta('sun', 'sol'), carta('extralongword', 'comprida')]
    expect(estadoDoJogo('termo', entrada(cartas)).disponiveis).toBe(contarJogaveisMulti(cartas))
  })
})

describe('gate × builder — os nove jogos', () => {
  const CENARIOS: Array<{ nome: string; e: EntradaDoEstado }> = [
    { nome: 'baralho e falas fartos', e: entrada(palavrasIguais(10)) },
    { nome: 'baralho no piso do Termo', e: entrada(palavrasIguais(3)) },
    { nome: 'baralho vazio', e: entrada([], { frases: [] }) },
    { nome: 'sem áudio na gravação', e: entrada(palavrasIguais(10), { temAudio: false }) },
    { nome: 'na trilha (sem frases)', e: entrada(palavrasIguais(10), { fonteId: 'trilha' }) },
    { nome: 'na trilha sem voz', e: entrada(palavrasIguais(10), { fonteId: 'trilha', temVoz: false }) },
    { nome: 'idioma sem conectores', e: entrada(palavrasIguais(10), { lang: 'xx' }) },
  ]

  for (const { nome, e } of CENARIOS) {
    describe(nome, () => {
      it.each(IDS)('%s: liberado ⟺ monta', (id) => {
        const gate = estadoDoJogo(id, e)
        const itens = montaRodada(id, e)

        if (gate.ok) {
          expect(itens, `${id} liberado mas a rodada veio vazia`).toBeGreaterThan(0)
          expect(itens, `${id} liberado com menos itens que o mínimo`).toBeGreaterThanOrEqual(MINIGAMES[id].minItems)
        } else {
          expect(itens, `${id} bloqueado mas a rodada montou com ${itens} itens`)
            .toBeLessThan(MINIGAMES[id].minItems)
        }
      })

      it.each(IDS)('%s: nunca anuncia mais do que entrega', (id) => {
        const gate = estadoDoJogo(id, e)
        if (!gate.ok) return
        expect(gate.tamanhoDaRodada).toBeLessThanOrEqual(montaRodada(id, e))
        expect(gate.tamanhoDaRodada).toBeGreaterThanOrEqual(MINIGAMES[id].minItems)
      })
    })
  }
})
