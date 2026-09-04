/**
 * A duração faturável é a base do teto de gasto. Se ela errar, o plano cobra o valor errado — e
 * erra em silêncio, porque nada na tela mostra segundos.
 *
 * O caso que motiva tudo: o VAD desta aplicação entrega enunciados de ~6 s, e a Groq fatura no
 * mínimo 10 s por requisição. Debitar 6 subestimaria a conta em ~70%.
 */
import { describe, it, expect } from 'vitest'
import { duracaoDoWav, segundosFaturaveis, MINIMO_FATURADO_S } from '../server/lib/duracaoDeAudio'

/** Monta um WAV PCM 16 bits mono válido com a duração pedida. */
function wav(segundos: number, taxa = 16_000, chunksExtras = false): Buffer {
  const bytesPorAmostra = 2
  const bytesDeAudio = Math.round(segundos * taxa) * bytesPorAmostra
  const extra = chunksExtras ? 12 : 0 // um chunk 'LIST' de 4 bytes de corpo, antes do 'data'
  const buf = Buffer.alloc(44 + extra + bytesDeAudio)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(buf.length - 8, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(taxa, 24)
  buf.writeUInt32LE(taxa * bytesPorAmostra, 28) // byteRate
  buf.writeUInt16LE(bytesPorAmostra, 32)
  buf.writeUInt16LE(16, 34)
  let i = 36
  if (chunksExtras) {
    buf.write('LIST', i, 'ascii')
    buf.writeUInt32LE(4, i + 4)
    i += 12
  }
  buf.write('data', i, 'ascii')
  buf.writeUInt32LE(bytesDeAudio, i + 4)
  return buf
}

describe('duração do WAV', () => {
  it('lê a duração real', () => {
    expect(duracaoDoWav(wav(6))).toBeCloseTo(6, 3)
    expect(duracaoDoWav(wav(30, 48_000))).toBeCloseTo(30, 3)
  })

  it('NÃO assume que o áudio começa no byte 44', () => {
    // Um WAV com chunk 'LIST' antes do 'data' é comum. Com offset fixo a duração sairia errada —
    // silenciosamente, que é o pior jeito de errar num número que vira cobrança.
    expect(duracaoDoWav(wav(6, 16_000, true))).toBeCloseTo(6, 3)
  })

  it('devolve null para o que não sabe ler, em vez de chutar', () => {
    expect(duracaoDoWav(Buffer.alloc(10))).toBeNull()
    expect(duracaoDoWav(Buffer.from('não sou um wav de jeito nenhum, nem perto'))).toBeNull()
  })
})

describe('segundos faturáveis', () => {
  it('O CASO QUE MOTIVOU ISTO: um enunciado de 6 s é cobrado como 10', () => {
    // "Minimum Billed Length: 10 seconds" — documentação da Groq. O VAD entrega ~6 s.
    expect(segundosFaturaveis(wav(6))).toBe(10)
    expect(MINIMO_FATURADO_S).toBe(10)
  })

  it('acima do mínimo, cobra a duração real arredondada para cima', () => {
    expect(segundosFaturaveis(wav(30))).toBe(30)
    expect(segundosFaturaveis(wav(12.3))).toBe(13)
  })

  it('áudio ilegível cai no mínimo, NUNCA em zero', () => {
    // Se não sabemos medir, a suposição segura é a que protege o dono da chave — zero seria
    // consumo não contabilizado, que é exatamente o furo que este módulo fecha.
    expect(segundosFaturaveis(Buffer.alloc(10))).toBe(MINIMO_FATURADO_S)
  })
})
