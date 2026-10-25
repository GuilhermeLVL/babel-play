/**
 * ÁUDIO DIFÍCIL — quando o "aparelho primeiro" manda as falas à nuvem, e quando volta (Fase B, item 6
 * do plano de qualidade da IA paga; decisão do dono de 24/10/2026; flag `stt_aparelho_primeiro`).
 *
 * O PROBLEMA. Sem isto, no automático, toda fala de quem tem nuvem vai à nuvem primeiro, mesmo no
 * computador que roda o Parakeet (5,8% de erro em português, 4,3% em espanhol, na bancada de
 * 09/10/2026) — e as "8 h de nuvem para o áudio difícil" do Plus se gastam em áudio fácil. Com a flag,
 * o aparelho capaz transcreve primeiro, e a nuvem entra quando o áudio fica difícil.
 *
 * O SINAL (`avaliarFalaLocal`), o mais simples que se mede, por fala final LOCAL:
 *   - `confianca`: a média da probabilidade (softmax) de cada token que o Parakeet emitiu
 *     (`adapters/parakeetTdt.ts`). Fala limpa fica perto de 1; ruído, sotaque forte, música e
 *     sobreposição derrubam. Fala de menos de `minPalavrasParaConfianca` palavras não é julgada por ela.
 *   - `compressao`: a porta do Whisper que já existe (`harness/portasDeQualidade.ts`): laço de repetição.
 *   - `lento`: o aparelho não acompanhou (tempo do decode, com a fila, ÷ duração da fala acima do teto).
 * Os limiares são PONTOS DE PARTIDA, a calibrar na bancada antes de ligar no staging (procedimento em
 * `docs/specs/2026-10-24-stt-aparelho-primeiro.md`).
 *
 * A HISTERESE (`registrarFalaLocal`, `registrarFalaNaNuvem`), para não oscilar:
 *   - sobe à nuvem com `dificeisParaSubir` falas difíceis nas últimas `janela` falas locais (uma ruim
 *     isolada não sobe: essa a porta por trecho já leva sozinha);
 *   - na nuvem, fica pelo menos `minimoNaNuvem` falas atendidas por ela; então tenta o aparelho de novo,
 *     com a janela limpa;
 *   - quem sobe de novo até `reincidencia` falas locais depois de descer fica o DOBRO na nuvem (até
 *     `maximoNaNuvem`): áudio que segue difícil não fica trocando de lado a cada minuto.
 * Conta FALAS, não segundos: é puro e testável, e cada fala é uma cobrança (a nuvem cobra por trecho).
 *
 * PURO: sem relógio, sem DOM, sem estado global. Quem guarda o estado é a captura.
 */
import { avaliarTrechoStt, razaoDeCompressaoAproximada } from '../harness/portasDeQualidade';

/** A flag que liga o "aparelho primeiro" no automático de quem tem nuvem (`docs/flags.md`). */
export const FLAG_STT_APARELHO_PRIMEIRO = 'stt_aparelho_primeiro';

export interface LimiaresDoAudioDificil {
  /** Confiança média dos tokens abaixo disto = difícil. A calibrar. */
  confiancaMinima: number;
  /** Com menos palavras que isto, a confiança não julga (fala curta oscila demais). */
  minPalavrasParaConfianca: number;
  /** Fator de tempo real (decode com fila ÷ duração da fala) acima disto = o aparelho não acompanhou. */
  fatorMaximo: number;
  /** Quantas falas locais recentes a histerese olha. */
  janela: number;
  /** Quantas difíceis na janela sobem à nuvem. */
  dificeisParaSubir: number;
  /** Mínimo de falas atendidas pela nuvem antes de tentar o aparelho de novo. */
  minimoNaNuvem: number;
  /** Teto do mínimo, depois de dobrar nas reincidências. */
  maximoNaNuvem: number;
  /** Subir de novo até tantas falas locais depois de descer conta como reincidência (dobra o mínimo). */
  reincidencia: number;
}

export const LIMIARES_DO_AUDIO_DIFICIL: LimiaresDoAudioDificil = {
  confiancaMinima: 0.75, // a calibrar na bancada
  minPalavrasParaConfianca: 3,
  fatorMaximo: 1,
  janela: 6,
  dificeisParaSubir: 3,
  minimoNaNuvem: 8,
  maximoNaNuvem: 64,
  reincidencia: 6,
};

