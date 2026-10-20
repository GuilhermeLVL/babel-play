import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { ExpansaoAcimaDoTeto, extrairDoZip, medirExpansaoDoZip } from '../src/lib/zip/zipComTeto'

const MB = 1024 * 1024

/**
 * Reescreve o tamanho DESCOMPACTADO declarado de todas as entradas (cabeçalho local e diretório
 * central) — é o zip mentindo, que é o caso que o teto tem de aguentar sem confiar no cabeçalho.
 */
function mentirTamanho(zip: Uint8Array, declarado: number): Uint8Array {
  const copia = zip.slice()
  const vista = new DataView(copia.buffer)
  for (let i = 0; i + 4 <= copia.length; i++) {
    const assinatura = vista.getUint32(i, true)
    if (assinatura === 0x04034b50) vista.setUint32(i + 22, declarado, true)
    if (assinatura === 0x02014b50) vista.setUint32(i + 24, declarado, true)
  }
  return copia
}

const blob = (bytes: Uint8Array) => new Blob([bytes])

describe('extrairDoZip', () => {
  it('extrai só as entradas pedidas e lista todos os nomes', async () => {
    const zip = zipSync({ 'a.txt': strToU8('conteúdo de a'), 'b.txt': strToU8('conteúdo de b'), '0': strToU8('mídia') })
    const { entradas, nomes } = await extrairDoZip(blob(zip), ['a.txt'], MB)
    expect(entradas.size).toBe(1)
    expect(new TextDecoder().decode(entradas.get('a.txt'))).toBe('conteúdo de a')
    // Chave numérica vem primeiro na ordem de um objeto JS, então o zip sai com '0' antes: compara sem ordem.
    expect([...nomes].sort()).toEqual(['0', 'a.txt', 'b.txt'])
  })

  it('recusa uma entrada que passa do teto DURANTE a inflação, mesmo com cabeçalho mentindo', async () => {
    const zip = mentirTamanho(zipSync({ 'collection.anki21': new Uint8Array(2 * MB) }), 10)
    expect(zip.length).toBeLessThan(64 * 1024) // a bomba: KB que viram MB
    const promessa = extrairDoZip(blob(zip), ['collection.anki21'], MB)
    await expect(promessa).rejects.toBeInstanceOf(ExpansaoAcimaDoTeto)
    await expect(promessa).rejects.toThrow('collection.anki21 passou de 1 MB ao descompactar; arquivo recusado')
  })

  it('Blob que não é zip → erro legível', async () => {
    await expect(extrairDoZip(blob(strToU8('isto não é um zip')), ['a.txt'], MB)).rejects.toThrow(/não é um zip válido/)
  })
})

describe('medirExpansaoDoZip', () => {
  it('medirExpansaoDoZip soma todas as entradas e aplica os dois tetos', async () => {
    const zip = zipSync({ '0': new Uint8Array(MB), '1': new Uint8Array(MB), '2': new Uint8Array(MB) })
    await expect(medirExpansaoDoZip(blob(zip), 2 * MB, 10 * MB)).resolves.toBe(3 * MB)
    await expect(medirExpansaoDoZip(blob(zip), 2 * MB, 2 * MB)).rejects.toBeInstanceOf(ExpansaoAcimaDoTeto)
    await expect(medirExpansaoDoZip(blob(zip), MB / 2, 10 * MB)).rejects.toBeInstanceOf(ExpansaoAcimaDoTeto)
  })
})
