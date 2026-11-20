/**
 * A LEGENDA SEGURA (change `legenda-segura-para-menores`, achado COMP-02): a função pura que troca só o termo sensível
 * por `•••`, e a política por perfil.
 */
import { describe, expect, it } from 'vitest'

import {
  MARCADOR,
  ocultarTermos,
  POLITICA_DESLIGADA,
  politicaDaLegenda,
  semMarcador,
} from '../src/core/moderacao/legendaSegura'
import negativos from './fixtures/legenda-segura/negativos.json'
import positivos from './fixtures/legenda-segura/positivos.json'

const PROTEGIDO = politicaDaLegenda({ protegido: true, opcaoDoAdulto: false })
const ADULTO = politicaDaLegenda({ protegido: false, opcaoDoAdulto: false })
const ADULTO_COM_OPCAO = politicaDaLegenda({ protegido: false, opcaoDoAdulto: true })

describe('ocultarTermos — a fala da auditoria (COMP-02)', () => {
  it('troca só o termo, no original e na tradução', () => {
    const o = ocultarTermos('reveal the porn quest together', PROTEGIDO)
    expect(o.texto).toBe('reveal the ••• quest together')
    expect(o.ocultadas).toBe(1)
    expect(o.categorias).toEqual(['sexual'])
    const t = ocultarTermos('revelar a busca pornô juntos', PROTEGIDO)
    expect(t.texto).toBe('revelar a busca ••• juntos')
    expect(t.ocultadas).toBe(1)
  })

  it('o adulto sem a opção vê como veio; com a opção, como o protegido', () => {
    expect(ocultarTermos('reveal the porn quest together', ADULTO)).toEqual({
      texto: 'reveal the porn quest together',
      ocultadas: 0,
      categorias: [],
    })
    expect(ocultarTermos('reveal the porn quest together', ADULTO_COM_OPCAO).texto).toBe(
      'reveal the ••• quest together',
    )
  })
})

describe('ocultarTermos — variantes de escrita', () => {
  it.each([
    ['Look at this p0rn0 site.', 'Look at this ••• site.'],
    ['Look at this P O R N site.', 'Look at this ••• site.'],
    ['Es pornografía, ¿no?', 'Es •••, ¿no?'],
    ['PORN!', '•••!'],
    ['"porn", she said.', '"•••", she said.'],
    ['p.o.r.n is bad', '••• is bad'],
    [`a p${String.fromCharCode(0x200b)}orn clip`, 'a ••• clip'],
    ['Fuuuck, that hurt.', '•••, that hurt.'],
    ['porn-star life', '••• life'],
    ['The P O R N O G R A F I A thing', 'The ••• thing'],
  ])('%s → %s', (entrada, saida) => {
    expect(ocultarTermos(entrada, PROTEGIDO).texto).toBe(saida)
  })

  it('pares de palavras viram um marcador só', () => {
    const o = ocultarTermos('They shouted sieg heil at the game.', PROTEGIDO)
    expect(o.texto).toBe('They shouted ••• at the game.')
    expect(o.ocultadas).toBe(1)
  })

  it('preserva maiúsculas, acentos e pontuação do resto', () => {
    expect(ocultarTermos('Olá, Ana! Que merda é essa? Não sei.', PROTEGIDO).texto).toBe(
      'Olá, Ana! Que ••• é essa? Não sei.',
    )
  })

  it('conta cada ocultação', () => {
    const o = ocultarTermos('porn, shit and nigger', PROTEGIDO)
    expect(o.texto).toBe('•••, ••• and •••')
    expect(o.ocultadas).toBe(3)
    expect([...o.categorias].sort()).toEqual(['odio', 'palavrao', 'sexual'])
  })
})

describe('ocultarTermos — palavra ambígua de aula passa', () => {
  it.each([
    'o sexo feminino',
    'sex education',
    'the fag end of the day',
    'veado',
    'Vimos um veado no parque.',
    'por no tener tiempo',
    'Computação é legal, disputa também.',
    'The I Ching is an old book.',
    'Cum laude, with honors.',
    'A blue tit landed on the cone.',
    'Moby Dick is a novel.',
    'top 10 da semana',
    'a e i o u',
  ])('%s', (frase) => {
    expect(ocultarTermos(frase, PROTEGIDO)).toEqual({ texto: frase, ocultadas: 0, categorias: [] })
  })
})

describe('ocultarTermos — palavrão só no perfil protegido', () => {
  it('protegido oculta, adulto com a opção não', () => {
    expect(ocultarTermos('Que merda!', PROTEGIDO).texto).toBe('Que •••!')
    expect(ocultarTermos('Que merda!', ADULTO_COM_OPCAO).texto).toBe('Que merda!')
  })
})

describe('corpus', () => {
  it('negativos: pelo menos 300 frases e 0 ocultações', () => {
    expect(negativos.length).toBeGreaterThanOrEqual(300)
    const escaparam = negativos.filter((f) => ocultarTermos(f, PROTEGIDO).ocultadas > 0)
    expect(escaparam).toEqual([])
  })

  it('positivos: pelo menos 20 por idioma e 100% ocultados', () => {
    for (const lang of ['pt', 'en', 'es'] as const) {
      expect(positivos.filter((p) => p.lang === lang).length).toBeGreaterThanOrEqual(20)
    }
    const passaram = positivos.filter((p) => {
      const o = ocultarTermos(p.texto, PROTEGIDO)
      return o.ocultadas === 0 || !o.texto.includes(MARCADOR)
    })
    expect(passaram).toEqual([])
  })
})

describe('politicaDaLegenda', () => {
  it('a tabela perfil → política', () => {
    expect(PROTEGIDO.ligada).toBe(true)
    expect([...PROTEGIDO.categorias].sort()).toEqual(['odio', 'palavrao', 'sexual'])
    expect(politicaDaLegenda({ protegido: true, opcaoDoAdulto: false }).travada).toBe(true)
    expect(ADULTO).toEqual(POLITICA_DESLIGADA)
    expect(ADULTO.ligada).toBe(false)
    expect(ADULTO_COM_OPCAO.ligada).toBe(true)
    expect(ADULTO_COM_OPCAO.travada).toBe(false)
    expect([...ADULTO_COM_OPCAO.categorias].sort()).toEqual(['odio', 'sexual'])
  })
})

describe('semMarcador (a voz do intérprete)', () => {
  it('tira o marcador e o espaço que sobra', () => {
    expect(semMarcador('revelar a busca ••• juntos')).toBe('revelar a busca juntos')
    expect(semMarcador('•••, que dia.')).toBe(', que dia.')
    expect(semMarcador('sem nada')).toBe('sem nada')
  })
})

describe('textos fora do alfabeto latino e vazios', () => {
  it('passam sem custo', () => {
    expect(ocultarTermos('', PROTEGIDO).texto).toBe('')
    expect(ocultarTermos('مرحبا بك', PROTEGIDO).ocultadas).toBe(0)
    expect(ocultarTermos('你好，世界', PROTEGIDO).ocultadas).toBe(0)
    expect(ocultarTermos('…', PROTEGIDO).texto).toBe('…')
  })
})
