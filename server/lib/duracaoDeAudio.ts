/**
 * Duração de um WAV, e as DUAS contas que se fazem sobre ela.
 *
 * POR QUE ISTO EXISTE. A quota media `managed_calls` — uma chamada. Mas a Groq cobra STT **por hora
 * de áudio**, então uma chamada de 1 segundo e uma de 25 MB consumiam exatamente a mesma unidade de
 * teto. Um teto em chamadas não protege de nada: quem deixa a captura aberta o dia inteiro gasta
 * dinheiro de verdade sem estourar contador nenhum.
 *
 * O MÍNIMO FATURADO É O DETALHE QUE MUDA A CONTA — DO DONO. A documentação da Groq diz: *"Minimum
 * Billed Length: 10 seconds. If you submit a request less than this, you will still be billed for
 * 10 seconds."* Os enunciados do VAD desta aplicação têm ~6 s — ou seja, **cada um custa ao dono
 * como 10**. Por isso `segundosFaturaveis` existe e alimenta o orçamento GLOBAL de IA
 * (`orcamentoDeIa.ts`): ali, contar a duração real subestimaria a fatura em ~70%.
 *
 * E NÃO MUDA A CONTA DO ASSINANTE (24/09/2026). Até esta data o mesmo número também saía da cota do
 * usuário (`stt_seconds`), e o efeito era uma promessa quebrada: o plano diz "15 h de transcrição",
 * cada fala de 6 s custava 10 s, e o assinante recebia ~9 h de fala. O mínimo do provedor é custo
 * nosso — a margem do plano o absorve (a conta está em `src/core/planos.ts`). A cota do usuário usa
 * `segundosDeAudioDoUsuario`: a duração REAL, arredondada para cima, com piso de 1 s.
 *
 * Sem dependência: o cabeçalho WAV é lido na mão. O corpo já chega como Buffer em `sttProxy`.
 */

/** Mínimo faturado por requisição pelo provedor de STT (Groq). Em segundos. */
export const MINIMO_FATURADO_S = 10

/**
 * Teto de duração POR REQUISIÇÃO no caminho pago pelo app. Em segundos.
 *
 * O cliente legítimo fica bem abaixo: a captura com nuvem corta a fala em 12 s
 * (`MAX_SPEECH_MS_NUVEM` em `src/gateway/capture/systemAudio.ts`) e a importação junta falas em
 * pacotes de até 28 s (`TETO_DO_PACOTE_MS` em `src/gateway/offlineTranscribe.ts`). 60 s dá folga de
 * 2× sobre o maior pacote real sem deixar uma requisição virar 25 MB de áudio pago — que é o que o
 * limite do `raw()` em `server/routes/ai.ts` ainda permitiria.
 */
export const TETO_DE_DURACAO_S = 60

/** Faixas plausíveis do cabeçalho. Fora delas, o arquivo não é algo que o nosso cliente produz. */
const TAXA_MIN = 8_000
const TAXA_MAX = 48_000
const BITS_ACEITOS = new Set([8, 16, 24, 32])
/** 1 = PCM inteiro, 3 = PCM float (IEEE). Comprimidos e o "extensível" (0xFFFE) ficam de fora. */
const FORMATO_PCM = 1
const FORMATO_FLOAT = 3

/**
 * Bytes por segundo DERIVADOS dos campos que descrevem o áudio — nunca o `byteRate` declarado.
 *
 * P0-2 (auditoria de prontidão). A versão anterior dividia pelo `byteRate` do cabeçalho, e o
 * cabeçalho é escrito pelo CLIENTE: um `byteRate` de 25 MB/s fazia 13 minutos de áudio valerem
 * 1 segundo na cota e no orçamento. Aqui o `byteRate` e o `blockAlign` só servem para conferir
 * COERÊNCIA: se não batem com taxa × canais × bits/8, alguém está mentindo — e um número que vira
 * cobrança não se calcula a partir de um cabeçalho mentiroso.
 *
 * @returns a taxa em bytes/s, ou `null` se o `fmt ` não for PCM plausível e coerente.
 */
function taxaDoFmt(buf: Buffer, corpo: number): number | null {
  const formato = buf.readUInt16LE(corpo)
  const canais = buf.readUInt16LE(corpo + 2)
  const taxa = buf.readUInt32LE(corpo + 4)
  const byteRateDeclarado = buf.readUInt32LE(corpo + 8)
  const blockAlignDeclarado = buf.readUInt16LE(corpo + 12)
  const bits = buf.readUInt16LE(corpo + 14)

  if (formato !== FORMATO_PCM && formato !== FORMATO_FLOAT) return null
  if (formato === FORMATO_FLOAT && bits !== 32) return null
  if (canais < 1 || canais > 2) return null
  if (taxa < TAXA_MIN || taxa > TAXA_MAX) return null
  if (!BITS_ACEITOS.has(bits)) return null

  const bloco = canais * (bits / 8)
  const derivada = taxa * bloco
  if (byteRateDeclarado !== derivada || blockAlignDeclarado !== bloco) return null
  return derivada
}

