/**
 * Monta Ogg Opus para os testes do STT — válidos por padrão (o que o cliente produz: pacotes de
 * 20 ms, mono, pre-skip 312, granule final apara o enchimento), e com as peças que um cliente
 * malicioso mexeria expostas para forjar: o granule final, o CRC, lixo no fim, um segundo fluxo.
 *
 * Os pacotes são SINTÉTICOS mas com o TOC válido (RFC 6716 §3.1): 0xF8 = config 31 (CELT FB 20 ms),
 * código 0 (um quadro). O parser do servidor conta amostras pelo TOC, então o conteúdo depois do
 * primeiro byte não importa — ninguém decodifica o áudio no teste.
 */
import { crcOgg, montarOggOpus, type PacoteOpus } from '../../src/lib/oggOpus'

export const PRE_SKIP = 312
/** TOC de um quadro CELT de 20 ms (960 amostras a 48 kHz). */
export const TOC_20MS = 0xf8

export interface OpcoesDeOgg {
  /** Granule final declarado, em amostras a 48 kHz SEM o pre-skip. Por padrão, a duração real. */
  totalAmostras48k?: number
  serie?: number
  canais?: number
  toc?: number
}

export function oggOpus(segundos: number, o: OpcoesDeOgg = {}): Buffer {
  const amostras = Math.round(segundos * 48_000)
  const n = Math.ceil(amostras / 960)
  const pacotes: PacoteOpus[] = Array.from({ length: n }, (_, i) => ({
    dados: Uint8Array.of(o.toc ?? TOC_20MS, i & 0xff, 0x55, 0xaa),
    amostras48k: 960,
  }))
  return Buffer.from(
    montarOggOpus({
      pacotes,
      canais: o.canais ?? 1,
      preSkip: PRE_SKIP,
      taxaDeEntrada: 16_000,
      totalAmostras48k: o.totalAmostras48k ?? amostras,
      serie: o.serie,
    }),
  )
}

/** Offsets de cada página de um fluxo Ogg bem formado. */
export function paginasDe(buf: Buffer): number[] {
  const offs: number[] = []
  let o = 0
  while (o + 27 <= buf.length) {
    offs.push(o)
    const n = buf[o + 26]
    let corpo = 0
    for (let i = 0; i < n; i++) corpo += buf[o + 27 + i]
    o += 27 + n + corpo
  }
  return offs
}

/** Recalcula o CRC de uma página (depois de mexer num campo dela). */
export function recalcularCrc(buf: Buffer, off: number): void {
  const n = buf[off + 26]
  let corpo = 0
  for (let i = 0; i < n; i++) corpo += buf[off + 27 + i]
  const fim = off + 27 + n + corpo
  buf.writeUInt32LE(0, off + 22)
  buf.writeUInt32LE(crcOgg(buf.subarray(off, fim)), off + 22)
}

/** Reescreve o granule da ÚLTIMA página (com CRC válido): o jeito de mentir a duração. */
export function comGranuleFinal(buf: Buffer, granule: bigint): Buffer {
  const b = Buffer.from(buf)
  const ultima = paginasDe(b).at(-1)!
  b.writeBigInt64LE(granule, ultima + 6)
  recalcularCrc(b, ultima)
  return b
}
