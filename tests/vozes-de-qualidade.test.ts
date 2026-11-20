/**
 * SÓ VOZ HUMANA: a reclamação do dono (17/11/2026) era a leitura com voz "rouca, zumbificada, robótica" — no macOS o
 * desempate alfabético punha a Eddy (Eloquence) à frente da Luciana, e o Albert (novidade) à frente da Samantha.
 * Agora é LISTA DE PERMISSÃO: o que não é reconhecido como voz de qualidade é recusado. Listas realistas por sistema.
 */
import { describe, expect, it } from 'vitest'

import { ehVozAceita, nivelDaVoz, ordenarPorQualidade, recomendarVoz } from '../src/core/voz/melhorVoz'

const v = (name: string, lang: string, local = true, voiceURI?: string) => ({
  name,
  lang,
  local,
  ...(voiceURI ? { voiceURI } : {}),
})

const ELOQUENCE = ['Eddy', 'Flo', 'Grandma', 'Grandpa', 'Reed', 'Rocko', 'Sandy', 'Shelley']
const NOVIDADE = [
  'Albert',
  'Bad News',
  'Bahh',
  'Bells',
  'Boing',
  'Bubbles',
  'Cellos',
  'Good News',
  'Jester',
  'Organ',
  'Superstar',
  'Trinoids',
  'Whisper',
  'Wobble',
  'Zarvox',
  'Fred',
  'Junior',
  'Ralph',
  'Kathy',
]

/* Chrome no Mac: as Eloquence vêm com o idioma entre parênteses; "(Premium)" às vezes só no voiceURI. */
const MAC_CHROME = [
  ...ELOQUENCE.map((n) => v(`${n} (Português (Brasil))`, 'pt-BR', true, `com.apple.eloquence.pt-BR.${n}`)),
  ...ELOQUENCE.map((n) => v(`${n} (English (US))`, 'en-US', true, `com.apple.eloquence.en-US.${n}`)),
  ...NOVIDADE.map((n) => v(n, 'en-US', true, `com.apple.speech.synthesis.voice.${n.replace(' ', '')}`)),
  v('Luciana', 'pt-BR', true, 'com.apple.voice.compact.pt-BR.Luciana'),
  v('Joana', 'pt-PT', true, 'com.apple.voice.compact.pt-PT.Joana'),
  v('Samantha', 'en-US', true, 'com.apple.voice.compact.en-US.Samantha'),
  v('Daniel', 'en-GB', true, 'com.apple.voice.compact.en-GB.Daniel'),
  v('Monica', 'es-ES', true, 'com.apple.voice.compact.es-ES.Monica'),
]
const GOOGLE_CHROME = [
  v('Google português do Brasil', 'pt-BR', false),
  v('Google US English', 'en-US', false),
  v('Google español', 'es-ES', false),
]

/* Safari no Mac: os mesmos nomes, com "(Premium)"/"(Enhanced)" no nome quando a pessoa baixou. */
const MAC_SAFARI = [
  ...ELOQUENCE.map((n) => v(n, 'pt-BR', true, `com.apple.eloquence.pt-BR.${n}`)),
  ...NOVIDADE.map((n) => v(n, 'en-US', true, `com.apple.speech.synthesis.voice.${n}`)),
  v('Luciana', 'pt-BR', true, 'com.apple.voice.compact.pt-BR.Luciana'),
  v('Samantha (Enhanced)', 'en-US', true, 'com.apple.voice.enhanced.en-US.Samantha'),
  v('Samantha', 'en-US', true, 'com.apple.voice.compact.en-US.Samantha'),
]

