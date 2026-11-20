/** KITTEN TTS 2, a parte pura: arquivos fixados, vozes, ids, estilo, corte do áudio e leitura do .npz. */
import { describe, expect, it } from 'vitest'

import {
  apararTrecho,
  ARQUIVOS_DO_KITTEN,
  arquivosDoIdioma,
  bytesDe,
  emendarTrechos,
  estiloParaTokens,
  fonemasParaSintese,
  idiomaDoKitten,
  idsDosFonemas,
  lerNpz,
  modeloDoIdioma,
  PAUSA_ENTRE_TRECHOS_KITTEN_S,
  TAXA_DO_KITTEN,
  trechosDeFonemas,
  urlDoArquivoDoKitten,
  velocidadeDoKitten,
  vozDoKitten,
  VOZES_DO_KITTEN,
} from '../src/core/voz/kitten'

/** Um .npz como o `np.savez` grava: zip sem compressão de .npy float32. */
function npz(arrays: Record<string, { forma: number[]; dados: number[] }>): Uint8Array {
  const partes: Uint8Array[] = []
  for (const [nome, a] of Object.entries(arrays)) {
    let cab = `{'descr': '<f4', 'fortran_order': False, 'shape': (${a.forma.join(', ')}${a.forma.length === 1 ? ',' : ''}), }`
    while ((10 + cab.length + 1) % 64) cab += ' '
    cab += '\n'
    const npy = new Uint8Array(10 + cab.length + a.dados.length * 4)
    npy.set([0x93, ...new TextEncoder().encode('NUMPY'), 1, 0], 0)
    new DataView(npy.buffer).setUint16(8, cab.length, true)
    npy.set(new TextEncoder().encode(cab), 10)
    new Float32Array(npy.buffer, 10 + cab.length).set(a.dados)
    const n = new TextEncoder().encode(`${nome}.npy`)
    const local = new Uint8Array(30 + n.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(8, 0, true)
    dv.setUint32(18, npy.length, true)
    dv.setUint32(22, npy.length, true)
    dv.setUint16(26, n.length, true)
    local.set(n, 30)
    partes.push(local, npy)
  }
  const fim = new Uint8Array(4)
  new DataView(fim.buffer).setUint32(0, 0x02014b50, true) // começo do diretório central: o leitor para aqui
  partes.push(fim)
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

describe('arquivos e vozes', () => {
  it('todo arquivo tem tamanho e sha256 fixados', () => {
    for (const v of ['mini', 'pico'] as const)
      for (const a of ARQUIVOS_DO_KITTEN[v]) {
        expect(a.bytes).toBeGreaterThan(0)
        expect(a.sha256).toMatch(/^[0-9a-f]{64}$/)
      }
  })

  it('o pico baixa só o modelo do idioma; o mini, o modelo único', () => {
    expect(arquivosDoIdioma('pico', 'pt').map((a) => a.caminho)).toContain('kitten_tts_2_pico_pt.onnx')
    expect(arquivosDoIdioma('pico', 'pt').map((a) => a.caminho)).not.toContain('kitten_tts_2_pico_es.onnx')
    expect(arquivosDoIdioma('pico', 'pt').map((a) => a.caminho)).not.toContain('g2p/cmu_misaki_us.json')
    expect(arquivosDoIdioma('pico', 'en').map((a) => a.caminho)).toContain('g2p/cmu_misaki_us.json')
    expect(modeloDoIdioma('mini', 'es')).toBe('kitten_tts_2_mini.onnx')
    /* ~10 MB por idioma no celular; ~90 MB no computador */
    expect(bytesDe(arquivosDoIdioma('pico', 'pt')) / 1e6).toBeLessThan(11)
    expect(bytesDe(arquivosDoIdioma('mini', 'pt')) / 1e6).toBeLessThan(91)
  })

  it('a URL é <raiz>/<variante>/<caminho>', () => {
    expect(urlDoArquivoDoKitten('https://m.x/kitten-tts-2/', 'pico', arquivosDoIdioma('pico', 'pt')[0])).toBe(
      'https://m.x/kitten-tts-2/pico/vocab.json',
    )
  })

  it('vozes do model card, a 1ª é a padrão; nome ou chave servem, o resto cai na padrão', () => {
    expect(VOZES_DO_KITTEN.mini.pt.map((v) => v.nome)).toEqual(['Beatriz', 'Thiago'])
    expect(VOZES_DO_KITTEN.pico.es.map((v) => v.nome)).toEqual(['Sofia', 'Pablo'])
    expect(vozDoKitten('mini', 'pt', 'Thiago').chave).toBe('thiago')
    expect(vozDoKitten('pico', 'pt', 'Luciana (pt-BR)').chave).toBe('juliana')
    expect(idiomaDoKitten('pt-BR')).toBe('pt')
    expect(idiomaDoKitten('fr')).toBeNull()
    expect(velocidadeDoKitten(5)).toBe(2)
    expect(velocidadeDoKitten(Number.NaN)).toBe(1)
  })
})

describe('entrada e saída do modelo', () => {
  const vocab = { ',': 3, '.': 4, ' ': 16, a: 43, b: 44 }
  it('ids: [0] + símbolos conhecidos + [10, 0]; parêntese vira vírgula; desconhecido sai', () => {
    expect(idsDosFonemas('ab (a).', vocab)).toEqual([0, 43, 44, 16, 3, 43, 3, 4, 10, 0])
    expect(idsDosFonemas('aũ', vocab)).toEqual([0, 43, 10, 0])
  })

  it('fonemas longos são cortados nos espaços', () => {
    const t = trechosDeFonemas('aaa bbb ccc', 8)
    expect(t).toEqual(['aaa bbb', 'ccc'])
  })

  it('o estilo é a linha de (tokens − 1), limitada ao pacote', () => {
    const pacote = Float32Array.from({ length: 3 * 2 }, (_, i) => i)
    expect(Array.from(estiloParaTokens(pacote, 2, 2))).toEqual([2, 3])
    expect(Array.from(estiloParaTokens(pacote, 2, 99))).toEqual([4, 5])
  })

  it('aparar: tira o quadro do token final (e o inicial fora do 1º trecho), limita a ±1, rampas', () => {
    const wav = new Float32Array(100).fill(2)
    const dur = [2, 6, 2] // 10 quadros → 10 amostras por quadro
    const primeiro = apararTrecho(wav, dur, true)
    expect(primeiro.length).toBe(90)
    expect(Math.max(...primeiro)).toBe(1)
    expect(primeiro[0]).toBe(0)
    expect(apararTrecho(wav, dur, false).length).toBe(80)
  })

  it('emendar põe 0,15 s entre os trechos', () => {
    const r = emendarTrechos([new Float32Array(10), new Float32Array(10)])
    expect(r.length).toBe(20 + Math.floor(PAUSA_ENTRE_TRECHOS_KITTEN_S * TAXA_DO_KITTEN))
  })

  it('texto vira trechos de fonemas, com números por extenso em pt', () => {
    const t = fonemasParaSintese('Tenho 2 gatos. Eles dormem.', 'pt')
    expect(t).toHaveLength(2)
    expect(t[0]).toContain('dˈoɪz ɡˈatʊs')
  })
})

describe('lerNpz', () => {
  it('lê os arrays float32 com a forma', () => {
    const m = lerNpz(npz({ juliana: { forma: [2, 3], dados: [1, 2, 3, 4, 5, 6] }, caio: { forma: [1], dados: [9] } }))
    expect([...m.keys()]).toEqual(['juliana', 'caio'])
    expect(m.get('juliana')!.forma).toEqual([2, 3])
    expect(Array.from(m.get('juliana')!.dados)).toEqual([1, 2, 3, 4, 5, 6])
    expect(Array.from(m.get('caio')!.dados)).toEqual([9])
  })

  it('nome com acento sai em UTF-8, igual ao TextDecoder', () => {
    const m = lerNpz(npz({ 'joão-ñ-€-𝄞': { forma: [1], dados: [7] } }))
    expect([...m.keys()]).toEqual(['joão-ñ-€-𝄞'])
  })

  it('arquivo que não é npz lança', () => {
    expect(() => lerNpz(new Uint8Array(40))).toThrow()
  })
})
