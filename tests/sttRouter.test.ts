import { describe, expect, it } from 'vitest'

import {
  MODEL_DOWNLOAD_MB,
  MODEL_DOWNLOAD_MEDIDO,
  modeloLocalDaImportacao,
  MOONSHINE_MODELS,
  nomeLegivelDoModelo,
  routeStt,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'

const base = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto' as const,
  hasWebGpu: true,
  cloudAvailable: true,
  profileId: 'free-web',
}

describe('routeStt — a régua de qualidade por idioma', () => {
  it('inglês em auto COM nuvem → nuvem primeiro, moonshine-base de reserva (bancada: 4,9% contra 13,5% de WER)', () => {
    // Auditoria de eficiência 2026-09-28, achado 5: quem paga recebia o Moonshine local em inglês.
    const r = routeStt({ ...base, contentLang: 'en' })
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: true, dtype: 'q8' })
    expect(r.label).toBe('nuvem (large-v3-turbo) · reserva local')
  })

  it('inglês em auto SEM nuvem fica LOCAL no moonshine-base (10,9% WER vs 19,7% do whisper-tiny)', () => {
    const r = routeStt({ ...base, contentLang: 'en', cloudAvailable: false })
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: false })
    expect(r.label).toBe('local · inglês (moonshine)')
  })

  it('inglês em auto no perfil Privado/Local continua no moonshine, sem nuvem', () => {
    const r = routeStt({ ...base, contentLang: 'en', profileId: 'local-private' })
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: false })
  })

  it('não-EN em auto com nuvem disponível → nuvem primeiro, reserva base', () => {
    const r = routeStt({ ...base, contentLang: 'pt' })
    expect(r.preferCloud).toBe(true)
    expect(r.localModel).toBe(WHISPER_MODELS.base)
  })

  it('não-EN sem nuvem → small no WebGPU', () => {
    const r = routeStt({ ...base, cloudAvailable: false })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, preferCloud: false })
  })

  it('não-EN sem nuvem e SEM WebGPU → base (small é lento demais em WASM)', () => {
    const r = routeStt({ ...base, cloudAvailable: false, hasWebGpu: false })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
  })

  it('multi-idioma (autoDetect) conta como não-EN mesmo com contentLang en', () => {
    const r = routeStt({ ...base, contentLang: 'en', autoDetect: true })
    expect(r.preferCloud).toBe(true)
  })

  it('perfil Privado/Local NUNCA prefere nuvem, em nenhuma qualidade', () => {
    for (const quality of ['auto', 'cloud'] as const) {
      const r = routeStt({ ...base, profileId: 'local-private', quality })
      expect(r.preferCloud).toBe(false)
    }
  })

  it('qualidade "fast" força whisper-tiny em PT (moonshine é só inglês)', () => {
    expect(routeStt({ ...base, quality: 'fast' }).localModel).toBe(WHISPER_MODELS.tiny)
  })

  it('qualidade "fast" em inglês usa o menor de todos: moonshine-tiny', () => {
    const r = routeStt({ ...base, contentLang: 'en', quality: 'fast' })
    expect(r.localModel).toBe(MOONSHINE_MODELS.tiny)
    expect(r.label).toContain('moonshine')
  })

  it('qualidade "fast" com mic em PT não usa moonshine', () => {
    expect(routeStt({ ...base, contentLang: 'en', micLang: 'pt', quality: 'fast' }).localModel).toBe(
      WHISPER_MODELS.tiny,
    )
  })

  it('qualidade "cloud" em inglês: a reserva local é o moonshine-base', () => {
    const r = routeStt({ ...base, contentLang: 'en', quality: 'cloud' })
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: true })
  })

  it('qualidade "accurate" força o melhor local e ignora a nuvem', () => {
    const r = routeStt({ ...base, quality: 'accurate' })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, preferCloud: false })
  })

  it('qualidade "cloud" sem nuvem disponível degrada honesto para o melhor local', () => {
    const r = routeStt({ ...base, quality: 'cloud', cloudAvailable: false })
    expect(r.preferCloud).toBe(false)
    expect(r.localModel).toBe(WHISPER_MODELS.small)
    expect(r.label).toContain('indisponível')
  })

  it('BCP-47 completo é normalizado (en-US → inglês)', () => {
    expect(routeStt({ ...base, contentLang: 'en-US', cloudAvailable: false }).localModel).toBe(MOONSHINE_MODELS.base)
    expect(routeStt({ ...base, contentLang: 'en-US' }).localModel).toBe(MOONSHINE_MODELS.base)
  })
})

