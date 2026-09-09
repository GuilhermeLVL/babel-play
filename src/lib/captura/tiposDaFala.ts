import { extractKeywords } from '@core';
import { type VocabWord } from '../../types';
import type { buildGateway } from '../../gateway';

/** O AI Gateway como a captura o enxerga (mesma instância que a tela monta com `buildGateway`). */
export type GatewayDaCaptura = ReturnType<typeof buildGateway>;

// Voice transcript structures
// Logger de diagnóstico da captura — prefixo colorido no console do navegador (observabilidade).
export const clog = (...args: any[]) => console.log('%c[cap]', 'color:#F04E23;font-weight:bold', ...args);

export interface SpeechSegment {
  id: string;
  speakerId: string;
  /** FONTE do áudio ('system' = som do computador; 'mic' = sua voz). Antes a fonte era
   *  inferida de `speakerId === 'system'` — com a identificação automática de voz o
   *  speakerId vira 'voice_N' e a inferência quebraria a direção da tradução/save. */
  source: 'system' | 'mic';
  timestamp: string;
  originalText: string;
  translatedText: string;
  isPartial?: boolean;
  words: VocabWord[];
  /** Início/fim do enunciado em ms, relativos ao START da sessão (timing real). */
  tStartMs?: number;
  tEndMs?: number;
  /** ISO-639-1 REAL desta fala quando DETECTADO (modo multi-idioma). undefined = usa a config. */
  lang?: string;
  /** Adapter que transcreveu (procedência: whisper-local/groq-whisper/web-speech). */
  engine?: string;
}

// `VocabWord` agora vive em `src/types.ts` — é o contrato compartilhado do <VocabularyPanel/>,
// usado por Captura, Análise, Leitura, Estudo e Métricas. A invariante de honestidade (campos
// ricos só quando há fonte REAL) está documentada lá.

/**
 * Palavras de vocabulário derivadas de uma fala REAL (determinístico, sem IA nem
 * lista fixa). A tradução do verso é preenchida depois pelo gateway de MT.
 */
export function wordsFromText(text: string, lang: string): VocabWord[] {
  // O idioma da FALA escolhe a lista de stopwords; sem lista a extracao roda sem filtro
  // gramatical, e `temStopwords` deixa a tela declarar isso quando for o caso.
  return extractKeywords(text, { max: 6, lang }).map((w) => ({ word: w, translation: '' }));
}

// Speaker definition
export interface SpeakerProfile {
  id: string;
  name: string;
  /** Cor da PESSOA (hex). Vale para o ponto do avatar, a borda do balão e o overlay —
   *  hex em vez de classe Tailwind para poder ir via inline style a qualquer superfície. */
  color: string;
  isActive: boolean;
}

/** Paleta das pessoas identificadas (voz N usa a cor N; recicla depois do fim). */
export const SPEAKER_COLORS = [
  '#7C3AED', // roxo
  '#0284C7', // azul
  '#10B981', // verde
  '#F59E0B', // âmbar
  '#EF4444', // vermelho
  '#E91E63', // rosa
  '#14B8A6', // teal
  '#8B5CF6', // violeta
];
/** Você (microfone) tem cor FIXA fora da paleta — nunca é confundido com uma voz detectada. */
export const USER_COLOR = '#EA580C';
/** Voz do sistema ainda não identificada (cinza neutro: "alguém", não uma pessoa nomeada). */
export const UNKNOWN_VOICE_COLOR = '#64748B';

/** Cenário de captura: a intenção do usuário decide fontes, rótulos e painéis. */
export type CaptureScenario = 'media' | 'conversation' | 'mic';

/** mm:ss a partir de segundos — o carimbo de tempo de cada fala e o cronômetro da sessão. */
export const formatTime = (s: number) => {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Os quatro retornos de chamada do VAD que uma fonte de áudio alimenta (o mesmo contrato
 * para sistema e microfone — ver `pipelineDeFala.ts`).
 */
export interface HandlersDaFonte {
  onSpeechStart: (rawSeq: number) => void;
  onMisfire: (rawSeq: number) => void;
  onPartialAudio: (pcm: Float32Array, sr: number, rawSeq: number) => void;
  onUtterance: (pcm: Float32Array, sr: number, rawSeq: number) => void;
}
