import { describe, expect, it } from 'vitest'

import { rotuloDaTranscricao, rotuloDoModeloLocal } from '../src/lib/import/rotuloDaImportacao'

describe('rótulo honesto da importação de áudio', () => {
  it('rota local padrão: no aparelho, com o modelo', () => {
    expect(rotuloDaTranscricao({ motor: 'whisper-local', modelo: 'onnx-community/whisper-tiny' })).toBe(
      'Transcrevendo no aparelho (whisper-tiny)…',
    )
  })
  it('rota local em inglês: moonshine, nunca "Whisper"', () => {
    const r = rotuloDaTranscricao({ motor: 'whisper-local', modelo: 'onnx-community/moonshine-base-ONNX' })
    expect(r).toContain('moonshine')
    expect(r).not.toMatch(/Whisper/)
  })
  it('rota de nuvem: diz que vai à nuvem do Frasy, com o modelo', () => {
    expect(rotuloDaTranscricao({ motor: 'groq-whisper', modelo: 'whisper-large-v3-turbo' })).toBe(
      'Transcrevendo na nuvem do Frasy (whisper-large-v3-turbo)…',
    )
  })
  it('nuvem que falhou e o local assumiu: o rótulo muda para o aparelho', () => {
    expect(rotuloDaTranscricao({ motor: 'whisper-local' })).toBe('Transcrevendo no aparelho…')
  })
  it('motor desconhecido ou ausente: não afirma nada', () => {
    expect(rotuloDaTranscricao({})).toBe('Transcrevendo…')
    expect(rotuloDaTranscricao({ motor: 'motor-que-nao-existe' as never })).toBe('Transcrevendo…')
  })
  it('modelo local carregando traz o nome do modelo', () => {
    expect(rotuloDoModeloLocal({ progress: 0.4, modelo: 'onnx-community/whisper-tiny' })).toBe(
      'Carregando o modelo local (whisper-tiny)… 40%',
    )
  })
})
