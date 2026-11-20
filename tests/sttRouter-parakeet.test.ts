/**
 * PARAKEET NA ROTA — chave `babel.stt.parakeet`, LIGADA de fábrica desde 23/10/2026 (decisão do dono;
 * só `'0'` desliga). A premissa antiga ("desligada de fábrica") foi reescrita: o que vale é "desligada
 * pela pessoa = nada muda".
 *
 * Duas garantias:
 *  1. DESLIGADA PELA PESSOA (`parakeet: false` ou `'0'`) = NADA MUDA. `IMPRESSAO_DE_ANTES` é o sha256 das 1280 rotas da matriz abaixo,
 *     capturado com o `sttRouter.ts` de ANTES do Parakeet existir (09/10/2026, commit 202c02e5). Se
 *     uma rota qualquer mudar com a chave desligada, a impressão muda e este teste quebra.
 *  2. CHAVE LIGADA: no `auto` só com a cópia no aparelho (`parakeetNoAparelho`); no "preciso" sempre. Só o modelo local de PRECISÃO de português e espanhol, no computador com memória
 *     medida (`deviceMemory` ≥ 8 e sem `poucaMemoria`), vira o Parakeet int8 em WASM. Inglês, os demais
 *     idiomas, "Detectar", o "rápido", a reserva da nuvem, o celular e o Quest ficam como estavam.
 */
import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHAVE_DO_PARAKEET, ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import {
  type DispositivoDaRota,
  MODEL_DOWNLOAD_MEDIDO,
  nomeLegivelDoModelo,
  outroBackend,
  parakeetCabeNoAparelho,
  routeStt,
  type SttQuality,
  type SttRouteInput,
  tamanhoDoDownloadMb,
  WHISPER_MODELS,
} from '../src/gateway/sttRouter'

const IMPRESSAO_DE_ANTES = '2626dac27586fa9904015e4624d00cfb8d687970fab28acd2d0825f1987b515d'

const desktopGpu: DispositivoDaRota = {
  tipo: 'desktop-com-gpu',
  permiteSmall: true,
  economiaDeDados: false,
  adaptadorReal: true,
}
const desktopSemGpu: DispositivoDaRota = { tipo: 'desktop-sem-gpu', permiteSmall: false, economiaDeDados: false }
const quest: DispositivoDaRota = { tipo: 'quest', permiteSmall: false, economiaDeDados: false }
const celularBom: DispositivoDaRota = { tipo: 'celular-bom', permiteSmall: false, economiaDeDados: false }
/** A memória que o perfil passa a informar: 8 GB no computador, pouca no celular e no Quest. */
const comMemoria = (d: DispositivoDaRota): DispositivoDaRota =>
  d.tipo.startsWith('desktop')
    ? { ...d, memoriaGb: 8, poucaMemoria: false }
    : { ...d, memoriaGb: 4, poucaMemoria: true }

function matriz(dispositivos: Array<DispositivoDaRota | undefined>): SttRouteInput[] {
  const entradas: SttRouteInput[] = []
  for (const quality of ['auto', 'fast', 'accurate', 'cloud'] as SttQuality[])
    for (const contentLang of ['pt', 'es', 'en', 'fr'])
      for (const micLang of ['', 'pt'])
        for (const autoDetect of [false, true])
          for (const hasWebGpu of [false, true])
            for (const cloudAvailable of [false, true])
              for (const dispositivo of dispositivos)
                entradas.push({
                  contentLang,
                  micLang,
                  autoDetect,
                  quality,
                  hasWebGpu,
                  cloudAvailable,
                  profileId: 'free-web',
                  dispositivo,
                  parakeet: false,
                })
  return entradas
}

const impressao = (entradas: SttRouteInput[]): string =>
  createHash('sha256')
    .update(
      entradas
        .map((e) => {
          const r = routeStt(e)
          return [r.localModel, r.dtype ?? '', r.device ?? '', r.preferCloud, r.label].join('|')
        })
        .join('\n'),
    )
    .digest('hex')

const APARELHOS = [undefined, desktopGpu, desktopSemGpu, quest, celularBom]

afterEach(() => vi.unstubAllGlobals())

