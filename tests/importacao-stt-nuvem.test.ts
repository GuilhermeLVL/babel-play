// @vitest-environment jsdom
/**
 * A TRANSCRIÇÃO DA IMPORTAÇÃO USA A NUVEM DE QUEM PAGA POR ELA (docs/PROXIMOS-PASSOS.md, D4).
 *
 * A importação (YouTube sem legenda, áudio local) transcrevia SEMPRE no Whisper local — 57% de WER
 * em português — mesmo para quem assina a transcrição de nuvem (24%). Agora ela segue a MESMA
 * escolha da captura ao vivo: rota do `sttRouter`, consentimento de nuvem e plano. Recusa definitiva
 * da nuvem (402/429/501/503) desliga a nuvem pelo resto do arquivo e o Whisper local assume — o
 * arquivo inteiro é transcrito de qualquer jeito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* Falas a 40 s uma da outra: longe demais para irem no mesmo pacote de nuvem (teto de 28 s) — cada
   uma vira um pedido, e estes testes olham a recusa/fallback por pedido. O agrupamento em si tem os
   testes dele (importacao-agrupamento-nuvem.test.ts e o describe do fim deste arquivo). */
const ESPACADAS = [
  { audio: new Float32Array(16000), start: 0, end: 1000 },
  { audio: new Float32Array(16000), start: 40000, end: 41000 },
  { audio: new Float32Array(16000), start: 80000, end: 81000 },
]
const segmentos = [...ESPACADAS]
vi.mock('@ricky0123/vad-web', () => ({
  NonRealTimeVAD: {
    new: vi.fn(async () => ({
      run: async function* () {
        for (const s of segmentos) yield s
      },
    })),
  },
}))

const local = {
  preload: vi.fn(async () => {}),
  transcribePcm: vi.fn(async () => ({ text: 'local' })),
  setModel: vi.fn(),
}
vi.mock('../src/gateway/adapters/whisperLocal', () => ({
  WhisperLocalStt: vi.fn(function () {
    return local
  }),
}))

import { offlineTranscribe } from '../src/gateway/offlineTranscribe'
import { importacaoVaiANuvem } from '../src/lib/import/nuvemDaImportacao'

function erroHttp(status: number) {
  return Object.assign(new Error(`groq-whisper HTTP ${status}`), { status })
}

beforeEach(() => {
  segmentos.splice(0, segmentos.length, ...ESPACADAS)
  local.preload.mockClear()
  local.transcribePcm.mockClear()
  local.setModel.mockClear()
  ;(window as unknown as { AudioContext: unknown }).AudioContext = class {
    async decodeAudioData() {
      return {
        sampleRate: 16000,
        numberOfChannels: 1,
        length: 16000 * 6,
        getChannelData: () => new Float32Array(16000 * 6),
      }
    }
    close() {
      return Promise.resolve()
    }
  }
})

describe('offlineTranscribe com motor de nuvem', () => {
  it('com nuvem, transcreve na nuvem e NÃO baixa o modelo local', async () => {
    const nuvem = { transcribePcm: vi.fn(async () => ({ text: 'nuvem' })) }
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    expect(segs.map((s) => [s.text, s.engine])).toEqual([
      ['nuvem', 'groq-whisper'],
      ['nuvem', 'groq-whisper'],
      ['nuvem', 'groq-whisper'],
    ])
    expect(local.preload).not.toHaveBeenCalled()
  })

  it('manda o trecho anterior como prompt (mesmo arquivo, mesmo idioma)', async () => {
    let n = 0
    const nuvem = { transcribePcm: vi.fn(async () => ({ text: `frase ${++n}` })) }
    await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    const prompts = nuvem.transcribePcm.mock.calls.map((c) => (c as unknown[])[2] as { prompt?: string })
    expect(prompts.map((p) => p.prompt)).toEqual([undefined, 'frase 1', 'frase 2'])
  })

  it.each([402, 429, 501, 503])('recusa %i: o local assume e a nuvem não é mais tentada', async (status) => {
    const nuvem = {
      transcribePcm: vi.fn(async () => {
        throw erroHttp(status)
      }),
    }
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    expect(segs.map((s) => s.engine)).toEqual(['whisper-local', 'whisper-local', 'whisper-local'])
    expect(nuvem.transcribePcm).toHaveBeenCalledTimes(1)
    expect(local.preload).toHaveBeenCalledTimes(1)
  })

  it('429 nuvem_ocupada (ADR 0007): o local assume SÓ até o Retry-After, e a nuvem volta', async () => {
    let agora = 1_000_000
    const relogio = vi.spyOn(Date, 'now').mockImplementation(() => agora)
    try {
      let chamada = 0
      const nuvem = {
        transcribePcm: vi.fn(async () => {
          if (++chamada === 1) {
            throw Object.assign(erroHttp(429), { code: 'nuvem_ocupada', retryAfterMs: 2_000 })
          }
          return { text: 'nuvem' }
        }),
      }
      // Cada trecho no local "leva" 1,5 s: o 1º e o 2º caem dentro da espera; o 3º, depois dela.
      local.transcribePcm.mockImplementation(async () => {
        agora += 1_500
        return { text: 'local' }
      })
      const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
      expect(segs.map((s) => s.engine)).toEqual(['whisper-local', 'whisper-local', 'groq-whisper'])
      expect(nuvem.transcribePcm).toHaveBeenCalledTimes(2)
    } finally {
      relogio.mockRestore()
      local.transcribePcm.mockImplementation(async () => ({ text: 'local' }))
    }
  })

  it('falha passageira (rede, 500): só aquele trecho vai ao local; a nuvem segue', async () => {
    let chamada = 0
    const nuvem = {
      transcribePcm: vi.fn(async () => {
        if (++chamada === 2) throw erroHttp(500)
        return { text: 'nuvem' }
      }),
    }
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    expect(segs.map((s) => s.engine)).toEqual(['groq-whisper', 'whisper-local', 'groq-whisper'])
  })

  it('arquivo em inglês: o local é o moonshine-base, escolhido ANTES do preload (senão baixa o Whisper à toa)', async () => {
    await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'en-US' })
    expect(local.setModel).toHaveBeenCalledWith('onnx-community/moonshine-base-ONNX')
    expect(local.setModel.mock.invocationCallOrder[0]).toBeLessThan(local.preload.mock.invocationCallOrder[0])
  })

  it('arquivo em português: o local segue o Whisper de sempre (moonshine é só inglês)', async () => {
    await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt' })
    expect(local.setModel).not.toHaveBeenCalled()
  })

  it('sem nuvem, tudo local como antes', async () => {
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt' })
    expect(segs.every((s) => s.engine === 'whisper-local')).toBe(true)
    expect(local.preload).toHaveBeenCalledTimes(1)
  })
})

