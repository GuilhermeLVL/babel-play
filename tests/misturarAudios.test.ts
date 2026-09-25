/**
 * O ÁUDIO MISTURADO DA SESSÃO (sistema + microfone) SAI EM OPUS, NÃO EM WAV.
 *
 * O WAV PCM de 16 kHz/16 bits custa ~115 MB por hora; o upload aceita 120 MB. Qualquer sessão com as
 * duas fontes acima de ~62 minutos quebrava no salvar — e só a do sistema sobrevivia, sem a voz da
 * pessoa. Em Opus a 32 kbps a mesma hora cabe em ~15 MB.
 *
 * Estes testes prendem: (1) o empacotador Ogg produz o que o formato exige e o que o servidor
 * reconhece; (2) a mistura usa o `AudioEncoder` quando ele existe; (3) sem ele, o WAV antigo só vale
 * enquanto couber no upload — acima disso a mistura recusa, e quem chama mantém o áudio do sistema.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { detectarAudio } from '../server/lib/tipoDeArquivo'
import { crcOgg, montarOggOpus, preSkipDoOpusHead } from '../src/lib/oggOpus'

/** Lê as páginas de um fluxo Ogg (cabeçalho + pacotes remontados pela tabela de segmentos). */
function lerPaginas(bytes: Uint8Array) {
  const paginas: Array<{ flags: number; granule: bigint; seq: number; pacotes: Uint8Array[]; crcOk: boolean }> = []
  let o = 0
  while (o < bytes.length) {
    const v = new DataView(bytes.buffer, bytes.byteOffset + o)
    expect(String.fromCharCode(...bytes.slice(o, o + 4))).toBe('OggS')
    const nSeg = bytes[o + 26]
    const tabela = [...bytes.slice(o + 27, o + 27 + nSeg)]
    const corpo = tabela.reduce((a, b) => a + b, 0)
    const tamanho = 27 + nSeg + corpo
    const copia = bytes.slice(o, o + tamanho)
    new DataView(copia.buffer).setUint32(22, 0, true)
    const crcOk = crcOgg(copia) === v.getUint32(22, true)
    const pacotes: Uint8Array[] = []
    let atual: number[] = []
    let p = o + 27 + nSeg
    for (const s of tabela) {
      atual.push(...bytes.slice(p, p + s))
      p += s
      if (s < 255) {
        pacotes.push(Uint8Array.from(atual))
        atual = []
      }
    }
    paginas.push({ flags: bytes[o + 5], granule: v.getBigInt64(6, true), seq: v.getUint32(18, true), pacotes, crcOk })
    o += tamanho
  }
  return paginas
}

const pacote = (n: number, byte = 7) => ({ dados: new Uint8Array(n).fill(byte), amostras48k: 960 })

describe('empacotador Ogg Opus', () => {
  it('CRC do Ogg bate com o valor de referência (polinômio 0x04C11DB7, init 0, sem xor final)', () => {
    expect(crcOgg(new TextEncoder().encode('123456789'))).toBe(0x89a1897f)
  })

  it('OpusHead na 1ª página (BOS), OpusTags na 2ª, EOS na última, granule apara o enchimento', () => {
    const pacotes = Array.from({ length: 120 }, (_, i) => pacote(80 + (i % 3)))
    const total = 120 * 960 - 500 // o último quadro veio com enchimento
    const ogg = montarOggOpus({ pacotes, canais: 1, preSkip: 312, taxaDeEntrada: 16000, totalAmostras48k: total })
    const pags = lerPaginas(ogg)

    expect(pags.every((p) => p.crcOk)).toBe(true)
    expect(pags.map((p) => p.seq)).toEqual(pags.map((_, i) => i))
    expect(pags[0].flags).toBe(0x02)
    expect(String.fromCharCode(...pags[0].pacotes[0].slice(0, 8))).toBe('OpusHead')
    expect(preSkipDoOpusHead(pags[0].pacotes[0])).toBe(312)
    expect(String.fromCharCode(...pags[1].pacotes[0].slice(0, 8))).toBe('OpusTags')
    expect(pags[1].granule).toBe(0n)

    const audio = pags.slice(2)
    expect(audio.flatMap((p) => p.pacotes)).toHaveLength(120) // nenhum pacote perdido ou partido
    expect(audio.at(-1)!.flags).toBe(0x04)
    expect(audio.at(-1)!.granule).toBe(BigInt(312 + total))
    // Granules crescem e contam o pre-skip.
    expect(audio[0].granule).toBe(BigInt(312 + audio[0].pacotes.length * 960))
    for (let i = 1; i < audio.length; i++) expect(audio[i].granule > audio[i - 1].granule).toBe(true)
  })

  it('pacote maior que 255 bytes atravessa segmentos sem se partir', () => {
    const ogg = montarOggOpus({ pacotes: [pacote(600, 1), pacote(255, 2), pacote(10, 3)], canais: 1, preSkip: 0, taxaDeEntrada: 16000 })
    const audio = lerPaginas(ogg).slice(2)
    expect(audio.flatMap((p) => p.pacotes).map((p) => p.length)).toEqual([600, 255, 10])
  })

  it('o servidor reconhece a saída como áudio ogg pelos magic bytes', () => {
    const ogg = montarOggOpus({ pacotes: [pacote(50)], canais: 1, preSkip: 312, taxaDeEntrada: 16000 })
    expect(detectarAudio(Buffer.from(ogg))?.mime).toBe('audio/ogg')
  })
})

