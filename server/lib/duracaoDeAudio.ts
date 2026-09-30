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
 *
 * OGG OPUS TAMBÉM (28/09/2026, auditoria de eficiência da IA, achado 3). O cliente passou a mandar
 * cada fala em Opus a ~24 kbps em vez de WAV de 16 bits (~256 kbps): ~10× menos dados no plano do
 * celular, WER igual na bancada (4,0% contra 4,1%). A duração continua MEDIDA aqui, nunca
 * declarada: o granule final do Ogg é escrito pelo cliente, então ele é conferido contra as
 * amostras que os pacotes de fato carregam (ver `duracaoDoOggOpus`). Uma função só,
 * `duracaoDoAudio`, alimenta as três contas — WAV e Ogg da mesma duração custam o mesmo.
 */
import { crcOgg } from '../../src/lib/oggOpus'

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

/* ───────────────────────────── Ogg Opus (RFC 3533 + RFC 7845) ───────────────────────────── */

/** O granule do Opus conta amostras a 48 kHz, qualquer que seja a taxa do áudio original. */
const AMOSTRAS_POR_SEGUNDO_OPUS = 48_000
/** O maior pacote Opus dura 120 ms (RFC 6716 §3.2.5): 5760 amostras a 48 kHz. */
const MAX_AMOSTRAS_POR_PACOTE = 5_760
/**
 * Quanto as amostras dos pacotes podem SOBRAR sobre a duração declarada pelo granule: o pre-skip
 * (312 no libopus) mais o enchimento do último quadro (até um pacote). 240 ms é o dobro do pior
 * pacote — folga para qualquer codificador honesto, e o máximo que um granule mentiroso consegue
 * esconder da cobrança. Acima disso o arquivo diz uma duração e carrega outra: 415.
 */
const FOLGA_DO_GRANULE = 2 * MAX_AMOSTRAS_POR_PACOTE
const FLAG_CONTINUACAO = 0x01
const FLAG_BOS = 0x02
const FLAG_EOS = 0x04

/**
 * Amostras (a 48 kHz) de um pacote Opus, lidas do byte TOC (RFC 6716 §3.1). `null` = pacote inválido.
 *
 * O TOC diz a configuração (duração de cada quadro) e quantos quadros o pacote leva. É o que o
 * decodificador do provedor vai tocar — e por isso é a régua contra a qual o granule é conferido.
 */
function amostrasDoPacote(toc: number, segundoByte: number | undefined, tamanho: number): number | null {
  if (tamanho < 1) return null
  const config = toc >> 3
  let quadro: number
  if (config < 12)
    quadro = [480, 960, 1920, 2880][config & 3] // SILK: 10/20/40/60 ms
  else if (config < 16)
    quadro = [480, 960][config & 1] // híbrido: 10/20 ms
  else quadro = [120, 240, 480, 960][config & 3] // CELT: 2,5/5/10/20 ms
  const codigo = toc & 3
  let quadros: number
  if (codigo === 0) quadros = 1
  else if (codigo < 3) quadros = 2
  else {
    if (tamanho < 2 || segundoByte === undefined) return null
    quadros = segundoByte & 0x3f
    if (quadros < 1) return null
  }
  const total = quadro * quadros
  return total > MAX_AMOSTRAS_POR_PACOTE ? null : total
}

/**
 * Lê a duração de um Ogg Opus, em segundos: granule da última página menos o pre-skip, a 48 kHz.
 *
 * O CONTÊINER É VALIDADO INTEIRO, porque tudo nele foi escrito pelo cliente e a duração vira cota
 * e custo:
 *  - toda página começa em `OggS`, versão 0, com o CRC certo e o número de sequência seguinte;
 *    um fluxo lógico só (uma série), BOS só na primeira página, nada depois do EOS;
 *  - o primeiro pacote é um `OpusHead` (versão 0.x, 1–2 canais, mapeamento 0) sozinho na página
 *    BOS, e o segundo é o `OpusTags`;
 *  - as páginas cobrem o buffer EXATAMENTE: lixo depois da última página é recusado, porque o
 *    provedor recebe o arquivo inteiro (a mesma razão pela qual o WAV conta tudo depois do `data`);
 *  - o granule nunca anda para trás, e o final é CONFERIDO contra a soma das amostras dos pacotes
 *    pelo TOC: a duração declarada não pode passar do que os pacotes carregam, nem ficar mais de
 *    `FOLGA_DO_GRANULE` abaixo. É o análogo do `byteRate` coerente do WAV (P0-2): sem isto, 30 s de
 *    pacotes com granule de 1 s seriam transcritos pela chave do dono ao preço de 1 s.
 *
 * @returns a duração em segundos, ou `null` se o buffer não for um Ogg Opus plausível e coerente.
 */
