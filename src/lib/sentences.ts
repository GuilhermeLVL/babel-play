/**
 * FRASE CANÔNICA — a unidade de conteúdo que todo exercício consome.
 *
 * Por que existe: as MESMAS `UtteranceRow` do backend eram re-derivadas em TRÊS formas incompatíveis
 * (`Analysis.parsedSentences`, `Reading.StudyText`, `Study.parsedSentences: any[]`). Só a do Analysis
 * carregava `lang` — que é justamente o campo do qual TTS e reconhecimento de fala dependem. Resultado:
 * o Shadowing só sabia o idioma quando aberto pelo caminho do Analysis, e "praticar esta frase" a partir
 * de outra tela era impossível sem perder metade dos dados.
 *
 * Agora há um tipo e um normalizador só.
 */
import type { UtteranceRow } from '../data/api';
import type { MinigameId } from '@core';
import { baseLang } from './languages';

export interface Sentence {
  /** Id real da utterance no banco (permite persistir resultado de exercício por frase). */
  id: string;
  /** Texto no idioma ORIGINAL (o que foi falado). */
  text: string;
  /** Tradução, quando existe. String vazia = não traduzido. */
  translation: string;
  /**
   * Idioma REAL do `text` (ISO-639-1). Vem da utterance; '' quando o backend não gravou —
   * jamais chutado. Quem consome decide o fallback (tipicamente o idioma configurado da sessão).
   */
  lang: string;
  /** Idioma da `translation` (ISO-639-1). '' quando desconhecido. */
  translationLang: string;
  speaker: string;
  /** 'mic' (você) | 'system' (o outro lado) | '' quando não gravado. */
  source: string;
  startMs: number;
  endMs: number;
  /** Posição na sessão (0-based), já ordenada. */
  index: number;
}

/**
 * SEMENTE DE PRÁTICA — o payload que viaja de qualquer tela até um exercício.
 * É o que faz "selecionar um trecho → botão direito → praticar" funcionar.
 */
export interface PracticeSeed {
  /** Texto a praticar (uma frase, uma seleção livre, ou uma palavra). */
  text: string;
  /** Idioma do `text` (ISO-639-1). '' = desconhecido; o exercício cai no idioma configurado. */
  lang: string;
  translation?: string;
  /** Id da frase de origem, quando veio de um transcript. */
  sentenceId?: string;
  sessionId?: string;
  /** Preenchido quando a semente é uma PALAVRA (vindo do Analista de Vocabulário). */
  word?: string;
  /** Exercício-alvo. O Study abre direto nele. */
  exercise?: ExerciseId;
}

/**
 * Exercícios endereçáveis (pela paleta de comandos, pelo menu de contexto e por deep-link).
 *
 * ESTA LISTA ENCOLHEU quando os oito exercícios legados saíram. Ela é o inventário do que existe:
 * dois fluxos que moram no Estudo (revisão espaçada e produção ativa) e os minijogos, que moram
 * no Jogar. Manter aqui um id sem tela do outro lado era exatamente o defeito que fazia um botão
 * parecer função e não fazer nada — e o compilador não podia avisar, porque o tipo dizia que
 * existia.
 */
export type ExerciseId =
  | 'review'            // Revisão espaçada (SRS) — Estudo
  | 'active_production' // Produção ativa — Estudo
  | MinigameId;         // os jogos — Jogar

/**
 * EM QUE TELA aquele exercício mora.
 *
 * Existe num lugar só de propósito: CINCO telas encaminham "praticar isto" (Análise, Captura,
 * Métricas, Leitura e o menu de contexto), e antes todas mandavam para o Estudo porque era o
 * único destino. Com metade dos alvos morando no Jogar, repetir o `if` em cinco lugares é
 * exatamente como o filtro de idioma divergiu entre telas neste projeto.
 */
export function telaDoExercicio(e: ExerciseId): 'study' | 'play' {
  return e === 'review' || e === 'active_production' ? 'study' : 'play';
}

/**
 * Normaliza as utterances cruas do backend numa lista de `Sentence` ordenada.
 * Descarta as sem texto (não há o que praticar) — mas NÃO inventa idioma nem tradução.
 */
export function toSentences(utterances: UtteranceRow[]): Sentence[] {
  return (utterances ?? [])
    .filter(u => (u.sourceText ?? '').trim().length > 0)
    .sort((a, b) => (a.idx ?? 0) - (b.idx ?? 0))
    .map((u, i) => ({
      id: u.id,
      text: (u.sourceText ?? '').trim(),
      translation: (u.translatedText ?? '').trim(),
      lang: baseLang(u.sourceLang ?? ''),
      translationLang: baseLang(u.targetLang ?? ''),
      speaker: u.speakerName ?? '',
      source: u.source ?? '',
      startMs: u.tStartMs ?? 0,
      endMs: u.tEndMs ?? 0,
      index: i,
    }));
}

/** Constrói uma semente a partir de uma frase do transcript. */
export function seedFromSentence(s: Sentence, sessionId?: string, exercise?: ExerciseId): PracticeSeed {
  return {
    text: s.text,
    lang: s.lang,
    translation: s.translation || undefined,
    sentenceId: s.id,
    sessionId,
    exercise,
  };
}

/** Constrói uma semente a partir de texto solto (seleção do usuário na tela). */
export function seedFromSelection(text: string, lang: string, exercise?: ExerciseId, sessionId?: string): PracticeSeed {
  return { text: text.trim(), lang: baseLang(lang), exercise, sessionId };
}
