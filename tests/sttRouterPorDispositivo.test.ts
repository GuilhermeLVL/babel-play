/**
 * MODELOS POR PERFIL DE DISPOSITIVO (camada gratuita, tudo local).
 *
 * A régua vem da bancada FLEURS pt_br (100 falas, `docs/auditoria/eval/bancada-2026-09/`):
 *   whisper-base  híbrido 18,2% · q8 18,9% → EMPATE (Δ +0,71 [−0,99; 2,23]); 209 MB contra 80 MB
 *   whisper-tiny  híbrido 29,2% · q8 41,6% → q8 PIORA 12,5 pontos, significativo
 * Então, fora do desktop, o português vai de base q8 (menor que o tiny híbrido E muito melhor), e o
 * tiny q8 não entra em rota nenhuma.
 */
import { describe, expect, it } from 'vitest'

import {
  type DispositivoDaRota,
  MOONSHINE_MODELS,
  routeStt,
  tamanhoDoDownloadMb,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'

const base = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto' as const,
  hasWebGpu: false,
  cloudAvailable: false,
  profileId: 'free-web',
}

const quest: DispositivoDaRota = { tipo: 'quest', permiteSmall: false, economiaDeDados: false }
const celularFraco: DispositivoDaRota = { tipo: 'celular-fraco', permiteSmall: false, economiaDeDados: false }
const celularBom: DispositivoDaRota = { tipo: 'celular-bom', permiteSmall: false, economiaDeDados: false }
const desktopGpu: DispositivoDaRota = { tipo: 'desktop-com-gpu', permiteSmall: true, economiaDeDados: false }
const desktopSemGpu: DispositivoDaRota = { tipo: 'desktop-sem-gpu', permiteSmall: false, economiaDeDados: false }

describe('português (não-EN) por perfil', () => {
  it.each([
    ['quest', quest],
    ['celular fraco', celularFraco],
    ['celular bom', celularBom],
  ])('%s em auto: whisper-base q8 em WASM (80 MB, mesma qualidade do híbrido)', (_n, dispositivo) => {
    const r = routeStt({ ...base, dispositivo })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'q8', device: 'wasm' })
    expect(tamanhoDoDownloadMb(r.localModel, r.dtype)).toBe(80)
  })

  it('celular bom COM WebGPU também não recebe o small (limite de memória da aba no iOS)', () => {
    const r = routeStt({ ...base, hasWebGpu: true, dispositivo: celularBom, quality: 'accurate' })
    expect(r.localModel).toBe(WHISPER_MODELS.base)
  })

  it('Quest em "preciso" continua no base q8 — o small nunca entra fora do desktop com GPU', () => {
    const r = routeStt({ ...base, hasWebGpu: true, dispositivo: quest, quality: 'accurate' })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'q8' })
  })

  it('desktop com GPU segue no small híbrido (sem mudança)', () => {
    const r = routeStt({ ...base, hasWebGpu: true, dispositivo: desktopGpu })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.small, dtype: 'hybrid' })
    expect(r.device).toBeUndefined()
  })

  it('desktop sem GPU segue no base híbrido', () => {
    expect(routeStt({ ...base, dispositivo: desktopSemGpu })).toMatchObject({
      localModel: WHISPER_MODELS.base,
      dtype: 'hybrid',
    })
  })

  it('desktop com economia de dados: base q8 (mesma qualidade, 129 MB a menos)', () => {
    const r = routeStt({ ...base, dispositivo: { ...desktopSemGpu, economiaDeDados: true } })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'q8' })
  })

  it('"rápido" no celular é o tiny HÍBRIDO, nunca o tiny q8 (41,6% de WER)', () => {
    const r = routeStt({ ...base, quality: 'fast', dispositivo: celularFraco })
    expect(r).toMatchObject({ localModel: WHISPER_MODELS.tiny, dtype: 'hybrid' })
  })

  it('nenhuma rota escolhe whisper-tiny em q8', () => {
    for (const dispositivo of [quest, celularFraco, celularBom, desktopGpu, desktopSemGpu])
      for (const quality of ['auto', 'fast', 'accurate', 'cloud'] as const)
        for (const economiaDeDados of [false, true]) {
          const r = routeStt({ ...base, quality, dispositivo: { ...dispositivo, economiaDeDados } })
          if (r.localModel === WHISPER_MODELS.tiny) expect(r.dtype).not.toBe('q8')
        }
  })
})

describe('inglês por perfil', () => {
  it('celular fraco: moonshine-tiny (32 MB)', () => {
    expect(routeStt({ ...base, contentLang: 'en', dispositivo: celularFraco }).localModel).toBe(MOONSHINE_MODELS.tiny)
  })

  it('economia de dados em qualquer perfil: moonshine-tiny', () => {
    const r = routeStt({ ...base, contentLang: 'en', dispositivo: { ...celularBom, economiaDeDados: true } })
    expect(r.localModel).toBe(MOONSHINE_MODELS.tiny)
  })

  it('Quest e celular bom: moonshine-base (67 MB)', () => {
    expect(routeStt({ ...base, contentLang: 'en', dispositivo: quest }).localModel).toBe(MOONSHINE_MODELS.base)
    expect(routeStt({ ...base, contentLang: 'en', dispositivo: celularBom }).localModel).toBe(MOONSHINE_MODELS.base)
  })

  it('moonshine é sempre q8', () => {
    expect(routeStt({ ...base, contentLang: 'en', dispositivo: quest }).dtype).toBe('q8')
  })
})

describe('sem perfil informado, o comportamento é o de antes', () => {
  it('pt sem GPU → base híbrido', () => {
    expect(routeStt(base)).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'hybrid' })
  })
  it('pt com GPU → small', () => {
    expect(routeStt({ ...base, hasWebGpu: true }).localModel).toBe(WHISPER_MODELS.small)
  })
})

describe('tamanhoDoDownloadMb — bytes do Hub por dtype', () => {
  it('q8 (encoder + decoder_merged quantizados + tokenizer/configs)', () => {
    expect(tamanhoDoDownloadMb(WHISPER_MODELS.tiny, 'q8')).toBe(44)
    expect(tamanhoDoDownloadMb(WHISPER_MODELS.base, 'q8')).toBe(80)
    expect(tamanhoDoDownloadMb(WHISPER_MODELS.small, 'q8')).toBe(252)
  })
  it('híbrido: os valores medidos de antes', () => {
    expect(tamanhoDoDownloadMb(WHISPER_MODELS.base, 'hybrid')).toBe(209)
    expect(tamanhoDoDownloadMb(MOONSHINE_MODELS.tiny, 'q8')).toBe(32)
  })
  it('tradutor opus-mt q8: 113 MB (52,90 + 60,21 MB no Hub)', () => {
    expect(tamanhoDoDownloadMb('Xenova/opus-mt-en-ROMANCE')).toBe(113)
  })
  it('modelo desconhecido: null (a tela não inventa número)', () => {
    expect(tamanhoDoDownloadMb('x/y')).toBeNull()
  })
})
