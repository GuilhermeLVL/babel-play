import { extractKeywords } from '@core';

import type { buildGateway } from '../../gateway';
import type { EspeculacaoDoFinal } from '../../gateway/capture/systemAudio';
import { type VocabWord } from '../../types';

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
  /**
   * A fala ficou SEM tradução automática pela preferência "Tradução" (`traducaoSobDemanda.ts`): o
   * balão mostra "Mostrar tradução" no lugar da linha traduzida. Ausente = o de sempre.
   */
  traducaoSobDemanda?: boolean;
  /**
   * A tradução está A CAMINHO: a cadeia falhou só porque o tradutor local ainda carrega. O balão fica
   * em "…" e a linha diz "Baixando o tradutor…" (`traducaoDaFala.ts`); o "tradutor pronto" a refaz.
   */
  traducaoPendente?: boolean;
  /**
   * A última tradução PARCIAL desta fala, guardada quando o final chega e a tradução volta a "…": a
   * tela a mantém até a tradução do final entrar, em vez de voltar ao original e trocar de novo
   * (`pipelineDeFala.ts`, `HistoricoDoPrototipo`). Só vale enquanto `translatedText` é "…": não é a
   * tradução da fala, e nada a lê em voz alta, guarda ou exporta.
   */
  traducaoProvisoria?: string;
  /**
   * MODO INTÉRPRETE (Fase E): de que metade da tela veio esta fala. É o LADO, e não a fonte, que diz a
   * direção — as duas pessoas falam no mesmo microfone. Ausente fora do intérprete.
   */
  lado?: LadoDoInterprete;
  /**
   * CONVERSA VIRTUAL com detecção de idioma: o idioma para o qual esta fala foi traduzida (ISO-639-1; o `lang`
   * é o dela) e se ela nem precisou de tradução porque já estava no idioma de quem lê.
   */
  paraLang?: string;
  semTraducao?: boolean;
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

/**
 * Cenário de captura: a intenção do usuário decide fontes, rótulos e painéis. `interprete` (Fase E):
 * duas pessoas frente a frente num aparelho só, cada uma com o seu botão de falar; a direção da
 * tradução vem do LADO tocado (`interprete.ts`), e a tradução é lida em voz alta para o outro.
 */
export type CaptureScenario = 'media' | 'conversation' | 'mic' | 'interprete';

/**
 * A METADE DA TELA no modo intérprete (Fase E): `meu` é a metade virada para quem segura o aparelho;
 * `outro`, a metade virada 180° para a outra pessoa. Cada metade tem o seu botão de falar e o seu
 * idioma (`interprete.ts`, `direcaoDoLado`).
 */
export type LadoDoInterprete = 'meu' | 'outro';

/**
 * A DIREÇÃO DA FALA DO MICROFONE quando ela vem do lado, e não da configuração (modo intérprete):
 * quem fala, em que idioma o reconhecedor ouve e para qual idioma vai a tradução.
 */
export interface DirecaoDaFala {
  lado: LadoDoInterprete;
  /** BCP-47 de quem fala — o idioma em que a Web Speech abre (`pt-BR`, `en-US`). */
  fala: string;
  /** ISO-639-1 da fala (a dica do Whisper e a origem da tradução). */
  de: string;
  /** ISO-639-1 da tradução — o idioma de quem ouve. */
  para: string;
}

/** Uma fala terminou no microfone (o VAD fechou, ou a Web Speech comprometeu o final). */
export interface FimDaFala {
  /** O id do balão da fala. */
  segId: string;
  source: 'system' | 'mic';
  /** No modo intérprete, o lado de quem falou. */
  lado?: LadoDoInterprete;
}

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
  /** `especulacao`: o final especulativo desta fala (ver `espelhoDoVad.ts`), cujo resultado É o final. */
  onUtterance: (pcm: Float32Array, sr: number, rawSeq: number, especulacao?: EspeculacaoDoFinal) => void;
  /** ~450 ms de silêncio: começa o decode final já (ver `SystemAudioCallbacks.onFinalEspeculativo`). */
  onFinalEspeculativo: (pcm: Float32Array, sr: number, rawSeq: number) => EspeculacaoDoFinal | null;
  /** O pipeline quer o parcial agora? A captura pergunta antes de copiar o áudio (ver `SystemAudioCallbacks`). */
  querParcial?: () => boolean;
  /** Espaçamento entre parciais (ms) que o pipeline pede à captura. */
  intervaloDosParciais?: () => number;
  /** Quanto de fala (ms) o primeiro parcial de cada fala espera (ver `SystemAudioCallbacks`). */
  primeiroParcialComMs?: () => number;
}
