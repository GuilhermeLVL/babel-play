/**
 * "APARELHO PRIMEIRO" NA ROTA (Fase B, item 6; flag `stt_aparelho_primeiro`, decisão do dono de
 * 24/10/2026). No automático de quem tem nuvem, o computador que roda o Parakeet (pt/es, cópia no
 * aparelho) transcreve primeiro, e a nuvem entra quando o áudio fica difícil (`nuvemNoAudioDificil`,
 * a histerese de `core/rota/audioDificil.ts`). Fora disso, nada muda.
 *
 * Garantias: flag desligada = rota idêntica à de hoje em toda a matriz; ligada, só o caso do aparelho
 * capaz no automático muda; Precisão pedida, aparelho fraco, sem cópia, inglês, sem nuvem e perfil
 * Privado ficam como estão.
 */
import { describe, expect, it } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { type DispositivoDaRota, routeStt, type SttQuality, type SttRouteInput } from '../src/gateway/sttRouter'

const desktop8: DispositivoDaRota = {
  tipo: 'desktop-com-gpu',
  permiteSmall: true,
  economiaDeDados: false,
  adaptadorReal: true,
  memoriaGb: 8,
  poucaMemoria: false,
}
const mac: DispositivoDaRota = {
  tipo: 'desktop-sem-gpu',
  permiteSmall: false,
  economiaDeDados: false,
  fornecedorGpu: 'apple',
}
const desktop4: DispositivoDaRota = { ...desktop8, memoriaGb: 4 }
const celular: DispositivoDaRota = { tipo: 'celular-bom', permiteSmall: false, economiaDeDados: false, memoriaGb: 8 }
const quest: DispositivoDaRota = { tipo: 'quest', permiteSmall: false, economiaDeDados: false }

const capaz: SttRouteInput = {
  contentLang: 'pt',
  autoDetect: false,
  quality: 'auto',
  hasWebGpu: true,
  cloudAvailable: true,
  profileId: 'free-web',
  dispositivo: desktop8,
  parakeet: true,
  parakeetNoAparelho: true,
  aparelhoPrimeiro: true,
}

/** A matriz da rota com as variações que importam aqui (Parakeet, cópia, aparelho, idioma, nuvem). */
function matriz(): SttRouteInput[] {
  const lista: SttRouteInput[] = []
  for (const quality of ['auto', 'fast', 'accurate', 'cloud'] as SttQuality[])
    for (const contentLang of ['pt', 'es', 'en', 'fr'])
      for (const micLang of ['', 'pt', 'en'])
        for (const autoDetect of [false, true])
          for (const cloudAvailable of [false, true])
            for (const dispositivo of [undefined, desktop8, mac, desktop4, celular, quest])
              for (const parakeetNoAparelho of [false, true])
                for (const profileId of ['free-web', 'local-private'])
                  lista.push({
                    contentLang,
                    micLang,
                    autoDetect,
                    quality,
                    hasWebGpu: true,
                    cloudAvailable,
                    profileId,
                    dispositivo,
                    parakeet: true,
                    parakeetNoAparelho,
                  })
  return lista
}

describe('flag desligada: a rota de hoje', () => {
  it('`aparelhoPrimeiro: false` (ou ausente) dá a mesma rota em toda a matriz', () => {
    const lista = matriz()
    expect(lista.length).toBeGreaterThan(4000)
    for (const e of lista) {
      const hoje = routeStt(e)
      expect(routeStt({ ...e, aparelhoPrimeiro: false }), JSON.stringify(e)).toEqual(hoje)
      expect(hoje.nuvemNoAudioDificil).toBeUndefined()
    }
  })
})

describe('flag ligada', () => {
  it.each([
    ['pt', desktop8],
    ['es', desktop8],
    ['pt', mac],
  ] as const)(
    '%s em computador capaz, automático, com nuvem: o Parakeet primeiro, a nuvem para o áudio difícil',
    (contentLang, dispositivo) => {
      const r = routeStt({ ...capaz, contentLang, dispositivo })
      expect(r).toEqual({
        localModel: ID_DO_PARAKEET,
        device: 'wasm',
        preferCloud: false,
        nuvemNoAudioDificil: true,
        label: 'local · Parakeet v3 · nuvem para o áudio difícil',
      })
    },
  )

  it('Precisão pedida (`cloud`): a nuvem primeiro, como hoje', () => {
    const entrada = { ...capaz, quality: 'cloud' as const }
    expect(routeStt(entrada)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
    expect(routeStt(entrada).preferCloud).toBe(true)
  })

  it('aparelho fraco ou sem memória medida: a nuvem primeiro, como hoje', () => {
    for (const dispositivo of [desktop4, celular, quest, { ...desktop8, economiaDeDados: true }, undefined]) {
      const entrada = { ...capaz, dispositivo }
      expect(routeStt(entrada), JSON.stringify(dispositivo)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
      expect(routeStt(entrada).preferCloud).toBe(true)
    }
  })

  it('sem a cópia do Parakeet no aparelho: a nuvem primeiro (a rota não baixa 672 MB sozinha)', () => {
    const entrada = { ...capaz, parakeetNoAparelho: false }
    expect(routeStt(entrada)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
    expect(routeStt(entrada).preferCloud).toBe(true)
  })

  it('inglês, francês, "Detectar" e o microfone em outro idioma: como hoje (não há modelo local bom o bastante)', () => {
    for (const mudanca of [{ contentLang: 'en' }, { contentLang: 'fr' }, { autoDetect: true }, { micLang: 'en' }]) {
      const entrada = { ...capaz, ...mudanca }
      expect(routeStt(entrada), JSON.stringify(mudanca)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
    }
  })

  it('sem nuvem na conta, perfil Privado, "rápido" e "preciso": como hoje', () => {
    for (const mudanca of [
      { cloudAvailable: false },
      { profileId: 'local-private' },
      { quality: 'fast' as const },
      { quality: 'accurate' as const },
    ]) {
      const entrada = { ...capaz, ...mudanca }
      expect(routeStt(entrada), JSON.stringify(mudanca)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
      expect(routeStt(entrada).nuvemNoAudioDificil).toBeUndefined()
    }
  })

  it('o Parakeet desligado pela pessoa: como hoje', () => {
    const entrada = { ...capaz, parakeet: false }
    expect(routeStt(entrada)).toEqual(routeStt({ ...entrada, aparelhoPrimeiro: false }))
  })
})
