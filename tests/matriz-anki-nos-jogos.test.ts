/**
 * A MATRIZ JOGO × DADOS do `motor-anki-jogos` (design.md, "A matriz jogo × dados"), UM CASO POR LINHA, contra o gate
 * `estadoDeCadaJogo` com um BARALHO como fonte (`fonteId: 'baralho'`, frases de exemplo do acervo sem clipe, voz do
 * navegador disponível).
 *
 * Nove jogos (as nove linhas da matriz) × quatro cenários do baralho: completo, sem tradução, sem frase e escrita não
 * latina. Cada célula diz se o jogo abre e, quando não abre por um motivo que não é só "faltam N", qual motivo. A função
 * que decide cada linha está no comentário da linha; nenhuma regra é repetida aqui, só a conclusão dela.
 *
 * Os cenários usam o que o Anki entrega de verdade: a frase de exemplo do acervo vem SEM tradução (`frasesDoAcervo`), por
 * isso a Frase embaralhada só abre no cenário "completo", onde a frase tem tradução.
 */
import { describe, expect, it } from 'vitest'

import { type EntradaDoEstado, estadoDeCadaJogo, type MotivoBloqueio } from '../src/core/minigames/estadoDosJogos'
import { frasesDoAcervo } from '../src/core/minigames/source'
import type { MinigameId } from '../src/core/minigames/types'
import type { VocabCard } from '../src/types'

const carta = (word: string, extra: Partial<VocabCard> = {}): VocabCard => ({
  id: `c-${word}`,
  word,
  phonetics: '',
  translation: '',
  explanation: '',
  srcLang: 'en',
  cefrLevel: 'A1',
  cefrConfidence: 1,
  inDeck: true,
  leitnerBox: 1,
  leitnerDueAt: '',
  fsrsState: 'New',
  fsrsStability: 0,
  fsrsDifficulty: 5,
  fsrsPredictedRetention: 0.9,
  fsrsDueAt: '',
  ...extra,
})

const PALAVRAS = ['house', 'bread', 'table', 'chair', 'plant', 'water', 'light', 'music']
const TRADUCOES = ['casa', 'pão', 'mesa', 'cadeira', 'planta', 'água', 'luz', 'música']
const RUSSAS = ['дом', 'хлеб', 'стол', 'стул', 'вода', 'свет', 'окно', 'мама']

const ID_DOS_NOVE = [
  'memory',
  'wordsearch',
  'blitz',
  'termo',
  'scramble',
  'escuta',
  'ditado',
  'karaoke',
  'conectores',
] as const satisfies readonly MinigameId[]
type Jogo = (typeof ID_DOS_NOVE)[number]

type Cenario = 'completo' | 'sem tradução' | 'sem frase' | 'escrita não latina'

/** O baralho de cada cenário, já no formato de `EntradaDoEstado` (com voz e sem gravação). */
function entradaDo(cenario: Cenario): EntradaDoEstado {
  const nao = cenario === 'escrita não latina'
  const lang = nao ? 'ru' : 'en'
  const cartas = (nao ? RUSSAS : PALAVRAS).map((w, i) =>
    carta(w, {
      srcLang: lang,
      translation: cenario === 'sem tradução' ? '' : TRADUCOES[i],
      sentence:
        cenario === 'sem frase'
          ? undefined
          : nao
            ? `Но я очень люблю ${w} номер ${i} сегодня`
            : `But I really like the ${w} number ${i} very much`,
    }),
  )
  let frases = frasesDoAcervo(cartas, lang)
  // O "completo" tem tradução da frase (o acervo do Anki, sozinho, não a traz: ver o cenário "sem tradução").
  if (cenario === 'completo') frases = frases.map((f, i) => ({ ...f, translation: `Eu gosto muito disso ${i}` }))
  return { cartas, frases, falasSoDoAcervo: frases.length > 0, temAudio: false, temVoz: true, fonteId: 'baralho', lang }
}

type Esperado = { ok: boolean; motivo?: MotivoBloqueio }
const abre: Esperado = { ok: true }
const fora: Esperado = { ok: false }
const foraPor = (motivo: MotivoBloqueio): Esperado => ({ ok: false, motivo })

/**
 * A matriz, linha a linha (jogo) e coluna a coluna (cenário). Quem decide cada linha:
 *
 *  - memory: `MINIGAMES.memory.requiresTranslation` + `canPlay` (itemSource) — sem tradução, o item fica fora.
 *  - wordsearch: `requisitos.alfabeto: 'latino'` → `alfabeto-nao-suportado`; sem tradução nem frase, sem pista.
 *  - blitz: `promptFor` — tradução OU frase com lacuna; só some quando não há nenhuma das duas.
 *  - termo: `contarJogaveisMulti` + o mesmo requisito de alfabeto; exige tradução.
 *  - scramble: `buildScrambleRounds` — frase de 4 a 10 palavras COM tradução.
 *  - escuta e ditado: `buildRodadasEscuta`/`buildRodadasDitado` com a frase falada por TTS (`falasSoDoAcervo` + `temVoz`).
 *  - karaoke: a frase do baralho não tem clipe → `sem-clipe-de-audio` (só quando há frase; sem frase é "faltam N").
 *  - conectores: `temConectores(lang)` + frase com conector; idioma sem lista não abre.
 */
