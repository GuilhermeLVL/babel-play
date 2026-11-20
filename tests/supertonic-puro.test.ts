import { describe, expect, it } from 'vitest'

import {
  ARQUIVOS_DO_SUPERTONIC,
  BYTES_DO_SUPERTONIC,
  emendar,
  idiomaDoSupertonic,
  idsDoTexto,
  MB_DO_SUPERTONIC,
  TETO_DO_TRECHO,
  textoParaOModelo,
  trechosParaSintese,
  urlDoArquivo,
  velocidadeDoModelo,
  VOZES_DO_SUPERTONIC,
} from '../src/core/voz/supertonic'

describe('Supertonic: arquivos fixados', () => {
  it('16 arquivos (4 ONNX, tts.json, indexador, 10 vozes), sha256 de 64 hex, total ≈ 401 MB', () => {
    expect(ARQUIVOS_DO_SUPERTONIC).toHaveLength(16)
    for (const a of ARQUIVOS_DO_SUPERTONIC) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
    for (const v of VOZES_DO_SUPERTONIC)
      expect(ARQUIVOS_DO_SUPERTONIC.some((a) => a.caminho === `voice_styles/${v}.json`)).toBe(true)
    expect(BYTES_DO_SUPERTONIC).toBe(401_276_744)
    expect(MB_DO_SUPERTONIC).toBe(401)
  })

  it('a URL junta a raiz e o caminho sem barra dupla', () => {
    const a = ARQUIVOS_DO_SUPERTONIC[0]
    expect(urlDoArquivo('http://localhost:3185/assets/', a)).toBe('http://localhost:3185/assets/onnx/tts.json')
  })
})

describe('Supertonic: texto', () => {
  it('prepara número e moeda antes do modelo (o modelo não normaliza)', () => {
    const [t] = trechosParaSintese('Custa R$ 39,90.', 'pt')
    expect(t).not.toMatch(/\d/)
    expect(t).toContain('reais')
  })

  it('frase longa vira trechos de até 120 caracteres, cortados na vírgula', () => {
    const longa =
      'Quando a chuva finalmente parou, as crianças correram para o quintal, recolheram as folhas molhadas do chão e, rindo muito, decidiram construir um pequeno barco de papel para soltar no riacho atrás da casa.'
    const trechos = trechosParaSintese(longa, 'pt')
    expect(trechos.length).toBeGreaterThan(1)
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(TETO_DO_TRECHO)
    expect(trechos.join(' ').replace(/\s+/g, ' ')).toBe(longa)
  })

  it('o texto do modelo: travessão vira hífen, ponto final, marca de idioma', () => {
    expect(textoParaOModelo('Olá — disse ela', 'pt')).toBe('<pt>Olá - disse ela.</pt>'.normalize('NFKD'))
    expect(textoParaOModelo('Oi !', 'pt')).toBe('<pt>Oi!</pt>')
  })

  it('ids por caractere, -1 fora da tabela', () => {
    const ids = idsDoTexto('ab', [0, ...Array(96).fill(5), 7])
    expect([...ids]).toEqual([7n, -1n])
  })

  it('idioma: só pt, en e es', () => {
    expect(idiomaDoSupertonic('pt-BR')).toBe('pt')
    expect(idiomaDoSupertonic('es')).toBe('es')
    expect(idiomaDoSupertonic('fr')).toBeNull()
  })

  it('velocidade: 1,05 × a narração, entre 0,5 e 2', () => {
    expect(velocidadeDoModelo(1)).toBeCloseTo(1.05)
    expect(velocidadeDoModelo(3)).toBe(2)
    expect(velocidadeDoModelo(0.1)).toBe(0.5)
    expect(velocidadeDoModelo(Number.NaN)).toBeCloseTo(1.05)
  })

  it('emendar põe o silêncio entre os trechos', () => {
    const r = emendar([new Float32Array([1, 1]), new Float32Array([2])], 10, 0.2)
    expect([...r]).toEqual([1, 1, 0, 0, 2])
  })
})
