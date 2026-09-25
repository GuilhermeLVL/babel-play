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

const segmentos = [
  { audio: new Float32Array(16000), start: 0, end: 1000 },
  { audio: new Float32Array(16000), start: 2000, end: 3000 },
  { audio: new Float32Array(16000), start: 4000, end: 5000 },
]
vi.mock('@ricky0123/vad-web', () => ({
  NonRealTimeVAD: {
    new: vi.fn(async () => ({
      run: async function* () {
        for (const s of segmentos) yield s
      },
    })),
  },
}))

const local = { preload: vi.fn(async () => {}), transcribePcm: vi.fn(async () => ({ text: 'local' })) }
vi.mock('../src/gateway/adapters/whisperLocal', () => ({ WhisperLocalStt: vi.fn(function () { return local }) }))

import { offlineTranscribe } from '../src/gateway/offlineTranscribe'
import { importacaoVaiANuvem } from '../src/lib/import/nuvemDaImportacao'

function erroHttp(status: number) {
  return Object.assign(new Error(`groq-whisper HTTP ${status}`), { status })
}

beforeEach(() => {
  local.preload.mockClear()
  local.transcribePcm.mockClear()
  ;(window as unknown as { AudioContext: unknown }).AudioContext = class {
    async decodeAudioData() {
      return { sampleRate: 16000, numberOfChannels: 1, length: 16000 * 6, getChannelData: () => new Float32Array(16000 * 6) }
    }
    close() { return Promise.resolve() }
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

  it('sem nuvem, tudo local como antes', async () => {
    const segs = await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt' })
    expect(segs.every((s) => s.engine === 'whisper-local')).toBe(true)
    expect(local.preload).toHaveBeenCalledTimes(1)
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
      importacaoVaiANuvem({ managedCloudStt: false, consentiu: true, rota: rotaNuvem, binding: { ...groq, credentialId: 'c1' } }),
    ).toBe(true)
  })

  it('rota local (inglês, "rápido", perfil Privado) ou perfil sem groq: local', () => {
    expect(importacaoVaiANuvem({ managedCloudStt: true, consentiu: true, rota: { ...rotaNuvem, preferCloud: false }, binding: groq })).toBe(false)
    expect(importacaoVaiANuvem({ managedCloudStt: true, consentiu: true, rota: rotaNuvem, binding: undefined })).toBe(false)
  })
})
