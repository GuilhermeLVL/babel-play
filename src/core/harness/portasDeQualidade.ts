/**
 * PORTAS DE QUALIDADE — a cascata POR TRECHO do harness adaptativo (§5).
 *
 * O motor barato roda primeiro; se o resultado PARECE ruim, só aquele trecho sobe um degrau (para o
 * modelo maior, o nativo ou a nuvem) — e não a sessão inteira. Estas funções são o "parece ruim":
 * olham só sinais que o motor já devolve (probabilidades, tamanhos), sem rodar outro modelo.
 *
 * STT (`avaliarTrechoStt`), com os limiares do PRÓPRIO Whisper (`transcribe.py`: temperatura de
 * fallback quando `compression_ratio > 2.4` ou `avg_logprob < -1.0`; trecho descartado como silêncio
 * quando `no_speech_prob > 0.6` E `avg_logprob < -1.0`), mais dois sinais de confiança por palavra
 * (arXiv 2509.07195): média abaixo de τ, e QUEDAS BRUSCAS — uma palavra muito menos confiante que as
 * vizinhas é o sinal típico de palavra trocada, que a média dilui.
 *
 * MT (`avaliarTraducaoLocal`): razão de tamanho fora de [0,5; 2] (truncou ou divagou), cópia do
 * original (o modelo devolveu a entrada) e logprob médio do decodificador abaixo de τ_mt. A validação
 * de idioma de hoje (`validarTraducao`) continua no gateway; esta porta soma a ela, não a troca.
 *
 * LIMIARES A CALIBRAR NA BANCADA. Os do Whisper são os do Whisper; τ, τ_mt e os de quedas são pontos
 * de partida razoáveis, a calibrar em FLEURS + gold de conversa (STT) e MetricX-24 (MT), com meta de
 * taxa de escalada (ex.: ≤ 15% dos trechos) para caber no orçamento. Por isso tudo é config.
 */
import { chaveDaPalavra } from '../texto/palavra';
import { palavrasDoTexto } from '../texto/segmentacao';

export type VeredictoStt = 'ok' | 'silencio' | 'subir';
export type VeredictoMt = 'ok' | 'subir';

export type MotivoDaPorta =
  | 'silencio'
  | 'compressao'
  | 'logprob'
  | 'confianca-media'
  | 'quedas'
  | 'vazia'
  | 'razao-de-tamanho'
  | 'copia';

export interface SinaisDoTrechoStt {
  /** Razão de compressão gzip do texto (alta = repetição em laço). */
  compressionRatio?: number;
  /** Logprob médio dos tokens do trecho. */
  avgLogprob?: number;
  /** Probabilidade do token <|nospeech|>. */
  noSpeechProb?: number;
  /** Confiança por palavra, na ordem (0–1). */
  confiancasDePalavra?: readonly number[];
}

export interface LimiaresStt {
  /** Whisper: `compression_ratio_threshold`. */
  compressao: number;
  /** Whisper: `logprob_threshold`. */
  logprob: number;
  /** Whisper: `no_speech_threshold`. */
  semFala: number;
  /** τ: confiança média mínima da palavra. A calibrar. */
  tau: number;
  /** δ abaixo disto conta como queda brusca. A calibrar. */
  deltaDeQueda: number;
  /** Quantas quedas bruscas no trecho sobem. A calibrar. */
  quedasParaSubir: number;
}

export const LIMIARES_PADRAO_STT: LimiaresStt = {
  compressao: 2.4,
  logprob: -1.0,
  semFala: 0.6,
  tau: 0.5, // a calibrar na bancada
  deltaDeQueda: -0.3, // a calibrar na bancada
  quedasParaSubir: 2, // a calibrar na bancada
};

export interface VereditoDaPorta<V> {
  veredicto: V;
  /** Todos os motivos que dispararam (telemetria); vazio quando `ok`. */
  motivos: MotivoDaPorta[];
}

/**
 * Quantas quedas bruscas locais: δ_t = P_t − (P_{t−1} + P_{t+1}) / 2 < `delta`. As pontas não contam
 * (falta um vizinho), e um declive suave dá δ ≈ 0 — é a palavra isolada que cai que interessa.
 */
export function quedasBruscas(confiancas: readonly number[], delta = LIMIARES_PADRAO_STT.deltaDeQueda): number {
  let n = 0;
  for (let t = 1; t < confiancas.length - 1; t++) {
    if (confiancas[t] - (confiancas[t - 1] + confiancas[t + 1]) / 2 < delta) n++;
  }
  return n;
}

/** Abaixo disto (caracteres, depois de normalizar) o texto não tem trigramas bastantes para julgar. */
export const MIN_CARACTERES_PARA_COMPRESSAO = 30;

/**
 * O `compression_ratio` do Whisper SEM zlib: caracteres ÷ trigramas de caractere DISTINTOS. O Whisper
 * mede bytes ÷ bytes do gzip; o que o gzip acha é repetição, e o laço do decode greedy ("obrigado por
 * assistir obrigado por assistir…") repete trigramas — a razão sobe como a do gzip. Fala normal fica
 * perto de 1,1–1,6; o laço passa de 3. Síncrono e barato (um `Set`), para rodar a cada final sem
 * `CompressionStream` assíncrono. `undefined` = curto demais para dizer algo (a porta não julga).
 * APROXIMAÇÃO: o limiar 2,4 é o do gzip; calibrar na bancada antes de apertar.
 */
