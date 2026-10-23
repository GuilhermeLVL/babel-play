// @vitest-environment jsdom
/**
 * O CATÁLOGO DA TELA "Modelos no aparelho": os seis modelos de transcrição, na ordem e com os números
 * da spec (tamanho q8 do roteador, erro medido na bancada de português), e os tradutores guardados no
 * aparelho, lidos dos manifestos do `localStorage` (os de transcrição ficam de fora).
 */
import { afterEach, describe, expect, it } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import {
  alcanceDoModelo,
  catalogoDeTranscricao,
  escolhaDoAutomatico,
  tradutoresGuardados,
} from '../src/gateway/catalogoDeModelos'
import { chaveDoManifesto } from '../src/gateway/modelManifest'
import { modeloFixoServe } from '../src/gateway/modeloFixo'
import { MODEL_DOWNLOAD_MB_Q8, MOONSHINE_MODELS, WHISPER_MODELS } from '../src/gateway/sttRouter'

afterEach(() => localStorage.clear())

describe('catalogoDeTranscricao', () => {
  it('seis itens, na ordem da spec, com idiomas, tamanho, erro e peso', () => {
    const c = catalogoDeTranscricao()
    expect(c.map((i) => [i.fixo, i.nome, i.idiomas, i.mb, i.erroPtPorCem, i.peso])).toEqual([
      ['parakeet', 'Preciso', ['pt', 'es'], 672, 6, 'medio'],
      ['whisper-small', 'Preciso com placa de vídeo', 'todos', 589, 11, 'pesado'],
      ['whisper-base', 'Equilibrado', 'todos', 80, 19, 'leve'],
      ['whisper-tiny', 'Rápido', 'todos', 44, 29, 'leve'],
      ['moonshine-base', 'Inglês', ['en'], 67, undefined, 'leve'],
      ['moonshine-tiny', 'Inglês, rápido', ['en'], 32, undefined, 'leve'],
    ])
  })

  it('os ids são os do roteador', () => {
    expect(catalogoDeTranscricao().map((i) => i.id)).toEqual([
      ID_DO_PARAKEET,
      WHISPER_MODELS.small,
      WHISPER_MODELS.base,
      WHISPER_MODELS.tiny,
      MOONSHINE_MODELS.base,
      MOONSHINE_MODELS.tiny,
    ])
    // base e tiny = o q8 da tabela do roteador (a mesma fonte, não um número copiado à mão)
    const porFixo = Object.fromEntries(catalogoDeTranscricao().map((i) => [i.fixo, i.mb]))
    expect(porFixo['whisper-base']).toBe(MODEL_DOWNLOAD_MB_Q8[WHISPER_MODELS.base])
    expect(porFixo['whisper-tiny']).toBe(MODEL_DOWNLOAD_MB_Q8[WHISPER_MODELS.tiny])
  })

  it('o Parakeet não serve ao francês', () => {
    expect(modeloFixoServe('parakeet', ['fr'])).toBe(false)
  })
})

function manifesto(modelId: string, dtype: string, bytes: number, gravadoEm = 1): void {
  localStorage.setItem(
    chaveDoManifesto(modelId, dtype, 'wasm'),
    JSON.stringify({ modelId, dtype, device: 'wasm', arquivos: [{ url: 'x', bytes }], bytesTotais: bytes, gravadoEm }),
  )
}

describe('tradutoresGuardados', () => {
  it('com um Whisper e um opus-mt guardados, devolve só o opus-mt', () => {
    manifesto(WHISPER_MODELS.base, 'q8', 80_000_000)
    manifesto('Xenova/opus-mt-en-ROMANCE', 'q8', 113_000_000)
    localStorage.setItem('outra.chave', '1')
    const r = tradutoresGuardados()
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('Xenova/opus-mt-en-ROMANCE')
    expect(r[0].bytes).toBe(113_000_000)
    expect(r[0].titulo).toMatch(/opus-mt/)
  })

  it('um tradutor com dois dtypes aparece uma vez (a cópia mais nova)', () => {
    manifesto('bergamot/pt-en', 'int8', 30_000_000, 1)
    manifesto('bergamot/pt-en', 'q8', 31_000_000, 2)
    expect(tradutoresGuardados()).toEqual([
      { id: 'bergamot/pt-en', titulo: expect.stringMatching(/Bergamot/), bytes: 31_000_000 },
    ])
  })

  it('manifesto ilegível não derruba a lista', () => {
    localStorage.setItem(chaveDoManifesto('Xenova/opus-mt-pt-en', 'q8', 'wasm'), '{quebrado')
    expect(tradutoresGuardados()).toEqual([])
  })
})

describe('alcanceDoModelo (estuda / fala)', () => {
  const item = (fixo: string) => catalogoDeTranscricao().find((i) => i.fixo === fixo)!
  it('en/pt: o Preciso vale em parte (a voz em português)', () => {
    expect(alcanceDoModelo(item('parakeet'), 'en-US', 'pt-BR')).toEqual({
      alcance: 'parte',
      serve: ['pt'],
      naoServe: ['en'],
    })
  })
  it('es/en: o Preciso vale em parte (o conteúdo em espanhol)', () => {
    expect(alcanceDoModelo(item('parakeet'), 'es', 'en')).toEqual({ alcance: 'parte', serve: ['es'], naoServe: ['en'] })
  })
  it('fr/de: o Preciso não serve a nenhum', () => {
    expect(alcanceDoModelo(item('parakeet'), 'fr', 'de').alcance).toBe('nada')
  })
  it('en/en: o Moonshine serve a tudo; en/pt: em parte', () => {
    expect(alcanceDoModelo(item('moonshine-base'), 'en-US', 'en-GB')).toEqual({
      alcance: 'tudo',
      serve: ['en'],
      naoServe: [],
    })
    expect(alcanceDoModelo(item('moonshine-tiny'), 'en-US', 'pt-BR')).toEqual({
      alcance: 'parte',
      serve: ['en'],
      naoServe: ['pt'],
    })
  })
  it('o Whisper serve a tudo', () => {
    expect(alcanceDoModelo(item('whisper-base'), 'fr', 'de').alcance).toBe('tudo')
  })
})

describe('escolhaDoAutomatico', () => {
  it('cabe e há pt/es: o preciso; cabe sem pt/es: o equilibrado pelos idiomas; não cabe ou vetado: pelo aparelho', () => {
    expect(escolhaDoAutomatico(true, false, 'en', 'pt-BR')).toBe('preciso')
    expect(escolhaDoAutomatico(true, false, 'en', 'fr')).toBe('equilibrado-pelos-idiomas')
    expect(escolhaDoAutomatico(false, false, 'es', 'pt')).toBe('equilibrado-pelo-aparelho')
    expect(escolhaDoAutomatico(true, true, 'es', 'pt')).toBe('equilibrado-pelo-aparelho')
  })
})
