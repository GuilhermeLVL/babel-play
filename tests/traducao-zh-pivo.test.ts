import { describe, expect, it } from 'vitest'

import { juntarFrases, separarEmFrases } from '../src/core/texto/frases'
import { modeloParaOIngles, MODELOS_PARA_O_INGLES } from '../src/core/traducao/viaIngles'
import { expectedModelIds } from '../src/gateway/modelCache'
import { REVISOES_DOS_MODELOS } from '../src/gateway/revisoesDosModelos'

/**
 * O CHINÊS TRADUZ NO APARELHO, PASSANDO PELO INGLÊS. Sem isto, sem o consentimento de nuvem, a fala em mandarim
 * era transcrita e ficava SEM tradução (o tradutor da web exige o consentimento). Aqui: a frase chinesa é separada
 * como o opus-mt precisa (uma por chamada) e a lista de download traz os dois modelos do pivô.
 */
describe('separarEmFrases: chinês e japonês', () => {
  it('quebra em 。！？ mesmo sem espaço depois (essas escritas não têm espaço nem maiúscula)', () => {
    expect(separarEmFrases('我喜欢学习中文。今天天气很好！我们去公园吧？')).toEqual([
      '我喜欢学习中文。',
      '今天天气很好！',
      '我们去公园吧？',
    ])
  })

  it('absorve terminadores repetidos e não perde texto', () => {
    const partes = separarEmFrases('真的吗？！我不相信。')
    expect(juntarFrases(partes).replace(/\s/g, '')).toBe('真的吗？！我不相信。')
    expect(partes).toHaveLength(2)
  })

  it('a vírgula do chinês (，) não quebra a frase', () => {
    expect(separarEmFrases('今天天气很好，我们去公园散步吧。')).toEqual(['今天天气很好，我们去公园散步吧。'])
  })

  it('o ponto final do japonês também quebra', () => {
    expect(separarEmFrases('今日は車を買いたいです。明日は雨です。')).toHaveLength(2)
  })

  it('o comportamento dos idiomas com espaço não muda', () => {
    expect(separarEmFrases('My doctor said I am fine. She was very kind.')).toEqual([
      'My doctor said I am fine.',
      'She was very kind.',
    ])
    expect(separarEmFrases('Dr. Silva chegou. Sentou.')).toEqual(['Dr. Silva chegou.', 'Sentou.'])
    expect(separarEmFrases('Pi vale 3.14 mais ou menos')).toEqual(['Pi vale 3.14 mais ou menos'])
  })
})

describe('separarEmFrases: idiomas sem maiúscula (coreano, árabe)', () => {
  it('o ponto seguido de letra sem maiúscula separa a frase (hangul)', () => {
    expect(separarEmFrases('저는 언어를 공부하는 것을 좋아해요. 오늘은 날씨가 좋으니까 공원에 산책하러 가요.')).toEqual(
      ['저는 언어를 공부하는 것을 좋아해요.', '오늘은 날씨가 좋으니까 공원에 산책하러 가요.'],
    )
  })

  it('o ponto de interrogação árabe (؟) também termina a frase', () => {
    expect(separarEmFrases('هل تحب دراسة اللغات؟ الطقس جميل اليوم.')).toEqual([
      'هل تحب دراسة اللغات؟',
      'الطقس جميل اليوم.',
    ])
  })

  it('minúscula depois do ponto, em alfabeto com maiúscula, continua sendo a mesma frase (abreviação ou erro)', () => {
    expect(separarEmFrases('Eu vi o sr. silva ontem. Ele estava bem.')).toEqual([
      'Eu vi o sr. silva ontem.',
      'Ele estava bem.',
    ])
  })
})

describe('os idiomas que passam pelo inglês: modelos e revisões', () => {
  const ids = Object.entries(MODELOS_PARA_O_INGLES)

  it.each(ids)('%s tem o modelo Xenova/opus-mt-%s-en, com a revisão fixada', (lang, modelo) => {
    expect(modelo).toBe(`Xenova/opus-mt-${lang}-en`)
    expect(REVISOES_DOS_MODELOS[modelo], modelo).toMatch(/^[0-9a-f]{40}$/)
  })

  it('o hindi e o vietnamita ficam de fora (saíram piores que a internet)', () => {
    expect(modeloParaOIngles('hi')).toBeNull()
    expect(modeloParaOIngles('vi')).toBeNull()
  })

  it('ja-JP, ko_KR e zh-TW chegam pela base do idioma', () => {
    expect(modeloParaOIngles('ja-JP')).toBe('Xenova/opus-mt-ja-en')
    expect(modeloParaOIngles('ko_KR')).toBe('Xenova/opus-mt-ko-en')
    expect(modeloParaOIngles('zh-TW')).toBe('Xenova/opus-mt-zh-en')
    expect(modeloParaOIngles('pt-BR')).toBeNull()
  })

  it('a lista de download do japonês para o português traz ja-en e en→pt', () => {
    expect(expectedModelIds('ja-JP', 'pt-BR', 'whisper-x').slice(1)).toEqual([
      'Xenova/opus-mt-ja-en',
      'Xenova/opus-mt-en-ROMANCE',
    ])
    expect(expectedModelIds('ko', 'en', 'whisper-x').slice(1)).toEqual(['Xenova/opus-mt-ko-en'])
  })
})

describe('expectedModelIds: chinês', () => {
  const sem = (ids: string[]) => ids.slice(1) // o primeiro é o modelo de transcrição

  it('zh → pt baixa zh-en e en→pt (o ROMANCE)', () => {
    expect(sem(expectedModelIds('zh-CN', 'pt-BR', 'whisper-x'))).toEqual([
      'Xenova/opus-mt-zh-en',
      'Xenova/opus-mt-en-ROMANCE',
    ])
  })

  it.each(['es', 'fr', 'it', 'de'])('zh → %s baixa zh-en e o modelo dedicado en→%s', (t) => {
    expect(sem(expectedModelIds('zh', t, 'whisper-x'))).toEqual(['Xenova/opus-mt-zh-en', `Xenova/opus-mt-en-${t}`])
  })

  it('zh → en baixa só o zh-en', () => {
    expect(sem(expectedModelIds('zh', 'en', 'whisper-x'))).toEqual(['Xenova/opus-mt-zh-en'])
  })

  it('os pares que já existiam seguem iguais', () => {
    expect(sem(expectedModelIds('en', 'pt', 'whisper-x'))).toEqual(['Xenova/opus-mt-en-ROMANCE'])
    expect(sem(expectedModelIds('es', 'en', 'whisper-x'))).toEqual(['Xenova/opus-mt-ROMANCE-en'])
  })

  it('todo modelo do pivô tem revisão fixada (cadeia de suprimentos)', () => {
    for (const id of sem(expectedModelIds('zh', 'pt', 'whisper-x'))) expect(REVISOES_DOS_MODELOS[id], id).toBeTruthy()
  })
})
