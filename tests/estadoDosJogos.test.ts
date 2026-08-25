/**
 * A REGRA QUE JÁ MENTIU EM PRODUÇÃO, agora com teste.
 *
 * `frases` e `audioSessao` vêm de uma GRAVAÇÃO e não são função da fonte escolhida. Na trilha, os
 * cinco jogos de frase anunciavam "N falas prontas" e jogavam o áudio de outra fonte — mistura
 * silenciosa, sem erro em lugar nenhum. O conserto entrou, mas ficou dentro de um `useMemo` de um
 * componente de 2.000 linhas, onde nenhum teste alcançava.
 *
 * Estes testes existem para que a correção não seja desfeita por acidente na próxima vez que
 * alguém mexer no gate das cartas.
 */
import { describe, it, expect } from 'vitest'
import { estadoDeCadaJogo, estadoDoJogo, type EntradaDoEstado } from '../src/core/minigames/estadoDosJogos'
import { MINIGAMES, type MinigameId } from '../src/core/minigames/types'
import type { VocabCard } from '../src/types'

function carta(word: string, translation: string): VocabCard {
  return {
    id: `c-${word}`,
    word,
    phonetics: '',
    translation,
    explanation: '',
    srcLang: 'en',
    tgtLang: 'pt',
    frequency: 'medium',
    leitnerBox: 1,
    leitnerDueAt: new Date(0).toISOString(),
    fsrsState: 'New',
    fsrsStability: 0,
    fsrsDifficulty: 5,
    fsrsPredictedRetention: 0,
    fsrsDueAt: new Date(0).toISOString(),
    inDeck: true,
  }
}

/** Palavras de comprimentos DISTINTOS e traduções distintas — passam pela triagem de qualidade. */
const CARTAS = [
  carta('house', 'casa'),
  carta('bread', 'pão'),
  carta('window', 'janela'),
  carta('table', 'mesa'),
  carta('chair', 'cadeira'),
  carta('garden', 'jardim'),
  carta('bottle', 'garrafa'),
  carta('mirror', 'espelho'),
]

/**
 * De 4 a 10 palavras: é a janela que `scramble.fraseJogavel` aceita. Frases longas demais tornariam
 * a frase embaralhada inelegível e o teste acusaria o código por um defeito da fixture.
 */
const FALAS = Array.from({ length: 12 }, (_, i) => ({
  id: `f${i}`,
  text: `But then she said that number ${i} again.`,
  translation: `Mas aí ela disse ${i} de novo.`,
  startMs: i * 4000,
  endMs: i * 4000 + 3000,
  lang: 'en',
}))

const BASE: EntradaDoEstado = {
  cartas: CARTAS,
  frases: FALAS,
  temAudio: true,
  temVoz: true,
  fonteId: 'sessao',
  lang: 'en',
}

const IDS = Object.keys(MINIGAMES) as MinigameId[]
const DE_FRASE = IDS.filter((id) => MINIGAMES[id].modalidade !== 'palavra')

describe('estado de cada jogo', () => {
  it('cobre os nove jogos, sem sobra nem falta', () => {
    const estados = estadoDeCadaJogo(BASE)
    expect(Object.keys(estados).sort()).toEqual([...IDS].sort())
    for (const id of IDS) expect(estados[id].id).toBe(id)
  })

  describe('na trilha, jogo de frase não finge ter falas', () => {
    const naTrilha: EntradaDoEstado = { ...BASE, fonteId: 'trilha' }

    it.each(DE_FRASE)('%s não conta as falas da gravação', (id) => {
      const e = estadoDoJogo(id, naTrilha)
      // O defeito original: `fonte: 'falas'` com `disponiveis: 12` na trilha, jogando o áudio de
      // outra fonte. Aqui, ou o jogo está bloqueado, ou passou a medir o BARALHO.
      if (e.fonte === 'falas') {
        expect(e.ok).toBe(false)
        expect(e.motivo).toBe('trilha-sem-frase')
        expect(e.disponiveis).toBe(0)
      } else {
        expect(e.fonte).toBe('baralho')
      }
    })

    it('quem não aceita palavra falada fica bloqueado com o motivo', () => {
      for (const id of DE_FRASE) {
        if (MINIGAMES[id].aceitaPalavraFalada) continue
        expect(estadoDoJogo(id, naTrilha).motivo).toBe('trilha-sem-frase')
      }
    })

    it('quem aceita palavra falada roda com o baralho — e só se houver voz', () => {
      for (const id of DE_FRASE) {
        if (!MINIGAMES[id].aceitaPalavraFalada) continue

        const comVoz = estadoDoJogo(id, naTrilha)
        expect(comVoz.fonte).toBe('baralho')
        expect(comVoz.disponiveis).toBe(CARTAS.length)
        expect(comVoz.motivo).toBeUndefined()

        const semVoz = estadoDoJogo(id, { ...naTrilha, temVoz: false })
        expect(semVoz.ok).toBe(false)
        expect(semVoz.disponiveis).toBe(0)
        // Sem TTS não se inventa áudio — e a carta diz por quê.
        expect(semVoz.motivo).toBe('sem-voz')
      }
    })
  })

  it('sem áudio na gravação, os jogos que precisam tocar som não abrem', () => {
    const mudo = estadoDeCadaJogo({ ...BASE, temAudio: false })
    for (const id of ['escuta', 'ditado', 'karaoke'] as MinigameId[]) {
      expect(mudo[id].disponiveis, id).toBe(0)
      expect(mudo[id].ok, id).toBe(false)
    }
    // A frase embaralhada é texto: continua jogável sem áudio nenhum.
    expect(estadoDeCadaJogo({ ...BASE, temAudio: false }).scramble.disponiveis).toBeGreaterThan(0)
  })

  it('caça-conectores só abre em idioma com lista de conectores', () => {
    expect(estadoDoJogo('conectores', BASE).disponiveis).toBeGreaterThan(0)
    // Idioma sem lista: zero, e sem inventar marcadores.
    expect(estadoDoJogo('conectores', { ...BASE, lang: 'xx' }).disponiveis).toBe(0)
  })

  it('o pool é medido SEM o teto do jogo — senão a carta não sabe dizer o tamanho do acervo', () => {
    // A Memória joga no máximo 8; com 8 cartas, `disponiveis` bate no teto mas o pool é o acervo.
    const e = estadoDoJogo('memory', BASE)
    expect(e.disponiveis).toBeLessThanOrEqual(MINIGAMES.memory.maxItems)
    expect(e.pool).toBeGreaterThanOrEqual(e.disponiveis)
  })

  it('faltam nunca é negativo, mesmo com acervo de sobra', () => {
    for (const e of Object.values(estadoDeCadaJogo(BASE))) {
      expect(e.faltam).toBeGreaterThanOrEqual(0)
      if (e.ok) expect(e.faltam).toBe(0)
    }
  })

  it('baralho vazio bloqueia tudo o que depende de palavra, com faltam = mínimo do jogo', () => {
    const vazio = estadoDeCadaJogo({ ...BASE, cartas: [], fonteId: 'baralho', frases: [] })
    for (const id of IDS) {
      expect(vazio[id].ok, id).toBe(false)
      expect(vazio[id].faltam, id).toBe(MINIGAMES[id].minItems)
    }
  })
})
