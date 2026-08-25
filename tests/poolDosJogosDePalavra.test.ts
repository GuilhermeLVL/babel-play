/**
 * O POOL CONTADO SEM MONTAR A RODADA — e a prova de que é o MESMO número.
 *
 * `estadoDoJogo` media o acervo com `buildItems(id, cartas, { limit: 999 })`, uma vez por jogo de
 * palavra. Quando a composição deixou de cortar o baralho em 200 e passou a entregar o acervo
 * inteiro, isso virou, por jogo, uma ordenação por urgência, dois embaralhamentos com cópia do
 * array e uma passada de `avaliarCartao` sobre 2.147 cartões — a causa medida do TBT do Jogar
 * (133 → 933 ms, achado F0-02 da auditoria).
 *
 * `poolDosJogosDePalavra` conta com UMA varredura para os três jogos. Este teste é o que autoriza
 * a troca: se a contagem barata divergir de `buildItems` em qualquer baralho, o conserto está
 * errado — a carta passaria a anunciar um acervo que a rodada não tem.
 */
import { describe, it, expect } from 'vitest'
import { poolDosJogosDePalavra } from '../src/core/minigames/estadoDosJogos'
import { buildItems } from '../src/core/minigames/itemSource'
import type { MinigameId } from '../src/core/minigames/types'
import type { VocabCard } from '../src/types'

/** O mesmo teto de medição de `estadoDosJogos`. */
const TETO = 999
const JOGOS: MinigameId[] = ['memory', 'wordsearch', 'blitz']

function carta(p: Partial<VocabCard> & { id: string; word: string }): VocabCard {
  return {
    phonetics: '', translation: '', explanation: '',
    srcLang: 'en', tgtLang: 'pt', frequency: 'medium',
    leitnerBox: 1, leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5,
    fsrsPredictedRetention: 0, fsrsDueAt: new Date(0).toISOString(),
    inDeck: true,
    ...p,
  } as VocabCard
}

const LETRAS = 'abcdefghijklmnopqrstuvwxyz'
const sufixo = (i: number) => LETRAS[i % 26] + LETRAS[Math.floor(i / 26) % 26] + LETRAS[Math.floor(i / 676) % 26]

/**
 * Um baralho com as situações que separam um jogo do outro: sem tradução (só a Memória recusa),
 * com frase e sem tradução (vira lacuna, que o caça-palavras recusa), tradução repetida (a pista
 * duplicada é recusada por todos), fora do baralho e palavra vazia.
 */
function baralho(n: number, semente: number): VocabCard[] {
  const fora: VocabCard[] = []
  for (let i = 0; i < n; i++) {
    const k = (i + semente) % 7
    fora.push(carta({
      id: `c${i}`,
      word: `word${sufixo(i)}`.replace(/\d/g, ''),
      // k=0: sem tradução e sem frase (sai de todos). k=1: só frase (vira lacuna).
      translation: k === 0 || k === 1 ? '' : k === 2 ? 'repetida' : `casa${sufixo(i)}`,
      sentence: k === 1 || k === 3 ? `The word ${sufixo(i)} was quiet in the morning.` : '',
      inDeck: k !== 6,
    }))
  }
  return fora
}

describe('poolDosJogosDePalavra', () => {
  it('conta o mesmo que `buildItems` com o teto de medição, em baralhos variados', () => {
    for (let semente = 0; semente < 7; semente++) {
      for (const n of [0, 1, 9, 137, 1200]) {
        const cartas = baralho(n, semente)
        const contado = poolDosJogosDePalavra(cartas)
        for (const id of JOGOS) {
          const montado = buildItems(id, cartas, { limit: TETO }).length
          expect(contado.get(id), `${id} · n=${n} · semente=${semente}`).toBe(montado)
        }
      }
    }
  })

  it('a contagem não depende da ordem dos cartões — é o que dispensa ordenar e embaralhar', () => {
    const cartas = baralho(300, 3)
    const direta = poolDosJogosDePalavra(cartas)
    const invertida = poolDosJogosDePalavra([...cartas].reverse())
    for (const id of JOGOS) expect(invertida.get(id), id).toBe(direta.get(id))
  })

  it('acima do teto de medição, satura no MESMO valor que `buildItems`', () => {
    // Baralho grande o bastante para os três estourarem 999 — é o caso em que os dois lados param
    // cedo, cada um pelo seu `break`, e precisam parar no mesmo número.
    const cartas = baralho(4000, 1)
    const contado = poolDosJogosDePalavra(cartas)
    for (const id of JOGOS) {
      expect(contado.get(id), id).toBe(TETO)
      expect(buildItems(id, cartas, { limit: TETO }).length, id).toBe(TETO)
    }
  })
})