export function duracaoDoOggOpus(buf: Buffer): number | null {
  if (buf.length < 28 || buf.toString('ascii', 0, 4) !== 'OggS') return null

  let serie: number | null = null
  let seq = 0
  let preSkip: number | null = null
  let tagsVistas = false
  let granuleFinal = -1n
  let amostras = 0
  let pacotesDeAudio = 0
  let fimDoFluxo = false
  /** Pacote que atravessa páginas: os primeiros bytes (TOC, cabeçalhos) e o tamanho acumulado. */
  let emCurso: { bytes: number[]; tamanho: number } | null = null
  let indiceDoPacote = 0

  let o = 0
  while (o < buf.length) {
    if (fimDoFluxo) return null // página depois do EOS: fluxo encadeado ou lixo
    if (o + 27 > buf.length || buf.toString('ascii', o, o + 4) !== 'OggS' || buf[o + 4] !== 0) return null
    const flags = buf[o + 5]
    if (flags & ~0x07) return null
    const granule = buf.readBigInt64LE(o + 6)
    const serieDaPagina = buf.readUInt32LE(o + 14)
    const seqDaPagina = buf.readUInt32LE(o + 18)
    const crcDeclarado = buf.readUInt32LE(o + 22)
    const nSeg = buf[o + 26]
    if (o + 27 + nSeg > buf.length) return null
    let corpo = 0
    for (let i = 0; i < nSeg; i++) corpo += buf[o + 27 + i]
    const fim = o + 27 + nSeg + corpo
    if (fim > buf.length) return null

    // Um fluxo só, na ordem, com BOS apenas no começo.
    if (serie === null) serie = serieDaPagina
    else if (serieDaPagina !== serie) return null
    if (seqDaPagina !== seq++) return null
    if (Boolean(flags & FLAG_BOS) !== (o === 0)) return null
    // Continuação declarada tem de bater com um pacote de fato em aberto.
    if (Boolean(flags & FLAG_CONTINUACAO) !== (emCurso !== null)) return null

    // CRC com o próprio campo zerado (cópia: o buffer do corpo da requisição não é nosso).
    const pagina = Buffer.from(buf.subarray(o, fim))
    pagina.writeUInt32LE(0, 22)
    if (crcOgg(pagina) !== crcDeclarado) return null

    // Remonta os pacotes pela tabela de segmentos: 255 continua, < 255 fecha.
    let p = o + 27 + nSeg
    for (let i = 0; i < nSeg; i++) {
      const s = buf[o + 27 + i]
      const pac: { bytes: number[]; tamanho: number } = emCurso ?? { bytes: [], tamanho: 0 }
      for (let k = 0; k < s && pac.bytes.length < 19; k++) pac.bytes.push(buf[p + k])
      pac.tamanho += s
      p += s
      if (s === 255) {
        emCurso = pac
        continue
      }
      emCurso = null
      const idx = indiceDoPacote++
      if (idx === 0) {
        // OpusHead: sozinho na página BOS (RFC 7845 §3), 19 bytes com mapeamento 0.
        if (o !== 0 || nSeg !== i + 1 || pac.tamanho !== 19) return null
        const h = Buffer.from(pac.bytes)
        if (h.toString('ascii', 0, 8) !== 'OpusHead') return null
        if (h[8] >> 4 !== 0) return null // versão maior 0 (o campo vale 1 hoje)
        const canais = h[9]
        if (canais < 1 || canais > 2 || h[18] !== 0) return null
        preSkip = h.readUInt16LE(10)
      } else if (idx === 1) {
        if (pac.tamanho < 16 || Buffer.from(pac.bytes.slice(0, 8)).toString('ascii') !== 'OpusTags') return null
        tagsVistas = true
      } else {
        const n = amostrasDoPacote(pac.bytes[0] ?? 0, pac.bytes[1], pac.tamanho)
        if (n === null) return null
        amostras += n
        pacotesDeAudio++
      }
    }

    // Granule −1 = nenhum pacote termina nesta página. Os demais nunca andam para trás.
    if (granule !== -1n) {
      if (granule < 0n || granule < granuleFinal) return null
      granuleFinal = granule
    }
    if (flags & FLAG_EOS) fimDoFluxo = true
    o = fim
  }

  if (emCurso !== null || preSkip === null || !tagsVistas || pacotesDeAudio === 0 || granuleFinal < 0n) return null
  const real = Number(granuleFinal) - preSkip
  if (real <= 0 || real > amostras || amostras - real > FOLGA_DO_GRANULE) return null
  return real / AMOSTRAS_POR_SEGUNDO_OPUS
}

