import { hkdfSync, scryptSync } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { derivarChave } from '../server/crypto'

const HEX = 'ab'.repeat(32)

describe('derivarChave', () => {
  it('o prefixo HKDF: vale em qualquer caixa e deriva a mesma chave que hkdf:', () => {
    const minuscula = derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets')
    expect(derivarChave(`HKDF:${HEX}`, 'babel-play-web:secrets').equals(minuscula)).toBe(true)
    expect(() => derivarChave('HKDF:abc', 'babel-play-web:secrets')).toThrow(/hkdf/)
  })

  it('hkdf:<64 hex> deriva por HKDF-SHA256 com o info como sal de uso', () => {
    const esperada = Buffer.from(hkdfSync('sha256', Buffer.from(HEX, 'hex'), '', 'babel-play-web:secrets', 32))
    expect(derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets').equals(esperada)).toBe(true)
  })
  it('infos diferentes dão chaves diferentes (cifra ≠ hash)', () => {
    expect(
      derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets').equals(derivarChave(`hkdf:${HEX}`, 'babel-play-web:hash')),
    ).toBe(false)
  })
  it('sem o prefixo continua no scrypt (compatível com quem já cifrou)', () => {
    expect(
      derivarChave('frase-antiga', 'babel-play-web:secrets').equals(
        scryptSync('frase-antiga', 'babel-play-web:secrets', 32),
      ),
    ).toBe(true)
  })
  it.each(['hkdf:', 'hkdf:abc', `hkdf:${'zz'.repeat(32)}`, `hkdf:${HEX}0`])('hkdf malformado lança (%s)', (raw) => {
    expect(() => derivarChave(raw, 'babel-play-web:secrets')).toThrow(/hkdf/)
  })
  it('HKDF custa menos de 5 ms', () => {
    const t = performance.now()
    derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets')
    expect(performance.now() - t).toBeLessThan(5)
  })
})
