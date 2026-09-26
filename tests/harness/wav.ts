/**
 * Monta WAVs para os testes do STT — válidos por padrão (o que `src/gateway/audio/wav.ts` produz:
 * PCM 16 bits mono), e com cada campo do `fmt ` sobrescrevível para forjar o que um cliente
 * malicioso mandaria. Um lugar só, porque três arquivos de teste precisam do mesmo cabeçalho e
 * uma cópia divergente é exatamente o tipo de erro silencioso que este módulo existe para pegar.
 */
export interface OpcoesDeWav {
  taxa?: number
  canais?: number
  bits?: number
  /** 1 = PCM inteiro, 3 = PCM float. Outros valores simulam formato comprimido. */
  formato?: number
  /** `byteRate` DECLARADO. Por padrão, o coerente com taxa × canais × bits/8. */
  byteRate?: number
  /** `blockAlign` DECLARADO. Por padrão, o coerente com canais × bits/8. */
  blockAlign?: number
}

export function wavPcm(segundos: number, o: OpcoesDeWav = {}): Buffer {
  const taxa = o.taxa ?? 16_000
  const canais = o.canais ?? 1
  const bits = o.bits ?? 16
  const bloco = canais * (bits / 8)
  const bytesDeAudio = Math.round(segundos * taxa) * bloco
  const buf = Buffer.alloc(44 + bytesDeAudio)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(buf.length - 8, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(o.formato ?? 1, 20)
  buf.writeUInt16LE(canais, 22)
  buf.writeUInt32LE(taxa, 24)
  buf.writeUInt32LE(o.byteRate ?? taxa * bloco, 28)
  buf.writeUInt16LE(o.blockAlign ?? bloco, 32)
  buf.writeUInt16LE(bits, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(bytesDeAudio, 40)
  return buf
}
