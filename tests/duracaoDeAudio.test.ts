/**
 * DUAS CONTAS SOBRE O MESMO ÁUDIO, e elas não podem se misturar.
 *
 *   - `segundosFaturaveis` é o que o PROVEDOR cobra do dono: a Groq fatura no mínimo 10 s por
 *     requisição, e o VAD entrega enunciados de ~6 s. É a base do orçamento GLOBAL de IA.
 *   - `segundosDeAudioDoUsuario` é o que sai da COTA do assinante: a duração REAL, arredondada para
 *     cima, com piso de 1 s. O plano promete "15 h de transcrição"; cobrar 10 s por uma fala de 6 s
 *     entregava ~9 h de fala e chamava isso de 15.
 */
import { describe, expect, it } from 'vitest'

import {
  avaliarAudioFaturavel,
  duracaoDoWav,
  MINIMO_FATURADO_S,
  segundosDeAudioDoUsuario,
  segundosFaturaveis,
  TETO_DE_DURACAO_S,
} from '../server/lib/duracaoDeAudio'
import { wavPcm } from './harness/wav'

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

describe('segundos da cota do usuário (duração REAL, não a do provedor)', () => {
  it('um enunciado de 6 s custa 6 s ao assinante — não 10', () => {
    expect(segundosDeAudioDoUsuario(wav(6))).toBe(6)
  })

  it('arredonda para cima, com piso de 1 s', () => {
    expect(segundosDeAudioDoUsuario(wav(2.2))).toBe(3)
    expect(segundosDeAudioDoUsuario(wav(0.3))).toBe(1)
    expect(segundosDeAudioDoUsuario(wav(30))).toBe(30)
  })

  it('áudio ilegível cai no mínimo do provedor (não sabemos medir; nunca zero)', () => {
    expect(segundosDeAudioDoUsuario(Buffer.alloc(10))).toBe(MINIMO_FATURADO_S)
  })

  it('as duas contas só coincidem acima do mínimo faturado', () => {
    expect(segundosDeAudioDoUsuario(wav(12.3))).toBe(segundosFaturaveis(wav(12.3)))
    expect(segundosDeAudioDoUsuario(wav(4))).toBeLessThan(segundosFaturaveis(wav(4)))
  })
})

/**
 * P0-2 (auditoria de prontidão): a duração saía de `bytesDeAudio / byteRate`, e `byteRate` é um
 * campo do cabeçalho que o CLIENTE escreve. Um `byteRate` enorme fazia 13 minutos de áudio contarem
 * como 1 segundo na cota e no orçamento. A taxa agora é DERIVADA dos campos que descrevem o áudio,
 * e o `byteRate` declarado só serve para conferir coerência.
 */
describe('cabeçalho forjado', () => {
  it('byteRate inflado (incoerente com taxa × canais × bits) → ilegível, não "1 segundo"', () => {
    // 13 min de PCM 16 kHz mono 16 bits declarando byteRate de ~25 MB/s: antes, ~1 s.
    const forjado = wavPcm(780, { byteRate: 25_000_000 })
    expect(duracaoDoWav(forjado)).toBeNull()
  })

  it('blockAlign incoerente → ilegível', () => {
    expect(duracaoDoWav(wavPcm(2, { blockAlign: 64 }))).toBeNull()
  })

  it('formato não-PCM (ex.: 0x55 MP3, 0xFFFE extensível) → ilegível', () => {
    expect(duracaoDoWav(wavPcm(2, { formato: 0x55 }))).toBeNull()
    expect(duracaoDoWav(wavPcm(2, { formato: 0xfffe }))).toBeNull()
  })

  it('valores fora do plausível → ilegível (taxa, canais, bits)', () => {
    expect(duracaoDoWav(wavPcm(1, { taxa: 4_000 }))).toBeNull()
    expect(duracaoDoWav(wavPcm(1, { taxa: 96_000 }))).toBeNull()
    expect(duracaoDoWav(wavPcm(1, { canais: 6 }))).toBeNull()
    expect(duracaoDoWav(wavPcm(1, { bits: 12 }))).toBeNull()
  })

  it('PCM float de 32 bits e estéreo 48 kHz continuam legíveis', () => {
    expect(duracaoDoWav(wavPcm(3, { formato: 3, bits: 32 }))).toBeCloseTo(3, 3)
    expect(duracaoDoWav(wavPcm(3, { taxa: 48_000, canais: 2, bits: 24 }))).toBeCloseTo(3, 3)
  })

  it('o WAV que o cliente monta (16 kHz mono 16 bits) segue lido como antes', () => {
    expect(duracaoDoWav(wavPcm(6))).toBeCloseTo(6, 3)
  })

  it('bytes escondidos DEPOIS do chunk data também contam (pior caso)', () => {
    // Declara 1 s no `data` e anexa mais 20 s de bytes: o provedor recebe o arquivo inteiro.
    const base = wavPcm(1)
    const cauda = Buffer.alloc(20 * 32_000)
    expect(duracaoDoWav(Buffer.concat([base, cauda]))).toBeCloseTo(21, 3)
  })
})

describe('avaliação do áudio pago pelo app', () => {
  it('WAV legível dentro do teto → segundos REAIS na cota (o mínimo de 10 s é custo do dono)', () => {
    expect(avaliarAudioFaturavel(wavPcm(6))).toEqual({ ok: true, segundosDoUsuario: 6 })
    expect(avaliarAudioFaturavel(wavPcm(30))).toEqual({ ok: true, segundosDoUsuario: 30 })
  })

  it('não-RIFF → recusa 415 audio_ilegivel (em vez de cobrar 10 s e mandar ao provedor)', () => {
    const r = avaliarAudioFaturavel(Buffer.from('não sou um wav de jeito nenhum, nem perto, mesmo'))
    expect(r).toMatchObject({ ok: false, status: 415, code: 'audio_ilegivel' })
  })

  it('byteRate forjado → recusa 415', () => {
    expect(avaliarAudioFaturavel(wavPcm(780, { byteRate: 25_000_000 }))).toMatchObject({ ok: false, status: 415 })
  })

  it('acima do teto por requisição → recusa 413 audio_longo_demais', () => {
    expect(TETO_DE_DURACAO_S).toBe(60)
    expect(avaliarAudioFaturavel(wavPcm(60))).toMatchObject({ ok: true, segundosDoUsuario: 60 })
    expect(avaliarAudioFaturavel(wavPcm(61))).toMatchObject({ ok: false, status: 413, code: 'audio_longo_demais' })
  })
})
