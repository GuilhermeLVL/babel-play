/** O publicador dos pesos da Supertonic: layout do bucket = o do app, e nunca grava um byte que a lista não descreve. */
import { describe, expect, it } from 'vitest'

import {
  chaveNoBucket,
  conferir,
  origemDoArquivo,
  PREFIXO_NO_BUCKET,
  sha256Hex,
  tipoDe,
} from '../scripts/modelos/publicar-supertonic-no-r2'
import { ARQUIVOS_DO_SUPERTONIC, REVISAO_DO_SUPERTONIC, urlDoArquivo } from '../src/core/voz/supertonic'

describe('publicar-supertonic-no-r2', () => {
  it('a chave no bucket é o caminho que o app pede a partir de <domínio>/supertonic-3', () => {
    for (const a of ARQUIVOS_DO_SUPERTONIC) {
      const url = urlDoArquivo(`https://m.example/${PREFIXO_NO_BUCKET}`, a)
      expect(url).toBe(`https://m.example/${chaveNoBucket(a.caminho)}`)
    }
  })

  it('baixa da revisão fixada, nunca de `main`', () => {
    expect(origemDoArquivo('onnx/tts.json')).toContain(`/resolve/${REVISAO_DO_SUPERTONIC}/onnx/tts.json`)
    expect(origemDoArquivo('onnx/tts.json')).not.toContain('/main/')
  })

  it('confere tamanho e sha256 e lança com o motivo', () => {
    const corpo = Buffer.from('peso')
    const hex = sha256Hex(corpo)
    expect(() => conferir('x', corpo, 4, hex)).not.toThrow()
    expect(() => conferir('x', corpo, 5, hex)).toThrow(/bytes/)
    expect(() => conferir('x', corpo, 4, 'a'.repeat(64))).toThrow(/sha256/)
  })

  it('o tipo é json para configuração e binário para o resto', () => {
    expect(tipoDe('onnx/tts.json')).toBe('application/json')
    expect(tipoDe('onnx/vocoder.onnx')).toBe('application/octet-stream')
  })
})
