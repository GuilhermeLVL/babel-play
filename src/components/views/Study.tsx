import { Mic, CheckCircle2, ChevronRight, Brain, Zap, Volume2, Briefcase, Sparkles, Plus, Search } from 'lucide-react';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { ficharPalavraDoAnalista } from '../../lib/adicionarAoDeck';
import FraseComLacuna from '../FraseComLacuna';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchDeck, reviewCard, saveExerciseResult } from '../../data/api';
import { VocabCard, SchedulerType, Recording, ExerciseKind, VocabWord } from '../../types';
import { stabilityThreshold, formatForCard, ActiveProductionExercise, similarityPercentage } from '../../lib/exercicios';
import { countDue, isDueNow } from '@core';
import { speak as ttsSpeak } from '../../lib/tts';
import type { Sentence, PracticeSeed, ExerciseId } from '../../lib/sentences';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import VocabularyPanel from '../VocabularyPanel';
import CommandPalette, { useCommandPalette } from '../CommandPalette';
import { t, showsPowerUserAffordances, type AgeProfileType } from '../../lib/profile';

// Exercícios — cada um é um componente próprio, com o contrato `ExerciseProps`.

interface StudyProps {
  recording?: Recording;
  /**
   * Frases REAIS da sessão, já normalizadas (`src/lib/sentences.ts`). Antes isto era
   * `parsedSentences?: any[]` — sem tipo e sem `lang`, o campo do qual TTS/STT dependem.
   */
  sentences?: Sentence[];
  onChangeView?: (view: string, data?: any) => void;
  /** Trecho que o usuário mandou praticar (menu de contexto / Analista de Vocabulário). */
  practiceSeed?: PracticeSeed | null;
  /** Avisa o App que a semente foi consumida (para não reabrir o exercício ao voltar). */
  onSeedConsumed?: () => void;
  /** Perfil de exibição — decide a linguagem dos exercícios e quantos abrem de uma vez. */
  ageProfile?: AgeProfileType;
}

