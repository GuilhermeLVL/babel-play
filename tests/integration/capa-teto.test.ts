import { describe, it, expect } from 'vitest'
import { patchMetaSchema, isSafeImageUrl, MAX_IMAGE_URL } from '../../server/validation'

const dataUri = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes, 0).toString('base64')}`
const aceita = (uri: string) => patchMetaSchema.safeParse({ imageUrl: uri }).success && isSafeImageUrl(uri)

describe('teto da capa de sessão', () => {
  it('MAX_IMAGE_URL é 8192', () => {
    expect(MAX_IMAGE_URL).toBe(8_192)
  })

  it('aceita 6 KB e recusa acima disso', () => {
    expect(aceita(dataUri(6_000))).toBe(true)
    expect(aceita(dataUri(6_200))).toBe(false)
    expect(aceita(dataUri(100_000))).toBe(false)
    expect(aceita(dataUri(3_900_000))).toBe(false)
  })

  it('os dois guardas recusam de forma independente', () => {
    const grande = dataUri(100_000)
    expect(patchMetaSchema.safeParse({ imageUrl: grande }).success).toBe(false)
    expect(isSafeImageUrl(grande)).toBe(false)
  })

  it('https continua passando, e http não', () => {
    expect(aceita('https://exemplo.com/capa.png')).toBe(true)
    expect(aceita('http://exemplo.com/capa.png')).toBe(false)
    expect(aceita('javascript:alert(1)')).toBe(false)
  })
})
