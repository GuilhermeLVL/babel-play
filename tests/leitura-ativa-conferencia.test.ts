/**
 * CONFERIR SOZINHO (spec `leitura-ativa-escrita`, plano grátis): no aparelho, conta as palavras, diz quais
 * palavras-alvo do texto foram usadas (pelo lema) e aponta as frases sem ponto final. Sem IA, sem rede.
 */
import { describe, expect, it } from 'vitest'

import {
  conferirEscrita,
  contarPalavrasDaEscrita,
  MAX_PALAVRAS_DA_ESCRITA,
  MIN_PALAVRAS_DA_ESCRITA,
} from '../src/core/leitura/conferenciaLocal'

describe('contarPalavrasDaEscrita', () => {
  it('conta só o que tem letra', () => {
    expect(contarPalavrasDaEscrita('')).toBe(0)
    expect(contarPalavrasDaEscrita('  Lia  went - to 2 shops.  ')).toBe(4)
    expect(contarPalavrasDaEscrita("Don't stop!")).toBe(2)
  })

  it('os limites são 20 e 120', () => {
    expect(MIN_PALAVRAS_DA_ESCRITA).toBe(20)
    expect(MAX_PALAVRAS_DA_ESCRITA).toBe(120)
  })
})

describe('conferirEscrita', () => {
  const alvo = ['morning', 'friend', 'umbrella']

  it('marca as palavras-alvo usadas, inclusive flexionadas', () => {
    const r = conferirEscrita({
      texto: 'In the morning Lia met two friends. They had no umbrellas',
      palavrasAlvo: alvo,
      lang: 'en',
    })
    expect(r.palavras).toBe(11)
    expect(r.alvoUsadas).toEqual(['morning', 'friend', 'umbrella'])
    expect(r.alvoFaltando).toEqual([])
  })

  it('diz o que faltou usar', () => {
    const r = conferirEscrita({ texto: 'Good morning.', palavrasAlvo: alvo, lang: 'en' })
    expect(r.alvoUsadas).toEqual(['morning'])
    expect(r.alvoFaltando).toEqual(['friend', 'umbrella'])
  })

  it('aponta a frase sem ponto final, em cada parágrafo', () => {
    const r = conferirEscrita({
      texto: 'Lucy forgot her umbrella. It was raining\nTom helped her! She was happy',
      palavrasAlvo: alvo,
      lang: 'en',
    })
    expect(r.frasesSemPonto).toEqual(['It was raining', 'She was happy'])
  })

  it('texto todo pontuado não tem frase sem ponto', () => {
    const r = conferirEscrita({ texto: 'Is it good? Yes. "It is."', palavrasAlvo: [], lang: 'en' })
    expect(r.frasesSemPonto).toEqual([])
  })
})
