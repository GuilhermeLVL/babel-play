import { describe, expect, it } from 'vitest'

import { decidirNaVirtual, ESTADO_DA_VIRTUAL } from '../src/lib/captura/idiomasDaConversaVirtual'

const par = { meu: 'pt-BR', outro: 'en' }
const pistas = (p: Partial<{ idiomaDoMotor: string; idiomaDoTexto: string; confianca: number; audioMs: number }> = {}) => ({
  idiomaDoMotor: '',
  idiomaDoTexto: '',
  audioMs: 2500,
  ...p,
})

describe('conversa virtual: idioma de "Eles" fala a fala', () => {
  it('o idioma combinado: traduz dele para o meu', () => {
    const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'en', idiomaDoTexto: 'en' }), par, ESTADO_DA_VIRTUAL)
    expect(d).toMatchObject({ de: 'en', para: 'pt', semTraducao: false, palpite: false })
    expect(d.estado.ultimoDeles).toBe('en')
  })

  it('um terceiro idioma com evidência forte vira o destino da minha resposta', () => {
    const d = decidirNaVirtual(
      'eles',
      pistas({ idiomaDoMotor: 'ja', confianca: 0.9, audioMs: 3000 }),
      par,
      ESTADO_DA_VIRTUAL,
    )
    expect(d).toMatchObject({ de: 'ja', para: 'pt', semTraducao: false })
    const voce = decidirNaVirtual('voce', pistas(), par, d.estado)
    expect(voce).toMatchObject({ de: 'pt', para: 'ja', semTraducao: false })
  })

  it('fala curta e fraca não inventa idioma novo: fica no último que falou', () => {
    const antes = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'es', idiomaDoTexto: 'es' }), par, ESTADO_DA_VIRTUAL)
    const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'ko', confianca: 0.5, audioMs: 900 }), par, antes.estado)
    expect(d).toMatchObject({ de: 'es', palpite: true })
    expect(d.estado).toBe(antes.estado)
  })

  it('o motor trocou idioma vizinho, mas o texto aponta um já ouvido: vale o texto', () => {
    const antes = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'es', idiomaDoTexto: 'es' }), par, ESTADO_DA_VIRTUAL)
    const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'ca', idiomaDoTexto: 'es', audioMs: 1500 }), par, antes.estado)
    expect(d.de).toBe('es')
  })

  it('várias pessoas em idiomas diferentes: cada fala segue o seu, e a resposta vai para o último', () => {
    let estado = ESTADO_DA_VIRTUAL
    for (const l of ['en', 'es', 'fr']) {
      const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: l, idiomaDoTexto: l }), par, estado)
      expect(d.de).toBe(l)
      estado = d.estado
    }
    expect(decidirNaVirtual('voce', pistas(), par, estado).para).toBe('fr')
    /* Alguém volta ao inglês: a resposta acompanha. */
    const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'en', idiomaDoTexto: 'en' }), par, estado)
    expect(decidirNaVirtual('voce', pistas(), par, d.estado).para).toBe('en')
  })

  it('"Eles" falam o meu idioma: sem tradução, e a resposta continua indo para o último estrangeiro', () => {
    const en = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'en', idiomaDoTexto: 'en' }), par, ESTADO_DA_VIRTUAL)
    const d = decidirNaVirtual('eles', pistas({ idiomaDoMotor: 'pt', idiomaDoTexto: 'pt' }), par, en.estado)
    expect(d).toMatchObject({ de: 'pt', para: 'pt', semTraducao: true })
    expect(decidirNaVirtual('voce', pistas(), par, d.estado).para).toBe('en')
  })

  it('sem nenhuma pista usa o combinado', () => {
    const d = decidirNaVirtual('eles', pistas({ audioMs: 500 }), par, ESTADO_DA_VIRTUAL)
    expect(d).toMatchObject({ de: 'en', para: 'pt', palpite: true })
  })
})

describe('conversa virtual: idioma de "Você"', () => {
  it('antes de ouvir alguém, a resposta vai para o idioma combinado', () => {
    expect(decidirNaVirtual('voce', pistas(), par, ESTADO_DA_VIRTUAL)).toMatchObject({ de: 'pt', para: 'en' })
  })

  it('se já falo o idioma do destino, não traduz', () => {
    const d = decidirNaVirtual('voce', pistas({ idiomaDoMotor: 'en', idiomaDoTexto: 'en' }), par, ESTADO_DA_VIRTUAL)
    expect(d).toMatchObject({ de: 'en', para: 'en', semTraducao: true })
  })

  it('um palpite do motor sozinho não vira o idioma de quem fala', () => {
    const d = decidirNaVirtual('voce', pistas({ idiomaDoMotor: 'en' }), par, ESTADO_DA_VIRTUAL)
    expect(d).toMatchObject({ de: 'pt', para: 'en', semTraducao: false })
  })
})
