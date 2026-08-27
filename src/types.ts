export interface Recording {
  id: string;
  title: string;
  date: string;
  durationStr: string;
  wordCount: number;
  type: 'audio' | 'video' | 'document';
  tags: string[];
  status: 'Processado' | 'Processando';
  isNew?: boolean;
  /** URL do áudio real gravado da sessão (se houver) — o player do Analysis reproduz. */
  audioUrl?: string;
  /** Capa personalizada do card (URL de imagem ou data URL colada). Persistida em `meta.imageUrl`. */
  imageUrl?: string;
  /** Sessão fixada aparece primeiro na grade. Persistida em `meta.pinned`. */
  pinned?: boolean;
}

/**
 * Palavra em análise no Analista de Vocabulário — o contrato compartilhado por TODAS as telas
 * (Captura, Análise, Leitura, Estudo, Métricas) via `<VocabularyPanel/>`.
 *
 * INVARIANTE DE HONESTIDADE: só `word` é garantido. Os campos ricos (cefr/phonetics/explanation/
 * example) são OPCIONAIS e só existem quando uma fonte REAL os fornece — nunca fabricados. O painel
 * omite a seção inteira quando o campo está ausente.
 */
export interface VocabWord {
  word: string;
  translation: string;
  cefr?: string;
  phonetics?: string;
  explanation?: string;
  example?: string;
  /**
   * Idioma REAL da palavra (código curto, ex.: 'en'). Cada tela já sabia disso e recalculava por
   * conta própria; agora viaja junto — é o que permite consultar o verbete certo no dicionário e
   * pronunciar com a voz certa.
   */
  lang?: string;
  /**
   * Motor que produziu `translation` ('opus-mt-local' | 'chrome-translator' | 'mymemory' | …).
   * O gateway SEMPRE devolveu isto em `MtResult.engine` e o cliente SEMPRE jogou fora — então a app
   * mostrava uma tradução sem dizer quem a fez. Ausente = tradução de origem desconhecida, e o
   * painel diz exatamente isso em vez de fingir procedência.
   */
  mtEngine?: string;
}

export type ExerciseKind = 'mc' | 'typing' | 'active-production' | 'read-aloud' | 'blocks' | 'dictation' | 'compose';
export type ExerciseFormat = 'mc' | 'typing' | 'active-production';

export interface VocabCard {
  id: string;
  word: string;
  phonetics: string;
  translation: string;
  explanation: string;
  sentence?: string; // Sentence context for Cloze
  /** Idioma REAL da frente do cartão (`word`), como gravado no banco. Ausente em cartões antigos. */
  srcLang?: string;
  /** Idioma REAL do verso (`translation`). Ausente em cartões antigos. */
  tgtLang?: string;
  /**
   * Nível CEFR do cartão e o quanto ele é confiável (1 = veio da lista curada, 0,3 = estimado por
   * comprimento). O banco sempre teve as duas colunas e o cliente as DESCARTAVA em
   * `rowToVocabCard` — por isso a trilha não conseguia filtrar por nível: o dado nunca chegava
   * aqui. `cartoesDaFonte` depende deles.
   */
  cefrLevel?: string;
  cefrConfidence?: number;
  sourceSessionId?: string; // ID of the session it came from
  sourceSessionTitle?: string;
  /**
   * Veio da trilha curada, e não de uma gravação sua.
   *
   * NÃO é derivável de `sourceSessionId`: o servidor sanea o id da sessão e `trilha:<lang>` vira
   * NULL, indistinguível de um cartão manual. A procedência real mora em
   * `vocab_occurrences.origin_kind` e chega até aqui por este campo — é o que permite a escolha
   * "minhas gravações OU trilha" ser exclusiva de verdade.
   */
  daTrilha?: boolean;
  frequency: 'high' | 'medium' | 'low';
  leitnerBox: number; // 1 to 5
  leitnerDueAt: string; // ISO date or descriptive
  fsrsState: 'New' | 'Learning' | 'Review' | 'Relearning';
  fsrsStability: number; // in days
  fsrsDifficulty: number; // 1 to 10
  fsrsPredictedRetention: number; // 0.0 to 1.0 (probabilistic)
  fsrsDueAt: string; // ISO date or descriptive
  inDeck: boolean;
  stability?: number; // mapped or alternative for fsrsStability
  /**
   * Epoch ms da última revisão FSRS. O banco sempre gravou esta coluna (`last_review`), mas
   * `rowToVocabCard` a descartava — mesma classe de bug já corrigida para `cefrLevel`/`cefrConfidence`.
   * Sem ela, retenção real por cartão (`retrievability`) não tem como ser calculada na UI: falta o
   * segundo insumo (o primeiro é `fsrsStability`). Ausente = cartão nunca revisado pelo FSRS.
   */
  lastReview?: number;
  /** nº de revisões FSRS já aplicadas ao cartão. Ausente/0 = ainda não revisado. */
  reps?: number;
  exerciseFormat?: ExerciseFormat;
}

export type SchedulerType = 'fsrs' | 'leitner';

/**
 * `play` é a tela dos minigames. Ela existe como view PRÓPRIA (e não como sub-aba da Análise)
 * porque minigame vive do BARALHO, que é global — sob a Análise ele herdaria a exigência de uma
 * sessão gravada e, sem nenhuma, a tela renderizava em branco.
 */
export type ViewType = 'hub' | 'capture' | 'study' | 'play' | 'library' | 'analysis' | 'settings' | 'reading' | 'metrics' | 'profile' | 'sobre' | 'loja';

