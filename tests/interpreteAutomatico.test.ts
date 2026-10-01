/**
 * O MODO AUTOMÁTICO DO INTÉRPRETE (E7 da Fase E; pedido do dono, 30/09): ninguém toca em lado. O
 * idioma de cada fala é medido pelo áudio, e é ele que diz de que metade a fala veio e para qual
 * idioma traduzir.
 *
 *   - o idioma medido é um dos dois da conversa → o lado dele, traduzido para o do outro;
 *   - o motor errou por pouco (fala curta) mas o texto é de um dos dois → vale o do texto;
 *   - um TERCEIRO idioma, com evidência forte (motor e texto concordam, ou fala longa e confiante), é
 *     de "outra pessoa": traduzido para o idioma do dono do aparelho; e a resposta do dono vai para
 *     esse idioma, até a outra pessoa voltar ao idioma combinado;
 *   - sem evidência: a conversa alterna (quem não falou por último).
 */
import { describe, expect, it } from 'vitest'

import { decidirLadoDaFala, ESTADO_DO_AUTOMATICO } from '../src/lib/captura/interpreteAutomatico'

const IDIOMAS = { meu: 'pt-BR', outro: 'en-US' }
const pistas = (p: Partial<Parameters<typeof decidirLadoDaFala>[0]> = {}) => ({
  idiomaDoMotor: '',
  idiomaDoTexto: '',
  audioMs: 3000,
  ...p,
})

describe('decidirLadoDaFala: o idioma medido diz o lado', () => {
  it('o meu idioma: o meu lado, traduzido para o do outro', () => {
    const d = decidirLadoDaFala(pistas({ idiomaDoMotor: 'pt' }), IDIOMAS, ESTADO_DO_AUTOMATICO)
    expect(d).toMatchObject({ lado: 'meu', de: 'pt', para: 'en', fala: 'en-US', terceiro: false, palpite: false })
  })

  it('o idioma do outro: o lado dele, traduzido para o meu', () => {
    const d = decidirLadoDaFala(pistas({ idiomaDoMotor: 'en' }), IDIOMAS, ESTADO_DO_AUTOMATICO)
    expect(d).toMatchObject({ lado: 'outro', de: 'en', para: 'pt', fala: 'pt-BR', terceiro: false })
  })

  it('o motor mediu outro idioma numa fala curta, mas o texto é português: vale o texto', () => {
    const d = decidirLadoDaFala(
      pistas({ idiomaDoMotor: 'gl', idiomaDoTexto: 'pt', audioMs: 900 }),
      IDIOMAS,
      ESTADO_DO_AUTOMATICO,
    )
    expect(d).toMatchObject({ lado: 'meu', de: 'pt', para: 'en', terceiro: false })
  })
})

describe('decidirLadoDaFala: um terceiro idioma', () => {
  it('motor e texto concordam no espanhol: é a outra pessoa, traduzida para o meu idioma', () => {
    const d = decidirLadoDaFala(pistas({ idiomaDoMotor: 'es', idiomaDoTexto: 'es' }), IDIOMAS, ESTADO_DO_AUTOMATICO)
    expect(d).toMatchObject({ lado: 'outro', de: 'es', para: 'pt', fala: 'pt-BR', terceiro: true })
    expect(d.estado.estrangeiro).toBe('es')
  })

  it('depois dele, a minha resposta vai para o espanhol (e é lida em espanhol)', () => {
    const a = decidirLadoDaFala(pistas({ idiomaDoMotor: 'es', idiomaDoTexto: 'es' }), IDIOMAS, ESTADO_DO_AUTOMATICO)
    const b = decidirLadoDaFala(pistas({ idiomaDoMotor: 'pt' }), IDIOMAS, a.estado)
    expect(b).toMatchObject({ lado: 'meu', de: 'pt', para: 'es' })
    expect(b.fala.toLowerCase().startsWith('es')).toBe(true)
  })

  it('a outra pessoa volta ao inglês: a minha resposta volta a ir para o inglês', () => {
    let e = decidirLadoDaFala(
      pistas({ idiomaDoMotor: 'es', idiomaDoTexto: 'es' }),
      IDIOMAS,
      ESTADO_DO_AUTOMATICO,
    ).estado
    e = decidirLadoDaFala(pistas({ idiomaDoMotor: 'en' }), IDIOMAS, e).estado
    expect(decidirLadoDaFala(pistas({ idiomaDoMotor: 'pt' }), IDIOMAS, e).para).toBe('en')
  })

  it('fala curta com o motor sozinho dizendo galego NÃO vira terceiro idioma: é palpite pela alternância', () => {
    const d = decidirLadoDaFala(pistas({ idiomaDoMotor: 'gl', audioMs: 800 }), IDIOMAS, {
      ...ESTADO_DO_AUTOMATICO,
      ultimoLado: 'outro',
    })
    expect(d).toMatchObject({ lado: 'meu', de: 'pt', para: 'en', terceiro: false, palpite: true })
  })

  it('fala longa e confiante num terceiro idioma, sem o detector de texto: vale', () => {
    const d = decidirLadoDaFala(
      pistas({ idiomaDoMotor: 'fr', confianca: 0.93, audioMs: 4000 }),
      IDIOMAS,
      ESTADO_DO_AUTOMATICO,
    )
    expect(d).toMatchObject({ lado: 'outro', de: 'fr', para: 'pt', terceiro: true })
  })
})

describe('decidirLadoDaFala: sem evidência, a conversa alterna', () => {
  it('ninguém falou ainda: o dono do aparelho fala primeiro', () => {
    expect(decidirLadoDaFala(pistas(), IDIOMAS, ESTADO_DO_AUTOMATICO)).toMatchObject({ lado: 'meu', palpite: true })
  })

  it('quem falou por último fui eu: agora é o outro', () => {
    const d = decidirLadoDaFala(pistas(), IDIOMAS, { ...ESTADO_DO_AUTOMATICO, ultimoLado: 'meu' })
    expect(d).toMatchObject({ lado: 'outro', de: 'en', para: 'pt', palpite: true })
  })

  it('o estado guarda quem falou por último', () => {
    const d = decidirLadoDaFala(pistas({ idiomaDoMotor: 'en' }), IDIOMAS, ESTADO_DO_AUTOMATICO)
    expect(d.estado.ultimoLado).toBe('outro')
  })
})
