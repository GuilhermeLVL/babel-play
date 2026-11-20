import { describe, expect, it } from 'vitest'

import { entradaDoParakeet } from '../src/gateway/modeloFixo'
import { routeStt } from '../src/gateway/sttRouter'

describe('entradaDoParakeet (veto)', () => {
  it('vetado: sem cópia contada e o fixo "parakeet" vira automático', () => {
    expect(entradaDoParakeet(true, true, 'parakeet')).toEqual({ parakeetNoAparelho: false, modeloFixo: 'auto' })
  })
  it('vetado mantém outro modelo fixado', () => {
    expect(entradaDoParakeet(true, true, 'whisper-base').modeloFixo).toBe('whisper-base')
  })
  it('não vetado: segue a cópia e o fixo', () => {
    expect(entradaDoParakeet(false, true, 'parakeet')).toEqual({ parakeetNoAparelho: true, modeloFixo: 'parakeet' })
    expect(entradaDoParakeet(false, false, 'auto').parakeetNoAparelho).toBe(false)
  })
  it('com o roteador: fixo parakeet vetado não resulta em Parakeet', () => {
    const base = {
      contentLang: 'pt',
      micLang: '',
      soMicrofone: false,
      autoDetect: false,
      quality: 'balanced',
      hasWebGpu: true,
      cloudAvailable: false,
      profileId: 'adult',
      parakeet: true,
    } as never
    const sem = routeStt({ ...(base as object), ...entradaDoParakeet(true, true, 'parakeet') } as never)
    expect(sem.localModel).not.toBe('parakeet-tdt-0.6b-v3')
  })
})
