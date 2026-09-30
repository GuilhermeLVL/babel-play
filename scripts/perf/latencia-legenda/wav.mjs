/**
 * WAV DA BANCADA: ler PCM16 ou µ-law (G.711) mono, escrever os dois.
 *
 * Por que µ-law: o áudio da bancada de desempenho vai VERSIONADO no repositório (o CI não tem o
 * FLEURS que a bancada de 2026-09 baixou para `%LOCALAPPDATA%`), e µ-law guarda a fala em 8 bits
 * por amostra — metade do PCM16, com erro de quantização abaixo de 5% da amplitude, que não muda
 * nada para o VAD nem para o STT que a bancada mede em VELOCIDADE. O Chromium só toca PCM no
 * microfone falso (`--use-file-for-fake-audio-capture`), então `montar-audio.mjs` decodifica e
 * escreve o WAV da rodada em PCM16.
 */

const BIAS = 0x84
const TETO = 32635

/** Amostra int16 → byte µ-law (G.711). */
export function mulawDe(amostra) {
  let s = Math.max(-32768, Math.min(32767, Math.round(amostra)))
  const sinal = s < 0 ? 0x80 : 0
  if (sinal) s = -s
  if (s > TETO) s = TETO
  s += BIAS
  let exp = 7
  for (let mascara = 0x4000; (s & mascara) === 0 && exp > 0; exp--, mascara >>= 1);
  const mantissa = (s >> (exp + 3)) & 0x0f
  return ~(sinal | (exp << 4) | mantissa) & 0xff
}

/** Byte µ-law → amostra int16. */
export function deMulaw(byte) {
  const u = ~byte & 0xff
  const exp = (u >> 4) & 0x07
  const s = ((((u & 0x0f) << 3) + BIAS) << exp) - BIAS
  return u & 0x80 && s ? -s : s
}

function cabecalho(tamanhoDosDados, fmt, extras = []) {
  const blocos = [fmt, ...extras]
  const tamanho = 4 + blocos.reduce((s, b) => s + b.length, 0) + 8 + tamanhoDosDados + (tamanhoDosDados % 2)
  const riff = Buffer.alloc(12)
  riff.write('RIFF', 0)
  riff.writeUInt32LE(tamanho, 4)
  riff.write('WAVE', 8)
  const data = Buffer.alloc(8)
  data.write('data', 0)
  data.writeUInt32LE(tamanhoDosDados, 4)
  return Buffer.concat([riff, ...blocos, data])
}

function blocoFmt({ formato, sr, bits, cbSize }) {
  const b = Buffer.alloc(cbSize === undefined ? 24 : 26)
  b.write('fmt ', 0)
  b.writeUInt32LE(b.length - 8, 4)
  b.writeUInt16LE(formato, 8)
  b.writeUInt16LE(1, 10) // mono
  b.writeUInt32LE(sr, 12)
  b.writeUInt32LE((sr * bits) / 8, 16)
  b.writeUInt16LE(bits / 8, 20)
  b.writeUInt16LE(bits, 22)
  if (cbSize !== undefined) b.writeUInt16LE(cbSize, 24)
  return b
}

/** Float32 [-1, 1] → WAV PCM 16 bits mono. */
export function wavPcm16(amostras, sr) {
  const dados = Buffer.alloc(amostras.length * 2)
  for (let i = 0; i < amostras.length; i++)
    dados.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(amostras[i] * 32767))), i * 2)
  return Buffer.concat([cabecalho(dados.length, blocoFmt({ formato: 1, sr, bits: 16 })), dados])
}

/** Float32 [-1, 1] → WAV µ-law 8 bits mono (formato 7, com o bloco `fact` que o formato não-PCM pede). */
export function wavMulaw(amostras, sr) {
  const dados = Buffer.alloc(amostras.length + (amostras.length % 2))
  for (let i = 0; i < amostras.length; i++) dados[i] = mulawDe(amostras[i] * 32767)
  const fact = Buffer.alloc(12)
  fact.write('fact', 0)
  fact.writeUInt32LE(4, 4)
  fact.writeUInt32LE(amostras.length, 8)
  const cab = cabecalho(amostras.length, blocoFmt({ formato: 7, sr, bits: 8, cbSize: 0 }), [fact])
  return Buffer.concat([cab, dados])
}

/**
 * WAV mono PCM16 ou µ-law → `{ sr, amostras: Float32Array }`. `opcoes.sr` exige a taxa (a bancada
 * trabalha em 16 kHz, a do VAD e do Whisper).
 */
export function lerWav(buf, opcoes = {}) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('não é WAV')
  let off = 12
  let fmt = null
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const tam = buf.readUInt32LE(off + 4)
    if (id === 'fmt ')
      fmt = {
        formato: buf.readUInt16LE(off + 8),
        canais: buf.readUInt16LE(off + 10),
        sr: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      }
    if (id === 'data') {
      if (!fmt) throw new Error('WAV sem bloco fmt antes dos dados')
      if (fmt.canais !== 1) throw new Error(`WAV com ${fmt.canais} canais; a bancada usa mono`)
      if (opcoes.sr && fmt.sr !== opcoes.sr) throw new Error(`WAV em ${fmt.sr} Hz; esperado ${opcoes.sr} Hz`)
      const ini = off + 8
      if (fmt.formato === 1 && fmt.bits === 16) {
        const out = new Float32Array(tam / 2)
        for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(ini + i * 2) / 32768
        return { sr: fmt.sr, amostras: out }
      }
      if (fmt.formato === 7 && fmt.bits === 8) {
        const out = new Float32Array(tam)
        for (let i = 0; i < tam; i++) out[i] = deMulaw(buf[ini + i]) / 32768
        return { sr: fmt.sr, amostras: out }
      }
      throw new Error(`WAV formato ${fmt.formato}/${fmt.bits} bits: só PCM16 e µ-law 8 bits`)
    }
    off += 8 + tam + (tam % 2)
  }
  throw new Error('WAV sem bloco data')
}
