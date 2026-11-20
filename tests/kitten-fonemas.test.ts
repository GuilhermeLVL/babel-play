/**
 * O FONETIZADOR DO KITTEN (sem espeak-ng): texto → fonemas no alfabeto do modelo. Os casos abaixo são frases cujo
 * resultado bate, símbolo a símbolo, com o que o modelo ouviu no treino (medido com `scripts/voz/kitten/` contra o
 * oráculo local: pt CER 1,0%, es 0,4%, en 2,0% em 15,6 mil / 8,2 mil / 3 mil frases do Tatoeba).
 */
import { describe, expect, it } from 'vitest'

import { fonemasDoTexto } from '../src/core/voz/kitten/fonemas'
import { cortarFrase } from '../src/core/voz/kitten/frase'

describe('fonetizador pt (pt-BR)', () => {
  it.each([
    ['Eu amo você!', 'eʊ ˈɐ̃mʊ vosˈe!'],
    ['A vida não é fácil.', 'a vˈidæ nˌɐ̃ʊ̃ ɛ fˈasiʊ.'],
    ['Aqui está o seu cachorro.', 'akˈi estˌa ʊ seʊ kˌaʃˈoxʊ.'],
    ['Estava muito tarde.', 'estˌavæ mwˈiŋtʊ tˈaɾəʤy.'],
    ['Eu quero falar com o seu tio.', 'eʊ kˈɛɾʊ falˈar koŋ ʊ seʊ ʧˈiʊ.'],
    ['Eu sou um menino.', 'eʊ sow ũŋ mˌenˈinʊ.'],
  ])('%s', (texto, esperado) => {
    expect(fonemasDoTexto(texto, 'pt-BR')).toBe(esperado.normalize('NFD'))
  })

  it('junção: -o átono vira semivogal antes de vogal tônica; -s soa z antes de vogal', () => {
    expect(fonemasDoTexto('Eu quero ir para a sua festa.', 'pt')).toBe('eʊ kˈɛɾw ˈir pˌaɾæ a sˌuæ fˈɛstæ.')
    expect(fonemasDoTexto('inglês às segundas', 'pt')).toContain('iŋɡlˈez aːs')
  })

  it('o til é sempre combinante (o vocabulário não tem ũ nem õ pré-compostos)', () => {
    const f = fonemasDoTexto('Nunca um coração, informações.', 'pt')
    expect(f).not.toMatch(/[ũõã]/)
    expect(f).toContain('ũ')
  })
})

describe('fonetizador es', () => {
  it.each([
    ['Es su trabajo.', 'ˈes su tɾaβˈaxo.'],
    ['¿Cómo se llama?', 'kˈomo se ʎˈama?'],
    ['No te voy a escuchar.', 'nˈo te βˈoɪ a ˌeskuʧˈaɾ.'],
    ['Era demasiado tarde.', 'ˈeɾa ðˌemasjˈaðo tˈaɾðe.'],
    ['Gracias por tu ayuda.', 'ɡɾˈaθjas poɾ tu aʝˈuða.'],
  ])('%s', (texto, esperado) => {
    expect(fonemasDoTexto(texto, 'es')).toBe(esperado)
  })

  it('b/d/g: oclusiva depois de pausa ou nasal, aproximante depois de vogal', () => {
    expect(fonemasDoTexto('Voy.', 'es')).toBe('bˈoɪ.')
    expect(fonemasDoTexto('No voy.', 'es')).toBe('nˈo βˈoɪ.')
  })
})

describe('fonetizador en', () => {
  const lexico = { flight: 'flˈIt', moved: 'mˈuvd', gate: 'ɡˈAt', twelve: 'twˈɛlv', your: 'jˈɔɹ', was: 'wˈɑz' }
  it('léxico + formas fracas', () => {
    expect(fonemasDoTexto('Your flight was moved to Gate twelve.', 'en', lexico)).toBe(
      'jˌʊɹ flˈIt wʌz mˈuvd tə ɡˈAt twˈɛlv.',
    )
  })
  it('palavra fora do léxico não some (regras de leitura)', () => {
    expect(fonemasDoTexto('Frasy', 'en', {})).toMatch(/f.*ɹ/)
  })
})

describe('corte da frase', () => {
  it('pontuação colada, parênteses viram vírgula, aspas saem', () => {
    const p = cortarFrase('Ele disse "oi" (baixo)...')
    expect(p.map((x) => x.texto)).toEqual(['ele', 'disse', 'oi', 'baixo'])
    expect(p[2].pontuacao).toBe(',')
    expect(p[3].pontuacao).toBe(',…')
    expect(p[1].proxima).toBe('oi')
    expect(p[2].fimDeGrupo).toBe(true)
  })

  it('idioma fora do fonetizador lança', () => {
    expect(() => fonemasDoTexto('Bonjour', 'fr')).toThrow(/fr/)
  })
})