const ehOgg = (buf: Buffer): boolean => buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS'

/**
 * Duração de um áudio que o nosso cliente manda ao STT — WAV PCM ou Ogg Opus, reconhecido pelos
 * magic bytes (nunca pelo `Content-Type`, que é declarado). É a ÚNICA porta das contas abaixo.
 */
export function duracaoDoAudio(buf: Buffer): number | null {
  if (ehOgg(buf)) return duracaoDoOggOpus(buf)
  return duracaoDoWav(buf)
}

/**
 * Tipo e nome do arquivo no multipart do provedor. O Whisper da Groq (e o da OpenAI) aceita `ogg`;
 * o nome importa porque há provedor OpenAI-compatível que escolhe o decodificador pela extensão.
 * Pelos magic bytes: o que não é Ogg segue como WAV, o comportamento de antes (no BYOK o corpo não
 * é medido, e mudar o rótulo do que não reconhecemos só trocaria um erro por outro).
 */
export function arquivoDoAudio(buf: Buffer): { tipo: 'audio/ogg' | 'audio/wav'; nome: 'audio.ogg' | 'audio.wav' } {
  return ehOgg(buf) ? { tipo: 'audio/ogg', nome: 'audio.ogg' } : { tipo: 'audio/wav', nome: 'audio.wav' }
}

/**
 * Segundos que o PROVEDOR fatura por uma requisição — a duração real elevada ao mínimo faturado, e
 * arredondada para cima (o provedor não cobra frações de segundo a nosso favor). Só para o gasto
 * INTERNO (orçamento global, métricas de custo); a cota do assinante é `segundosDeAudioDoUsuario`.
 *
 * Áudio ilegível cai no mínimo, e não em zero: se não sabemos medir, a suposição segura é a que
 * protege o dono da chave, não a que libera consumo não contabilizado.
 *
 * O MÍNIMO É DO PROVEDOR (B2 da Fase B): a Groq fatura 10 s por pedido, e um provedor que cobra por
 * segundo não fatura mínimo nenhum. Quem chama passa o do provedor que atendeu
 * (`minimoFaturadoDoStt`, `server/lib/orcamentoDeIa.ts`); sem ele, o da Groq. O ilegível continua
 * no maior dos dois — é exatamente o caso em que não sabemos quanto o provedor vai cobrar.
 */
export function segundosFaturaveis(buf: Buffer, minimo: number = MINIMO_FATURADO_S): number {
  const real = duracaoDoAudio(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) return Math.max(minimo, MINIMO_FATURADO_S)
  return Math.max(minimo, Math.ceil(real))
}

/**
 * Segundos que saem da COTA DO ASSINANTE (`stt_seconds`) — a duração REAL, arredondada para cima,
 * com piso de 1 s. É a unidade em que o plano promete horas de transcrição.
 *
 * Áudio ilegível cai no mínimo faturado, e não em 1: se não sabemos medir, também não sabemos se foi
 * curto. Na prática não acontece — o cliente sempre manda WAV ou Ogg Opus —, mas um corpo forjado não pode virar
 * transcrição quase de graça.
 */
export function segundosDeAudioDoUsuario(buf: Buffer): number {
  const real = duracaoDoAudio(buf)
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
 * cliente legítimo SEMPRE manda Ogg Opus mono (`src/gateway/audio/opusDoStt.ts`) ou, sem WebCodecs,
 * WAV PCM 16 bits mono (`src/gateway/audio/wav.ts`), então recusar o que não se mede não quebra
 * ninguém de verdade.
 */
export function avaliarAudioFaturavel(buf: Buffer): AvaliacaoDeAudio {
  const real = duracaoDoAudio(buf)
  if (real === null || !Number.isFinite(real) || real <= 0) {
    return {
      ok: false,
      status: 415,
      code: 'audio_ilegivel',
      error: 'áudio não reconhecido: envie WAV PCM (8–48 kHz, mono ou estéreo, 8/16/24/32 bits) ou Ogg Opus',
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