const MATRIZ: Record<Jogo, Record<Cenario, Esperado>> = {
  memory: { completo: abre, 'sem tradução': fora, 'sem frase': abre, 'escrita não latina': abre },
  wordsearch: {
    completo: abre,
    'sem tradução': fora,
    'sem frase': abre,
    'escrita não latina': foraPor('alfabeto-nao-suportado'),
  },
  blitz: { completo: abre, 'sem tradução': abre, 'sem frase': abre, 'escrita não latina': abre },
  termo: {
    completo: abre,
    'sem tradução': fora,
    'sem frase': abre,
    'escrita não latina': foraPor('alfabeto-nao-suportado'),
  },
  scramble: { completo: abre, 'sem tradução': fora, 'sem frase': fora, 'escrita não latina': fora },
  escuta: { completo: abre, 'sem tradução': abre, 'sem frase': fora, 'escrita não latina': abre },
  ditado: { completo: abre, 'sem tradução': abre, 'sem frase': fora, 'escrita não latina': abre },
  karaoke: {
    completo: foraPor('sem-clipe-de-audio'),
    'sem tradução': foraPor('sem-clipe-de-audio'),
    'sem frase': fora,
    'escrita não latina': foraPor('sem-clipe-de-audio'),
  },
  conectores: { completo: abre, 'sem tradução': abre, 'sem frase': fora, 'escrita não latina': fora },
}

const CENARIOS: Cenario[] = ['completo', 'sem tradução', 'sem frase', 'escrita não latina']

describe('matriz do motor-anki-jogos: nove jogos × quatro cenários do baralho', () => {
  it('a matriz tem as nove linhas e as quatro colunas (uma linha esquecida passaria em tudo sem testar nada)', () => {
    expect(Object.keys(MATRIZ).sort()).toEqual([...ID_DOS_NOVE].sort())
    for (const jogo of ID_DOS_NOVE) expect(Object.keys(MATRIZ[jogo]).sort()).toEqual([...CENARIOS].sort())
  })

  for (const cenario of CENARIOS) {
    describe(`baralho ${cenario}`, () => {
      const estados = estadoDeCadaJogo(entradaDo(cenario))
      it.each(ID_DOS_NOVE)('%s', (jogo) => {
        const esperado = MATRIZ[jogo][cenario]
        const e = estados[jogo]
        expect(e.ok, `${jogo} × ${cenario}: ok`).toBe(esperado.ok)
        expect(e.motivo, `${jogo} × ${cenario}: motivo`).toBe(esperado.motivo)
        // "Nunca apresentar item quebrado": jogo fechado não promete rodada; jogo aberto promete pelo menos o mínimo.
        if (!e.ok) expect(e.tamanhoDaRodada).toBe(0)
        else expect(e.tamanhoDaRodada).toBeGreaterThan(0)
      })
    })
  }
})

describe('motivo quando o baralho não serve ao jogo (2.2)', () => {
  it('baralho sem frases: os cinco jogos de frase ficam fechados, sem prometer item (o motivo é a contagem do gate)', () => {
    const e = estadoDeCadaJogo(entradaDo('sem frase'))
    for (const jogo of ['scramble', 'escuta', 'ditado', 'karaoke', 'conectores'] as const) {
      expect(e[jogo].ok, jogo).toBe(false)
      expect(e[jogo].fonte, jogo).toBe('falas')
      expect(e[jogo].disponiveis, jogo).toBe(0)
      expect(e[jogo].faltam, jogo).toBeGreaterThan(0)
    }
  })

  it('baralho com frases e SEM voz: escuta e ditado dizem `sem-voz` (antes ficavam sem motivo)', () => {
    const e = estadoDeCadaJogo({ ...entradaDo('completo'), temVoz: false })
    expect(e.escuta).toMatchObject({ ok: false, motivo: 'sem-voz' })
    expect(e.ditado).toMatchObject({ ok: false, motivo: 'sem-voz' })
    // O Karaokê continua dizendo o seu: a falta é de clipe, não de voz.
    expect(e.karaoke.motivo).toBe('sem-clipe-de-audio')
    // Os de palavra não dependem da voz.
    expect(e.memory.ok).toBe(true)
  })

  it('baralho SEM frases e sem voz: não inventa `sem-voz` (falta frase, e a voz não resolveria)', () => {
    const e = estadoDeCadaJogo({ ...entradaDo('sem frase'), temVoz: false })
    expect(e.escuta.motivo).toBeUndefined()
    expect(e.ditado.motivo).toBeUndefined()
  })
})