describe('offlineTranscribe junta as falas próximas num pedido só (a Groq cobra 10 s por pedido)', () => {
  const PROXIMAS = [
    { audio: new Float32Array(16000 * 2), start: 0, end: 2000 },
    { audio: new Float32Array(16000 * 3), start: 2500, end: 5500 },
    { audio: new Float32Array(16000 * 5), start: 6000, end: 11000 },
  ]

  it('três falas curtas → um pedido; a fala sai do início da primeira ao fim da última', async () => {
    segmentos.splice(0, segmentos.length, ...PROXIMAS)
    const nuvem = { transcribePcm: vi.fn(async () => ({ text: 'as três frases' })) }
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    expect(nuvem.transcribePcm).toHaveBeenCalledTimes(1)
    const audio = (nuvem.transcribePcm.mock.calls[0] as unknown[])[0] as Float32Array
    expect(audio.length).toBeGreaterThanOrEqual(16000 * 10)
    expect(segs).toEqual([{ tStartMs: 0, tEndMs: 11000, text: 'as três frases', engine: 'groq-whisper' }])
  })

  it('falha passageira no pacote: cada fala dele vai ao local, com o próprio horário', async () => {
    segmentos.splice(0, segmentos.length, ...PROXIMAS)
    const nuvem = {
      transcribePcm: vi.fn(async () => {
        throw erroHttp(500)
      }),
    }
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt', nuvem })
    expect(segs.map((s) => [s.tStartMs, s.tEndMs, s.engine])).toEqual([
      [0, 2000, 'whisper-local'],
      [2500, 5500, 'whisper-local'],
      [6000, 11000, 'whisper-local'],
    ])
  })

  it('sem nuvem, o local segue fala a fala (nada muda no caminho local)', async () => {
    segmentos.splice(0, segmentos.length, ...PROXIMAS)
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt' })
    expect(local.transcribePcm).toHaveBeenCalledTimes(3)
    expect(segs.map((s) => [s.tStartMs, s.tEndMs])).toEqual([
      [0, 2000],
      [2500, 5500],
      [6000, 11000],
    ])
  })
})

describe('importacaoVaiANuvem — a mesma escolha da captura ao vivo', () => {
  const rotaNuvem = { preferCloud: true, localModel: 'x', label: '' }
  const groq = { adapterId: 'groq-whisper' }

  it('plano com nuvem + consentimento + rota nuvem-primeiro + binding groq → nuvem', () => {
    expect(importacaoVaiANuvem({ managedCloudStt: true, consentiu: true, rota: rotaNuvem, binding: groq })).toBe(true)
  })

  it('sem consentimento, nunca', () => {
    expect(importacaoVaiANuvem({ managedCloudStt: true, consentiu: false, rota: rotaNuvem, binding: groq })).toBe(false)
  })

  it('plano sem nuvem gerenciada: só com a chave PRÓPRIA (BYOK é sempre livre)', () => {
    expect(importacaoVaiANuvem({ managedCloudStt: false, consentiu: true, rota: rotaNuvem, binding: groq })).toBe(false)
    expect(
      importacaoVaiANuvem({
        managedCloudStt: false,
        consentiu: true,
        rota: rotaNuvem,
        binding: { ...groq, credentialId: 'c1' },
      }),
    ).toBe(true)
  })

  it('rota local (inglês, "rápido", perfil Privado) ou perfil sem groq: local', () => {
    expect(
      importacaoVaiANuvem({
        managedCloudStt: true,
        consentiu: true,
        rota: { ...rotaNuvem, preferCloud: false },
        binding: groq,
      }),
    ).toBe(false)
    expect(importacaoVaiANuvem({ managedCloudStt: true, consentiu: true, rota: rotaNuvem, binding: undefined })).toBe(
      false,
    )
  })
})
