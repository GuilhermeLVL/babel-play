/**
 * Moonshine no worker de STT — o ramo de decode que NÃO é Whisper.
 *
 * O Moonshine não aceita as opções do Whisper (`language`/`task`/`return_timestamps`/`num_beams`):
 * o pipeline repassa tudo ao `generate`, e opção desconhecida ali é, no melhor caso, ruído. O decode
 * dele é só o teto de tokens pela duração do áudio (+ o streamer, que é do `generate` genérico).
 */
import { describe, expect, it } from 'vitest'

import {
  DEVICE_MOONSHINE,
  DTYPE_MOONSHINE,
  ehMoonshine,
  moonshineAceita,
  opcoesDeDecodeMoonshine,
  SESSAO_MOONSHINE,
} from '../src/gateway/adapters/moonshine'
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'

describe('ehMoonshine', () => {
  it('reconhece os ids do Hub e ignora o Whisper', () => {
    expect(ehMoonshine(MOONSHINE_MODELS.base)).toBe(true)
    expect(ehMoonshine(MOONSHINE_MODELS.tiny)).toBe(true)
    expect(ehMoonshine(WHISPER_MODELS.tiny)).toBe(false)
    expect(ehMoonshine('')).toBe(false)
    expect(ehMoonshine(undefined)).toBe(false)
  })
})

describe('opcoesDeDecodeMoonshine', () => {
  it('só max_new_tokens — nenhuma opção do Whisper', () => {
    const o = opcoesDeDecodeMoonshine(4)
    expect(Object.keys(o)).toEqual(['max_new_tokens'])
  })

  it('~15 tokens por segundo de áudio', () => {
    expect(opcoesDeDecodeMoonshine(4).max_new_tokens).toBe(60)
    expect(opcoesDeDecodeMoonshine(2.5).max_new_tokens).toBe(38)
  })

  it('piso de 8 (parcial curtíssimo) e teto de 128 (trecho longo)', () => {
    expect(opcoesDeDecodeMoonshine(0.1).max_new_tokens).toBe(8)
    expect(opcoesDeDecodeMoonshine(0).max_new_tokens).toBe(8)
    expect(opcoesDeDecodeMoonshine(30).max_new_tokens).toBe(128)
  })
})

describe('moonshineAceita', () => {
  it('inglês ou sem dica (a rota já garantiu inglês)', () => {
    expect(moonshineAceita('en')).toBe(true)
    expect(moonshineAceita('en-US')).toBe(true)
    expect(moonshineAceita(undefined)).toBe(true)
    expect(moonshineAceita('')).toBe(true)
  })
  it('qualquer outro idioma, não', () => {
    expect(moonshineAceita('pt')).toBe(false)
    expect(moonshineAceita('pt-BR')).toBe(false)
    expect(moonshineAceita('es')).toBe(false)
  })
})

it('o dtype do moonshine é q8 (o da bancada), não o híbrido do Whisper', () => {
  expect(DTYPE_MOONSHINE).toBe('q8')
})

it('carga no navegador: WASM e otimização de grafo só "basic" (medido: com "all" o decoder q8 não abre no ORT-web)', () => {
  expect(DEVICE_MOONSHINE).toBe('wasm')
  expect(SESSAO_MOONSHINE.graphOptimizationLevel).toBe('basic')
})
