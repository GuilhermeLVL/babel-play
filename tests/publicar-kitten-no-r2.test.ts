/** O espelho dos pesos do Kitten: layout do bucket = o do app, revisão fixada, nunca de `main`. */
import { describe, expect, it } from 'vitest'

import {
  chaveDoKitten,
  origemDoKitten,
  PREFIXO_DO_KITTEN,
  tipoDoKitten,
} from '../scripts/modelos/publicar-kitten-no-r2'
import { ARQUIVOS_DO_KITTEN, REVISAO_DO_KITTEN, urlDoArquivoDoKitten } from '../src/core/voz/kitten'

describe('publicar-kitten-no-r2', () => {
  it('a chave no bucket é o caminho que o app pede a partir de <domínio>/kitten-tts-2', () => {
    for (const v of ['mini', 'pico'] as const)
      for (const a of ARQUIVOS_DO_KITTEN[v])
        expect(urlDoArquivoDoKitten(`https://m.example/${PREFIXO_DO_KITTEN}`, v, a)).toBe(
          `https://m.example/${chaveDoKitten(v, a.caminho)}`,
        )
  })

  it('baixa da revisão fixada de cada repositório', () => {
    expect(origemDoKitten('pico', 'vocab.json')).toBe(
      `https://huggingface.co/KittenML/kitten-tts-2-pico/resolve/${REVISAO_DO_KITTEN.pico}/vocab.json`,
    )
    expect(origemDoKitten('mini', 'vocab.json')).not.toContain('/main/')
  })

  it('json como json, o resto binário', () => {
    expect(tipoDoKitten('g2p/cmu_misaki_us.json')).toBe('application/json')
    expect(tipoDoKitten('voices_pt.npz')).toBe('application/octet-stream')
  })
})