export type MotivoDoAudioDificil = 'confianca' | 'compressao' | 'lento';

export interface SinaisDaFalaLocal {
  /** O texto final do motor local. */
  texto: string;
  /** Confiança média dos tokens, 0–1, quando o motor informa (o Parakeet). Ausente = não julga por ela. */
  confianca?: number;
  /** Tempo do decode (com a fila) ÷ duração da fala. Ausente = não julga por ele. */
  fatorDeTempoReal?: number;
}

/** A fala local foi difícil? E por quê (telemetria). Texto vazio não é julgado. */
export function avaliarFalaLocal(
  s: SinaisDaFalaLocal,
  l: LimiaresDoAudioDificil = LIMIARES_DO_AUDIO_DIFICIL,
): { dificil: boolean; motivos: MotivoDoAudioDificil[] } {
  const texto = s.texto.trim();
  if (!texto) return { dificil: false, motivos: [] };
  const motivos: MotivoDoAudioDificil[] = [];
  const palavras = texto.split(/\s+/).length;
  if (s.confianca !== undefined && palavras >= l.minPalavrasParaConfianca && s.confianca < l.confiancaMinima)
    motivos.push('confianca');
  if (avaliarTrechoStt({ compressionRatio: razaoDeCompressaoAproximada(texto) }).motivos.includes('compressao'))
    motivos.push('compressao');
  if (s.fatorDeTempoReal !== undefined && s.fatorDeTempoReal > l.fatorMaximo) motivos.push('lento');
  return { dificil: motivos.length > 0, motivos };
}

export interface EstadoDoAudioDificil {
  /** `aparelho`: o modelo local primeiro. `nuvem`: a nuvem primeiro, o local de reserva. */
  modo: 'aparelho' | 'nuvem';
  /** As últimas falas locais (true = difícil), no máximo `janela`. Só no modo aparelho. */
  recentes: readonly boolean[];
  /** Falas atendidas pela nuvem desde a subida. */
  naNuvem: number;
  /** O mínimo de falas na nuvem desta subida (dobra na reincidência). */
  minimoNaNuvem: number;
  /** Falas locais desde a última descida; `null` = ainda não desceu nesta sessão. */
  desdeADescida: number | null;
}

export function estadoInicialDoAudioDificil(
  l: LimiaresDoAudioDificil = LIMIARES_DO_AUDIO_DIFICIL,
): EstadoDoAudioDificil {
  return { modo: 'aparelho', recentes: [], naNuvem: 0, minimoNaNuvem: l.minimoNaNuvem, desdeADescida: null };
}

/**
 * Uma fala atendida pelo modelo LOCAL. No modo nuvem ela é a reserva de uma nuvem que falhou: não conta
 * para nada (a pausa da nuvem já cuida de não insistir). Devolve um estado novo.
 */
export function registrarFalaLocal(
  e: EstadoDoAudioDificil,
  dificil: boolean,
  l: LimiaresDoAudioDificil = LIMIARES_DO_AUDIO_DIFICIL,
): EstadoDoAudioDificil {
  if (e.modo === 'nuvem') return e;
  const recentes = [...e.recentes, dificil].slice(-l.janela);
  const desdeADescida = e.desdeADescida === null ? null : e.desdeADescida + 1;
  if (recentes.filter(Boolean).length < l.dificeisParaSubir) return { ...e, recentes, desdeADescida };
  const reincidiu = desdeADescida !== null && desdeADescida <= l.reincidencia;
  return {
    modo: 'nuvem',
    recentes: [],
    naNuvem: 0,
    minimoNaNuvem: reincidiu ? Math.min(l.maximoNaNuvem, e.minimoNaNuvem * 2) : l.minimoNaNuvem,
    desdeADescida: null,
  };
}

/**
 * Uma fala atendida pela NUVEM. No modo aparelho ela é a porta por trecho (um trecho só subiu): não
 * muda o modo. Devolve um estado novo.
 */
export function registrarFalaNaNuvem(e: EstadoDoAudioDificil): EstadoDoAudioDificil {
  if (e.modo === 'aparelho') return e;
  const naNuvem = e.naNuvem + 1;
  if (naNuvem < e.minimoNaNuvem) return { ...e, naNuvem };
  return { modo: 'aparelho', recentes: [], naNuvem: 0, minimoNaNuvem: e.minimoNaNuvem, desdeADescida: 0 };
}