describe('routeStt — o mesmo modelo decodifica o MICROFONE', () => {
  it('ouvindo inglês mas falando português ao mic → nem tiny nem moonshine (só inglês)', () => {
    const r = routeStt({ ...base, contentLang: 'en', micLang: 'pt', cloudAvailable: false })
    expect(r.localModel).not.toBe(WHISPER_MODELS.tiny)
    expect(r.localModel).not.toMatch(/moonshine/)
  })
  it('inglês nas duas fontes continua no moonshine', () => {
    expect(routeStt({ ...base, contentLang: 'en', micLang: 'en-US' }).localModel).toBe(MOONSHINE_MODELS.base)
  })
  it('mic desligado (micLang vazio) não muda a rota do inglês', () => {
    expect(routeStt({ ...base, contentLang: 'en', micLang: '' }).localModel).toBe(MOONSHINE_MODELS.base)
  })
})

describe('routeStt — moonshine NUNCA recebe conteúdo que não seja inglês', () => {
  const idiomas = ['pt', 'es', 'fr', 'de', 'ja', '', 'en']
  const qualidades = ['auto', 'fast', 'accurate', 'cloud'] as const
  it('em qualquer combinação, moonshine só aparece com conteúdo E mic em inglês e sem autodetecção', () => {
    for (const contentLang of idiomas)
      for (const micLang of ['', ...idiomas])
        for (const autoDetect of [false, true])
          for (const quality of qualidades)
            for (const cloudAvailable of [false, true]) {
              const r = routeStt({ ...base, contentLang, micLang, autoDetect, quality, cloudAvailable })
              if (/moonshine/.test(r.localModel)) {
                expect(contentLang).toBe('en')
                expect(['', 'en']).toContain(micLang)
                expect(autoDetect).toBe(false)
              }
            }
  })
})

describe('tamanhos de download e nomes', () => {
  it('moonshine tem tamanho MEDIDO (listagem de bytes do Hub) e cabe bem abaixo do whisper-tiny', () => {
    expect(MODEL_DOWNLOAD_MEDIDO[MOONSHINE_MODELS.base]).toBe(true)
    expect(MODEL_DOWNLOAD_MEDIDO[MOONSHINE_MODELS.tiny]).toBe(true)
    expect(MODEL_DOWNLOAD_MB[MOONSHINE_MODELS.base]).toBe(67)
    expect(MODEL_DOWNLOAD_MB[MOONSHINE_MODELS.tiny]).toBe(32)
    expect(MODEL_DOWNLOAD_MB[MOONSHINE_MODELS.base]).toBeLessThan(MODEL_DOWNLOAD_MB[WHISPER_MODELS.tiny])
  })

  it('whisper small e base: o que o navegador de fato baixa (small 588,7 MB medido; não os 880 estimados)', () => {
    expect(MODEL_DOWNLOAD_MB[WHISPER_MODELS.small]).toBe(589)
    expect(MODEL_DOWNLOAD_MB[WHISPER_MODELS.base]).toBe(209)
    expect(MODEL_DOWNLOAD_MEDIDO[WHISPER_MODELS.small]).toBe(true)
    expect(MODEL_DOWNLOAD_MEDIDO[WHISPER_MODELS.base]).toBe(true)
  })

  it('nome legível para o selo: "Whisper small", "Moonshine base"', () => {
    expect(nomeLegivelDoModelo(WHISPER_MODELS.small)).toBe('Whisper small')
    expect(nomeLegivelDoModelo(MOONSHINE_MODELS.base)).toBe('Moonshine base')
    expect(nomeLegivelDoModelo(MOONSHINE_MODELS.tiny)).toBe('Moonshine tiny')
  })
})

describe('modeloLocalDaImportacao — a transcrição offline de arquivo', () => {
  it('arquivo em inglês vai para o moonshine-base', () => {
    expect(modeloLocalDaImportacao('en')).toBe(MOONSHINE_MODELS.base)
    expect(modeloLocalDaImportacao('en-GB')).toBe(MOONSHINE_MODELS.base)
  })
  it('outro idioma ou idioma desconhecido não escolhe (fica o whisper de sempre)', () => {
    expect(modeloLocalDaImportacao('pt')).toBeNull()
    expect(modeloLocalDaImportacao(undefined)).toBeNull()
    expect(modeloLocalDaImportacao('')).toBeNull()
  })
})
