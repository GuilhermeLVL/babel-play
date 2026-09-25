/**
 * O SELF-HOST BAIXA EXATAMENTE OS PESOS QUE O RUNTIME PEDE.
 *
 * `scripts/fetch-models.mjs` filtrava os `.onnx` por sufixo de dtype (`_q4.`, `_fp32.`…). Só que no
 * transformers.js o fp32 é o arquivo SEM sufixo (`encoder_model.onnx`) — nenhum `_fp32` existe no
 * Hub. O Whisper carrega no `hybrid` (encoder fp32 + decoder q4): o self-host baixava o decoder e
 * pulava o encoder, e a primeira captura offline falhava procurando um arquivo que "já tinha sido
 * baixado". Agora cada modelo diz o dtype que o worker usa, e a seleção sai dele.
 */
import { describe, expect, it } from 'vitest'

import { arquivosOnnxDoDtype, MODELOS, selecionarArquivos } from '../scripts/fetch-models.mjs'

/** Um repo "cheio": todos os dtypes que o Hub costuma publicar, mais os arquivos de config. */
function repo(modulos: string[]) {
  const sufixos = ['', '_fp16', '_int8', '_uint8', '_q4', '_q4f16', '_bnb4', '_quantized']
  return [
    'config.json',
    'tokenizer.json',
    'README.md',
    ...modulos.flatMap((m) => sufixos.map((s) => `onnx/${m}${s}.onnx`)),
  ]
}

const onnx = (arquivos: string[]) => arquivos.filter((p) => p.endsWith('.onnx')).sort()

describe('arquivosOnnxDoDtype', () => {
  it('fp32 é o arquivo sem sufixo; q8 é `_quantized`; q4 é `_q4`', () => {
    expect(arquivosOnnxDoDtype(['model'], 'fp32')).toEqual(['onnx/model.onnx'])
    expect(arquivosOnnxDoDtype(['model'], 'q8')).toEqual(['onnx/model_quantized.onnx'])
    expect(arquivosOnnxDoDtype(['model'], 'q4')).toEqual(['onnx/model_q4.onnx'])
  })

  it('dtype por módulo (o hybrid do Whisper)', () => {
    expect(
      arquivosOnnxDoDtype(['encoder_model', 'decoder_model_merged'], {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      }),
    ).toEqual(['onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx'])
  })

  it('dtype desconhecido é erro, não um filtro que não casa com nada', () => {
    expect(() => arquivosOnnxDoDtype(['model'], 'q3')).toThrow(/q3/)
  })
})

describe('selecionarArquivos', () => {
  it('whisper-tiny (hybrid): encoder fp32 SEM sufixo + decoder merged q4', () => {
    const sel = selecionarArquivos('onnx-community/whisper-tiny', repo(['encoder_model', 'decoder_model_merged']))
    expect(onnx(sel)).toEqual(['onnx/decoder_model_merged_q4.onnx', 'onnx/encoder_model.onnx'])
  })

  it.each(['onnx-community/moonshine-base-ONNX', 'onnx-community/moonshine-tiny-ONNX'])(
    '%s (q8): os dois `_quantized`',
    (id) => {
      const sel = selecionarArquivos(id, repo(['encoder_model', 'decoder_model_merged']))
      expect(onnx(sel)).toEqual(['onnx/decoder_model_merged_quantized.onnx', 'onnx/encoder_model_quantized.onnx'])
    },
  )

  it.each(['Xenova/opus-mt-en-ROMANCE', 'Xenova/opus-mt-ROMANCE-en'])('%s (q8, o que o ORT aceita)', (id) => {
    const sel = selecionarArquivos(id, repo(['encoder_model', 'decoder_model_merged', 'decoder_model']))
    expect(onnx(sel)).toEqual(['onnx/decoder_model_merged_quantized.onnx', 'onnx/encoder_model_quantized.onnx'])
  })

  it('wespeaker (q8): model_quantized', () => {
    const sel = selecionarArquivos('onnx-community/wespeaker-voxceleb-resnet34-LM', repo(['model']))
    expect(onnx(sel)).toEqual(['onnx/model_quantized.onnx'])
  })

  it('configs e tokenizers vêm sempre', () => {
    const sel = selecionarArquivos('onnx-community/whisper-tiny', repo(['encoder_model']))
    expect(sel).toEqual(expect.arrayContaining(['config.json', 'tokenizer.json', 'README.md']))
  })

  it('pesos externos (`.onnx_data`) acompanham o .onnx escolhido, e só ele', () => {
    const sel = selecionarArquivos('onnx-community/whisper-tiny', [
      'onnx/encoder_model.onnx',
      'onnx/encoder_model.onnx_data',
      'onnx/encoder_model_fp16.onnx_data',
      'onnx/decoder_model_merged_q4.onnx',
    ])
    expect(sel).toContain('onnx/encoder_model.onnx_data')
    expect(sel).not.toContain('onnx/encoder_model_fp16.onnx_data')
  })

  it('--onnx-dtype (override manual): fp32 casa com o arquivo sem sufixo', () => {
    const sel = selecionarArquivos('onnx-community/whisper-tiny', repo(['encoder_model']), ['fp32', 'q4'])
    expect(onnx(sel)).toEqual(['onnx/encoder_model.onnx', 'onnx/encoder_model_q4.onnx'])
  })

  it('todo modelo da lista tem dtype declarado', () => {
    for (const id of MODELOS.map((m: { id: string }) => m.id)) {
      expect(
        onnx(selecionarArquivos(id, repo(['encoder_model', 'decoder_model_merged', 'model']))).length,
      ).toBeGreaterThan(0)
    }
  })
})