/**
 * Lê a duração de um WAV PCM, em segundos.
 *
 * Percorre os chunks RIFF em vez de assumir que `data` começa no byte 44: WAVs com `LIST`/`fact`
 * antes do áudio são comuns, e o offset fixo daria uma duração errada — silenciosamente, que é o
 * pior jeito de errar num número que vira cobrança.
 *
 * TUDO o que vem depois do cabeçalho do `data` conta como áudio, e não só o tamanho que o chunk
 * declara: o provedor recebe o arquivo inteiro, e um `data` que declara 1 s seguido de 20 s de
 * bytes seria mais um jeito de o cabeçalho encolher a conta. O WAV que o nosso cliente monta
 * (`src/gateway/audio/wav.ts`) termina no `data`, então para ele as duas contas são idênticas.
 *
 * @returns a duração em segundos, ou `null` se o buffer não for um WAV PCM plausível e coerente.
 */
export function duracaoDoWav(buf: Buffer): number | null {
  // 12 bytes: 'RIFF' + tamanho + 'WAVE'.
  if (buf.length < 44) return null
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null

  let taxaDeBytes: number | null = null
  let bytesDeAudio = 0
  let i = 12
  while (i + 8 <= buf.length) {
    const id = buf.toString('ascii', i, i + 4)
    const tamanho = buf.readUInt32LE(i + 4)
    const corpo = i + 8
    if (id === 'fmt ') {
      // Um `fmt ` curto demais, ou um segundo `fmt `, não é um WAV que saibamos cobrar.
      if (tamanho < 16 || corpo + 16 > buf.length || taxaDeBytes !== null) return null
      taxaDeBytes = taxaDoFmt(buf, corpo)
      if (taxaDeBytes === null) return null
    } else if (id === 'data') {
      bytesDeAudio = Math.max(0, buf.length - corpo)
      break
    }
    if (tamanho <= 0) break // chunk inválido: para em vez de girar para sempre
    i = corpo + tamanho + (tamanho % 2) // chunks RIFF são alinhados em 2 bytes
  }

  // `fmt ` precisa vir ANTES do `data` (é o que a especificação exige e o que o cliente produz).
  if (taxaDeBytes === null || bytesDeAudio <= 0) return null
  return bytesDeAudio / taxaDeBytes
}

/**
 * Segundos que o PROVEDOR fatura por uma requisição — a duração real elevada ao mínimo faturado, e
 * arredondada para cima (o provedor não cobra frações de segundo a nosso favor). Só para o gasto
 * INTERNO (orçamento global, métricas de custo); a cota do assinante é `segundosDeAudioDoUsuario`.
 *
 * Áudio ilegível cai no mínimo, e não em zero: se não sabemos medir, a suposição segura é a que
 * protege o dono da chave, não a que libera consumo não contabilizado.
 */
export function segundosFaturaveis(buf: Buffer): number {
  const real = duracaoDoWav(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) return MINIMO_FATURADO_S
  return Math.max(MINIMO_FATURADO_S, Math.ceil(real))
}

/**
 * Segundos que saem da COTA DO ASSINANTE (`stt_seconds`) — a duração REAL, arredondada para cima,
 * com piso de 1 s. É a unidade em que o plano promete horas de transcrição.
 *
 * Áudio ilegível cai no mínimo faturado, e não em 1: se não sabemos medir, também não sabemos se foi
 * curto. Na prática não acontece — o cliente sempre manda WAV —, mas um corpo forjado não pode virar
 * transcrição quase de graça.
 */
export function segundosDeAudioDoUsuario(buf: Buffer): number {
  const real = duracaoDoWav(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) return MINIMO_FATURADO_S
  return Math.max(1, Math.ceil(real))
}

/** Resultado de `avaliarAudioFaturavel`: segundos a debitar da cota do assinante, ou o motivo da recusa. */
export type AvaliacaoDeAudio =
  | { ok: true; segundosDoUsuario: number }
  | { ok: false; status: 413 | 415; code: 'audio_longo_demais' | 'audio_ilegivel'; error: string }

/**
 * Decide se um áudio pode seguir para o provedor NA CHAVE DO APP, e quanto ele custa na cota.
 *
 * Aqui o ilegível é RECUSADO, e não cobrado como o mínimo (que é o que `segundosFaturaveis` faz).
 * Cobrar 10 s e mandar ao provedor mesmo assim deixava qualquer corpo — inclusive 25 MB de algo
 * que não sabemos medir — ser transcrito pela chave do dono ao preço de um enunciado curto. O
 * cliente legítimo SEMPRE manda WAV PCM 16 bits mono (`src/gateway/audio/wav.ts`), então recusar
 * o que não se mede não quebra ninguém de verdade.
 */
export function avaliarAudioFaturavel(buf: Buffer): AvaliacaoDeAudio {
  const real = duracaoDoWav(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) {
    return {
      ok: false,
      status: 415,
      code: 'audio_ilegivel',
      error: 'áudio não reconhecido: envie WAV PCM (8–48 kHz, mono ou estéreo, 8/16/24/32 bits)',
    }
  }
  if (real > TETO_DE_DURACAO_S) {
    return {
      ok: false,
      status: 413,
      code: 'audio_longo_demais',
      error: `áudio longo demais: o máximo por requisição é ${TETO_DE_DURACAO_S} s`,
    }
  }
  // A cota do assinante é a duração REAL (ver `segundosDeAudioDoUsuario`); o mínimo de 10 s do
  // provedor é custo do dono e entra só no orçamento global (`segundosFaturaveis`).
  return { ok: true, segundosDoUsuario: segundosDeAudioDoUsuario(buf) }
}
