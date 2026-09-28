/**
 * CADA FALA VAI AO STT DE NUVEM EM OGG OPUS, NÃO EM WAV (auditoria de eficiência 2026-09-28, achado 3).
 *
 * WAV de 16 bits a 16 kHz são ~32 KB por segundo de fala no plano de dados do celular; Opus a 24 kbps
 * são ~3 KB — e a bancada mediu WER 4,0% contra 4,1% (não piora). O que estes testes prendem:
 *  - com WebCodecs + Opus: o corpo é Ogg, o servidor mede a MESMA duração do PCM (ida e volta pelo
 *    parser de verdade, `server/lib/duracaoDeAudio.ts`) e a cobrança é igual à do WAV;
 *  - sem `AudioEncoder`, com o Opus recusado, ou com o codificador falhando: WAV, como antes — e,
 *    depois de uma falha, o Opus fica desligado na sessão (não se paga a tentativa em toda fala);
 *  - o adaptador groq-whisper manda `Content-Type` coerente com o corpo.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { duracaoDoAudio, segundosDeAudioDoUsuario, segundosFaturaveis } from '../server/lib/duracaoDeAudio'

/** Um `AudioEncoder` falso que emite pacotes de 20 ms com TOC válido (0xF8 = CELT FB 20 ms). */
function instalarWebCodecs(o: { suportado?: boolean; falhar?: boolean } = {}) {
  const configs: Array<Record<string, unknown>> = []
  let instancias = 0
  class AudioDataFalso {
    numberOfFrames: number
    sampleRate: number
    constructor(init: { numberOfFrames: number; sampleRate: number }) {
      this.numberOfFrames = init.numberOfFrames
      this.sampleRate = init.sampleRate
    }
    close() {}
  }
  class EncoderFalso {
    static isConfigSupported = vi.fn(async (c: Record<string, unknown>) => ({ supported: o.suportado ?? true, config: c }))
    encodeQueueSize = 0
    private pendente = 0
    private porPacote = 320
    constructor(private init: { output: (c: unknown, m?: unknown) => void; error: (e: unknown) => void }) {
      instancias++
    }
    configure(c: Record<string, unknown>) {
      configs.push(c)
      this.porPacote = Math.round((c.sampleRate as number) / 50)
    }
    encode(d: AudioDataFalso) {
      if (o.falhar) throw new Error('codificador quebrou')
      this.pendente += d.numberOfFrames
      while (this.pendente >= this.porPacote) {
        this.pendente -= this.porPacote
        this.emitir()
      }
    }
    private emitir() {
      const dados = Uint8Array.of(0xf8, 1, 2, 3, 4, 5)
      this.init.output(
        { byteLength: dados.length, duration: 20_000, copyTo: (dst: Uint8Array) => dst.set(dados) },
        { decoderConfig: { description: undefined } },
      )
    }
    async flush() {
      if (this.pendente > 0) {
        this.pendente = 0
        this.emitir()
      }
    }
    close() {}
  }
  vi.stubGlobal('AudioEncoder', EncoderFalso)
  vi.stubGlobal('AudioData', AudioDataFalso)
  return { configs, instancias: () => instancias, suportado: EncoderFalso.isConfigSupported }
}

const pcm = (segundos: number, taxa = 16_000) => new Float32Array(Math.round(segundos * taxa)).fill(0.1)
const bytes = async (b: Blob) => Buffer.from(await b.arrayBuffer())

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('audioParaStt', () => {
  it('com WebCodecs: Ogg Opus mono a 24 kbps, e o servidor mede a duração do PCM', async () => {
    const wc = instalarWebCodecs()
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    const a = await audioParaStt(pcm(6.37), 16_000)
    expect(a.tipo).toBe('audio/ogg')
    expect(wc.configs[0]).toMatchObject({ codec: 'opus', sampleRate: 16_000, numberOfChannels: 1, bitrate: 24_000 })
    const b = await bytes(a.corpo)
    expect(b.subarray(0, 4).toString('ascii')).toBe('OggS')
    expect(duracaoDoAudio(b)).toBeCloseTo(6.37, 3)
  })

  it('Ogg e WAV da mesma fala custam o mesmo na cota e no orçamento', async () => {
    instalarWebCodecs()
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    const { encodeWav } = await import('../src/gateway/audio/wav')
    for (const s of [0.8, 6, 11.2]) {
      const ogg = await bytes((await audioParaStt(pcm(s), 16_000)).corpo)
      const wav = await bytes(encodeWav(pcm(s), 16_000))
      expect(segundosDeAudioDoUsuario(ogg)).toBe(segundosDeAudioDoUsuario(wav))
      expect(segundosFaturaveis(ogg)).toBe(segundosFaturaveis(wav))
    }
  })

  it('o Ogg é bem menor que o WAV', async () => {
    instalarWebCodecs()
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    const { encodeWav } = await import('../src/gateway/audio/wav')
    const ogg = (await audioParaStt(pcm(6), 16_000)).corpo
    expect(ogg.size).toBeLessThan(encodeWav(pcm(6), 16_000).size / 5)
  })

  it('a checagem de suporte roda UMA vez por taxa, não a cada fala', async () => {
    const wc = instalarWebCodecs()
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    await audioParaStt(pcm(1), 16_000)
    await audioParaStt(pcm(1), 16_000)
    await audioParaStt(pcm(1), 16_000)
    expect(wc.suportado).toHaveBeenCalledTimes(1)
  })

  it('sem AudioEncoder: WAV, como antes', async () => {
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    const a = await audioParaStt(pcm(2), 16_000)
    expect(a.tipo).toBe('audio/wav')
    expect(duracaoDoAudio(await bytes(a.corpo))).toBeCloseTo(2, 3)
  })

  it('Opus recusado pelo navegador: WAV', async () => {
    instalarWebCodecs({ suportado: false })
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    expect((await audioParaStt(pcm(2), 16_000)).tipo).toBe('audio/wav')
  })

  it('codificador falha: WAV nesta fala, e o Opus fica desligado nas próximas', async () => {
    const wc = instalarWebCodecs({ falhar: true })
    const { audioParaStt } = await import('../src/gateway/audio/opusDoStt')
    expect((await audioParaStt(pcm(2), 16_000)).tipo).toBe('audio/wav')
    expect((await audioParaStt(pcm(2), 16_000)).tipo).toBe('audio/wav')
    expect(wc.instancias()).toBe(1)
  })
})

describe('adaptador groq-whisper', () => {
  function espiarApi() {
    const api = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ text: 'oi' })))
    vi.doMock('../src/data/api', () => ({ apiFetch: api }))
    return api
  }

  it('com Opus: corpo Ogg e Content-Type audio/ogg', async () => {
    instalarWebCodecs()
    const api = espiarApi()
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    await new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }).transcribePcm(pcm(1), 16_000)
    const init = api.mock.calls[0][1]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/ogg')
    expect((init.body as Blob).type).toContain('audio/ogg')
  })

  it('sem Opus: corpo WAV e Content-Type audio/wav', async () => {
    const api = espiarApi()
    const { GroqWhisperStt } = await import('../src/gateway/adapters/groqWhisper')
    await new GroqWhisperStt({ model: 'whisper-large-v3-turbo' }).transcribePcm(pcm(1), 16_000)
    const init = api.mock.calls[0][1]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('audio/wav')
  })
})
