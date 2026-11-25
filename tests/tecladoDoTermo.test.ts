import { describe, expect, it } from 'vitest'

import { letraDaTecla, linhasDoTeclado } from '../src/core/minigames/tecladoDoTermo'
import { chaveDoTermo } from '../src/core/minigames/termo'

const teclas = (lang: string) => new Set(linhasDoTeclado(lang).join(''))

describe('teclado do Termo por idioma (tela-de-jogos-v2 5.2)', () => {
  it('cada layout tem as 26 letras, sem repetir', () => {
    for (const lang of ['en', 'pt', 'es', 'de', 'fr', 'it', 'xx']) {
      expect(linhasDoTeclado(lang).join('')).toHaveLength(26)
      expect(teclas(lang).size).toBe(26)
    }
  })

  it('QWERTZ no alemão, AZERTY no francês, QWERTY no resto (inclui regionais)', () => {
    expect(linhasDoTeclado('de-AT')[0]).toBe('QWERTZUIOP')
    expect(linhasDoTeclado('fr')[0]).toBe('AZERTYUIOP')
    expect(linhasDoTeclado('pt-BR')[0]).toBe('QWERTYUIOP')
    expect(linhasDoTeclado(undefined)[0]).toBe('QWERTYUIOP')
  })

  it('a palavra de cada idioma é digitável só pela tela (es ñ, de ä ö ü ß, pt ç)', () => {
    const casos: Array<[string, string[]]> = [
      ['es', ['año', 'niño', 'señal', 'cigüeña']],
      ['de', ['Äpfel', 'schön', 'über', 'Straße', 'Mädchen']],
      ['pt', ['coração', 'maçã', 'pão', 'açúcar']],
      ['fr', ['garçon', 'œuvre', 'être']],
    ]
    for (const [lang, palavras] of casos) {
      const disponiveis = teclas(lang)
      for (const p of palavras) {
        const chave = chaveDoTermo(p)
        expect(chave, p).toMatch(/^[A-Z]+$/)
        for (const c of chave) expect(disponiveis.has(c), `${lang}:${p}:${c}`).toBe(true)
      }
    }
  })

  it('a tecla física acentuada vira a letra-base; ß e não-letras não entram', () => {
    expect(letraDaTecla('ñ')).toBe('N')
    expect(letraDaTecla('ç')).toBe('C')
    expect(letraDaTecla('Ü')).toBe('U')
    expect(letraDaTecla('a')).toBe('A')
    expect(letraDaTecla('ß')).toBeNull()
    expect(letraDaTecla('Enter')).toBeNull()
    expect(letraDaTecla('1')).toBeNull()
    expect(letraDaTecla('')).toBeNull()
  })
})
