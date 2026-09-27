/**
 * O REPARO NÃO INVENTA IDIOMA (achado da QA dos jogos, 26/09/2026): numa sessão só em português, o
 * reparo local reclassificou cartões como tcheco e romeno, porque decidia pela FRASE de exemplo
 * (4–5 palavras) com o detector heurístico, e aceitava qualquer idioma que ele devolvesse.
 *
 * Regras: numa sessão com evidência clara, o cartão segue o idioma da sessão; e nenhuma
 * reclassificação sai do par de idiomas da sessão sem confiança alta em texto longo.
 */
import { describe, expect, it } from 'vitest'

import { planejarReparoDeIdioma } from '../src/core/texto/reparoDeIdioma'

const falasPt = [
  'Eu vou para a escola amanhã cedo com a minha irmã',
  'A cidade está muito cheia hoje por causa da festa',
  'A viagem foi longa e cansativa mas valeu a pena',
  'Tenho muito trabalho esta semana e não posso sair',
].map((t, i) => ({ id: `f${i}`, sessionId: 's1', sourceLang: 'pt', sourceText: t }))

const cartao = (id: string, word: string, sentence: string) => ({
  id,
  word,
  sentence,
  srcLang: 'pt',
  tgtLang: 'en-US',
  sessionId: 's1',
})

describe('reparo dentro dos idiomas plausíveis', () => {
  it('sessão só em português: nenhum cartão vira tcheco/romeno pela frase curta', () => {
    const plano = planejarReparoDeIdioma({
      sessoes: [{ id: 's1', sourceLang: 'pt', targetLang: 'en-US' }],
      falas: falasPt,
      cartoes: [
        cartao('c1', 'viagem', 'A viagem foi longa e cansativa'),
        cartao('c2', 'cidade', 'A cidade está muito cheia hoje'),
        cartao('c3', 'escola', 'Eu vou para a escola amanhã'),
        cartao('c4', 'trabalho', 'Tenho muito trabalho esta semana'),
      ],
    })
    expect(plano.cartoes).toEqual([])
    expect(plano.falas).toEqual([])
  })

  it('cartão etiquetado errado numa sessão portuguesa volta para pt, não para outro idioma', () => {
    const plano = planejarReparoDeIdioma({
      sessoes: [{ id: 's1', sourceLang: 'pt', targetLang: 'en-US' }],
      falas: falasPt,
      cartoes: [{ ...cartao('c1', 'viagem', 'A viagem foi longa e cansativa'), srcLang: 'en' }],
    })
    expect(plano.cartoes.map((c) => c.srcPara)).toEqual(['pt'])
  })

  it('fala curta não é reclassificada para idioma fora do par da sessão', () => {
    const plano = planejarReparoDeIdioma({
      sessoes: [{ id: 's1', sourceLang: 'pt', targetLang: 'en-US' }],
      falas: [{ id: 'f1', sessionId: 's1', sourceLang: 'pt', sourceText: 'A viagem foi longa e cansativa' }],
      cartoes: [],
    })
    expect(plano.falas).toEqual([])
  })
})
