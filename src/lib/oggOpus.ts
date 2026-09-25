/**
 * EMPACOTADOR OGG PARA OPUS (RFC 3533 + RFC 7845) — o mínimo para guardar pacotes Opus num arquivo
 * que qualquer navegador toca e que o servidor reconhece pelos magic bytes (`OggS`).
 *
 * POR QUE EXISTE. O `AudioEncoder` do WebCodecs devolve pacotes Opus CRUS, sem contêiner. Para
 * virar um arquivo, alguém tem de embrulhá-los. Ogg e não WebM porque o Ogg é bem mais simples de
 * escrever certo: páginas com cabeçalho fixo, um CRC e uma tabela de segmentos — sem EBML, sem
 * tamanhos de elemento variáveis, sem índice. Não vale uma dependência para ~100 linhas.
 *
 * O que o formato exige, e onde cada coisa está:
 *  - página 1: SÓ o `OpusHead` (flag BOS), granule 0;
 *  - página 2: SÓ o `OpusTags`, granule 0;
 *  - páginas de áudio: pacotes inteiros (nunca partidos entre páginas — o maior pacote Opus tem
 *    1275 bytes, 6 segmentos), granule = amostras A 48 kHz até o fim do último pacote da página,
 *    CONTANDO o pre-skip;
 *  - última página: flag EOS e granule = pre-skip + duração real, o que APARA o enchimento que o
 *    codificador pôs no último quadro (sem isto o arquivo sobraria uns ms de silêncio no fim).
 */

/** Tabela do CRC do Ogg: polinômio 0x04C11DB7, sem reflexão, valor inicial 0, sem xor final. */
const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

export function crcOgg(bytes: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ TABELA_CRC[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0
  return crc >>> 0
}

export interface PacoteOpus {
  dados: Uint8Array
  /** Duração do pacote em amostras A 48 kHz (a unidade do granule do Opus, qualquer que seja a taxa de entrada). */
  amostras48k: number
}

export interface OpcoesOggOpus {
  pacotes: PacoteOpus[]
  canais: number
  /** Amostras a 48 kHz que o decodificador descarta no início (atraso do codificador). */
  preSkip: number
  /** Taxa do áudio ORIGINAL — informativa no `OpusHead`, o decodificador sempre sai a 48 kHz. */
  taxaDeEntrada: number
  /** Duração real em amostras a 48 kHz. Omitida, vale a soma dos pacotes. */
  totalAmostras48k?: number
  /** Número de série do fluxo lógico. Qualquer valor; fixo por padrão para a saída ser determinística. */
  serie?: number
}

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0))

function opusHead(canais: number, preSkip: number, taxa: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusHead'), 0)
  b[8] = 1 // versão
  b[9] = canais
  v.setUint16(10, preSkip, true)
  v.setUint32(12, taxa, true)
  v.setInt16(16, 0, true) // ganho de saída
  b[18] = 0 // família de mapeamento 0: mono/estéreo
  return b
}

function opusTags(): Uint8Array {
  const vendor = ascii('babel-play')
  const b = new Uint8Array(8 + 4 + vendor.length + 4)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusTags'), 0)
  v.setUint32(8, vendor.length, true)
  b.set(vendor, 12)
  v.setUint32(12 + vendor.length, 0, true) // nenhum comentário
  return b
}

/** Laço do Ogg: 255 por segmento cheio, e o resto (inclusive 0) fecha o pacote. */
function segmentosDe(tamanho: number): number[] {
  const s: number[] = []
  let r = tamanho
  while (r >= 255) {
    s.push(255)
    r -= 255
  }
  s.push(r)
  return s
}

function pagina(pacotes: Uint8Array[], granule: bigint, serie: number, seq: number, flags: number): Uint8Array {
  const tabela = pacotes.flatMap((p) => segmentosDe(p.length))
  const corpo = pacotes.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(27 + tabela.length + corpo)
  const v = new DataView(out.buffer)
  out.set(ascii('OggS'), 0)
  out[4] = 0 // versão do formato
  out[5] = flags
  v.setBigInt64(6, granule, true)
  v.setUint32(14, serie, true)
  v.setUint32(18, seq, true)
  v.setUint32(22, 0, true) // CRC entra depois, calculado com o campo zerado
  out[26] = tabela.length
  out.set(tabela, 27)
  let o = 27 + tabela.length
  for (const p of pacotes) {
    out.set(p, o)
    o += p.length
  }
  v.setUint32(22, crcOgg(out), true)
  return out
}

const BOS = 0x02
const EOS = 0x04
/** Teto de pacotes por página: ~1 s de áudio a quadros de 20 ms. Páginas grandes demais atrasam o seek. */
const PACOTES_POR_PAGINA = 50

export function montarOggOpus(op: OpcoesOggOpus): Uint8Array {
  const serie = op.serie ?? 0x62616265 // "babe"
  const paginas: Uint8Array[] = []
  let seq = 0
  paginas.push(pagina([opusHead(op.canais, op.preSkip, op.taxaDeEntrada)], 0n, serie, seq++, BOS))
  paginas.push(pagina([opusTags()], 0n, serie, seq++, 0))

  const soma = op.pacotes.reduce((n, p) => n + p.amostras48k, 0)
  const total = Math.min(op.totalAmostras48k ?? soma, soma)
  const granuleFinal = BigInt(op.preSkip + total)

  let granule = op.preSkip
  let lote: Uint8Array[] = []
  let segmentosNoLote = 0
  const fechar = (ultima: boolean) => {
    const g = ultima ? granuleFinal : BigInt(granule)
    paginas.push(pagina(lote, g, serie, seq++, ultima ? EOS : 0))
    lote = []
    segmentosNoLote = 0
  }
  op.pacotes.forEach((p, i) => {
    const seg = segmentosDe(p.dados.length).length
    if (lote.length && (segmentosNoLote + seg > 255 || lote.length >= PACOTES_POR_PAGINA)) fechar(false)
    lote.push(p.dados)
    segmentosNoLote += seg
    granule += p.amostras48k
    if (i === op.pacotes.length - 1) fechar(true)
  })
  // Sem pacote nenhum, o fluxo ainda precisa terminar: uma página vazia com EOS.
  if (!op.pacotes.length) fechar(true)

  const tamanho = paginas.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(tamanho)
  let o = 0
  for (const p of paginas) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Lê o pre-skip de um `OpusHead` (o `description` que o `AudioEncoder` às vezes entrega). */
export function preSkipDoOpusHead(desc: ArrayBuffer | ArrayBufferView | undefined | null): number | null {
  if (!desc) return null
  const b = desc instanceof ArrayBuffer ? new Uint8Array(desc) : new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
  if (b.length < 19) return null
  for (let i = 0; i < 8; i++) if (b[i] !== 'OpusHead'.charCodeAt(i)) return null
  return b[10] | (b[11] << 8)
}
