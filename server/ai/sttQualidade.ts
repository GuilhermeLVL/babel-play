/**
 * O QUE O PROXY DE STT FAZ COM O TEXTO ANTES E DEPOIS DO WHISPER DE NUVEM — funções puras, fora do
 * `sttProxy.ts` para poderem ser lidas (e testadas) sem um provedor falso.
 *
 * O CONTEXTO. O Whisper local do navegador já passava pelo filtro de alucinação
 * (`src/gateway/alucinacao.ts`); o de nuvem não passava por nada. O `verbose_json` que o proxy
 * pede traz, por segmento, os três sinais que o próprio Whisper usa para decidir que não houve fala
 * (`no_speech_prob`, `avg_logprob`) ou que o decode entrou em laço (`compression_ratio`) — e o
 * proxy lia só `text` e `language`, jogando fora exatamente a parte que distingue fala de invenção.
 */

/** Teto do `prompt` do Whisper. A API limita a 224 TOKENS; 224 caracteres cabem com folga. */
export const TETO_DO_PROMPT = 224

/**
 * Os limiares são os do próprio Whisper (`transcribe.py` da OpenAI), não uma calibração nossa:
 *   - `no_speech_threshold = 0.6` E `logprob_threshold = -1.0` — o segmento é silêncio quando o
 *     modelo acha que não há fala E não tem confiança no que escreveu. Os DOIS juntos: só o primeiro
 *     derrubaria um "Sim." curto dito baixo, que o modelo transcreve com confiança;
 *   - `compression_ratio_threshold = 2.4` — texto que o gzip comprime mais que isso é repetição
 *     ("la la la la…"), o laço clássico do decode greedy.
 */
export const LIMIAR_SEM_FALA = 0.6
export const LIMIAR_LOGPROB = -1
export const LIMIAR_COMPRESSAO = 2.4

/**
 * O `prompt` que o cliente manda em `x-stt-prompt` — a última frase já confirmada, que dá ao Whisper
 * o contexto de grafia, nomes próprios e idioma entre um enunciado e o seguinte.
 *
 * Vem por CABEÇALHO porque o corpo desta rota é o WAV cru; e vem `encodeURIComponent`-ado porque
 * cabeçalho HTTP não carrega UTF-8 com segurança. Tudo que não decodifica é ignorado EM SILÊNCIO: o
 * prompt é dica, e uma dica ilegível não pode custar a transcrição.
 *
 * Caracteres de controle viram espaço (uma quebra de linha no meio não deve colar duas palavras) e o
 * teto guarda o FIM do texto — o que está mais perto do áudio novo é o que mais ajuda.
 *
 * @returns o texto pronto para o campo `prompt`, ou `null` quando não há o que mandar.
 */
export function promptDoCabecalho(bruto: string | undefined): string | null {
  if (!bruto) return null
  let texto: string
  try {
    texto = decodeURIComponent(bruto)
  } catch {
    return null
  }
  const limpo = Array.from(texto, (c) => (ehControle(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!limpo) return null
  // `Array.from` conta por ponto de código: `slice` em UTF-16 partiria um emoji ao meio.
  const pontos = Array.from(limpo)
  return pontos.length > TETO_DO_PROMPT ? pontos.slice(-TETO_DO_PROMPT).join('').trim() : limpo
}

/** C0, DEL e C1 — o que não tem lugar num prompt de texto. Por código, sem regex de controle. */
function ehControle(c: string): boolean {
  const n = c.codePointAt(0) ?? 0
  return n < 0x20 || (n >= 0x7f && n <= 0x9f)
}

interface SegmentoDoWhisper {
  text?: unknown
  no_speech_prob?: unknown
  avg_logprob?: unknown
  compression_ratio?: unknown
}

export interface Triagem {
  /** O texto remontado só com os segmentos que ficaram. */
  texto: string
  /** Quantos segmentos vieram. */
  total: number
  /** Descartados por silêncio com baixa confiança. */
  semFala: number
  /** Descartados por laço de repetição. */
  repeticao: number
}

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Triagem dos segmentos do `verbose_json`.
 *
 * `null` quando não há segmentos para triar — resposta em `json` (o provedor recusou
 * `verbose_json`) ou lista vazia. Nesse caso quem chama fica com o `text` inteiro: sem sinal por
 * segmento, descartar seria chute.
 *
 * Um segmento sem os números (provedor que implementa `verbose_json` pela metade) FICA: a ausência
 * de evidência não é evidência de silêncio.
 */
export function triarSegmentos(segmentos: unknown): Triagem | null {
  if (!Array.isArray(segmentos) || segmentos.length === 0) return null
  let semFala = 0
  let repeticao = 0
  const ficam: string[] = []
  for (const bruto of segmentos as SegmentoDoWhisper[]) {
    const semFalaProb = numero(bruto?.no_speech_prob)
    const logprob = numero(bruto?.avg_logprob)
    const compressao = numero(bruto?.compression_ratio)
    if (semFalaProb !== null && logprob !== null && semFalaProb > LIMIAR_SEM_FALA && logprob < LIMIAR_LOGPROB) {
      semFala++
      continue
    }
    if (compressao !== null && compressao > LIMIAR_COMPRESSAO) {
      repeticao++
      continue
    }
    if (typeof bruto?.text === 'string') ficam.push(bruto.text)
  }
  return { texto: juntarSegmentos(ficam), total: segmentos.length, semFala, repeticao }
}

/** Escritas sem espaço entre palavras (CJK, kana, hangul, tailandês): segmento junta sem separador. */
const SEM_ESPACO = /[\u0E00-\u0E7F\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/

/**
 * Remonta o texto. O Whisper devolve cada segmento com o espaço inicial ("␣A gente…"), e aí juntar
 * é concatenar. Provedor que não manda o espaço não pode colar duas palavras — mas pôr espaço entre
 * dois segmentos em chinês inventaria uma separação que a escrita não tem.
 */
function juntarSegmentos(partes: string[]): string {
  let out = ''
  for (const p of partes) {
    if (!p) continue
    const fim = out.slice(-1)
    const inicio = p.charAt(0)
    const colado = SEM_ESPACO.test(fim) && SEM_ESPACO.test(inicio)
    const precisaDeEspaco = out !== '' && !/\s/.test(fim) && !/\s/.test(inicio) && !colado
    out += precisaDeEspaco ? ` ${p}` : p
  }
  return out.replace(/\s+/g, ' ').trim()
}
