/**
 * O MANIFESTO DOS PESOS PRESO ÀS REVISÕES FIXADAS (change `modelos-confiaveis-e-offline`, 2.1).
 *
 * Trocar o commit de um modelo em `revisoesDosModelos.ts` sem regenerar o manifesto deixaria o cache de
 * pesos sem régua para o arquivo novo (e o portão do deploy sem o que conferir no bucket). Este teste é o
 * cadeado: cada `<modelo>@<sha>` das revisões existe no manifesto, e o manifesto não tem sobra.
 */
import { describe, expect, it } from 'vitest'

import manifesto from '../src/gateway/manifestoDosPesos.json'
import { REVISOES_DOS_MODELOS } from '../src/gateway/revisoesDosModelos'

const m = manifesto as unknown as Record<string, Record<string, [number] | [number, string]>>

describe('manifestoDosPesos.json', () => {
  it('cada modelo das revisões tem o seu bloco, no commit fixado', () => {
    for (const [modelo, sha] of Object.entries(REVISOES_DOS_MODELOS)) {
      expect(
        m[`${modelo}@${sha}`],
        `${modelo}@${sha} sem manifesto: rode scripts/modelos/gerar-manifesto-dos-pesos.ts`,
      ).toBeTruthy()
    }
  })

  it('nenhum bloco de revisão que o app não usa mais', () => {
    const esperadas = new Set(Object.entries(REVISOES_DOS_MODELOS).map(([mo, sha]) => `${mo}@${sha}`))
    expect(Object.keys(m).filter((k) => !esperadas.has(k))).toEqual([])
  })

  it('bytes positivos; sha256 com 64 hex nos pesos; todo modelo tem .onnx', () => {
    for (const [chave, arquivos] of Object.entries(m)) {
      expect(
        Object.keys(arquivos).some((a) => a.endsWith('.onnx')),
        chave,
      ).toBe(true)
      for (const [arquivo, [bytes, sha]] of Object.entries(arquivos)) {
        expect(bytes, `${chave}/${arquivo}`).toBeGreaterThan(0)
        if (arquivo.endsWith('.onnx')) expect(sha, `${chave}/${arquivo}`).toMatch(/^[0-9a-f]{64}$/)
      }
    }
  })
})