// ───────────────────────── mistura (WebAudio + WebCodecs falsos) ─────────────────────────

class BufferFalso {
  constructor(public length: number, public sampleRate: number, public numberOfChannels = 1) {}
  get duration() { return this.length / this.sampleRate }
  getChannelData() { return new Float32Array(this.length).fill(0.25) }
}

/** Um `OfflineAudioContext` que decodifica cada blob num buffer de N segundos (o tamanho do blob). */
function instalarWebAudio() {
  const inicios: number[] = []
  class OfflineFalso {
    constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {}
    destination = {}
    async decodeAudioData(bytes: ArrayBuffer) { return new BufferFalso(bytes.byteLength * this.sampleRate, this.sampleRate) }
    createBufferSource() { return { buffer: null, connect: vi.fn(), start: (t: number) => inicios.push(t) } }
    createGain() { return { gain: { value: 1 }, connect: vi.fn() } }
    async startRendering() { return new BufferFalso(this.length, this.sampleRate) }
  }
  vi.stubGlobal('OfflineAudioContext', OfflineFalso)
  return { inicios }
}

function instalarWebCodecs(suportado = true) {
  const configs: Array<Record<string, unknown>> = []
  let quadros = 0
  class AudioDataFalso {
    numberOfFrames: number
    timestamp: number
    constructor(init: { numberOfFrames: number; timestamp: number }) {
      this.numberOfFrames = init.numberOfFrames
      this.timestamp = init.timestamp
    }
    close() {}
  }
  class EncoderFalso {
    static isConfigSupported = vi.fn(async (c: Record<string, unknown>) => ({ supported: suportado, config: c }))
    encodeQueueSize = 0
    private pendente = 0
    constructor(private init: { output: (c: unknown, m?: unknown) => void; error: (e: unknown) => void }) {}
    configure(c: Record<string, unknown>) { configs.push(c) }
    encode(d: AudioDataFalso) {
      quadros += d.numberOfFrames
      this.pendente += d.numberOfFrames
      // 20 ms a 16 kHz = 320 quadros por pacote Opus
      while (this.pendente >= 320) {
        this.pendente -= 320
        this.emitir()
      }
    }
    private emitir() {
      const dados = new Uint8Array(80).fill(9)
      this.init.output(
        { byteLength: dados.length, duration: 20_000, copyTo: (dst: Uint8Array) => dst.set(dados) },
        { decoderConfig: { description: undefined } },
      )
    }
    async flush() { if (this.pendente > 0) { this.pendente = 0; this.emitir() } }
    close() {}
  }
  vi.stubGlobal('AudioEncoder', EncoderFalso)
  vi.stubGlobal('AudioData', AudioDataFalso)
  return { configs, quadros: () => quadros }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** Blob de N "segundos" — o `decodeAudioData` falso usa o tamanho do blob como duração. */
const blobDe = (segundos: number) => new Blob([new Uint8Array(segundos)])

describe('misturarAudios', () => {
  it('com AudioEncoder: devolve Ogg Opus a 32 kbps, mono 16 kHz, com a duração da mistura', async () => {
    const { inicios } = instalarWebAudio()
    const wc = instalarWebCodecs(true)
    const { misturarAudios } = await import('../src/lib/misturarAudios')
    const saida = await misturarAudios(blobDe(3), blobDe(2), 1500)
    expect(saida.type).toBe('audio/ogg; codecs=opus')
    expect(wc.configs[0]).toMatchObject({ codec: 'opus', sampleRate: 16000, numberOfChannels: 1, bitrate: 32000 })
    expect(inicios).toEqual([0, 1.5]) // o mic entrou 1,5 s depois do sistema
    // Tudo o que foi renderizado (3,55 s a 16 kHz) passou pelo codificador.
    expect(wc.quadros()).toBe(Math.ceil(3.55 * 16000))
    const bytes = new Uint8Array(await saida.arrayBuffer())
    expect(detectarAudio(Buffer.from(bytes))?.mime).toBe('audio/ogg')
    const ultima = lerPaginas(bytes).at(-1)!
    expect(ultima.granule).toBe(BigInt(312 + Math.ceil(3.55 * 16000) * 3))
  })

  it('sem AudioEncoder e mistura pequena: cai no WAV antigo', async () => {
    instalarWebAudio()
    const { misturarAudios } = await import('../src/lib/misturarAudios')
    const saida = await misturarAudios(blobDe(3), blobDe(2), 0)
    expect(saida.type).toBe('audio/wav')
  })

  it('codec Opus recusado pelo navegador: também cai no WAV', async () => {
    instalarWebAudio()
    instalarWebCodecs(false)
    const { misturarAudios } = await import('../src/lib/misturarAudios')
    expect((await misturarAudios(blobDe(3), blobDe(2), 0)).type).toBe('audio/wav')
  })

  it('sem AudioEncoder e mistura que não cabe no upload: RECUSA (quem chama fica com o áudio do sistema)', async () => {
    instalarWebAudio()
    const { misturarAudios, TETO_DO_WAV_BYTES } = await import('../src/lib/misturarAudios')
    const segundosDemais = Math.ceil(TETO_DO_WAV_BYTES / 32000) + 60
    await expect(misturarAudios(blobDe(segundosDemais), blobDe(10), 0)).rejects.toThrow(/não cabe/)
  })
})
