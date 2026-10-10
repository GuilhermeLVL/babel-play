/**
 * PARAKEET — o que o app sabe do modelo antes de abrir o worker: a chave (desligada de fábrica), os
 * idiomas, os arquivos FIXADOS (commit + sha256) e de onde eles vêm.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ARQUIVOS_DO_PARAKEET,
  BYTES_DO_PARAKEET,
  planoDeCargaDoParakeet,
} from '../src/gateway/adapters/parakeetArquivos'
import {
  CHAVE_DO_PARAKEET,
  ehParakeet,
  ID_DO_PARAKEET,
  MB_DO_PARAKEET,
  parakeetAceita,
  parakeetLigado,
  REVISAO_DO_PARAKEET,
  revisaoFixaDoParakeet,
} from '../src/gateway/adapters/parakeetModelo'

afterEach(() => vi.unstubAllGlobals())

describe('a chave', () => {
  it('sem localStorage, ou sem a chave: DESLIGADA', () => {
    expect(parakeetLigado()).toBe(false)
    vi.stubGlobal('localStorage', { getItem: () => null })
    expect(parakeetLigado()).toBe(false)
  })

  it("só o valor '1' liga", () => {
    for (const [valor, esperado] of [
      ['1', true],
      ['true', false],
      ['0', false],
      ['', false],
    ] as const) {
      vi.stubGlobal('localStorage', { getItem: (k: string) => (k === CHAVE_DO_PARAKEET ? valor : null) })
      expect(parakeetLigado(), valor).toBe(esperado)
    }
  })

  it('localStorage que lança (modo restrito) não derruba a rota', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(parakeetLigado()).toBe(false)
  })
})

describe('idiomas e id', () => {
  it('aceita só português e espanhol com dica explícita', () => {
    expect(parakeetAceita('pt')).toBe(true)
    expect(parakeetAceita('pt-BR')).toBe(true)
    expect(parakeetAceita('ES')).toBe(true)
    expect(parakeetAceita('en')).toBe(false)
    expect(parakeetAceita('fr')).toBe(false)
    expect(parakeetAceita('')).toBe(false) // "Detectar"
    expect(parakeetAceita(undefined)).toBe(false)
  })

  it('reconhece o id e devolve a revisão fixada só para ele', () => {
    expect(ehParakeet(ID_DO_PARAKEET)).toBe(true)
    expect(ehParakeet('onnx-community/whisper-base')).toBe(false)
    expect(ehParakeet(undefined)).toBe(false)
    expect(revisaoFixaDoParakeet(ID_DO_PARAKEET)).toBe(REVISAO_DO_PARAKEET)
    expect(revisaoFixaDoParakeet('bergamot/pt-en')).toBeNull()
  })
})

describe('os arquivos fixados', () => {
  it('quatro arquivos, 672 MB (o que a bancada baixou), o encoder por último', () => {
    expect(ARQUIVOS_DO_PARAKEET.map((a) => a.papel)).toEqual(['vocab', 'pre', 'decoder', 'encoder'])
    expect(BYTES_DO_PARAKEET).toBe(671_670_240)
    // O número que a rota anuncia (pedaço leve, no arranque) é o teto do que os arquivos somam.
    expect(MB_DO_PARAKEET).toBe(Math.ceil(BYTES_DO_PARAKEET / 1_000_000))
    expect(MB_DO_PARAKEET).toBe(672)
  })

  it('a revisão do manifesto é o começo dos dois commits fixados', () => {
    const commits = [...new Set(ARQUIVOS_DO_PARAKEET.map((a) => a.revisao))]
    expect(commits).toHaveLength(2)
    const [istupakov, striimit] = ['istupakov', 'striimit'].map(
      (dono) => ARQUIVOS_DO_PARAKEET.find((a) => a.repo.startsWith(`${dono}/`))!.revisao,
    )
    expect(REVISAO_DO_PARAKEET).toBe(`${istupakov.slice(0, 12)}+${striimit.slice(0, 12)}`)
  })

  it('todo arquivo aponta para um COMMIT (40 hex) e tem sha256 (64 hex), nunca um ponteiro', () => {
    for (const a of ARQUIVOS_DO_PARAKEET) {
      expect(a.revisao, a.nome).toMatch(/^[0-9a-f]{40}$/)
      expect(a.sha256, a.nome).toMatch(/^[0-9a-f]{64}$/)
      expect(a.bytes, a.nome).toBeGreaterThan(0)
    }
  })

  it('o extrator de áudio é o de convolução (o `nemo128.onnx` com STFT não abre no onnxruntime-web)', () => {
    const pre = ARQUIVOS_DO_PARAKEET.find((a) => a.papel === 'pre')!
    expect(pre.nome).toBe('nemo128_conv.onnx')
    expect(pre.repo).toBe('striimit/parakeet-tdt-0.6b-v3-webgpu')
  })
})

describe('planoDeCargaDoParakeet: de onde vêm os pesos', () => {
  const origem = 'https://app.exemplo/captura'

  it('padrão: o Hub, no commit fixado (`resolve/<sha>`, nunca `main`)', () => {
    const p = planoDeCargaDoParakeet({ origem })
    expect(p.modelId).toBe(ID_DO_PARAKEET)
    expect(p.bytesTotais).toBe(BYTES_DO_PARAKEET)
    expect(p.arquivos.find((a) => a.papel === 'encoder')!.url).toBe(
      'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/encoder-model.int8.onnx',
    )
    expect(p.arquivos.find((a) => a.papel === 'pre')!.url).toBe(
      'https://huggingface.co/striimit/parakeet-tdt-0.6b-v3-webgpu/resolve/d233168ffeab292a6b3d2379a5b2d5934e1df8a7/nemo128_conv.onnx',
    )
    for (const a of p.arquivos) expect(a.url).not.toContain('/main/')
  })

  it('bucket (VITE_SELF_HOST_MODELS=<url>): `<bucket>/<repo>/<sha>/<arquivo>`, o layout do publicar-no-r2', () => {
    const p = planoDeCargaDoParakeet({ origem, entrega: 'https://modelos.exemplo.com.br/' })
    expect(p.arquivos.find((a) => a.papel === 'vocab')!.url).toBe(
      'https://modelos.exemplo.com.br/istupakov/parakeet-tdt-0.6b-v3-onnx/8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce/vocab.txt',
    )
  })

  it('mesmo domínio (VITE_SELF_HOST_MODELS=1): `/models/<repo>/<arquivo>`', () => {
    const p = planoDeCargaDoParakeet({ origem, entrega: '1' })
    expect(p.arquivos.find((a) => a.papel === 'decoder')!.url).toBe(
      'https://app.exemplo/models/istupakov/parakeet-tdt-0.6b-v3-onnx/decoder_joint-model.int8.onnx',
    )
  })

  it('http só para o próprio computador (bancada); outro http cai no Hub', () => {
    expect(planoDeCargaDoParakeet({ origem, entrega: 'http://127.0.0.1:4599' }).arquivos[0].url).toMatch(
      /^http:\/\/127\.0\.0\.1:4599\/istupakov\//,
    )
    expect(planoDeCargaDoParakeet({ origem, entrega: 'http://localhost:4599/' }).arquivos[0].url).toMatch(
      /^http:\/\/localhost:4599\/istupakov\//,
    )
    expect(planoDeCargaDoParakeet({ origem, entrega: 'http://modelos.exemplo.com' }).arquivos[0].url).toMatch(
      /^https:\/\/huggingface\.co\//,
    )
    expect(planoDeCargaDoParakeet({ origem, entrega: 'http://127.0.0.1.exemplo.com' }).arquivos[0].url).toMatch(
      /^https:\/\/huggingface\.co\//,
    )
  })

  it('toda URL contém o id do modelo: é por ele que "Liberar espaço" e o manifesto acham os arquivos', () => {
    for (const entrega of [undefined, '1', 'https://b.exemplo', 'http://127.0.0.1:1'])
      for (const a of planoDeCargaDoParakeet({ origem, entrega }).arquivos)
        expect(a.url, `${entrega} ${a.papel}`).toContain(ID_DO_PARAKEET)
  })
})
