/**
 * WAV PCM 16-bit mono, o único formato que a bancada de voz troca entre sintetizadores.
 * Escreve o cabeçalho canônico de 44 bytes; lê varrendo os blocos (tolera `LIST` etc. de motores de terceiros).
 */

const ASCII = (b, i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0))

/**
 * Lê taxa, canais, bits e a posição dos dados.
 * @param {Uint8Array} wav
 * @returns {{ formato: number, taxaHz: number, canais: number, bits: number, inicio: number, tamanho: number }}
 */
function lerCabecalho(wav) {
  if (!(wav instanceof Uint8Array) || wav.length < 44 || !ASCII(wav, 0, 'RIFF') || !ASCII(wav, 8, 'WAVE')) {
    throw new Error('entrada não é um WAV (cabeçalho RIFF/WAVE ausente)')
  }
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  let fmt = null
  let pos = 12
  while (pos + 8 <= wav.length) {
    const tamanho = v.getUint32(pos + 4, true)
    if (ASCII(wav, pos, 'fmt ') && pos + 24 <= wav.length) {
      fmt = {
        formato: v.getUint16(pos + 8, true),
        canais: v.getUint16(pos + 10, true),
        taxaHz: v.getUint32(pos + 12, true),
        bits: v.getUint16(pos + 22, true),
      }
    } else if (ASCII(wav, pos, 'data')) {
      if (!fmt) throw new Error('entrada não é um WAV (bloco fmt ausente antes dos dados)')
      const restante = wav.length - (pos + 8)
      return { ...fmt, inicio: pos + 8, tamanho: Math.min(tamanho, restante) }
    }
    pos += 8 + tamanho + (tamanho % 2)
  }
  throw new Error('entrada não é um WAV (bloco data ausente)')
}

/**
 * Duração em segundos, pelo cabeçalho.
 * @param {Uint8Array} wav
 * @returns {number}
 */
export function duracaoDoWav(wav) {
  const h = lerCabecalho(wav)
  if (h.bits !== 16 || h.canais !== 1)
    throw new Error(`WAV precisa ser PCM 16-bit mono (veio ${h.bits} bits, ${h.canais} canais)`)
  return h.tamanho / 2 / h.taxaHz
}

/**
 * A taxa de amostragem do WAV.
 * @param {Uint8Array} wav
 * @returns {number}
 */
export function taxaDoWav(wav) {
  return lerCabecalho(wav).taxaHz
}

/**
 * Monta um WAV canônico a partir das amostras (bytes PCM 16-bit little-endian).
 * @param {Uint8Array} pcm
 * @param {number} taxaHz
 * @returns {Uint8Array}
 */
function montarWav(pcm, taxaHz) {
  const b = new Uint8Array(44 + pcm.length)
  const v = new DataView(b.buffer)
  b.set([0x52, 0x49, 0x46, 0x46], 0)
  v.setUint32(4, 36 + pcm.length, true)
  b.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8)
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, taxaHz, true)
  v.setUint32(28, taxaHz * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  b.set([0x64, 0x61, 0x74, 0x61], 36)
  v.setUint32(40, pcm.length, true)
  b.set(pcm, 44)
  return b
}

/**
 * Silêncio de `segundos` na taxa dada (como WAV).
 * @param {number} segundos
 * @param {number} taxaHz
 * @returns {Uint8Array}
 */
export function wavDeSilencio(segundos, taxaHz) {
  return montarWav(new Uint8Array(Math.round(segundos * taxaHz) * 2), taxaHz)
}

/**
 * Junta os clipes em um só, com `pausaS` de silêncio entre eles. Exige a mesma taxa em todos.
 * @param {Uint8Array[]} clipes
 * @param {number} pausaS
 * @returns {Uint8Array}
 */
export function emendarWavs(clipes, pausaS) {
  if (clipes.length === 0) throw new Error('emendarWavs precisa de ao menos um clipe')
  if (!Number.isFinite(pausaS) || pausaS < 0) throw new RangeError(`emendarWavs: pausaS inválida (${pausaS})`)
  const cabecalhos = clipes.map(lerCabecalho)
  for (const h of cabecalhos) {
    if (h.formato !== 1) throw new Error(`emendarWavs: clipe não é PCM (formato ${h.formato})`)
    if (h.bits !== 16 || h.canais !== 1) {
      throw new Error(`emendarWavs: clipe precisa ser 16-bit mono (veio ${h.bits} bits, ${h.canais} canais)`)
    }
  }
  const taxaHz = cabecalhos[0].taxaHz
  if (cabecalhos.some((h) => h.taxaHz !== taxaHz)) {
    throw new Error('emendarWavs: clipes com taxa de amostragem diferente')
  }
  const pausa = Math.round(pausaS * taxaHz) * 2
  const total = cabecalhos.reduce((s, h) => s + h.tamanho, 0) + pausa * (clipes.length - 1)
  const pcm = new Uint8Array(total)
  let pos = 0
  cabecalhos.forEach((h, i) => {
    if (i > 0) pos += pausa
    pcm.set(clipes[i].subarray(h.inicio, h.inicio + h.tamanho), pos)
    pos += h.tamanho
  })
  return montarWav(pcm, taxaHz)
}