export function razaoDeCompressaoAproximada(texto: string): number | undefined {
  const t = texto.toLowerCase().replace(/\s+/g, ' ').trim();
  if (t.length < MIN_CARACTERES_PARA_COMPRESSAO) return undefined;
  const trigramas = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) trigramas.add(t.slice(i, i + 3));
  return (t.length - 2) / trigramas.size;
}

export function avaliarTrechoStt(
  s: SinaisDoTrechoStt,
  limiares: LimiaresStt = LIMIARES_PADRAO_STT,
): VereditoDaPorta<VeredictoStt> {
  /* Silêncio primeiro, como no Whisper: um trecho sem fala com texto inventado tem logprob ruim e
     subiria — e pagar a nuvem para transcrever silêncio é o desperdício que a porta existe para evitar. */
  if (
    s.noSpeechProb !== undefined &&
    s.avgLogprob !== undefined &&
    s.noSpeechProb > limiares.semFala &&
    s.avgLogprob < limiares.logprob
  ) {
    return { veredicto: 'silencio', motivos: ['silencio'] };
  }
  const motivos: MotivoDaPorta[] = [];
  if (s.compressionRatio !== undefined && s.compressionRatio > limiares.compressao) motivos.push('compressao');
  if (s.avgLogprob !== undefined && s.avgLogprob < limiares.logprob) motivos.push('logprob');
  const c = s.confiancasDePalavra;
  if (c && c.length > 0) {
    const media = c.reduce((a, b) => a + b, 0) / c.length;
    if (media < limiares.tau) motivos.push('confianca-media');
    if (quedasBruscas(c, limiares.deltaDeQueda) >= limiares.quedasParaSubir) motivos.push('quedas');
  }
  return { veredicto: motivos.length ? 'subir' : 'ok', motivos };
}

export interface TraducaoLocal {
  origem: string;
  traducao: string;
  /** Logprob médio por token do decodificador, quando o motor expõe. */
  logprobMedio?: number;
}

export interface LimiaresMt {
  /** Razão de tamanho (caracteres da tradução / da origem) aceitável. */
  razaoMinima: number;
  razaoMaxima: number;
  /**
   * Abaixo disto a razão não é julgada: "ok" → "tá bom" tem razão 3 e está certo. Texto curto varia
   * demais de tamanho entre idiomas para a razão dizer alguma coisa.
   */
  minCaracteresParaRazao: number;
  /** Fração máxima de palavras da tradução que já estavam na origem. */
  copiaMaxima: number;
  /** Com menos palavras que isto a cópia não é julgada (nomes próprios, "OK", "Netflix"). */
  minPalavrasParaCopia: number;
  /** τ_mt: logprob médio mínimo. A calibrar com MetricX-24. */
  tauMt: number;
}

export const LIMIARES_PADRAO_MT: LimiaresMt = {
  razaoMinima: 0.5,
  razaoMaxima: 2,
  minCaracteresParaRazao: 10, // a calibrar na bancada
  copiaMaxima: 0.5,
  minPalavrasParaCopia: 3, // a calibrar na bancada
  tauMt: -1.2, // a calibrar na bancada (MetricX-24; CometKiwi é não comercial)
};

export function avaliarTraducaoLocal(
  t: TraducaoLocal,
  limiares: LimiaresMt = LIMIARES_PADRAO_MT,
): VereditoDaPorta<VeredictoMt> {
  const origem = t.origem.trim();
  const traducao = t.traducao.trim();
  if (!traducao) return { veredicto: 'subir', motivos: ['vazia'] };
  const motivos: MotivoDaPorta[] = [];

  if (origem.length >= limiares.minCaracteresParaRazao) {
    const razao = traducao.length / origem.length;
    if (razao < limiares.razaoMinima || razao > limiares.razaoMaxima) motivos.push('razao-de-tamanho');
  }

  /* Cópia: fração das palavras da TRADUÇÃO que já estavam na origem (sem acento e sem caixa). Mede
     pela tradução, e não pela origem, porque o sintoma é "a saída é a entrada". Idioma vazio =
     segmentação neutra: os dois textos estão em idiomas diferentes e as regras de clítico de um não
     valem para o outro. */
  const daTraducao = palavrasDoTexto(traducao, '').map(chaveDaPalavra).filter(Boolean);
  if (daTraducao.length >= limiares.minPalavrasParaCopia) {
    const daOrigem = new Set(palavrasDoTexto(origem, '').map(chaveDaPalavra));
    const copiadas = daTraducao.filter((p) => daOrigem.has(p)).length;
    if (copiadas / daTraducao.length > limiares.copiaMaxima) motivos.push('copia');
  }

  if (t.logprobMedio !== undefined && t.logprobMedio < limiares.tauMt) motivos.push('logprob');
  return { veredicto: motivos.length ? 'subir' : 'ok', motivos };
}
