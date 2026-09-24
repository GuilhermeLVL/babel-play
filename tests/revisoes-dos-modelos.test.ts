/**
 * GAP-014 — pesos dos modelos locais com revisão FIXADA, e opcionalmente servidos do bucket R2.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { arquivoInteressa, chaveNoBucket } from '../scripts/modelos/publicar-no-r2'
import { REVISOES_DOS_MODELOS, urlFixadaDoModelo } from '../src/gateway/revisoesDosModelos'

const TINY = 'onnx-community/whisper-tiny'
const SHA_TINY = REVISOES_DOS_MODELOS[TINY]

describe('urlFixadaDoModelo', () => {
  it('troca resolve/main pelo commit fixado', () => {
    expect(urlFixadaDoModelo(`https://huggingface.co/${TINY}/resolve/main/onnx/encoder_model.onnx`)).toBe(
      `https://huggingface.co/${TINY}/resolve/${SHA_TINY}/onnx/encoder_model.onnx`,
    )
  })

  it('com o bucket, vai para <bucket>/<modelo>/<sha>/<arquivo>', () => {
    expect(
      urlFixadaDoModelo(`https://huggingface.co/${TINY}/resolve/main/config.json`, 'https://modelos.exemplo.com.br/'),
    ).toBe(`https://modelos.exemplo.com.br/${TINY}/${SHA_TINY}/config.json`)
  })

  it('modelo fora da lista, API do Hub e outros hosts ficam intocados', () => {
    const fora = 'https://huggingface.co/alguem/outro-modelo/resolve/main/config.json'
    expect(urlFixadaDoModelo(fora)).toBe(fora)
    const api = `https://huggingface.co/api/models/${TINY}`
    expect(urlFixadaDoModelo(api)).toBe(api)
    expect(urlFixadaDoModelo('/models/x/config.json')).toBe('/models/x/config.json')
  })

  it('pedido de OUTRA revisão explícita não é reescrito (quem pediu sabe o que quer)', () => {
    const outra = `https://huggingface.co/${TINY}/resolve/v1.0/config.json`
    expect(urlFixadaDoModelo(outra)).toBe(outra)
  })

  it('toda revisão é um commit (40 hex), nunca um ponteiro', () => {
    for (const [modelo, sha] of Object.entries(REVISOES_DOS_MODELOS)) {
      expect(sha, modelo).toMatch(/^[0-9a-f]{40}$/)
    }
  })
})

/** Todo modelo citado no código do gateway tem revisão fixada. */
describe('cobertura da lista', () => {
  function arquivos(dir: string, fora: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const p = path.join(dir, nome)
      if (statSync(p).isDirectory()) arquivos(p, fora)
      else if (/\.(ts|tsx)$/.test(nome) && !nome.includes('.test.')) fora.push(p)
    }
    return fora
  }

  it('os ids literais de modelo do app estão todos na lista', () => {
    const achados = new Set<string>()
    for (const f of [...arquivos('src/gateway'), 'src/lib/speakerIdWorker.ts']) {
      for (const m of readFileSync(f, 'utf8').matchAll(/['"`]((?:onnx-community|Xenova)\/[A-Za-z0-9._-]+)['"`]/g)) {
        achados.add(m[1])
      }
    }
    const semRevisao = [...achados].filter((m) => !(m in REVISOES_DOS_MODELOS))
    expect(semRevisao).toEqual([])
  })

  it('os pares dinâmicos do opus-mt (en↔es/fr/it/de) estão na lista', () => {
    for (const l of ['es', 'fr', 'it', 'de']) {
      expect(REVISOES_DOS_MODELOS[`Xenova/opus-mt-en-${l}`], `en-${l}`).toBeTruthy()
      expect(REVISOES_DOS_MODELOS[`Xenova/opus-mt-${l}-en`], `${l}-en`).toBeTruthy()
    }
  })
})

describe('publicar-no-r2: o que sobe e onde', () => {
  it('sobem configs, tokenizers e os dtypes usados — inclusive o fp32, que não tem sufixo', () => {
    expect(arquivoInteressa('config.json')).toBe(true)
    expect(arquivoInteressa('merges.txt')).toBe(true)
    expect(arquivoInteressa('onnx/encoder_model.onnx')).toBe(true)
    expect(arquivoInteressa('onnx/decoder_model_merged_q4.onnx')).toBe(true)
    expect(arquivoInteressa('onnx/model_quantized.onnx')).toBe(true)
  })

  it('não sobem dtypes que ninguém carrega nem arquivos de repositório', () => {
    expect(arquivoInteressa('onnx/decoder_model_merged_bnb4.onnx')).toBe(false)
    expect(arquivoInteressa('onnx/decoder_model_merged_q4f16.onnx')).toBe(false)
    expect(arquivoInteressa('README.md')).toBe(false)
    expect(arquivoInteressa('.gitattributes')).toBe(false)
  })

  it('a chave no bucket é o layout que urlFixadaDoModelo pede', () => {
    const chave = chaveNoBucket(TINY, SHA_TINY, 'onnx/encoder_model.onnx')
    expect(
      urlFixadaDoModelo(`https://huggingface.co/${TINY}/resolve/main/onnx/encoder_model.onnx`, 'https://b.exemplo'),
    ).toBe(`https://b.exemplo/${chave}`)
  })
})
