import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectedModelIds } from '../src/gateway/modelCache'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  definirEstadoDasFlags(null)
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

describe('expectedModelIds', () => {
  it('default: whisper-tiny + par EN→ROMANCE', () => {
    expect(expectedModelIds('en', 'pt')).toEqual(['onnx-community/whisper-tiny', 'Xenova/opus-mt-en-ROMANCE'])
  })

  it('respeita o override babel.whisperModel (o bug do falso "Baixando")', () => {
    store.set('babel.whisperModel', 'onnx-community/whisper-base')
    expect(expectedModelIds('pt', 'en')).toEqual(['onnx-community/whisper-base', 'Xenova/opus-mt-ROMANCE-en'])
  })

  it('par sem opus-mt local não espera modelo de MT', () => {
    // O hindi não tem modelo X→inglês aprovado (`core/traducao/viaIngles.ts`); o japonês, o chinês e outros passam pelo inglês.
    expect(expectedModelIds('hi', 'pt')).toEqual(['onnx-community/whisper-tiny'])
  })

  it('aceita BCP-47 completo', () => {
    expect(expectedModelIds('en-US', 'pt-BR')).toContain('Xenova/opus-mt-en-ROMANCE')
  })
})

/* A9b: com o Bergamot oferecido (modelo no build, navegador capaz, sem falha lembrada), o pt→en
   espera o Bergamot — é ele que a captura carrega, e o aviso de download conta os 31 MB dele. */
describe('expectedModelIds com o Bergamot', () => {
  beforeEach(() => {
    vi.stubGlobal('__BERGAMOT_PT_EN__', true)
    vi.stubGlobal('Worker', class {})
  })

  it('pt→en com o Bergamot oferecido: bergamot/pt-en no lugar do opus-mt ROMANCE-en', () => {
    expect(expectedModelIds('pt-BR', 'en')).toEqual(['onnx-community/whisper-tiny', 'bergamot/pt-en'])
  })

  it('en→pt continua no opus-mt (o Bergamot escreve português europeu)', () => {
    expect(expectedModelIds('en', 'pt')).toEqual(['onnx-community/whisper-tiny', 'Xenova/opus-mt-en-ROMANCE'])
  })

  it('com o CDN: ja→en, ja→pt, es→en e es→pt (pivô, CEL-01) esperam o Bergamot na primeira perna', () => {
    vi.stubGlobal('__BERGAMOT_CDN__', true)
    // Os pares do CDN só abrem com a flag `traducao_local_por_direcao` (openspec traducao-local-por-direcao).
    definirEstadoDasFlags({ traducao_local_por_direcao: { ligada: true } })
    expect(expectedModelIds('ja', 'en')).toEqual(['onnx-community/whisper-tiny', 'bergamot/ja-en'])
    expect(expectedModelIds('ja', 'pt')).toEqual([
      'onnx-community/whisper-tiny',
      'bergamot/ja-en',
      'Xenova/opus-mt-en-ROMANCE',
    ])
    expect(expectedModelIds('es', 'en')).toEqual(['onnx-community/whisper-tiny', 'bergamot/es-en'])
    expect(expectedModelIds('es', 'pt')).toEqual([
      'onnx-community/whisper-tiny',
      'bergamot/es-en',
      'Xenova/opus-mt-en-ROMANCE',
    ])
  })

  it('com a nuvem consentida, es→pt não espera modelo de tradução (o gateway tira o pivô da cascata)', () => {
    expect(expectedModelIds('es', 'pt', undefined, { nuvemConsentida: true })).toEqual(['onnx-community/whisper-tiny'])
    expect(expectedModelIds('en', 'pt', undefined, { nuvemConsentida: true })).toContain('Xenova/opus-mt-en-ROMANCE')
  })

  it('sem o CDN: es→pt espera as duas pernas do opus-mt (es-en dedicado e en→pt)', () => {
    vi.stubGlobal('__BERGAMOT_CDN__', false)
    expect(expectedModelIds('es', 'pt')).toEqual([
      'onnx-community/whisper-tiny',
      'Xenova/opus-mt-es-en',
      'Xenova/opus-mt-en-ROMANCE',
    ])
  })

  it('sem o CDN: o opus-mt de antes também no ja→en', () => {
    vi.stubGlobal('__BERGAMOT_CDN__', false)
    expect(expectedModelIds('ja', 'en')).toContain('Xenova/opus-mt-ja-en')
  })

  it('build sem o modelo: o opus-mt de antes', () => {
    vi.stubGlobal('__BERGAMOT_PT_EN__', false)
    expect(expectedModelIds('pt', 'en')).toContain('Xenova/opus-mt-ROMANCE-en')
  })

  it('motor que já falhou neste aparelho: o opus-mt (é ele que vai carregar)', () => {
    store.set(
      'babel.bergamot.falha',
      JSON.stringify({ assinatura: '0.4.9|retrain_hr_drxrs5bGSsOWvfK9lyZISw', motivo: 'CompileError' }),
    )
    expect(expectedModelIds('pt', 'en')).toContain('Xenova/opus-mt-ROMANCE-en')
  })
})
