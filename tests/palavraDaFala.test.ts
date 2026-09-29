/**
 * A PALAVRA DA FALA, pelo lado das Legendas flutuantes (ei/leg): a glosa da palavra tocada sai do
 * MESMO `buildVocabWord` do Analista (sem abrir o painel nem falar), e o fichamento devolve o que
 * disse — a janelinha na PiP não vê o aviso da tela principal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildVocabWord = vi.fn()
const bulkAddCards = vi.fn()
vi.mock('../src/lib/vocabWord', () => ({
  buildVocabWord: (...a: unknown[]) => buildVocabWord(...a),
  resolveWord: async (o: { word: string; declaredLang?: string }) => ({
    word: o.word,
    lang: o.declaredLang || 'en',
    targetLang: 'pt',
    langSource: 'declared',
    coverage: 'full',
  }),
  cardLangs: () => ({ srcLang: 'en', tgtLang: 'pt' }),
}))
vi.mock('../src/data/api', () => ({ bulkAddCards: (...a: unknown[]) => bulkAddCards(...a) }))

import { criarPalavraDaFala } from '../src/lib/captura/palavraDaFala'

const mt = { translate: vi.fn(async () => ({ text: 'olá', engine: 'x' })) }
const deps = () => ({
  gateway: { mt } as never,
  langConfigRef: { current: { mine: 'pt', studying: 'en' } },
  targetLangRef: { current: 'en' },
  selectedWordLangRef: { current: '' },
  speakWord: vi.fn(),
  setSelectedExamWord: vi.fn(),
  addedWords: [],
  setAddedWords: vi.fn(),
  setFeedbackMsg: vi.fn(),
})

beforeEach(() => {
  buildVocabWord.mockReset()
  bulkAddCards.mockReset()
})

describe('glosaDaPalavra', () => {
  it('consulta pelo caminho do Analista, com a frase e o idioma da linha, sem falar nem abrir o painel', async () => {
    buildVocabWord.mockResolvedValue({ vocab: { word: 'there', translation: 'lá', lang: 'en' } })
    const d = deps()
    const r = await criarPalavraDaFala(d).glosaDaPalavra('there', 'Hello there.', 'en')
    expect(r).toEqual({ traducao: 'lá' })
    expect(buildVocabWord).toHaveBeenCalledWith(
      { word: 'there', context: 'Hello there.', declaredLang: 'en', config: { mine: 'pt', studying: 'en' } },
      mt,
    )
    expect(d.speakWord).not.toHaveBeenCalled()
    expect(d.setSelectedExamWord).not.toHaveBeenCalled()
  })

  it('sem glosa: tradução vazia (a janela diz "sem tradução"), não um erro', async () => {
    buildVocabWord.mockResolvedValue({ vocab: { word: 'zzz', translation: '' } })
    expect(await criarPalavraDaFala(deps()).glosaDaPalavra('zzz', '')).toEqual({ traducao: '' })
  })
})

describe('handleAddWordToDeck devolve o que o fichamento disse', () => {
  it('entrou', async () => {
    bulkAddCards.mockResolvedValue({ cards: [{}], skipped: [] })
    const d = deps()
    const msg = await criarPalavraDaFala(d).handleAddWordToDeck({ word: 'there', translation: 'lá', lang: 'en' })
    expect(msg).toBe('"there" adicionado ao seu deck (FSRS)!')
    expect(d.setFeedbackMsg).toHaveBeenCalledWith(msg)
  })

  it('recusado pela régua', async () => {
    bulkAddCards.mockResolvedValue({ cards: [], skipped: [{ motivo: 'duplicada' }] })
    const msg = await criarPalavraDaFala(deps()).handleAddWordToDeck({ word: 'there', translation: 'lá', lang: 'en' })
    expect(msg).toBe('"there" não entrou: já está no seu baralho.')
  })

  it('falha de rede', async () => {
    bulkAddCards.mockRejectedValue(new Error('rede'))
    const msg = await criarPalavraDaFala(deps()).handleAddWordToDeck({ word: 'there', translation: 'lá', lang: 'en' })
    expect(msg).toBe('Falha ao adicionar "there" ao deck.')
  })
})