describe('chave desligada pela pessoa: a rota é a de antes', () => {
  it('as 1280 rotas da matriz têm a mesma impressão de antes do Parakeet', () => {
    const entradas = matriz(APARELHOS)
    expect(entradas).toHaveLength(1280)
    expect(impressao(entradas)).toBe(IMPRESSAO_DE_ANTES)
  })

  it('…também com a memória do aparelho informada (o campo novo não decide nada sozinho)', () => {
    expect(impressao(matriz(APARELHOS.map((d) => d && comMemoria(d))))).toBe(IMPRESSAO_DE_ANTES)
  })

  it('…e com a chave gravada como "0" (sem `parakeet` na entrada)', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === CHAVE_DO_PARAKEET ? '0' : null) })
    const entradas = matriz(APARELHOS.map((d) => d && comMemoria(d))).map(({ parakeet: _, ...e }) => e)
    expect(impressao(entradas)).toBe(IMPRESSAO_DE_ANTES)
  })

  it('`parakeet: false` na entrada vence a chave ligada', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === CHAVE_DO_PARAKEET ? '1' : null) })
    const entradas = matriz(APARELHOS.map((d) => d && comMemoria(d))).map((e) => ({ ...e, parakeet: false }))
    expect(impressao(entradas)).toBe(IMPRESSAO_DE_ANTES)
  })
})

describe('chave ligada', () => {
  const base: SttRouteInput = {
    contentLang: 'pt',
    autoDetect: false,
    quality: 'auto',
    hasWebGpu: true,
    cloudAvailable: false,
    profileId: 'free-web',
    dispositivo: comMemoria(desktopGpu),
    parakeet: true,
    parakeetNoAparelho: true,
  }

  it.each(['pt', 'es'])('%s no computador com memória: Parakeet int8 em WASM, 672 MB', (contentLang) => {
    for (const dispositivo of [comMemoria(desktopGpu), comMemoria(desktopSemGpu)]) {
      const r = routeStt({ ...base, contentLang, dispositivo })
      expect(r).toMatchObject({ localModel: ID_DO_PARAKEET, device: 'wasm', preferCloud: false })
      expect(r.dtype).toBeUndefined()
      expect(r.label).toBe('local · modelo preciso (Parakeet v3)')
      expect(tamanhoDoDownloadMb(r.localModel, r.dtype)).toBe(672)
    }
  })

  it('a chave no localStorage liga a mesma rota (sem `parakeet` na entrada)', () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === CHAVE_DO_PARAKEET ? '1' : null) })
    expect(routeStt({ ...base, parakeet: undefined }).localModel).toBe(ID_DO_PARAKEET)
  })

  it('"preciso" e "nuvem" sem nuvem também caem no Parakeet; o "rápido" segue no tiny', () => {
    expect(routeStt({ ...base, quality: 'accurate' }).localModel).toBe(ID_DO_PARAKEET)
    const semNuvem = routeStt({ ...base, quality: 'cloud' })
    expect(semNuvem.localModel).toBe(ID_DO_PARAKEET)
    expect(semNuvem.label).toBe('local (nuvem indisponível) · Parakeet v3')
    expect(routeStt({ ...base, quality: 'fast' }).localModel).toBe(WHISPER_MODELS.tiny)
  })

  /* Fase B, item 5 (24/10/2026): quando a nuvem do pagante falha ou pausa, a reserva é o Parakeet onde
     ele serve e JÁ ESTÁ no aparelho (o mesmo critério do automático). Sem a cópia, o Whisper base: a
     reserva nunca baixa 672 MB. */
  it('com a nuvem primeiro e o Parakeet no aparelho, a RESERVA local é o Parakeet (int8, WASM)', () => {
    for (const quality of ['auto', 'cloud'] as const) {
      const r = routeStt({ ...base, quality, cloudAvailable: true })
      expect(r).toMatchObject({ localModel: ID_DO_PARAKEET, device: 'wasm', preferCloud: true })
      expect(r.dtype).toBeUndefined()
      expect(r.label).toBe('nuvem (large-v3-turbo) · reserva local')
    }
  })

  it('com a nuvem primeiro SEM a cópia do Parakeet, a reserva continua o Whisper base (não baixa 672 MB)', () => {
    for (const quality of ['auto', 'cloud'] as const) {
      const r = routeStt({ ...base, quality, cloudAvailable: true, parakeetNoAparelho: false })
      expect(r).toMatchObject({ localModel: WHISPER_MODELS.base, dtype: 'hybrid', preferCloud: true })
      expect(r.parakeetDisponivelParaBaixar).toBeUndefined()
    }
  })

  it('a reserva da nuvem em aparelho que não comporta o Parakeet segue o Whisper base', () => {
    for (const d of [quest, celularBom, { ...desktopGpu, memoriaGb: 4, poucaMemoria: false }]) {
      const entrada = { ...base, quality: 'auto' as const, cloudAvailable: true, dispositivo: d }
      expect(routeStt(entrada), d.tipo).toEqual(routeStt({ ...entrada, parakeet: false }))
      expect(routeStt(entrada).localModel).not.toBe(ID_DO_PARAKEET)
    }
  })

  it('inglês, francês e "Detectar" ficam exatamente como com a chave desligada', () => {
    for (const mudanca of [{ contentLang: 'en' }, { contentLang: 'fr' }, { autoDetect: true }, { contentLang: '' }]) {
      for (const quality of ['auto', 'fast', 'accurate', 'cloud'] as const) {
        const entrada = { ...base, ...mudanca, quality }
        expect(routeStt(entrada), JSON.stringify(mudanca)).toEqual(routeStt({ ...entrada, parakeet: false }))
      }
    }
  })

  it('o microfone no modelo conta: pt ouvindo es serve; inglês ao microfone volta ao Whisper', () => {
    expect(routeStt({ ...base, contentLang: 'es', micLang: 'pt' }).localModel).toBe(ID_DO_PARAKEET)
    const micEmIngles = { ...base, contentLang: 'pt', micLang: 'en' }
    expect(routeStt(micEmIngles)).toEqual(routeStt({ ...micEmIngles, parakeet: false }))
    // Só o microfone: quem decide é o idioma da fala, não o de destino.
    expect(routeStt({ ...base, contentLang: 'en', micLang: 'pt', soMicrofone: true }).localModel).toBe(ID_DO_PARAKEET)
  })

  it('celular e Quest ficam como estão, mesmo com muita memória declarada', () => {
    for (const d of [quest, celularBom]) {
      const entrada = { ...base, dispositivo: { ...d, memoriaGb: 8, poucaMemoria: false } }
      expect(routeStt(entrada)).toEqual(routeStt({ ...entrada, parakeet: false }))
    }
  })

  it('sem memória MEDIDA suficiente, fica o Whisper: < 8 GB, pouca memória, sem medida, economia de dados', () => {
    const semParakeet = (dispositivo: DispositivoDaRota | undefined) => {
      const entrada = { ...base, dispositivo }
      expect(routeStt(entrada), JSON.stringify(dispositivo)).toEqual(routeStt({ ...entrada, parakeet: false }))
    }
    semParakeet({ ...desktopGpu, memoriaGb: 4, poucaMemoria: false })
    semParakeet({ ...desktopGpu, memoriaGb: 8, poucaMemoria: true })
    semParakeet({ ...desktopGpu, memoriaGb: null, poucaMemoria: false }) // Firefox/Safari: não informam
    semParakeet(desktopGpu) // perfil antigo, sem os campos
    semParakeet({ ...comMemoria(desktopGpu), economiaDeDados: true })
    semParakeet(undefined) // quem não mede o aparelho continua igual
  })
})

