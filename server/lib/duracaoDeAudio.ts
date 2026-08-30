/**
 * Duração de um WAV, e quanto dele o provedor de fato COBRA.
 *
 * POR QUE ISTO EXISTE. A quota media `managed_calls` — uma chamada. Mas a Groq cobra STT **por hora
 * de áudio**, então uma chamada de 1 segundo e uma de 25 MB consumiam exatamente a mesma unidade de
 * teto. Um teto em chamadas não protege de nada: quem deixa a captura aberta o dia inteiro gasta
 * dinheiro de verdade sem estourar contador nenhum.
 *
 * O MÍNIMO FATURADO É O DETALHE QUE MUDA A CONTA. A documentação da Groq diz: *"Minimum Billed
 * Length: 10 seconds. If you submit a request less than this, you will still be billed for 10
 * seconds."* Os enunciados do VAD desta aplicação têm ~6 s — ou seja, **cada um é cobrado como 10**.
 * Debitar a duração real subestimaria a conta em ~70% e o teto do plano não seguraria o que promete.
 *
 * Sem dependência: o cabeçalho WAV é lido na mão. O corpo já chega como Buffer em `sttProxy`.
 */

/** Mínimo faturado por requisição pelo provedor de STT (Groq). Em segundos. */
export const MINIMO_FATURADO_S = 10

/**
 * Lê a duração real de um WAV (PCM), em segundos.
 *
 * Percorre os chunks RIFF em vez de assumir que `data` começa no byte 44: WAVs com `LIST`/`fact`
 * antes do áudio são comuns, e o offset fixo daria uma duração errada — silenciosamente, que é o
 * pior jeito de errar num número que vira cobrança.
 *
 * @returns a duração em segundos, ou `null` se o buffer não for um WAV que saibamos ler.
 */
export function duracaoDoWav(buf: Buffer): number | null {
  // 12 bytes: 'RIFF' + tamanho + 'WAVE'.
  if (buf.length < 44) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null

  let taxaDeBytes = 0
  let bytesDeAudio = 0
  let i = 12
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4)
    const tamanho = buf.readUInt32LE(i + 4)
    const corpo = i + 8
    if (id === 'fmt ' && corpo + 16 <= buf.length) {
      // byteRate (bytes por segundo) já embute canais, taxa de amostragem e profundidade.
      taxaDeBytes = buf.readUInt32LE(corpo + 8)
    } else if (id === 'data') {
      // O tamanho declarado pode mentir em stream truncado; o que existe no buffer manda.
      bytesDeAudio = Math.min(tamanho, Math.max(0, buf.length - corpo))
      break
    }
    if (tamanho <= 0) break // chunk inválido: para em vez de girar para sempre
    i = corpo + tamanho + (tamanho % 2) // chunks RIFF são alinhados em 2 bytes
  }

  if (taxaDeBytes <= 0 || bytesDeAudio <= 0) return null
  return bytesDeAudio / taxaDeBytes
}

/**
 * Segundos a DEBITAR do teto por uma requisição — a duração real elevada ao mínimo faturado, e
 * arredondada para cima (o provedor não cobra frações de segundo a nosso favor).
 *
 * Áudio ilegível cai no mínimo, e não em zero: se não sabemos medir, a suposição segura é a que
 * protege o dono da chave, não a que libera consumo não contabilizado.
 */
export function segundosFaturaveis(buf: Buffer): number {
  const real = duracaoDoWav(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) return MINIMO_FATURADO_S
  return Math.max(MINIMO_FATURADO_S, Math.ceil(real))
}
