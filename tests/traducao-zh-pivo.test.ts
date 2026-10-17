import { describe, expect, it } from 'vitest'

import { juntarFrases, separarEmFrases } from '../src/core/texto/frases'
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
