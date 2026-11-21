/**
 * A decisão da rota do inglês por medição versionada (openspec `stt-ingles-volume-e-rota`, REQ-015): vence com IC 95%
 * pareado → nuvem primeiro; empate ou sem medição → aparelho; pt/es não mudam; o roteador não cita "4,9".
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { inglesNuvemVenceAparelho, MEDICOES_DE_STT, type MedicoesDeStt } from '../src/core/rota/medicoesDeStt'
import { MOONSHINE_MODELS, routeStt, WHISPER_MODELS } from '../src/gateway/sttRouter'
import { MEDICOES_QUE_FAVORECEM_A_NUVEM } from './fixtures/medicoesDeSttQueFavorecemANuvem'

const diferenca = (ic95: [number, number]) => ({
  valor: (ic95[0] + ic95[1]) / 2,
  ic95,
  n: 100,
  data: '2026-11-21',
  fonte: 't',
})
const comDiferenca = (d: ReturnType<typeof diferenca> | null): MedicoesDeStt => ({
  en: {
    ...MEDICOES_QUE_FAVORECEM_A_NUVEM.en,
    nuvemNormalizadaContraLocal: { 'moonshine-base': d, 'parakeet-v3': null },
  },
})

const base = {
  contentLang: 'en',
  autoDetect: false,
  quality: 'auto' as const,
  hasWebGpu: true,
  cloudAvailable: true,
  profileId: 'free-web',
}

describe('inglesNuvemVenceAparelho', () => {
  it('vence: limite superior do IC pareado abaixo de zero', () => {
    expect(inglesNuvemVenceAparelho(comDiferenca(diferenca([-10.5, -4.6])))).toBe(true)
  })
  it('empate: o IC inclui zero (ou encosta em zero)', () => {
    expect(inglesNuvemVenceAparelho(comDiferenca(diferenca([-2.2, 0.3])))).toBe(false)
    expect(inglesNuvemVenceAparelho(comDiferenca(diferenca([-2.2, 0])))).toBe(false)
  })
  it('perde: diferença positiva', () => {
    expect(inglesNuvemVenceAparelho(comDiferenca(diferenca([1, 4])))).toBe(false)
  })
  it('sem diferença medida, ou sem medição normalizada: não vence', () => {
    expect(inglesNuvemVenceAparelho(comDiferenca(null))).toBe(false)
    const semNormalizada: MedicoesDeStt = { en: { ...MEDICOES_QUE_FAVORECEM_A_NUVEM.en, nuvemNormalizada: null } }
    expect(inglesNuvemVenceAparelho(semNormalizada)).toBe(false)
  })
  it('as medições versionadas trazem o que a auditoria de 09/10 registrou', () => {
    expect(MEDICOES_DE_STT.en.nuvemPadrao).toMatchObject({ wer: 27.8, ic95: [22.1, 33.9], n: 100 })
    expect(MEDICOES_DE_STT.en.locais['moonshine-base'].wer).toBe(13.6)
    for (const m of Object.values(MEDICOES_DE_STT.en.locais)) expect(m.fonte.length).toBeGreaterThan(0)
  })
})

describe('routeStt — inglês por medição', () => {
  const vence = comDiferenca(diferenca([-10.5, -4.6]))
  const empate = comDiferenca(diferenca([-2.2, 0.3]))

  it('padrão (flag desligada, medição versionada): aparelho, moonshine-base', () => {
    const r = routeStt(base)
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: false, dtype: 'q8' })
    expect(r.label).toBe('local · inglês (moonshine)')
  })
  it('flag desligada NÃO basta, mesmo com medição que vence: aparelho', () => {
    expect(routeStt({ ...base, medicoesDeStt: vence }).preferCloud).toBe(false)
  })
  it('flag ligada e medição que vence: nuvem primeiro, moonshine de reserva', () => {
    const r = routeStt({ ...base, sttNuvemNormalizar: true, medicoesDeStt: vence })
    expect(r).toMatchObject({ localModel: MOONSHINE_MODELS.base, preferCloud: true, dtype: 'q8' })
    expect(r.label).toBe('nuvem (large-v3-turbo) · reserva local')
  })
  it('flag ligada e empate: aparelho', () => {
    expect(routeStt({ ...base, sttNuvemNormalizar: true, medicoesDeStt: empate }).preferCloud).toBe(false)
  })
  it('flag ligada e medição versionada de hoje (sem normalizada): aparelho', () => {
    expect(routeStt({ ...base, sttNuvemNormalizar: true }).preferCloud).toBe(false)
  })
  it('sem nuvem disponível: aparelho, com ou sem medição', () => {
    expect(
      routeStt({ ...base, cloudAvailable: false, sttNuvemNormalizar: true, medicoesDeStt: vence }).preferCloud,
    ).toBe(false)
  })
  it('pt e es não mudam: nuvem primeiro, com a flag e a medição que for', () => {
    for (const contentLang of ['pt', 'es'])
      for (const extra of [{}, { sttNuvemNormalizar: true, medicoesDeStt: vence }, { medicoesDeStt: empate }]) {
        const r = routeStt({ ...base, contentLang, ...extra })
        expect(r.preferCloud, contentLang).toBe(true)
        expect(r.label).toBe('nuvem (large-v3-turbo) · reserva local')
        expect(r.localModel).toBe(WHISPER_MODELS.base)
      }
  })
  it('modo "cloud" em inglês não muda', () => {
    expect(routeStt({ ...base, quality: 'cloud' })).toMatchObject({
      preferCloud: true,
      localModel: MOONSHINE_MODELS.base,
    })
  })
  it('o roteador não cita o 4,9% da bancada de setembro', () => {
    const fonte = readFileSync('src/gateway/sttRouter.ts', 'utf8')
    expect(fonte).not.toMatch(/4[,.]9\s*%/)
  })
})
