import { afterEach, describe, expect, it, vi } from 'vitest'

import { ID_DO_PARAKEET, parakeetLigado } from '../src/gateway/adapters/parakeetModelo'
import { gravarModeloFixo, lerModeloFixo, modeloFixoServe } from '../src/gateway/modeloFixo'
import {
  type DispositivoDaRota,
  parakeetCabeNoAparelho,
  routeStt,
  type SttRouteInput,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'

function memoria(): Record<string, string> {
  const m: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => void (m[k] = v),
    removeItem: (k: string) => void delete m[k],
  })
  return m
}

afterEach(() => vi.unstubAllGlobals())

describe('parakeetLigado: ligada de fábrica', () => {
  it('sem chave = true; "0" = false; "1" = true; sem localStorage = false', () => {
    const m = memoria()
    expect(parakeetLigado()).toBe(true)
    m['babel.stt.parakeet'] = '0'
    expect(parakeetLigado()).toBe(false)
    m['babel.stt.parakeet'] = '1'
    expect(parakeetLigado()).toBe(true)
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', undefined)
    expect(parakeetLigado()).toBe(false)
  })
})

describe('lerModeloFixo / gravarModeloFixo', () => {
  it('padrão auto, grava e lê, ignora valor inválido', () => {
    const m = memoria()
    expect(lerModeloFixo()).toBe('auto')
    gravarModeloFixo('whisper-base')
    expect(lerModeloFixo()).toBe('whisper-base')
    m['babel.stt.modeloFixo'] = 'lixo'
    expect(lerModeloFixo()).toBe('auto')
    gravarModeloFixo('auto')
    expect(lerModeloFixo()).toBe('auto')
  })
})

describe('modeloFixoServe', () => {
  it('parakeet só pt/es, moonshine só en, whisper qualquer', () => {
    expect(modeloFixoServe('parakeet', ['pt', 'es'])).toBe(true)
    expect(modeloFixoServe('parakeet', ['pt', 'fr'])).toBe(false)
    expect(modeloFixoServe('moonshine-base', ['en'])).toBe(true)
    expect(modeloFixoServe('moonshine-tiny', ['en', 'pt'])).toBe(false)
    expect(modeloFixoServe('whisper-small', ['fr', 'ja'])).toBe(true)
  })
})

describe('Parakeet cabe: Mac Apple', () => {
  const macSemMedida: DispositivoDaRota = {
    tipo: 'desktop-com-gpu',
    permiteSmall: false,
    economiaDeDados: false,
    poucaMemoria: true,
    memoriaGb: null,
  }
  it('fornecedor apple cabe; intel sem memória não', () => {
    expect(parakeetCabeNoAparelho({ ...macSemMedida, fornecedorGpu: 'apple' })).toBe(true)
    expect(parakeetCabeNoAparelho({ ...macSemMedida, fornecedorGpu: 'intel' })).toBe(false)
    expect(parakeetCabeNoAparelho({ ...macSemMedida, fornecedorGpu: 'apple', economiaDeDados: true })).toBe(false)
  })
})

describe('routeStt: Parakeet no automático e modelo fixado', () => {
  const desktop8 = {
    tipo: 'desktop-com-gpu' as const,
    permiteSmall: false,
    economiaDeDados: false,
    memoriaGb: 8,
    poucaMemoria: false,
  }
  const base: SttRouteInput = {
    contentLang: 'pt',
    autoDetect: false,
    quality: 'auto',
    hasWebGpu: false,
    cloudAvailable: false,
    profileId: 'free-web',
    dispositivo: desktop8,
    parakeet: true,
  }

  it('com cópia no aparelho: Parakeet', () => {
    const r = routeStt({ ...base, parakeetNoAparelho: true })
    expect(r.localModel).toBe(ID_DO_PARAKEET)
    expect(r.parakeetDisponivelParaBaixar).toBeUndefined()
  })

  it('sem cópia: Whisper base e avisa que o Parakeet está disponível para baixar', () => {
    const r = routeStt({ ...base, parakeetNoAparelho: false })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
    expect(r.parakeetDisponivelParaBaixar).toBe(true)
  })

  it('"preciso" entra no Parakeet mesmo sem cópia', () => {
    expect(routeStt({ ...base, quality: 'accurate', parakeetNoAparelho: false }).localModel).toBe(ID_DO_PARAKEET)
  })

  it('fixado em parakeet mas idioma fora (fr): rota do automático', () => {
    const r = routeStt({ ...base, contentLang: 'fr', modeloFixo: 'parakeet', parakeetNoAparelho: true })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
    expect(r.label).not.toContain('escolhido por você')
  })

  it('fixado em parakeet sem cópia: vai ao Parakeet (a pessoa escolheu)', () => {
    const r = routeStt({ ...base, modeloFixo: 'parakeet', parakeetNoAparelho: false })
    expect(r).toMatchObject({ localModel: ID_DO_PARAKEET, device: 'wasm', preferCloud: false })
    expect(r.label).toBe('local · escolhido por você (Parakeet v3)')
  })

  it('fixado em whisper-base: base, rótulo "escolhido por você", sem nuvem', () => {
    const r = routeStt({ ...base, modeloFixo: 'whisper-base', cloudAvailable: true, parakeetNoAparelho: true })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
    expect(r.preferCloud).toBe(false)
    expect(r.label).toContain('escolhido por você')
  })

  it('fixado em small num aparelho que não permite: ignorado', () => {
    const r = routeStt({ ...base, modeloFixo: 'whisper-small', parakeetNoAparelho: false })
    expect(r.label).not.toContain('escolhido por você')
  })

  it('fixado em moonshine só com inglês', () => {
    const en = routeStt({ ...base, contentLang: 'en', modeloFixo: 'moonshine-tiny' })
    expect(en.label).toContain('escolhido por você')
    const pt = routeStt({ ...base, modeloFixo: 'moonshine-tiny', parakeetNoAparelho: false })
    expect(pt.label).not.toContain('escolhido por você')
  })
})