describe('parakeetCabeNoAparelho', () => {
  it('só computador, com 8 GB medidos, sem pouca memória e sem economia de dados', () => {
    expect(parakeetCabeNoAparelho(comMemoria(desktopGpu))).toBe(true)
    expect(parakeetCabeNoAparelho(comMemoria(desktopSemGpu))).toBe(true)
    expect(parakeetCabeNoAparelho(desktopGpu)).toBe(false)
    expect(parakeetCabeNoAparelho(comMemoria(quest))).toBe(false)
    expect(parakeetCabeNoAparelho(undefined)).toBe(false)
  })
})

describe('o que a tela mostra do Parakeet', () => {
  it('nome legível, tamanho medido e sem troca de backend pelo regulador', () => {
    expect(nomeLegivelDoModelo(ID_DO_PARAKEET)).toBe('Parakeet v3')
    expect(tamanhoDoDownloadMb(ID_DO_PARAKEET)).toBe(672)
    expect(MODEL_DOWNLOAD_MEDIDO[ID_DO_PARAKEET]).toBe(true)
    const rota = routeStt({
      contentLang: 'pt',
      autoDetect: false,
      quality: 'auto',
      hasWebGpu: true,
      cloudAvailable: false,
      profileId: 'free-web',
      dispositivo: comMemoria(desktopGpu),
      parakeet: true,
      parakeetNoAparelho: true,
    })
    // A GPU medida mais rápida não leva o Parakeet a ela: o int8 no WebGPU ficou 2,3× mais lento.
    expect(outroBackend(rota, { ...comMemoria(desktopGpu), pontuacaoWasm: 1, pontuacaoWebgpu: 30 }, true)).toBeNull()
  })
})