export default function Study({
  recording,
  sentences = [],
  onChangeView,
  practiceSeed = null,
  onSeedConsumed,
  ageProfile = 'pro',
}: StudyProps = {}) {

  // Dynamic Vocabulary Deck State
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  /**
   * O deck é ASSÍNCRONO (vem do servidor). Sem esta flag, uma semente `review` chegando junto com a
   * montagem da tela montaria a fila de revisão com o deck ainda vazio — a revisão simplesmente não
   * abriria. Quem depende do deck espera por ela.
   */
  const [deckLoaded, setDeckLoaded] = useState(false);

  // Fase 2: carrega o deck REAL do backend (substitui mockData/localStorage).
  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => setVocabCards([]))
      .finally(() => setDeckLoaded(true));
  }, []);

  /**
   * Cartões do contexto ativo (a sessão em foco, ou o baralho inteiro).
   *
   * MEMOIZADO, e isto é a raiz de um bug real. Era um `.filter()` cru, ou seja, um array NOVO a cada
   * render — e por isso ele não podia entrar nas dependências de nenhum hook sem invalidá-lo sempre.
   * Foi essa impossibilidade que deixou o catálogo `EXERCISES` (abaixo) sem `activeVocabCards` nas
   * deps, empacotando funções que leem esta lista: terminar uma revisão avaliando "de novo" muda os
   * cartões sem mudar as contagens (`dueCount`, `deckSize`), o memo não recalculava, e o próximo
   * clique montava a fila com os cartões de ANTES da atualização.
   *
   * Com a identidade estável, a lista pode ser dependência de verdade, e os memos abaixo param de
   * recalcular a cada render de brinde.
   */
  const activeVocabCards = useMemo(
    () => (recording ? vocabCards.filter(c => c.sourceSessionId === recording.id) : vocabCards),
    [vocabCards, recording]
  );
  const [scheduler] = useState<SchedulerType>('fsrs');
  const [searchVocab, setSearchVocab] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  /* `suggestHighFreq` saiu: nem o valor nem o setter eram usados em lugar nenhum. */

  /*
   * REMOVIDOS: `metrics`, `weeklySessions` e `streak`, junto com o `fetchMetrics()` que os
   * alimentava (abaixo).
   *
   * Os três eram ESCRITOS e nunca lidos. O último consumidor era o `dominantLevel`, que também não
   * tinha consumidor — a cadeia inteira estava morta, de ponta a ponta. Na prática isso era uma
   * requisição de rede a CADA abertura da tela de Estudo para preencher estado que ninguém exibia.
   *
   * Se a ofensiva e o contador de sessões voltarem a aparecer aqui, o `fetchMetrics` volta com eles
   * — e aí o dado terá para onde ir.
   */

  /**
   * XP GANHO NESTA SESSÃO. É o total que os exercícios REALMENTE anunciaram ao usuário — ver `earnXp`.
   * Zera a cada abertura da tela porque não há persistência de XP no servidor; prometer um acumulado
   * "eterno" a partir de um contador de memória seria inventar dado.
   */
  const [vocabXP, setVocabXP] = useState(0);

  /** XP por cartão revisado. Regra DECLARADA (não é medição) — e é o número que o resumo exibe. */
  const XP_PER_REVIEWED_CARD = 5;

  /* O `fetchMetrics()` que ficava aqui foi removido junto com os três estados que ele semeava — ver
     o comentário acima. O XP desta sessão (`vocabXP`) nunca vinha dele e continua intacto. */

  // Nível CEFR REAL dominante (maior contagem em levelDistribution); honesto se sem dados.
  /* `dominantLevel` saiu: calculava o nível CEFR predominante do baralho e ninguém lia o resultado.
     Um cálculo sem consumidor roda a cada render e sugere uma feature que não existe na tela. */

  // Review Session State
  const [reviewing, setReviewing] = useState(false);
  const [reviewCards, setReviewCards] = useState<VocabCard[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [reviewType] = useState<'cloze' | 'qa'>('cloze');

  // Active Production and Review Log states
  const [reviewLogs, setReviewLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem('reviewLogs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('reviewLogs', JSON.stringify(reviewLogs));
  }, [reviewLogs]);

  const [llmValidation] = useState<boolean>(() => {
    return localStorage.getItem('practice.activeProduction.llmValidation') === 'true';
  });

  /* `handleToggleLlmValidation` saiu: não havia controle nenhum na tela chamando este toggle, então
     `llmValidation` era lido mas nunca alterável. Um handler sem gatilho é um botão que não existe. */

  const [isActiveProductionOnly, setIsActiveProductionOnly] = useState(false);


  // States for interactive typing/mc exercises within review session
  const [typingAttempt, setTypingAttempt] = useState('');
  const [typingVerified, setTypingVerified] = useState(false);
  const [typingCorrect, setTypingCorrect] = useState(false);

  // Reset exercise states when card changes
  useEffect(() => {
    setTypingAttempt('');
    setTypingVerified(false);
    setTypingCorrect(false);
  }, [currentReviewIndex]);

  // TTS de uma palavra do deck: idioma REAL do cartão (`srcLang`), com fallback para o idioma
  // estudado configurado. Antes fixava 'en-US' — quebrava qualquer par que não fosse inglês.
  const playWordTTS = (word?: string) => {
    if (!word) return;
    const lang = langPairOf(cardFor(word)).src || studyLang;
    ttsSpeak(word, { lang: lang || undefined, rate: 0.9 });
  };

  /**
   * Revisão: manda a nota para o servidor e adota o cartão que ele devolve.
   *
   * ANTES o FSRS era calculado DUAS vezes: uma aproximação local à mão (constantes 8.2/6.5/5.0/3.0
   * e, pior, `const elapsedDays = 0.5; // simulated time since last review`) E o FSRS-5 de verdade no
   * backend, via `reviewCard`. A UI mostrava a aproximação — ou seja, a estabilidade e a "retenção
   * prevista" exibidas ao usuário eram uma simulação, não o agendamento real do deck dele.
   *
   * `reviewCard()` já devolve o cartão atualizado pelo servidor. Agora é essa a única fonte.
   */
  const handleFsrsFeedback = async (cardId: string, rating: 1 | 2 | 3 | 4, exerciseKind?: ExerciseKind) => {
    let effectiveRating = rating;
    if (exerciseKind === 'active-production' && rating === 3) {
      effectiveRating = 4; // produção ativa é mais difícil: um acerto vale Easy
    }

    const cardObj = vocabCards.find(c => c.id === cardId);

    try {
      const updated = await reviewCard(cardId, effectiveRating);
      setVocabCards(prev => prev.map(c => (c.id === cardId ? updated : c)));
    } catch {
      // Offline/erro: não inventamos um agendamento novo. O cartão fica como está e o usuário
      // segue revisando — a próxima sincronização com o servidor corrige.
    }

    if (cardObj) {
      setReviewLogs(prev => [...prev, {
        id: Math.random().toString(36).slice(2, 11),
        cardId,
        word: cardObj.word,
        rating: effectiveRating,
        correct: effectiveRating > 1,
        timestamp: new Date().toISOString(),
        exerciseKind,
      }]);
    }

    // Persiste o resultado do exercício (alimenta métricas e streak).
    saveExerciseResult({
      sessionId: recording?.id,
      exerciseKind,
      correct: effectiveRating > 1 ? 1 : 0,
    }).catch(() => {});

    triggerNextCard();
  };

  // Leitner feedback algorithm
  const handleLeitnerFeedback = (cardId: string, success: boolean, exerciseKind?: ExerciseKind) => {
    setVocabCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      
      /* Sem valor inicial: os dois ramos abaixo atribuem, e o de partida nunca era lido. */
      let nextBox: number;
      if (success) {
        nextBox = Math.min(5, card.leitnerBox + 1);
      } else {
        nextBox = 1; // Back to box 1
      }
      
      let dueStr = 'hoje';
      if (nextBox === 2) dueStr = 'Amanhã';
      else if (nextBox === 3) dueStr = 'Em 3 dias';
      else if (nextBox === 4) dueStr = 'Em 7 dias';
      else if (nextBox === 5) dueStr = 'Em 14 dias';
      
      return {
        ...card,
        leitnerBox: nextBox,
        leitnerDueAt: dueStr
      };
    }));

    // Fase 2: persiste a revisão no backend (mapeia sucesso→grade FSRS).
    reviewCard(cardId, success ? 3 : 1).catch(() => {});

    // Record ReviewLog (histórico local para stats da UI)
    const cardObj = vocabCards.find(c => c.id === cardId);
    if (cardObj) {
      const logEntry = {
        id: Math.random().toString(36).substr(2, 9),
        cardId,
        word: cardObj.word,
        rating: success ? 3 : 1,
        correct: success,
        timestamp: new Date().toISOString(),
        exerciseKind,
      };
      setReviewLogs(prev => [...prev, logEntry]);
    }

    triggerNextCard();
  };

  // Move forward in the flashcard queue
  const triggerNextCard = () => {
    setShowAnswer(false);
    if (currentReviewIndex + 1 < reviewCards.length) {
      setCurrentReviewIndex(prev => prev + 1);
    } else {
      setSessionCompleted(true);
      // Credita exatamente o que o resumo da sessão vai exibir (5 XP por cartão revisado).
      setVocabXP(prev => prev + reviewCards.length * XP_PER_REVIEWED_CARD);
    }
  };

  // Idempotent migration of state between Leitner and FSRS
  /* O `handleMigrateToFsrs` que existia aqui foi REMOVIDO. Era inalcançável — nenhum caller no
     arquivo, e, se algum dia fosse ligado, FABRICARIA estado de FSRS a partir das caixas do
     Leitner: estabilidade 1,8 / dificuldade 5,5 para a caixa 2, 28,0 / 2,0 para a caixa 5, e
     `fsrsPredictedRetention: 0.90` para todo cartão. Quarenta linhas de números inventados
     esperando um botão. Migração de verdade tem de sair de revisões reais, não de uma tabela
     de equivalência escrita à mão. */

  // Start study review session
  /* `useCallback` porque esta função é EMPACOTADA no catálogo `EXERCISES`, que é um `useMemo`. Sem
     identidade que mude junto com `activeVocabCards`/`scheduler`, o catálogo guardava uma closure
     velha e a fila era montada com os cartões de antes da última avaliação. */
  const startReviewSession = useCallback(() => {
    // Filter due cards or fall back to any in-deck cards
    const due = activeVocabCards.filter(c => c.inDeck && (scheduler === 'fsrs' ? c.fsrsDueAt === 'hoje' : c.leitnerDueAt === 'hoje'));
    const finalQueue = due.length > 0 ? due : activeVocabCards.filter(c => c.inDeck);

    if (finalQueue.length > 0) {
      setReviewCards(finalQueue);
      setCurrentReviewIndex(0);
      setShowAnswer(false);
      setSessionCompleted(false);
      setIsActiveProductionOnly(false);
      setReviewing(true);
    }
  }, [activeVocabCards, scheduler]);

  /**
   * Revisão FOCADA numa palavra — é o "Revisar agora" do Analista de Vocabulário.
   *
   * A revisão normal monta a fila do deck da sessão em foco; a palavra que o usuário acabou de
   * mandar revisar pode nem estar nela (foi fichada na Captura, nas Métricas, noutra sessão…).
   * Por isso a busca é no deck INTEIRO (`vocabCards`), não no recorte da sessão.
   */
  const startReviewSessionFor = (card: VocabCard) => {
    setReviewCards([card]);
    setCurrentReviewIndex(0);
    setShowAnswer(false);
    setSessionCompleted(false);
    setIsActiveProductionOnly(false);
    setReviewing(true);
  };

  /* Mesmo motivo do `startReviewSession`: vai dentro do `useMemo` do catálogo. */
  const startActiveProductionSession = useCallback(() => {
    const threshold = stabilityThreshold();
    const eligible = activeVocabCards.filter(c => c.inDeck && (c.stability ?? c.fsrsStability ?? 0) >= threshold);
    if (eligible.length > 0) {
      setReviewCards(eligible);
      setCurrentReviewIndex(0);
      setShowAnswer(false);
      setSessionCompleted(false);
      setIsActiveProductionOnly(true);
      setReviewing(true);
    }
  }, [activeVocabCards]);

  const handleToggleInDeck = (cardId: string) => {
    setVocabCards(prev => prev.map(card => {
      if (card.id !== cardId) return card;
      return { ...card, inDeck: !card.inDeck };
    }));
  };

  // --- ANALISTA DE VOCABULÁRIO ---
  // C12 — a rotina inteira (config de idioma, votação do par, resolução, tradução sob
  // demanda) vive em `lib/useExameDePalavra`, compartilhada com a tela de Vocabulário.
  // Eram ~101 linhas clonadas que o jscpd media, e as duas cópias já divergiam: aqui a
  // votação usava o recorte em estudo e lá o baralho inteiro. Agora é parâmetro.
  const exame = useExameDePalavra(vocabCards, activeVocabCards);
  const { langCfg, deckLangPair, cardFor, langPairOf } = exame;
  const selectedExamWord = exame.palavraExaminada;
  const setSelectedExamWord = exame.setPalavraExaminada;
  const examineWord = exame.examinar;
  const speakWord = exame.falar;
  const ttsSpeed = exame.velocidade;
  const setTtsSpeed = exame.setVelocidade;
  const [addedWords, setAddedWords] = useState<string[]>([]);

  /**
   * Idioma ESTUDADO — o `src` do par do baralho, injetado nos exercícios como fallback.
   * Com a leitura invertida de antes, este valor podia ser o idioma que o usuário FALA, e
   * o exercício narrava a frase inglesa com voz portuguesa.
   */
  const studyLang = deckLangPair.src;

  // Manda o termo para o deck SRS (mesmo backend/FSRS da Lista de Vocábulos).
  // Devolve o cartão REAL (o que já existia ou o recém-criado) — é o que permite ao "Revisar agora"
  // abrir a revisão NESTA palavra sem reimplementar a lógica de deck.
  const handleAddWordToDeck = async (w: VocabWord): Promise<VocabCard | undefined> => {
    setAddedWords(prev => (prev.includes(w.word) ? prev : [...prev, w.word]));
    const existing = vocabCards.find(c => c.word.toLowerCase() === w.word.toLowerCase());
    if (existing) {
      // Já existe no deck: só garante que está marcado como "no deck".
      if (!existing.inDeck) handleToggleInDeck(existing.id);
      return { ...existing, inDeck: true };
    }
    // Resolução do idioma + gravação + aviso de recusa vivem em `lib/adicionarAoDeck` — a mesma
    // rotina que Métricas usa. O que sobra aqui é o que só o Estudo faz: devolver o cartão real
    // para o "Revisar agora" abrir a revisão NESTA palavra.
    const created = await ficharPalavraDoAnalista(w, langCfg);
    if (created.length) {
      setVocabCards(prev => [...prev, ...created]);
      return created[0];
    }
    return undefined;
  };

  /**
   * "Praticar esta palavra" a partir do Analista de Vocabulário — AQUI, no Estudo, não há navegação:
   * esta JÁ é a tela do exercício. Abrimos a sessão localmente (é o mesmo caminho que a lista de
   * exercícios e a paleta ⌘K usam).
   *
   *  • `review`      → a palavra precisa estar no deck antes de ser revisada; então fichamos primeiro
   *                    (reusando `handleAddWordToDeck`) e abrimos a revisão NELA.
   *  • demais        → é um JOGO, e jogo mora no Jogar: navega para lá com a palavra na semente,
   *                    que entra na frente da fila da rodada. Antes isto chamava
   *                    `setActiveSession`, e depois que os exercícios legados saíram aquilo virava
   *                    um clique sem tela do outro lado.
   */
  const handlePracticeWord = async (w: VocabWord, exercise: ExerciseId) => {
    if (exercise === 'review') {
      const existing = vocabCards.find(
        c => c.word.toLowerCase() === w.word.toLowerCase() && c.inDeck
      );
      const card = existing ?? (await handleAddWordToDeck(w));
      // Sem cartão (o backend recusou/está offline) não inventamos uma revisão: cai na fila normal.
      if (card) startReviewSessionFor(card);
      else startReviewSession();
      return;
    }
    const seed: PracticeSeed = {
      ...seedFromSelection(w.word, studyLang, exercise, recording?.id),
      word: w.word,
    };
    onChangeView?.(telaDoExercicio(exercise), { seed, id: recording?.id });
  };







  // ══════════════════ ESTADO DERIVADO DA NOVA SUPERFÍCIE ══════════════════

  /* Prioridade 1: enquanto esta tela está montada, o ⌘K busca EXERCÍCIO, não gravação. A busca
     global do shell (prioridade 0) volta a atender assim que se sai daqui. */
  const [paletteOpen, setPaletteOpen] = useCommandPalette(true, 1);

  const deckSize = activeVocabCards.filter(c => c.inDeck).length;
  /** Cartões REALMENTE vencidos hoje (nada de número decorativo). */
  // `countDue` parseia a data REAL. A comparação anterior era com a string 'hoje', enquanto a
  // API grava ISO — o contador era sempre 0 e o bloco "AGORA" nunca aparecia. Ver core/learning/due.
  const dueCount = countDue(activeVocabCards, scheduler);

  /** Cartões elegíveis a Produção Ativa — o gate real por estabilidade. */
  const producibleCount = activeVocabCards.filter(
    c => c.inDeck && (c.stability ?? c.fsrsStability ?? 0) >= stabilityThreshold()
  ).length;

  /** A busca e o filtro FINALMENTE têm UI (o estado existia e nunca foi controlável). */
  const filteredVocab = useMemo(() => {
    const q = searchVocab.trim().toLowerCase();
    return activeVocabCards.filter(c => {
      if (q && !c.word.toLowerCase().includes(q) && !(c.translation ?? '').toLowerCase().includes(q)) return false;
      if (filterStatus === 'deck') return c.inDeck;
      if (filterStatus === 'due') return isDueNow(c, scheduler);  // mesmo bug do contador
      if (filterStatus === 'new') return c.fsrsState === 'New';
      return true;
    });
  }, [activeVocabCards, searchVocab, filterStatus, scheduler]);

  /* `hasAudio` e `hasTimestamps` saíram junto com as dependências do catálogo que os usava: os
     exercícios de mídia não estão mais nesta lista, e ninguém mais lê essas condições aqui. */

  /**
   * CATÁLOGO ÚNICO DE EXERCÍCIOS — a mesma lista alimenta as linhas da tela E a paleta ⌘K.
   *
   * `disabledReason` é o coração da mudança de UX: antes, um exercício que não podia rodar
   * simplesmente NÃO APARECIA (os de mídia eram escondidos por `recording.type`), então quem tinha
   * uma sessão de áudio jamais descobria que o Caption Sync existia. Agora ele aparece, desabilitado,
   * dizendo exatamente o que falta.
   */
  /**
   * A REVELAÇÃO PROGRESSIVA SAIU DAQUI, e o motivo é aritmético: ela existe para domar MUITAS
   * opções, e sobraram duas. Com doze exercícios, esconder oito atrás de "Ver tudo" poupava quem
   * está começando; com dois, esconder um é só um clique a mais para ver o que cabia na tela
   * inteira. A revelação continua valendo no Jogar, onde há nove jogos (`PRIMEIROS_POR_PERFIL`).
   */

  const EXERCISES = useMemo(() => ([
    {
      id: 'review',
      label: t('ex.review', ageProfile),
      hint: dueCount > 0
        ? t('ex.review.hint.due', ageProfile, { n: dueCount })
        : t('ex.review.hint.deck', ageProfile, { n: deckSize }),
      keywords: 'srs fsrs leitner flashcard revisar memorizar treino memoria',
      icon: <Zap className="w-4 h-4" />,
      disabledReason: deckSize === 0 ? t('block.emptyDeck', ageProfile) : undefined,
      run: startReviewSession,
    },
    {
      id: 'active_production',
      label: t('ex.active_production', ageProfile),
      hint: t('ex.active_production.hint', ageProfile, { n: producibleCount }),
      keywords: 'producao ativa escrever recall',
      icon: <Brain className="w-4 h-4" />,
      disabledReason: producibleCount === 0
        ? t('block.notMature', ageProfile, { n: stabilityThreshold() })
        : undefined,
      run: startActiveProductionSession,
    },
  /* As duas `run` entram nas deps: era a AUSÊNCIA delas que fazia o catálogo servir uma closure com
     os cartões de antes da última avaliação. Agora que `activeVocabCards` é memoizado, incluí-las
     não faz o memo recalcular a cada render, só quando os cartões realmente mudam.

     `sentences.length`, `hasAudio` e `hasTimestamps` SAÍRAM: eram dependências dos exercícios de
     mídia, que não existem mais neste catálogo (sobraram dois, e nenhum lê essas condições). Deps
     que ninguém usa fazem o memo recalcular por nada e sugerem uma relação que já não existe. */
  ]), [dueCount, deckSize, producibleCount, ageProfile,
       startReviewSession, startActiveProductionSession]);


  /** Uma linha da lista de exercícios. Extraída para as duas camadas renderizarem idêntico. */
  const renderExerciseRow = (ex: typeof EXERCISES[number]) => {
    const blocked = ex.disabledReason;
    return (
      <button
        key={ex.id}
        onClick={() => !blocked && ex.run()}
        disabled={!!blocked}
        className={`w-full flex items-center gap-3.5 px-4 py-3.5 text-left transition-colors ${
          blocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer group'
        }`}
      >
        <span className={`shrink-0 ${blocked ? 'text-ink-faint' : 'text-ink-muted group-hover:text-accent transition-colors'}`}>
          {ex.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-ink leading-tight">{ex.label}</span>
          <span className={`block text-[11.5px] leading-tight mt-0.5 ${blocked ? 'text-warn-ink' : 'text-ink-muted'}`}>
            {blocked ?? ex.hint}
          </span>
        </span>
        {!blocked && <ChevronRight className="w-4 h-4 text-ink-faint shrink-0 group-hover:text-accent transition-colors" />}
      </button>
    );
  };

  /**
   * SEMENTE → abre o exercício pedido, já com o conteúdo. É o que faz o botão direito em outra tela
   * ("revisar esta palavra") terminar aqui, no exercício certo.
   *
   * SÓ TRATA O QUE MORA AQUI. Antes esta tela era o destino de TODA semente, porque era onde todos
   * os exercícios viviam. Com os legados fora, os jogos são o destino da maioria delas e quem
   * decide é `telaDoExercicio` (`lib/sentences.ts`), na origem. Uma semente de jogo que chegasse
   * aqui por engano é ignorada em silêncio de propósito: melhor o hub aberto do que abrir o
   * exercício errado porque o id não bateu.
   */
  useEffect(() => {
    if (!practiceSeed?.exercise) return;
    const target = practiceSeed.exercise;
    if (target !== 'review' && target !== 'active_production') return;
    // Exercícios que LEEM O DECK só podem abrir depois que ele chegou do servidor — senão a fila
    // sairia vazia e a semente seria consumida à toa (o "Revisar agora" de outra tela não abriria).
    if (!deckLoaded) return;
    if (target === 'review') {
      // Semente com PALAVRA (veio do Analista de Vocabulário) → revisa exatamente essa palavra.
      const seedWord = practiceSeed.word;
      const card = seedWord
        ? vocabCards.find(c => c.word.toLowerCase() === seedWord.toLowerCase() && c.inDeck)
        : undefined;
      if (card) startReviewSessionFor(card);
      else startReviewSession();
    } else {
      startActiveProductionSession();
    }
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceSeed, deckLoaded, vocabCards]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row w-full min-h-0 bg-canvas">
    <div className="flex-1 min-w-0 p-6 md:p-10 w-full bg-canvas text-ink overflow-y-auto custom-scrollbar">

      {/* ══════════════════ CABEÇALHO ══════════════════ */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono mb-1">Treino</p>
          <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight truncate">
            {recording ? recording.title : 'Meu treino'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* XP REALMENTE creditado nesta sessão — o mesmo número que os exercícios anunciaram.
              Antes o total era clampado em 20 e não aparecia em lugar nenhum: o "+80 XP" do
              exercício não tinha para onde ir. */}
          {vocabXP > 0 && (
            <span className="kpi-pill cursor-default text-[11px] flex items-center gap-1" title="XP ganho nesta sessão de estudo">
              <Zap className="w-3 h-3" /> +{vocabXP} XP
            </span>
          )}
          {/* A paleta é atalho de quem já domina a ferramenta. Para Kids e Sênior ela seria mais um
              elemento a decifrar no topo, e a lista abaixo já cabe inteira na tela nesses perfis. */}
          {showsPowerUserAffordances(ageProfile) && (
            <button
              onClick={() => setPaletteOpen(true)}
              className="btn-outline flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold shrink-0"
              title="Buscar qualquer exercício pelo nome"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Buscar exercício</span>
              <kbd className="text-[10px] font-mono border border-border-subtle rounded px-1 py-0.5 ml-1">⌘K</kbd>
            </button>
          )}
        </div>
      </header>

      {/* ══════════════════ AGORA — a única ação primária ══════════════════
          Um número REAL (cartões vencidos no deck). Quando não há nada vencido, em vez de um vazio
          inútil, oferece a próxima melhor ação real. */}
      <section className="mb-8">
        {dueCount > 0 ? (
          <div className="card-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display font-black text-lg text-ink">
                {t('now.due.title', ageProfile, { n: dueCount })}
              </p>
              <p className="text-[12.5px] text-ink-muted">
                {t('now.due.sub', ageProfile, { sched: scheduler === 'fsrs' ? 'FSRS-5' : 'Leitner' })}
              </p>
            </div>
            <button onClick={startReviewSession} className="btn-solid flex items-center gap-2 shrink-0">
              <Zap className="w-4 h-4" /> {t('now.due.cta', ageProfile)}
            </button>
          </div>
        ) : deckSize > 0 ? (
          <div className="card-panel p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display font-black text-lg text-ink">{t('now.clear.title', ageProfile)} ✓</p>
              <p className="text-[12.5px] text-ink-muted">
                {sentences.length > 0
                  ? t('now.clear.sub', ageProfile, { n: sentences.length })
                  : t('now.empty.sub', ageProfile)}
              </p>
            </div>
            {sentences.length > 0 && (
              /* Abria o Estúdio de Shadowing. O substituto é o Karaokê, que faz a mesma coisa com
                 a fala REAL da sessão e agora mostra palavra a palavra o que escapou. */
              <button
                onClick={() => onChangeView?.('play', { seed: { exercise: 'karaoke', lang: studyLang }, id: recording?.id })}
                className="btn-outline flex items-center gap-2 shrink-0 text-xs font-bold px-4 py-2.5 rounded-xl"
              >
                <Mic className="w-4 h-4" /> {t('now.clear.cta', ageProfile)}
              </button>
            )}
          </div>
        ) : (
          /* Empty state que ENSINA a interface, em vez de dizer "nada aqui". */
          <div className="card-panel p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-canvas border border-border-subtle flex items-center justify-center mb-4 text-ink-faint">
              <Brain className="w-7 h-7" />
            </div>
            <h3 className="font-display font-extrabold text-base text-ink">Seu deck está vazio</h3>
            <p className="text-[12.5px] text-ink-muted mt-2 max-w-md">
              Clique numa palavra em qualquer transcrição, ou <b className="text-ink">selecione um trecho e use o
              botão direito</b>, para mandá-la ao deck. A revisão espaçada aparece aqui assim que houver cartões.
            </p>
            {onChangeView && (
              <button onClick={() => onChangeView('capture')} className="btn-solid mt-5">
                Capturar uma sessão
              </button>
            )}
          </div>
        )}
      </section>

      {/* ══════════════════ EXERCÍCIOS — linhas, não cards ══════════════════
          Antes eram cards duplicados espalhados por 3 abas (Revisão Espaçada aparecia 3×), com os
          exercícios de mídia ESCONDIDOS conforme o tipo da sessão, quem tinha áudio nunca descobria
          que Caption Sync existia. Agora: uma lista só, tudo sempre visível, e o que não dá para
          rodar fica DESABILITADO com o motivo real. */}
      <section className="mb-8">
        <h2 className="label-mono mb-3">
          {ageProfile === 'kids' ? 'Desafios' : ageProfile === 'senior' ? 'Exercícios' : 'Exercícios'}
        </h2>
        {/* Os dois, sempre à vista. Eram doze e valia esconder; com dois, o "Ver tudo" seria
            fricção sem ganho. */}
        <div className="border border-border-subtle rounded-2xl overflow-hidden bg-surface divide-y divide-border-subtle">
          {EXERCISES.map(renderExerciseRow)}
        </div>
      </section>

      {/* ══════════════════ MEU VOCABULÁRIO ══════════════════
          A busca e o filtro EXISTIAM no estado (`searchVocab`, `filterStatus`) mas NUNCA tiveram UI,
          o código filtrava por um valor que o usuário não tinha como mudar. Agora estão ligados. */}
      <section className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <h2 className="label-mono">Meu vocabulário <span className="text-ink-faint">({filteredVocab.length})</span></h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface border border-border-subtle rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-ink-faint" />
              {/* C2 — `placeholder` NÃO é nome acessível: some ao digitar e vários leitores de
                  tela o ignoram. O `aria-label` permanece. */}
              <input
                value={searchVocab}
                onChange={(e) => setSearchVocab(e.target.value)}
                placeholder="Buscar palavra…"
                aria-label="Buscar palavra no baralho"
                /* C5 — `min-h-6`: o campo media 16px de altura (WCAG 2.2 AA 2.5.8 pede 24). */
                className="bg-transparent text-xs text-ink placeholder-ink-faint outline-none w-32 min-h-6"
              />
            </div>
            <select
              aria-label="Filtrar cartões por situação"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-surface border border-border-subtle rounded-lg px-2 py-1.5 text-xs font-bold text-ink cursor-pointer outline-none focus:border-accent"
            >
              <option value="all">Todos</option>
              <option value="deck">No deck</option>
              <option value="due">Vencidos</option>
              <option value="new">Novos</option>
            </select>
          </div>
        </div>

        {filteredVocab.length === 0 ? (
          <div className="border border-dashed border-border-subtle rounded-2xl p-8 text-center">
            <p className="text-xs text-ink-muted">
              {vocabCards.length === 0
                ? 'Nenhuma palavra no deck ainda.'
                : 'Nenhuma palavra corresponde à busca/filtro.'}
            </p>
          </div>
        ) : (
          <div className="border border-border-subtle rounded-2xl overflow-hidden bg-surface divide-y divide-border-subtle max-h-[420px] overflow-y-auto custom-scrollbar">
            {filteredVocab.map(card => (
              <div key={card.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors">
                <button
                  onClick={() => void examineWord(card.word)}
                  className="min-w-0 flex-1 text-left cursor-pointer group"
                  title="Abrir no Analista de Vocabulário"
                >
                  <span className="block text-[13px] font-bold text-ink group-hover:text-accent transition-colors truncate">
                    {card.word}
                  </span>
                  <span className="block text-[11px] text-ink-muted truncate">{card.translation || '-'}</span>
                </button>

                <button
                  onClick={() => playWordTTS(card.word)}
                  className="p-1.5 rounded-lg text-ink-muted hover:text-accent hover:bg-canvas transition-colors cursor-pointer shrink-0"
                  title="Ouvir"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>

                <span className={`badge-tag shrink-0 ${card.fsrsState === 'Review' ? 'ok' : card.fsrsState === 'New' ? '' : 'warn'}`}>
                  {card.fsrsState === 'New' ? 'novo' : card.fsrsDueAt}
                </span>

                <button
                  onClick={() => handleToggleInDeck(card.id)}
                  className={`shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer ${
                    card.inDeck ? 'text-accent hover:bg-canvas' : 'text-ink-faint hover:text-ink hover:bg-canvas'
                  }`}
                  title={card.inDeck ? 'Remover do deck' : 'Adicionar ao deck'}
                >
                  {card.inDeck ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Paleta de comandos — o gesto que resolve "é um desafio encontrar os exercícios". */}
      <CommandPalette
        open={paletteOpen && showsPowerUserAffordances(ageProfile)}
        onClose={() => setPaletteOpen(false)}
        commands={EXERCISES.map(ex => ({
          id: ex.id,
          label: ex.label,
          hint: ex.hint,
          icon: ex.icon,
          keywords: ex.keywords,
          disabledReason: ex.disabledReason,
          run: ex.run,
        }))}
      />


    {/* Immersive Vocabulary Review Session Overlay */}
    {reviewing && (
      <div className="fixed inset-0 z-50 bg-ink/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-2xl bg-canvas text-ink rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-border-subtle">
          
          {/* Header */}
          <div className="px-6 py-4 bg-surface border-b border-border-subtle flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-accent" />
              <div>
                <h3 className="font-display font-bold text-base text-ink">Sessão de Estudo Ativo</h3>
                <span className="text-[11px] text-ink-muted">Método: {scheduler === 'fsrs' ? 'FSRS-5 (Probabilístico)' : 'Leitner (Cinco Caixas)'}</span>
              </div>
            </div>
            <button 
              onClick={() => setReviewing(false)}
              className="p-1.5 hover:bg-surface-hover rounded text-ink-muted hover:text-ink text-[12px] font-bold"
            >
              Encerrar
            </button>
          </div>

          {/* Content Area */}
          {!sessionCompleted ? (() => {
            const currentCard = reviewCards[currentReviewIndex];
            const format = isActiveProductionOnly 
              ? 'active-production' 
              : (scheduler === 'fsrs' && currentCard ? formatForCard(currentCard) : 'cloze');
            
            return (
              <div className="p-6 md:p-8 space-y-6">
                
                {/* Progress Indicators */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[12px] font-bold text-ink-muted">Cartão {currentReviewIndex + 1} de {reviewCards.length}</span>
                  <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden mx-2 max-w-xs">
                    <div 
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${((currentReviewIndex + 1) / reviewCards.length) * 100}%` }}
                    ></div>
                  </div>
                  
                  {/* Format Indicator Badge */}
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-border-subtle bg-surface text-ink-muted">
                    Modo: {format === 'active-production' ? 'Produção Ativa' : format === 'typing' ? 'Digitação' : format === 'mc' ? 'Múltipla Escolha' : 'Flashcard'}
                  </span>
                </div>

                {format === 'active-production' ? (
                  <ActiveProductionExercise
                    card={currentCard}
                    llmValidationEnabled={llmValidation}
                    playTTS={playWordTTS}
                    onVerify={(res: any) => {
                      (currentCard as any)._lastResult = res;
                    }}
                    onNext={() => {
                      const res = (currentCard as any)._lastResult || { correct: false };
                      const rating = res.correct ? 3 : 1;
                      if (scheduler === 'fsrs') {
                        handleFsrsFeedback(currentCard.id, rating, 'active-production');
                      } else {
                        handleLeitnerFeedback(currentCard.id, res.correct, 'active-production');
                      }
                    }}
                  />
                ) : format === 'typing' ? (
                  /* TYPING EXERCISE UI */
                  <div className="space-y-6 w-full animate-in fade-in duration-200">
                    <div className="card-panel p-8 md:p-12 text-center bg-surface border-2 border-border-subtle min-h-[220px] flex flex-col justify-center items-center relative overflow-hidden">
                      <span className="text-[10px] uppercase font-mono text-ink-muted tracking-wider block mb-2">Exercício de Digitação</span>
                      <FraseComLacuna sentence={currentCard.sentence} word={currentCard.word} />
                      <p className="text-xs text-ink-muted italic mb-4">Tradução: {currentCard.translation}</p>

                      {!typingVerified ? (
                        <div className="w-full max-w-sm mx-auto space-y-3">
                          <input
                            type="text"
                            value={typingAttempt}
                            onChange={(e) => setTypingAttempt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const score = similarityPercentage(currentCard.word, typingAttempt);
                                setTypingCorrect(score >= 0.85);
                                setTypingVerified(true);
                              }
                            }}
                            placeholder="Digite a palavra..."
                            className="w-full p-2.5 text-center border-2 border-border-subtle rounded-xl outline-none focus:border-accent bg-canvas font-medium text-base text-ink"
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const score = similarityPercentage(currentCard.word, typingAttempt);
                              setTypingCorrect(score >= 0.85);
                              setTypingVerified(true);
                            }}
                            disabled={!typingAttempt.trim()}
                            className="btn-solid bg-accent text-white py-2 px-6 font-bold text-xs cursor-pointer"
                          >
                            Verificar
                          </button>
                        </div>
                      ) : (
                        <div className="w-full max-w-sm mx-auto space-y-4">
                          {typingCorrect ? (
                            <div className="text-good font-bold text-sm flex items-center justify-center gap-1.5 bg-good-soft/10 p-3 rounded-xl border border-good/20">
                              <CheckCircle2 className="w-4 h-4" /> Correto! A resposta era "{currentCard.word}"
                            </div>
                          ) : (
                            <div className="text-error font-bold text-sm bg-error-soft/10 p-3 rounded-xl border border-error/20">
                              Incorreto. A resposta correta era "<strong className="text-good">{currentCard.word}</strong>" (você escreveu "{typingAttempt}")
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const isCorrect = typingCorrect;
                              if (scheduler === 'fsrs') {
                                handleFsrsFeedback(currentCard.id, isCorrect ? 3 : 1, 'typing');
                              } else {
                                handleLeitnerFeedback(currentCard.id, isCorrect, 'typing');
                              }
                            }}
                            className="btn-ink py-2 px-6 font-bold text-xs cursor-pointer"
                          >
                            Avançar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : format === 'mc' ? (
                  /* MULTIPLE CHOICE EXERCISE UI */
                  <div className="space-y-6 w-full animate-in fade-in duration-200">
                    <div className="card-panel p-8 md:p-12 text-center bg-surface border-2 border-border-subtle min-h-[220px] flex flex-col justify-center items-center relative overflow-hidden">
                      <span className="text-[10px] uppercase font-mono text-ink-muted tracking-wider block mb-2">Múltipla Escolha</span>
                      <FraseComLacuna sentence={currentCard.sentence} word={currentCard.word} />
                      <p className="text-xs text-ink-muted italic mb-6">Tradução: {currentCard.translation}</p>

                      {!typingVerified ? (
                        <div className="grid grid-cols-2 gap-3 w-full max-w-md mx-auto">
                          {[
                            currentCard.word,
                            ...vocabCards.filter(c => c.id !== currentCard.id).sort(() => 0.5 - Math.random()).slice(0, 3).map(c => c.word)
                          ].sort(() => 0.5 - Math.random()).map((option, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                const isCorrect = option.toLowerCase() === currentCard.word.toLowerCase();
                                setTypingCorrect(isCorrect);
                                setTypingAttempt(option);
                                setTypingVerified(true);
                                // Persiste o resultado do exercício (best-effort) → alimenta métricas.
                                void saveExerciseResult({
                                  kind: 'study',
                                  exerciseKind: 'multiple-choice',
                                  correct: isCorrect ? 1 : 0,
                                  score: isCorrect ? 1 : 0,
                                  sessionId: (currentCard as any).sourceSessionId,
                                });
                              }}
                              className="p-3 border border-border-subtle rounded-xl font-bold bg-canvas hover:border-accent text-sm hover:bg-surface-hover transition-colors cursor-pointer text-ink"
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="w-full max-w-sm mx-auto space-y-4">
                          {typingCorrect ? (
                            <div className="text-good font-bold text-sm flex items-center justify-center gap-1.5 bg-good-soft/10 p-3 rounded-xl border border-good/20">
                              <CheckCircle2 className="w-4 h-4" /> Correto!
                            </div>
                          ) : (
                            <div className="text-error font-bold text-sm bg-error-soft/10 p-3 rounded-xl border border-error/20">
                              Incorreto. Você selecionou "{typingAttempt}". A resposta correta era "<strong className="text-good">{currentCard.word}</strong>"
                            </div>
                          )}
                          <button
                            onClick={() => {
                              const isCorrect = typingCorrect;
                              if (scheduler === 'fsrs') {
                                handleFsrsFeedback(currentCard.id, isCorrect ? 3 : 1, 'mc');
                              } else {
                                handleLeitnerFeedback(currentCard.id, isCorrect, 'mc');
                              }
                            }}
                            className="btn-ink py-2 px-6 font-bold text-xs cursor-pointer"
                          >
                            Avançar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* DEFAULT FLASHCARD VIEW */
                  <>
                    {/* The Flashcard Body */}
                    <div className="card-panel p-8 md:p-12 text-center bg-surface border-2 border-border-subtle min-h-[220px] flex flex-col justify-center items-center relative overflow-hidden shadow-md">
                      
                      {/* Origin watermark */}
                      {currentCard?.sourceSessionTitle && (
                        <div className="absolute top-3 left-3 flex items-center gap-1 text-[11px] font-medium text-rare">
                          <Briefcase className="w-3.5 h-3.5" /> {currentCard.sourceSessionTitle}
                        </div>
                      )}

                      {!showAnswer ? (
                        /* FRONT OF THE CARD */
                        <div className="space-y-6 w-full">
                          {reviewType === 'cloze' && currentCard?.sentence ? (
                            <div className="text-xl md:text-2xl font-medium text-ink leading-relaxed px-4">
                              {currentCard.sentence!.split(new RegExp(`(${currentCard.word})`, 'gi')).map((chunk, index) => {
                                if (chunk.toLowerCase() === currentCard.word.toLowerCase()) {
                                  return (
                                    <span key={index} className="px-4 py-1.5 mx-1 rounded bg-accent-soft text-accent-ink font-bold border border-dashed border-accent font-mono text-[16px]">
                                      [ ... ]
                                    </span>
                                  );
                                }
                                return <span key={index}>{chunk}</span>;
                              })}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-[12px] font-mono text-ink-muted uppercase tracking-widest block">Como traduz e pronuncia:</span>
                              <h2 className="text-3xl md:text-4xl font-display font-extrabold text-ink tracking-tight">
                                {currentCard?.word}
                              </h2>
                            </div>
                          )}
                          
                          <button 
                            onClick={() => playWordTTS(currentCard?.word)}
                            className="btn-outline hover:bg-surface-hover py-1.5 px-3 rounded-full text-[12px] flex items-center gap-1.5 mx-auto cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4 text-ink-muted" /> Ouvir Áudio
                          </button>
                        </div>
                      ) : (
                        /* BACK OF THE CARD */
                        <div className="space-y-6 w-full animate-in fade-in zoom-in-95 duration-200">
                          <div className="space-y-1">
                            <h2 className="text-3xl font-display font-extrabold text-ink tracking-tight flex items-center justify-center gap-2">
                              {currentCard?.word}
                              <button 
                                onClick={() => playWordTTS(currentCard?.word)}
                                className="p-1 hover:bg-surface-hover rounded cursor-pointer"
                              >
                                <Volume2 className="w-4 h-4 text-accent" />
                              </button>
                            </h2>
                            <span className="text-xs font-mono text-ink-muted block">{currentCard?.phonetics}</span>
                          </div>

                          <div className="space-y-2 max-w-md mx-auto">
                            <div className="text-[18px] font-extrabold text-accent">
                              {currentCard?.translation}
                            </div>
                            <p className="text-[13.5px] text-ink-muted leading-relaxed">
                              {currentCard?.explanation}
                            </p>
                          </div>

                          {currentCard?.sentence && (
                            <div className="bg-canvas border border-border-subtle p-3 rounded-xl max-w-lg mx-auto text-left">
                              <span className="text-[10px] uppercase font-mono text-ink-muted block mb-1">Frase Contexto</span>
                              <p className="text-[13px] text-ink italic leading-relaxed">
                                {currentCard.sentence!.split(new RegExp(`(${currentCard.word})`, 'gi')).map((chunk, index) => {
                                  if (chunk.toLowerCase() === currentCard.word.toLowerCase()) {
                                    return <strong key={index} className="text-accent underline font-extrabold">{chunk}</strong>;
                                  }
                                  return <span key={index}>{chunk}</span>;
                                })}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Controls */}
                    <div className="pt-2 border-t border-border-subtle">
                      {!showAnswer ? (
                        <button 
                          onClick={() => {
                            setShowAnswer(true);
                            playWordTTS(currentCard?.word);
                          }}
                          className="w-full btn-ink py-3 text-sm font-bold shadow-md hover:scale-[1.01] cursor-pointer"
                        >
                          Mostrar Resposta
                        </button>
                      ) : (
                        <div className="space-y-4">
                          <div className="text-center">
                            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">Como foi o seu desempenho?</span>
                          </div>
                          
                          {scheduler === 'fsrs' ? (
                            /* FSRS FEEDBACK BUTTONS */
                            <div className="grid grid-cols-4 gap-2.5">
                              <button 
                                onClick={() => handleFsrsFeedback(currentCard.id, 1)}
                                className="p-3 border-2 border-error-soft bg-error-soft/10 rounded-xl hover:bg-error-soft/20 text-center transition-colors flex flex-col items-center justify-between min-h-[75px] cursor-pointer"
                              >
                                <span className="font-extrabold text-[12px] text-error">Errei</span>
                                <span className="text-[9px] text-ink-muted block font-mono mt-1">Again (10m)</span>
                              </button>
                              <button 
                                onClick={() => handleFsrsFeedback(currentCard.id, 2)}
                                className="p-3 border-2 border-warn-soft bg-warn-soft/10 rounded-xl hover:bg-warn-soft/20 text-center transition-colors flex flex-col items-center justify-between min-h-[75px] cursor-pointer"
                              >
                                <span className="font-extrabold text-[12px] text-warn">Difícil</span>
                                <span className="text-[9px] text-ink-muted block font-mono mt-1">Hard (1.2d)</span>
                              </button>
                              <button 
                                onClick={() => handleFsrsFeedback(currentCard.id, 3)}
                                className="p-3 border-2 border-accent-soft bg-accent-soft/10 rounded-xl hover:bg-accent-soft/20 text-center transition-colors flex flex-col items-center justify-between min-h-[75px] cursor-pointer"
                              >
                                <span className="font-extrabold text-[12px] text-accent-ink">Bom</span>
                                <span className="text-[9px] text-ink-muted block font-mono mt-1">Good (3.5d)</span>
                              </button>
                              <button 
                                onClick={() => handleFsrsFeedback(currentCard.id, 4)}
                                className="p-3 border-2 border-good-soft bg-good-soft/10 rounded-xl hover:bg-good-soft/20 text-center transition-colors flex flex-col items-center justify-between min-h-[75px] cursor-pointer"
                              >
                                <span className="font-extrabold text-[12px] text-good">Fácil</span>
                                <span className="text-[9px] text-ink-muted block font-mono mt-1">Easy (8d)</span>
                              </button>
                            </div>
                          ) : (
                            /* LEITNER FEEDBACK BUTTONS */
                            <div className="grid grid-cols-2 gap-4">
                              <button 
                                onClick={() => handleLeitnerFeedback(currentCard.id, false)}
                                className="p-4 border-2 border-error/20 bg-error/5 hover:bg-error/10 text-error rounded-xl font-bold flex items-center justify-center gap-2 transition-colors py-3 cursor-pointer"
                              >
                                Errei (Volta Caixa 1)
                              </button>
                              <button 
                                onClick={() => handleLeitnerFeedback(currentCard.id, true)}
                                className="p-4 border-2 border-good/20 bg-good/5 hover:bg-good/10 text-good rounded-xl font-bold flex items-center justify-center gap-2 transition-colors py-3 cursor-pointer"
                              >
                                Acertei (Avança Caixa)
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

              </div>
            );
          })() : (
            /* VICTOR / SUMMARY CARD */
            <div className="p-8 text-center space-y-6 animate-in fade-in duration-300">
              <div className="w-16 h-16 bg-good-soft/50 border border-good/20 rounded-full flex items-center justify-center mx-auto text-good-ink">
                <Sparkles className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h3 className="font-display font-extrabold text-2xl text-ink">Estudo Concluído!</h3>
                <p className="text-[13.5px] text-ink-muted max-w-sm mx-auto">
                  Excelente trabalho. Seus cartões foram reordenados e novos prazos foram agendados localmente.
                </p>
              </div>

              <div className="card-panel p-5 bg-surface max-w-sm mx-auto grid grid-cols-2 gap-4 divide-x divide-border-subtle">
                <div>
                  <span className="text-[10px] uppercase font-mono text-ink-muted block mb-1">Revisões Feitas</span>
                  <span className="font-display font-bold text-xl text-ink">{reviewCards.length} cartões</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-ink-muted block mb-1">XP Ganho</span>
                  <span className="font-display font-bold text-xl text-good flex items-center justify-center gap-1">
                    {/* Mesma regra creditada em `triggerNextCard` — o número exibido é o recebido. */}
                    <Zap className="w-4 h-4 text-accent fill-accent" /> +{reviewCards.length * XP_PER_REVIEWED_CARD} XP
                  </span>
                </div>
              </div>

              <button 
                onClick={() => setReviewing(false)}
                className="w-full btn-solid bg-accent text-white hover:bg-accent-ink py-3 text-sm font-bold shadow-md cursor-pointer"
              >
                Voltar ao Painel de Estudos
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    </div>

      {/* Analista de Vocabulário — coluna à direita; só monta quando há palavra selecionada. */}
      <VocabularyPanel
        viewKey="study"
        word={selectedExamWord}
        onClose={() => setSelectedExamWord(null)}
        onSpeak={speakWord}
        onAddToDeck={handleAddWordToDeck}
        isAdded={
          !!selectedExamWord &&
          (addedWords.includes(selectedExamWord.word) ||
            vocabCards.some(c => c.word.toLowerCase() === selectedExamWord.word.toLowerCase() && c.inDeck))
        }
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        onPractice={handlePracticeWord}
      />
    </div>
  );
}