const WINDOWS_CHROME = [
  v('Microsoft Maria - Portuguese (Brazil)', 'pt-BR', true),
  v('Microsoft David - English (United States)', 'en-US', true),
  v('Microsoft Zira - English (United States)', 'en-US', true),
  ...GOOGLE_CHROME,
]
const WINDOWS_EDGE = [
  v('Microsoft Maria - Portuguese (Brazil)', 'pt-BR', true),
  v('Microsoft Daniel Desktop - Portuguese(Brazil)', 'pt-BR', true),
  v('Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR', false),
  v('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
  v('Microsoft David - English (United States)', 'en-US', true),
]
const ANDROID = [
  v('pt-BR-language', 'pt-BR', true),
  v('pt-br-x-afs-local', 'pt-BR', true),
  v('pt-br-x-afs-network', 'pt-BR', false),
  v('en-US-language', 'en-US', true),
  v('Google português do Brasil (Natural)', 'pt-BR', false),
]
const LINUX = [v('eSpeak Portuguese', 'pt-BR', true), v('espeak-ng English', 'en-US', true)]

describe('ehVozAceita / nivelDaVoz: lista de permissão', () => {
  it.each([...ELOQUENCE, ...NOVIDADE])('%s é recusada, com ou sem idioma entre parênteses e em qualquer caixa', (n) => {
    expect(ehVozAceita({ name: n })).toBe(false)
    expect(ehVozAceita({ name: `${n} (Português (Brasil))` })).toBe(false)
    expect(ehVozAceita({ name: n.toUpperCase() })).toBe(false)
  })

  it('SAPI do Windows (com ou sem Desktop) e eSpeak são recusadas', () => {
    for (const x of [...LINUX, WINDOWS_EDGE[0], WINDOWS_EDGE[1], WINDOWS_CHROME[1]]) expect(nivelDaVoz(x)).toBe(0)
  })

  it('premium/enhanced/aprimorada, Natural/Neural, Siri e Google são nível 3', () => {
    expect(nivelDaVoz({ name: 'Luciana (Premium)' })).toBe(3)
    expect(nivelDaVoz({ name: 'Luciana (Aprimorada)' })).toBe(3)
    expect(nivelDaVoz({ name: 'Luciana', voiceURI: 'com.apple.voice.premium.pt-BR.Luciana' })).toBe(3)
    expect(nivelDaVoz({ name: 'Samantha', voiceURI: 'com.apple.voice.enhanced.en-US.Samantha' })).toBe(3)
    expect(nivelDaVoz({ name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)' })).toBe(3)
    expect(nivelDaVoz({ name: 'Nicky', voiceURI: 'com.apple.ttsbundle.siri_Nicky_en-US_compact' })).toBe(3)
    expect(nivelDaVoz({ name: 'Google US English' })).toBe(3)
  })

  it('as vozes padrão conhecidas do macOS/iOS e as do Google TTS no Android são nível 2', () => {
    expect(nivelDaVoz({ name: 'Luciana', voiceURI: 'com.apple.voice.compact.pt-BR.Luciana' })).toBe(2)
    expect(nivelDaVoz({ name: 'Samantha' })).toBe(2)
    expect(nivelDaVoz({ name: 'pt-BR-language' })).toBe(2)
    expect(nivelDaVoz({ name: 'pt-br-x-afs-network' })).toBe(2)
  })

  it('o que não é reconhecido é recusado (lista de permissão, não de bloqueio)', () => {
    expect(nivelDaVoz({ name: 'Voz Estranha Nova' })).toBe(0)
    /* "Albert" com voiceURI premium não existe; um nome de novidade nunca vira aceito pelo URI. */
    expect(nivelDaVoz({ name: 'Albert', voiceURI: 'com.apple.speech.synthesis.voice.Albert' })).toBe(0)
  })
})

describe('recomendarVoz em listas reais', () => {
  it('Mac Chrome sem Google: Luciana em pt-BR e Samantha em en-US, nunca Eddy nem Albert', () => {
    expect(recomendarVoz(MAC_CHROME, 'pt-BR')?.name).toBe('Luciana')
    expect(recomendarVoz(MAC_CHROME, 'en-US')?.name).toBe('Samantha')
    const nomes = ordenarPorQualidade(MAC_CHROME, 'en').map((x) => x.name)
    expect(nomes.sort()).toEqual(['Daniel', 'Samantha'])
  })

  it('Mac Chrome com Google: Google (nível 3) primeiro; Luciana premium no aparelho vence a de rede', () => {
    expect(recomendarVoz([...MAC_CHROME, ...GOOGLE_CHROME], 'pt-BR')?.name).toBe('Google português do Brasil')
    const premium = v('Luciana', 'pt-BR', true, 'com.apple.voice.premium.pt-BR.Luciana')
    expect(recomendarVoz([...GOOGLE_CHROME, premium, ...MAC_CHROME], 'pt-BR')).toBe(premium)
  })

  it('Mac Safari: Samantha (Enhanced) primeiro; nenhuma Eloquence nem novidade na lista', () => {
    expect(ordenarPorQualidade(MAC_SAFARI, 'en-US').map((x) => x.name)).toEqual(['Samantha (Enhanced)', 'Samantha'])
    expect(ordenarPorQualidade(MAC_SAFARI, 'pt-BR').map((x) => x.name)).toEqual(['Luciana'])
  })

  it('Windows Chrome: só a Google; Windows Edge: só a Natural', () => {
    expect(ordenarPorQualidade(WINDOWS_CHROME, 'pt-BR').map((x) => x.name)).toEqual(['Google português do Brasil'])
    expect(ordenarPorQualidade(WINDOWS_EDGE, 'pt-BR').map((x) => x.name)).toEqual([
      'Microsoft Francisca Online (Natural) - Portuguese (Brazil)',
    ])
  })

  it('Android: as vozes do Google TTS servem', () => {
    expect(recomendarVoz(ANDROID, 'pt-BR')?.name).toBe('Google português do Brasil (Natural)')
    expect(ordenarPorQualidade(ANDROID, 'pt-BR')).toHaveLength(4)
  })

  it('idioma só com vozes recusadas: nenhuma (o app não fala)', () => {
    expect(recomendarVoz(LINUX, 'pt-BR')).toBeNull()
    expect(recomendarVoz(WINDOWS_EDGE.slice(0, 2), 'pt-BR')).toBeNull()
    expect(
      recomendarVoz(
        ELOQUENCE.map((n) => v(n, 'pt-BR')),
        'pt-BR',
      ),
    ).toBeNull()
  })
})
