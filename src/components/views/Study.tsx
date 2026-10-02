import '../../styles/cartoes.css';
import '../../styles/questBiblioteca.css';

import { countDue, ganhoDaNota, ganhoDaRevisao, type Grade, isDueNow, makeFsrs5 } from '@core';
import {
  Brain,
  ChartColumn,
  Check,
  CheckCircle2,
  Eye,
  Gamepad2,
  PartyPopper,
  Pause,
  Pencil,
  Settings2,
  SlidersHorizontal,
  Target,
  Undo2,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  desfazerRevisao,
  type EstadoAntesDaNota,
  fetchDeck,
  reviewCard,
  salvarRodada,
  updateCard,
} from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { ActiveProductionExercise, similarityPercentage, stabilityThreshold } from '../../lib/exercicios';
import { t } from '../../lib/i18n';
import { ganho } from '../../lib/juice';
import { classesDaPalavra } from '../../lib/pelesDeCartao';
import { type AgeProfileType, copyDoPerfil, showsPowerUserAffordances } from '../../lib/profile';
import { recompensasV2Ligadas } from '../../lib/recompensasV2';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { speak as ttsSpeak } from '../../lib/tts';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { ExerciseKind, Recording, SchedulerType, VocabCard } from '../../types';
import CommandPalette, { useCommandPalette } from '../CommandPalette';
import FraseComLacuna from '../FraseComLacuna';
import ResumoDaPratica from '../progress/ResumoDaPratica';
import { toast } from '../Toast';
import { CabecalhoDeTela, fecharDialogoDe, IconeEmBloco, Tela } from '../ui';
import Dialogo, { CampoLinha, Interruptor, Segmentos } from './vocab/Dialogo';
import GavetaDaPalavra from './vocab/GavetaDaPalavra';

/**
 * REVISÃO — a tela `T.revisao` do protótipo aprovado (`docs/prototipos/consistencia-telas.html`).
 *
 * `/revisar` é "Revisar agora" em todo o app, então a tela ABRE NA RODADA: o cartão (`.cartao.flash`),
 * "Mostrar resposta" (ou Espaço) e as quatro notas do FSRS (`.fsrs`, teclas 1–4), com as ações do
 * cartão embaixo (`.rev-ferr`) e as opções num diálogo. No fim, o resumo da rodada (`.fim-rev`).
 *
 * O agendamento é o do SERVIDOR (`POST /api/vocab/:id/review`, FSRS-5); os intervalos escritos em
 * cada nota são a MESMA conta (`Fsrs5Strategy`, do núcleo que o servidor usa) aplicada ao estado
 * real do cartão — não números de enfeite.
 */

interface StudyProps {
  recording?: Recording;
  /** Frases REAIS da sessão, já normalizadas (`src/lib/sentences.ts`). */
  sentences?: Sentence[];
  onChangeView?: (view: string, data?: any) => void;
  /** Trecho que o usuário mandou praticar (menu de contexto / Analista de Vocabulário). */
  practiceSeed?: PracticeSeed | null;
  /** Avisa o App que a semente foi consumida (para não reabrir o exercício ao voltar). */
  onSeedConsumed?: () => void;
  /** Perfil de exibição — decide a linguagem dos exercícios. */
  ageProfile?: AgeProfileType;
}

/** O tipo de cartão (Opções da revisão). O padrão, por decisão do dono, é "Lembrar". */
type TipoDeCartao = 'lembrar' | 'digitar' | 'escolha';
type OrdemDaRodada = 'vencidas' | 'misturar';
const CHAVE_TIPO = 'revisao.tipoDeCartao';
const CHAVE_OUVIR = 'revisao.ouvirAoMostrar';
const CHAVE_NOVAS = 'revisao.novasPorDia';
const CHAVE_REVISOES = 'revisao.revisoesPorDia';
const CHAVE_ORDEM = 'revisao.ordem';
const CHAVE_RETENCAO = 'revisao.metaDeRetencao';
const PADRAO = {
  novas: 20,
  revisoes: 200,
  ordem: 'vencidas' as OrdemDaRodada,
  tipo: 'lembrar' as TipoDeCartao,
  ouvir: true,
  retencao: 90,
};
const numeroEntre = (v: string | null, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : padrao;
};

function lerPreferencia(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarPreferencia(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: a escolha vale só nesta abertura */
  }
}

/** O estado do agendador que o cartão tem AGORA — o que o "Desfazer" devolve depois da nota. */
function estadoDoCartao(card: VocabCard): EstadoAntesDaNota {
  const extra = card as VocabCard & { difficulty?: number | null; lapses?: number | null };
  return {
    box: card.leitnerBox ?? 1,
    dueAt: card.dueAtMs ?? Date.now(),
    stability: card.lastReview ? (card.stability ?? null) : null,
    difficulty: card.lastReview ? (extra.difficulty ?? card.fsrsDifficulty ?? null) : null,
    reps: card.reps ?? null,
    lapses: extra.lapses ?? null,
    lastReview: card.lastReview ?? null,
  };
}

/** "3,5 d", "agora" — o intervalo que o FSRS dá a esta nota, a partir do estado real do cartão. */
function intervaloDaNota(card: VocabCard, grade: Grade, agora: number, retencao: number): string {
  const extra = card as VocabCard & { difficulty?: number | null; lapses?: number | null };
  const proximo = makeFsrs5(undefined, retencao / 100).review(
    {
      box: card.leitnerBox ?? 1,
      dueAt: card.dueAtMs ?? agora,
      stability: card.lastReview ? card.stability : undefined,
      difficulty: card.lastReview ? (extra.difficulty ?? card.fsrsDifficulty) : undefined,
      reps: card.reps,
      lapses: extra.lapses ?? undefined,
      lastReview: card.lastReview,
    },
    grade,
    agora,
  );
  const dias = (proximo.dueAt - agora) / 86_400_000;
  if (dias < 1 / 24) return 'agora';
  if (dias < 30) return `${String(Math.round(dias * 10) / 10).replace('.', ',')} d`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? '1 mês' : `${meses} meses`;
}

/** "B1 · Sessão" — o que o cartão declara de nível e procedência. */
function seloDoCartao(card: VocabCard): string {
  const origem = card.daTrilha ? 'Trilha' : card.daAnki ? 'Anki' : card.sourceSessionId ? 'Sessão' : '';
  return [card.cefrLevel ?? 'sem nível', origem].filter(Boolean).join(' · ');
}

export default function Study({
  recording,
  onChangeView,
  practiceSeed = null,
  onSeedConsumed,
  ageProfile = 'pro',
}: StudyProps = {}) {
  /** Quest com as telas novas (maquete de 01/10/2026, tela 8): o mesmo cartão, só que lido de longe. */
  const questNovo = useQuestNovo();
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  /**
   * O deck é ASSÍNCRONO (vem do servidor). Sem esta flag, uma semente `review` chegando junto com a
   * montagem da tela montaria a fila de revisão com o deck ainda vazio.
   */
  const [deckLoaded, setDeckLoaded] = useState(false);

  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => setVocabCards([]))
      .finally(() => setDeckLoaded(true));
  }, []);

  /**
   * Cartões do contexto ativo (a sessão em foco, ou o baralho inteiro). MEMOIZADO: com a identidade
   * estável a lista pode ser dependência dos hooks abaixo sem invalidá-los a cada render — foi a
   * falta disso que já fez a fila ser montada com os cartões de antes da última avaliação.
   */
  const activeVocabCards = useMemo(
    () => (recording ? vocabCards.filter((c) => c.sourceSessionId === recording.id) : vocabCards),
    [vocabCards, recording],
  );
  const [scheduler] = useState<SchedulerType>('fsrs');

  /**
   * O XP QUE A REVISÃO CREDITA DE VERDADE: `PESOS_XP` do núcleo, a mesma conta que o servidor faz
   * sobre `review_logs` (`revisao` por nota, mais `revisaoCerta` quando a nota é Bom ou Fácil,
   * `grade >= 3` em `metrics.ts`). O "+10 XP" fixo do protótipo seria um número inventado.
   */
  const xpDaNota = (nota: number) => ganhoDaNota(nota).xp;

  // Review Session State
  const [reviewing, setReviewing] = useState(false);
  const [reviewCards, setReviewCards] = useState<VocabCard[]>([]);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  /** As notas dadas nesta rodada (a nota efetiva, a que foi ao servidor) — base do "Acerto". */
  const [notasDaRodada, setNotasDaRodada] = useState<number[]>([]);
  const [inicioDaRodada, setInicioDaRodada] = useState(0);
  const [fimDaRodada, setFimDaRodada] = useState(0);
  /** O usuário encerrou a rodada sem navegar: não reabrir sozinha. */
  const [encerrada, setEncerrada] = useState(false);

  const [llmValidation] = useState<boolean>(() => {
    return lerPreferencia('practice.activeProduction.llmValidation') === 'true';
  });

  const [isActiveProductionOnly, setIsActiveProductionOnly] = useState(false);

  // Opções da revisão (diálogo do protótipo) — preferências locais, valem para as próximas rodadas.
  const [tipo, setTipo] = useState<TipoDeCartao>(() => {
    const v = lerPreferencia(CHAVE_TIPO);
    return v === 'digitar' || v === 'escolha' ? v : 'lembrar';
  });
  const [ouvirAoMostrar, setOuvirAoMostrar] = useState<boolean>(() => lerPreferencia(CHAVE_OUVIR) !== 'false');
  const [novasPorDia, setNovasPorDia] = useState(() => numeroEntre(lerPreferencia(CHAVE_NOVAS), 0, 200, PADRAO.novas));
  const [revisoesPorDia, setRevisoesPorDia] = useState(() =>
    numeroEntre(lerPreferencia(CHAVE_REVISOES), 10, 999, PADRAO.revisoes),
  );
  const [ordem, setOrdem] = useState<OrdemDaRodada>(() =>
    lerPreferencia(CHAVE_ORDEM) === 'misturar' ? 'misturar' : 'vencidas',
  );
  const [retencao, setRetencao] = useState(() => numeroEntre(lerPreferencia(CHAVE_RETENCAO), 80, 97, PADRAO.retencao));
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  const [editando, setEditando] = useState<VocabCard | null>(null);
  /** As notas desta rodada, com o estado de ANTES de cada uma — o "Desfazer" (Z) volta uma a uma. */
  const [historico, setHistorico] = useState<
    Array<{ card: VocabCard; antes: EstadoAntesDaNota; indice: number; xp: number; nota: number; aceita: boolean }>
  >([]);

  // States for interactive typing/mc exercises within review session
  const [typingAttempt, setTypingAttempt] = useState('');
  const [typingVerified, setTypingVerified] = useState(false);
  const [typingCorrect, setTypingCorrect] = useState(false);

  // Reset exercise states when card changes
  useEffect(() => {
    setTypingAttempt('');
    setTypingVerified(false);
    setTypingCorrect(false);
  }, [currentReviewIndex, tipo]);

  // C12 — config de idioma e o par do baralho vêm de `lib/useExameDePalavra`, o mesmo leitor da
  // tela de Vocabulário (a votação do par usa o recorte em estudo aqui).
  const exame = useExameDePalavra(vocabCards, activeVocabCards);
  const { deckLangPair, cardFor, langPairOf } = exame;
  /** Idioma ESTUDADO — o `src` do par do baralho, fallback da voz. */
  const studyLang = deckLangPair.src;

  // TTS de uma palavra do deck: idioma REAL do cartão (`srcLang`), com fallback para o estudado.
  const playWordTTS = (word?: string) => {
    if (!word) return;
    const lang = langPairOf(cardFor(word)).src || studyLang;
    ttsSpeak(word, { lang, rate: 0.9 });
  };

  /**
   * Revisão: manda a nota para o servidor e adota o cartão que ele devolve. O FSRS roda SÓ no
   * servidor — a aproximação local que já existiu aqui mostrava um agendamento que não era o do deck.
   */
  const handleFsrsFeedback = async (
    cardId: string,
    rating: 1 | 2 | 3 | 4,
    exerciseKind?: ExerciseKind,
    /** De onde o "+N XP" sobe (o botão da nota, como no protótipo). */
    origem?: Element | null,
  ) => {
    let effectiveRating = rating;
    if (exerciseKind === 'active-production' && rating === 3) {
      effectiveRating = 4; // produção ativa é mais difícil: um acerto vale Easy
    }
    setNotasDaRodada((prev) => [...prev, effectiveRating]);
    const antes = vocabCards.find((c) => c.id === cardId);
    const indice = currentReviewIndex;
    /* O retângulo é lido ANTES do await: depois dele o cartão já pode ter trocado. */
    const rect = (origem ?? document.querySelector('.flash'))?.getBoundingClientRect();
    let xp = 0;
    let aceita = false;
    try {
      const updated = await reviewCard(cardId, effectiveRating, retencao / 100);
      setVocabCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      // Só depois de o servidor gravar: o XP que sobe é o que de fato entrou na conta.
      xp = xpDaNota(effectiveRating);
      aceita = true;
      if (rect) ganho(rect, `+${xp} XP`);
    } catch {
      // Offline/erro: não inventamos um agendamento novo. O cartão fica como está.
    }
    if (antes)
      setHistorico((h) => [
        ...h,
        { card: antes, antes: estadoDoCartao(antes), indice, xp, nota: effectiveRating, aceita },
      ]);

    /* PELO MESMO FUNIL DOS JOGOS (auditoria de 2026-09-07, achado A53): uma revisão vira uma rodada
       de um item em `/rodada`, com `roundId` — uma porta só para o mesmo dado. */
    void salvarRodada({
      roundId: `study-${cardId}-${Date.now()}`,
      exerciseKind,
      origem: recording?.id ? `sessao:${recording.id}` : 'estudo',
      sessionId: recording?.id,
      itens: [{ cardId, correct: effectiveRating > 1 ? 1 : 0, kind: 'srs' }],
    });

    triggerNextCard();
  };

  // Leitner feedback algorithm
  const handleLeitnerFeedback = (cardId: string, success: boolean, _exerciseKind?: ExerciseKind) => {
    setNotasDaRodada((prev) => [...prev, success ? 3 : 1]);
    setVocabCards((prev) =>
      prev.map((card) => {
        if (card.id !== cardId) return card;
        const nextBox = success ? Math.min(5, card.leitnerBox + 1) : 1;
        let dueStr = 'hoje';
        if (nextBox === 2) dueStr = 'Amanhã';
        else if (nextBox === 3) dueStr = 'Em 3 dias';
        else if (nextBox === 4) dueStr = 'Em 7 dias';
        else if (nextBox === 5) dueStr = 'Em 14 dias';
        return { ...card, leitnerBox: nextBox, leitnerDueAt: dueStr };
      }),
    );
    // Persiste a revisão no backend (mapeia sucesso→grade FSRS).
    reviewCard(cardId, success ? 3 : 1).catch(() => {});
    triggerNextCard();
  };

  const concluir = () => {
    setSessionCompleted(true);
    setFimDaRodada(Date.now());
  };

  // Move forward in the flashcard queue
  const triggerNextCard = () => {
    setShowAnswer(false);
    if (currentReviewIndex + 1 < reviewCards.length) {
      setCurrentReviewIndex((prev) => prev + 1);
    } else {
      concluir();
    }
  };

  const abrirRodada = (fila: VocabCard[], producaoAtiva: boolean) => {
    setReviewCards(fila);
    setCurrentReviewIndex(0);
    setShowAnswer(false);
    setSessionCompleted(false);
    setIsActiveProductionOnly(producaoAtiva);
    setNotasDaRodada([]);
    setHistorico([]);
    setInicioDaRodada(Date.now());
    setFimDaRodada(0);
    setEncerrada(false);
    setReviewing(true);
  };

  /* `useCallback`: vai empacotada no catálogo da paleta ⌘K (um `useMemo`). Sem identidade que mude
     junto com `activeVocabCards`, a paleta guardaria uma closure com os cartões de antes. */
  const startReviewSession = useCallback(() => {
    /* Os VENCIDOS primeiro, pela data real (`isDueNow`). A comparação antiga era com a string
       'hoje', que a API nunca grava — a fila nunca achava vencido e caía sempre no baralho inteiro. */
    const noBaralho = activeVocabCards.filter((c) => c.inDeck);
    const due = noBaralho.filter((c) => isDueNow(c, scheduler));
    const base = due.length > 0 ? due : noBaralho;
    /* OPÇÕES DA REVISÃO: no máximo N novas (nunca vistas) e M revisões por rodada; "Vencidas
       primeiro" põe as de vencimento mais antigo na frente, "Misturar" embaralha. */
    const novas = base.filter((c) => c.fsrsState === 'New').slice(0, novasPorDia);
    const revisoes = base.filter((c) => c.fsrsState !== 'New').slice(0, revisoesPorDia);
    let fila =
      ordem === 'misturar'
        ? [...revisoes, ...novas].sort(() => Math.random() - 0.5)
        : [...revisoes.sort((a, b) => (a.dueAtMs ?? 0) - (b.dueAtMs ?? 0)), ...novas];
    if (!fila.length) fila = base.slice(0, Math.max(1, revisoesPorDia));
    if (fila.length > 0) abrirRodada(fila, false);
  }, [activeVocabCards, scheduler, novasPorDia, revisoesPorDia, ordem]);

  /** Revisão FOCADA numa palavra — o "Revisar agora" do Analista de Vocabulário, via semente. */
  const startReviewSessionFor = (card: VocabCard) => abrirRodada([card], false);

  const startActiveProductionSession = useCallback(() => {
    const threshold = stabilityThreshold();
    const eligible = activeVocabCards.filter((c) => c.inDeck && (c.stability ?? c.fsrsStability ?? 0) >= threshold);
    if (eligible.length > 0) abrirRodada(eligible, true);
  }, [activeVocabCards]);

  /* Prioridade 1: enquanto esta tela está montada, o ⌘K busca EXERCÍCIO, não gravação. */
  const [paletteOpen, setPaletteOpen] = useCommandPalette(true, 1);

  const deckSize = activeVocabCards.filter((c) => c.inDeck).length;
  /** Cartões REALMENTE vencidos agora (`countDue` parseia a data real). */
  const dueCount = countDue(activeVocabCards, scheduler);
  /** Cartões elegíveis a Produção Ativa — o gate real por estabilidade. */
  const producibleCount = activeVocabCards.filter(
    (c) => c.inDeck && (c.stability ?? c.fsrsStability ?? 0) >= stabilityThreshold(),
  ).length;
  const bloqueioDaProducao =
    producibleCount === 0 ? copyDoPerfil('block.notMature', ageProfile, { n: stabilityThreshold() }) : undefined;

  /** O catálogo da paleta ⌘K: os dois exercícios desta tela. */
  const EXERCISES = useMemo(
    () => [
      {
        id: 'review',
        label: copyDoPerfil('ex.review', ageProfile),
        hint:
          dueCount > 0
            ? copyDoPerfil('ex.review.hint.due', ageProfile, { n: dueCount })
            : copyDoPerfil('ex.review.hint.deck', ageProfile, { n: deckSize }),
        keywords: 'srs fsrs leitner flashcard revisar memorizar treino memoria',
        icon: <Zap className="w-4 h-4" />,
        disabledReason: deckSize === 0 ? copyDoPerfil('block.emptyDeck', ageProfile) : undefined,
        run: startReviewSession,
      },
      {
        id: 'active_production',
        label: copyDoPerfil('ex.active_production', ageProfile),
        hint: copyDoPerfil('ex.active_production.hint', ageProfile, { n: producibleCount }),
        keywords: 'producao ativa escrever recall',
        icon: <Brain className="w-4 h-4" />,
        disabledReason: bloqueioDaProducao,
        run: startActiveProductionSession,
      },
    ],
    [
      dueCount,
      deckSize,
      producibleCount,
      ageProfile,
      startReviewSession,
      startActiveProductionSession,
      bloqueioDaProducao,
    ],
  );

  /**
   * SEMENTE → abre o exercício pedido, já com o conteúdo. Só trata o que mora aqui (revisão e
   * produção ativa); semente de jogo que chegasse por engano é ignorada de propósito.
   */
  useEffect(() => {
    if (!practiceSeed?.exercise) return;
    const target = practiceSeed.exercise;
    if (target !== 'review' && target !== 'active_production') return;
    if (!deckLoaded) return;
    if (target === 'review') {
      const seedWord = practiceSeed.word;
      const card = seedWord
        ? vocabCards.find((c) => c.word.toLowerCase() === seedWord.toLowerCase() && c.inDeck)
        : undefined;
      if (card) startReviewSessionFor(card);
      else startReviewSession();
    } else {
      startActiveProductionSession();
    }
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceSeed, deckLoaded, vocabCards]);

  /* `/revisar` É o "Revisar agora": com o deck carregado e sem semente pendente, a rodada abre
     sozinha — a tela do protótipo é o cartão, não um menu antes dele. */
  useEffect(() => {
    if (!deckLoaded || reviewing || sessionCompleted || encerrada) return;
    if (practiceSeed?.exercise === 'review' || practiceSeed?.exercise === 'active_production') return;
    startReviewSession();
  }, [deckLoaded, reviewing, sessionCompleted, encerrada, practiceSeed, startReviewSession]);

  const currentCard: VocabCard | undefined = reviewCards[currentReviewIndex];
  const format = isActiveProductionOnly
    ? 'active-production'
    : !currentCard
      ? 'cloze'
      : tipo === 'digitar'
        ? 'typing'
        : tipo === 'escolha'
          ? 'mc'
          : 'cloze';

  const mostrarResposta = () => {
    setShowAnswer(true);
    if (ouvirAoMostrar) playWordTTS(currentCard?.word);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.flash .fsrs button')?.focus());
  };

  /** Desfaz a última nota: o cartão volta ao estado de antes (no servidor) e à frente da fila. */
  const desfazer = async () => {
    const ultimo = historico[historico.length - 1];
    if (!ultimo) return;
    try {
      const volta = await desfazerRevisao(ultimo.card.id, ultimo.antes);
      setVocabCards((prev) => prev.map((c) => (c.id === volta.id ? volta : c)));
    } catch (e) {
      toast.error('Não deu para desfazer a última resposta.', { detail: e });
      return;
    }
    setHistorico((h) => h.slice(0, -1));
    setNotasDaRodada((n) => n.slice(0, -1));
    setSessionCompleted(false);
    setReviewing(true);
    setCurrentReviewIndex(ultimo.indice);
    setShowAnswer(true);
    toast.ok('Última resposta desfeita');
  };

  /** Alternativas da múltipla escolha — sorteadas UMA vez por cartão, não a cada render. */
  const alternativas = useMemo(() => {
    if (!currentCard) return [];
    const outras = vocabCards
      .filter((c) => c.id !== currentCard.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map((c) => c.word);
    return [currentCard.word, ...outras].sort(() => 0.5 - Math.random());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCard?.id]);

  // Teclado do protótipo: Espaço mostra a resposta, 1–4 dão a nota.
  useEffect(() => {
    if (!reviewing || sessionCompleted || format !== 'cloze' || !currentCard) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
      if (document.querySelector('dialog[open]')) return;
      if (!showAnswer && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        mostrarResposta();
        return;
      }
      if (showAnswer && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const nota = Number(e.key) as 1 | 2 | 3 | 4;
        void handleFsrsFeedback(
          currentCard.id,
          nota,
          undefined,
          document.querySelectorAll('.flash .fsrs button')[nota - 1] ?? null,
        );
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });
  // Z desfaz a última resposta — também na tela de fim de rodada.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
      if (document.querySelector('dialog[open]')) return;
      if ((e.key === 'z' || e.key === 'Z') && !e.ctrlKey && !e.metaKey && historico.length) {
        e.preventDefault();
        void desfazer();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  /** Suspender = tirar do baralho (`inDeck: false`) sem apagar; sai desta rodada na hora. */
  const suspender = async (card: VocabCard) => {
    try {
      const atualizado = await updateCard(card.id, { inDeck: false });
      setVocabCards((prev) => prev.map((c) => (c.id === card.id ? atualizado : c)));
    } catch (e) {
      toast.error('Não consegui suspender a palavra.', { detail: e });
      return;
    }
    const resto = reviewCards.filter((c) => c.id !== card.id);
    setReviewCards(resto);
    setShowAnswer(false);
    if (currentReviewIndex >= resto.length) {
      if (resto.length) setCurrentReviewIndex(resto.length - 1);
      concluir();
    }
    toast.ok(`“${card.word}” suspensa e tirada desta rodada.`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          void updateCard(card.id, { inDeck: true })
            .then((c) => {
              setVocabCards((prev) => prev.map((x) => (x.id === c.id ? c : x)));
              setReviewCards((prev) => [...prev, c]);
              setSessionCompleted(false);
              toast.ok(`“${card.word}” volta para a revisão`);
            })
            .catch((e) => toast.error('Não consegui reativar a palavra.', { detail: e }));
        },
      },
    });
  };

  const voltarAoVocabulario = () => onChangeView?.('metrics');
  const tituloDaRevisao = copyDoPerfil('now.due.cta', ageProfile);

  const paleta = (
    <CommandPalette
      open={paletteOpen && showsPowerUserAffordances(ageProfile)}
      onClose={() => setPaletteOpen(false)}
      commands={EXERCISES.map((ex) => ({
        id: ex.id,
        label: ex.label,
        hint: ex.hint,
        icon: ex.icon,
        keywords: ex.keywords,
        disabledReason: ex.disabledReason,
        run: ex.run,
      }))}
    />
  );

  const dialogos = (
    <>
      {opcoesAbertas && (
        <OpcoesDaRevisao
          valores={{ novas: novasPorDia, revisoes: revisoesPorDia, ordem, tipo, ouvir: ouvirAoMostrar, retencao }}
          aoTrocar={(v) => {
            if (v.novas !== undefined) {
              setNovasPorDia(v.novas);
              gravarPreferencia(CHAVE_NOVAS, String(v.novas));
            }
            if (v.revisoes !== undefined) {
              setRevisoesPorDia(v.revisoes);
              gravarPreferencia(CHAVE_REVISOES, String(v.revisoes));
            }
            if (v.ordem !== undefined) {
              setOrdem(v.ordem);
              gravarPreferencia(CHAVE_ORDEM, v.ordem);
            }
            if (v.tipo !== undefined) {
              setTipo(v.tipo);
              gravarPreferencia(CHAVE_TIPO, v.tipo);
            }
            if (v.ouvir !== undefined) {
              setOuvirAoMostrar(v.ouvir);
              gravarPreferencia(CHAVE_OUVIR, String(v.ouvir));
            }
            if (v.retencao !== undefined) {
              setRetencao(v.retencao);
              gravarPreferencia(CHAVE_RETENCAO, String(v.retencao));
            }
          }}
          aoFechar={() => setOpcoesAbertas(false)}
        />
      )}
      {editando && (
        <GavetaDaPalavra
          key={editando.id}
          cartao={vocabCards.find((c) => c.id === editando.id) ?? editando}
          gravacoes={recording ? [recording] : []}
          editando
          velocidade={exame.velocidade}
          aoTrocarVelocidade={exame.setVelocidade}
          aoFalar={playWordTTS}
          aoFechar={() => setEditando(null)}
          aoMudar={(novo) => {
            setVocabCards((prev) => prev.map((c) => (c.id === novo.id ? novo : c)));
            setReviewCards((prev) => prev.map((c) => (c.id === novo.id ? novo : c)));
          }}
          aoExcluir={(c) => {
            void suspender(c);
          }}
          aoExercitar={(c) => onChangeView?.('play', { seed: { exercise: 'memory', word: c.word, lang: c.srcLang } })}
          aoRevisar={() => setEditando(null)}
        />
      )}
    </>
  );

  // ── Carregando ─────────────────────────────────────────────────────────────
  if (!deckLoaded) {
    return (
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
          sobrancelha="Revisão"
          icone={Target}
          titulo={tituloDaRevisao}
        />
        <p className="mut" aria-busy>
          Carregando o seu baralho…
        </p>
      </Tela>
    );
  }

  // ── Baralho vazio: o estado que ensina de onde as palavras vêm ─────────────
  if (deckSize === 0) {
    return (
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
          sobrancelha="Revisão"
          icone={Target}
          titulo={tituloDaRevisao}
        />
        <section className="cartao">
          <div className="vazio">
            <IconeEmBloco icone={Brain} />
            <h3>{copyDoPerfil('block.emptyDeck', ageProfile)}</h3>
            <p>
              Clique numa palavra em qualquer transcrição, ou selecione um trecho e use o botão direito, para mandá-la
              ao deck. A revisão espaçada aparece aqui assim que houver cartões.
            </p>
            {onChangeView && (
              <button type="button" className="btn btn-solid" onClick={() => onChangeView('capture')}>
                Capturar uma sessão
              </button>
            )}
          </div>
        </section>
        {paleta}
      </Tela>
    );
  }

  // ── Fim da rodada ──────────────────────────────────────────────────────────
  if (sessionCompleted) {
    const feitas = notasDaRodada.length;
    const acertos = notasDaRodada.filter((n) => n > 1).length;
    const seg = inicioDaRodada && fimDaRodada ? Math.round((fimDaRodada - inicioDaRodada) / 1000) : 0;
    /* O QUE FOI CREDITADO, pela mesma conta do perfil (`ganhoDaRevisao`, core): só as notas que o
       servidor aceitou. XP e Seeds do resumo são os que entraram na conta (spec 10.2). */
    const creditado = ganhoDaRevisao(historico.filter((h) => h.aceita).map((h) => h.nota));
    const xp = creditado.xp;
    const v2 = recompensasV2Ligadas();
    /* Quando abre a próxima rodada: o vencimento mais próximo e quantas vencem naquele dia. */
    const proxima = (() => {
      const dues = activeVocabCards.filter((c) => c.inDeck && c.dueAtMs).map((c) => c.dueAtMs as number);
      if (!dues.length) return null;
      const d = Math.min(...dues);
      const fimDoDia = new Date(d);
      fimDoDia.setHours(24, 0, 0, 0);
      const amanha = new Date();
      amanha.setHours(24, 0, 0, 0);
      const dias = Math.round((fimDoDia.getTime() - amanha.getTime()) / 86_400_000);
      const quando = d < amanha.getTime() ? 'ainda hoje' : dias <= 1 ? 'amanhã' : `em ${dias} dias`;
      return { quando, n: dues.filter((x) => x < fimDoDia.getTime()).length };
    })();
    return (
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
          sobrancelha="Revisão"
          icone={Target}
          titulo="Rodada concluída"
          sub={`${feitas === 1 ? 'A palavra foi revisada' : `As ${feitas} palavras foram revisadas`}.${proxima ? ` A próxima rodada abre ${proxima.quando}.` : ''}`}
        />
        <section className="cartao p6 fim-rev entra">
          <div className="vazio" style={{ padding: '12px 0 20px' }}>
            <IconeEmBloco icone={PartyPopper} />
            <h3>Você fechou a rodada</h3>
            <p>
              {dueCount > 0
                ? `Ainda ${dueCount === 1 ? 'vence 1 palavra' : `vencem ${dueCount} palavras`} agora.`
                : proxima
                  ? `A próxima abre ${proxima.quando} com ${proxima.n} palavra${proxima.n === 1 ? '' : 's'}.`
                  : 'Nada mais vence agora.'}
            </p>
          </div>
          <div className="ladrilhos">
            <div className="cartao ladrilho">
              <span className="label-mono">Revisões</span>
              <span className="v">{feitas}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Acerto</span>
              <span className="v good">{feitas ? `${Math.round((acertos / feitas) * 100)}%` : '—'}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">Tempo</span>
              <span className="v">{seg ? `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}` : '—'}</span>
            </div>
            <div className="cartao ladrilho">
              <span className="label-mono">XP</span>
              <span className="v acc">+{xp}</span>
            </div>
            {v2 && (
              <div className="cartao ladrilho" data-seeds-da-revisao={creditado.seeds}>
                <span className="label-mono">Seeds</span>
                <span className="v good">+{creditado.seeds}</span>
              </div>
            )}
          </div>
          {/* Recompensas v2: as missões do dia e a ofensiva, lidas do servidor depois da rodada. */}
          {v2 && <ResumoDaPratica />}
          <div className="linha" style={{ gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-solid" onClick={() => onChangeView?.('play')}>
              <Gamepad2 aria-hidden /> Jogar com as mesmas
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onChangeView?.('estatisticas')}>
              <ChartColumn aria-hidden /> Ver estatísticas
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onChangeView?.('hub')}>
              Voltar ao início
            </button>
          </div>
        </section>
        {paleta}
      </Tela>
    );
  }

  // ── Fora de uma rodada (encerrada sem sair da tela) ────────────────────────
  if (!reviewing || !currentCard) {
    return (
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
          sobrancelha="Revisão"
          icone={Target}
          titulo={tituloDaRevisao}
          acoes={
            <button
              type="button"
              className="btn btn-outline peq icone"
              aria-label="Opções da revisão"
              onClick={() => setOpcoesAbertas(true)}
            >
              <Settings2 aria-hidden />
            </button>
          }
        />
        <section className="cartao faixa-rev">
          <span className="contador">{dueCount || deckSize}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800 }}>
              {dueCount > 0
                ? copyDoPerfil('now.due.title', ageProfile, { n: dueCount })
                : copyDoPerfil('now.clear.title', ageProfile)}
            </h2>
            <p className="mut" style={{ fontSize: 13 }}>
              {copyDoPerfil('now.due.sub', ageProfile, { sched: scheduler === 'fsrs' ? 'FSRS-5' : 'Leitner' })}
            </p>
          </div>
          <button type="button" className="btn btn-solid" onClick={startReviewSession}>
            <Target aria-hidden /> {tituloDaRevisao}
          </button>
        </section>
        {dialogos}
        {paleta}
      </Tela>
    );
  }

  // ── A rodada ───────────────────────────────────────────────────────────────
  const agora = Date.now();
  const notas: Array<[1 | 2 | 3 | 4, string, string]> = [
    [1, 'e', 'Errei'],
    [2, 'd', 'Difícil'],
    [3, 'b', 'Bom'],
    [4, 'f', 'Fácil'],
  ];
  const avancar = (kind: ExerciseKind, origem?: Element | null) => {
    if (scheduler === 'fsrs') void handleFsrsFeedback(currentCard.id, typingCorrect ? 3 : 1, kind, origem);
    else handleLeitnerFeedback(currentCard.id, typingCorrect, kind);
  };
  const verificarDigitacao = () => {
    const score = similarityPercentage(
      format === 'typing' ? currentCard.translation || '' : currentCard.word,
      typingAttempt,
    );
    setTypingCorrect(score >= 0.85);
    setTypingVerified(true);
  };
  const resultado = (certo: boolean, texto: React.ReactNode) => (
    <div className="resp">
      <p style={{ fontWeight: 700, color: certo ? 'var(--good-ink)' : 'var(--error-ink)' }}>
        {certo && <CheckCircle2 style={{ display: 'inline', width: 16, height: 16, verticalAlign: -3 }} aria-hidden />}{' '}
        {texto}
      </p>
      <button
        type="button"
        className="btn btn-solid"
        style={{ marginTop: 14, minWidth: 220 }}
        onClick={(e) => avancar(format === 'mc' ? 'mc' : 'typing', e.currentTarget)}
      >
        Avançar
      </button>
    </div>
  );

  /* A frase só diz de onde veio quando a palavra saiu DESTA sessão gravada (maquete do Quest). */
  const origemDaFrase =
    questNovo && recording && currentCard.sourceSessionId === recording.id ? (
      <span className="rev-origem"> · {recording.title}</span>
    ) : null;

  return (
    <Tela largura="larga" className="rev-rodada">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
        sobrancelha={questNovo ? t('Revisão de hoje') : `Revisão · ${currentReviewIndex + 1} de ${reviewCards.length}`}
        icone={Target}
        titulo={isActiveProductionOnly ? copyDoPerfil('ex.active_production', ageProfile) : tituloDaRevisao}
        sub="Tente lembrar a tradução antes de mostrar a resposta. Depois diga o quanto foi fácil."
        acoes={
          <>
            <button
              type="button"
              className="btn btn-outline peq icone"
              aria-label="Opções da revisão"
              onClick={() => setOpcoesAbertas(true)}
            >
              <Settings2 aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-outline peq"
              onClick={() => {
                setReviewing(false);
                setEncerrada(true);
                if (onChangeView) voltarAoVocabulario();
              }}
            >
              <X aria-hidden /> Encerrar
            </button>
            <div
              className="barra"
              style={{ width: 160 }}
              role="progressbar"
              aria-label="Progresso da rodada"
              aria-valuenow={currentReviewIndex}
              aria-valuemin={0}
              aria-valuemax={reviewCards.length}
            >
              <span style={{ width: `${(currentReviewIndex / reviewCards.length) * 100}%` }} />
            </div>
            {questNovo && (
              <span className="rev-conta">
                {currentReviewIndex + 1} / {reviewCards.length}
              </span>
            )}
          </>
        }
      />

      {/* A PELE DE CARTÃO equipada (onda 4): a moldura diz se a palavra é nova, aprendida ou
          dominada — pela fase do FSRS que o cartão já carrega. */}
      <section className={`cartao flash ${classesDaPalavra(currentCard)}`}>
        <span className="badge neu">{seloDoCartao(currentCard)}</span>

        {format === 'active-production' ? (
          <div style={{ marginTop: 14, textAlign: 'left' }}>
            <ActiveProductionExercise
              card={currentCard}
              llmValidationEnabled={llmValidation}
              playTTS={playWordTTS}
              onVerify={(res: any) => {
                (currentCard as any)._lastResult = res;
              }}
              onNext={() => {
                const res = (currentCard as any)._lastResult || { correct: false };
                if (scheduler === 'fsrs')
                  void handleFsrsFeedback(currentCard.id, res.correct ? 3 : 1, 'active-production');
                else handleLeitnerFeedback(currentCard.id, res.correct, 'active-production');
              }}
            />
          </div>
        ) : format === 'typing' ? (
          <>
            <div className="termo" style={{ marginTop: 14 }}>
              {currentCard.word}
            </div>
            {currentCard.sentence && (
              <p className="exemplo">
                “{currentCard.sentence}”{origemDaFrase}
              </p>
            )}
            {!typingVerified ? (
              <div className="resp" style={{ border: 0, paddingTop: 0 }}>
                <label className="sr" htmlFor="rev-digitar">
                  Digite a tradução
                </label>
                <input
                  id="rev-digitar"
                  type="text"
                  className="campo"
                  style={{ textAlign: 'center', maxWidth: 320, margin: '0 auto' }}
                  value={typingAttempt}
                  onChange={(e) => setTypingAttempt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && typingAttempt.trim()) verificarDigitacao();
                  }}
                  placeholder="Digite a tradução…"
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-solid"
                  style={{ marginTop: 12, minWidth: 220 }}
                  disabled={!typingAttempt.trim()}
                  onClick={verificarDigitacao}
                >
                  Verificar
                </button>
              </div>
            ) : (
              resultado(
                typingCorrect,
                typingCorrect ? (
                  <>Correto! A tradução era “{currentCard.translation}”</>
                ) : (
                  <>
                    Incorreto. A tradução era “<b style={{ font: 'inherit' }}>{currentCard.translation || '—'}</b>”
                    (você escreveu “{typingAttempt}”)
                  </>
                ),
              )
            )}
          </>
        ) : format === 'mc' ? (
          <>
            <FraseComLacuna sentence={currentCard.sentence} word={currentCard.word} />
            <p className="exemplo">{currentCard.translation}</p>
            {!typingVerified ? (
              <div className="fsrs" role="group" aria-label="Qual palavra completa a frase">
                {alternativas.map((option, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const isCorrect = option.toLowerCase() === currentCard.word.toLowerCase();
                      setTypingCorrect(isCorrect);
                      setTypingAttempt(option);
                      setTypingVerified(true);
                      // Persiste o resultado do exercício (best-effort) → alimenta métricas.
                      void salvarRodada({
                        roundId: `study-mc-${currentCard.id}-${Date.now()}`,
                        exerciseKind: 'multiple-choice',
                        origem: 'estudo',
                        sessionId: currentCard.sourceSessionId,
                        score: isCorrect ? 1 : 0,
                        itens: [{ cardId: currentCard.id, correct: isCorrect ? 1 : 0, kind: 'drill' }],
                      });
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              resultado(
                typingCorrect,
                typingCorrect ? (
                  <>Correto!</>
                ) : (
                  <>
                    Incorreto. Você selecionou “{typingAttempt}”. A resposta correta era “{currentCard.word}”
                  </>
                ),
              )
            )}
          </>
        ) : (
          /* LEMBRAR — o cartão do protótipo: a palavra e a frase; a tradução só depois. */
          <>
            <div className="termo" style={{ marginTop: 14 }}>
              {currentCard.word}
            </div>
            {currentCard.sentence && (
              <p className="exemplo">
                “{currentCard.sentence}”{origemDaFrase}
              </p>
            )}
            {showAnswer ? (
              <div className="resp">
                <b>{currentCard.translation || '—'}</b>
                {currentCard.explanation && (
                  <p className="mut" style={{ fontSize: 13.5, marginTop: 6 }}>
                    {currentCard.explanation}
                  </p>
                )}
                {scheduler === 'fsrs' ? (
                  <div className="fsrs" role="group" aria-label="Quão fácil foi lembrar">
                    {notas.map(([nota, cls, rotulo]) => (
                      <button
                        key={nota}
                        type="button"
                        className={cls}
                        onClick={(e) => void handleFsrsFeedback(currentCard.id, nota, undefined, e.currentTarget)}
                      >
                        {rotulo}
                        <small>{intervaloDaNota(currentCard, nota, agora, retencao)}</small>
                        <kbd data-precisa="teclado">{nota}</kbd>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="fsrs" role="group" aria-label="Acertou?" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <button type="button" className="e" onClick={() => handleLeitnerFeedback(currentCard.id, false)}>
                      Errei<small>volta à caixa 1</small>
                    </button>
                    <button type="button" className="b" onClick={() => handleLeitnerFeedback(currentCard.id, true)}>
                      Acertei<small>avança a caixa</small>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="resp" style={{ border: 0, paddingTop: 0 }}>
                <button type="button" className="btn btn-solid" style={{ minWidth: 220 }} onClick={mostrarResposta}>
                  <Eye aria-hidden /> Mostrar resposta
                </button>
                <p className="mut" style={{ fontSize: 12, marginTop: 10 }} data-precisa="teclado">
                  ou aperte <kbd>Espaço</kbd>
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <div className="rev-ferr" role="toolbar" aria-label="Ações do cartão">
        <button
          type="button"
          className="btn btn-outline peq"
          disabled={!historico.length}
          onClick={() => void desfazer()}
        >
          <Undo2 aria-hidden /> Desfazer <kbd data-precisa="teclado">Z</kbd>
        </button>
        <button
          type="button"
          className="btn btn-outline peq"
          data-precisa="voz"
          onClick={() => playWordTTS(currentCard.word)}
        >
          <Volume2 aria-hidden /> Ouvir
        </button>
        <button type="button" className="btn btn-outline peq" onClick={() => setEditando(currentCard)}>
          <Pencil aria-hidden /> Editar cartão
        </button>
        <button type="button" className="btn btn-outline peq" onClick={() => void suspender(currentCard)}>
          <Pause aria-hidden /> Suspender
        </button>
      </div>

      {dialogos}
      {paleta}
    </Tela>
  );
}

/** "Opções da revisão" — o diálogo R1 do protótipo, os seis campos, todos valendo de verdade. */
type ValoresDaRevisao = {
  novas: number;
  revisoes: number;
  ordem: OrdemDaRodada;
  tipo: TipoDeCartao;
  ouvir: boolean;
  retencao: number;
};
function OpcoesDaRevisao({
  valores,
  aoTrocar,
  aoFechar,
}: {
  valores: ValoresDaRevisao;
  aoTrocar: (v: Partial<ValoresDaRevisao>) => void;
  aoFechar: () => void;
}) {
  const descricao: Record<TipoDeCartao, string> = {
    lembrar: 'Você pensa e mostra a resposta.',
    digitar: 'Você escreve a tradução.',
    escolha: 'Quatro alternativas.',
  };
  const numero = (campo: 'novas' | 'revisoes', min: number, max: number, rotulo: string) => (
    <input
      className="campo num"
      type="number"
      min={min}
      max={max}
      value={valores[campo]}
      aria-label={rotulo}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value));
        if (Number.isFinite(n)) aoTrocar({ [campo]: Math.min(max, Math.max(min, n)) });
      }}
    />
  );
  return (
    <Dialogo
      icone={SlidersHorizontal}
      titulo="Opções da revisão"
      sub="Valem para todas as rodadas. A agenda é do FSRS."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha rola-dlg">
        <CampoLinha rotulo="Novas por dia" desc="Quantas palavras nunca vistas entram por dia.">
          {numero('novas', 0, 200, 'Novas por dia')}
        </CampoLinha>
        <CampoLinha rotulo="Revisões por dia" desc="Um teto para dias de atraso; o resto fica para amanhã.">
          {numero('revisoes', 10, 999, 'Revisões por dia')}
        </CampoLinha>
        <CampoLinha rotulo="Ordem">
          <Segmentos<OrdemDaRodada>
            atual={valores.ordem}
            aoTrocar={(o) => aoTrocar({ ordem: o })}
            rotulo="Ordem"
            opcoes={[
              ['vencidas', 'Vencidas primeiro'],
              ['misturar', 'Misturar'],
            ]}
          />
        </CampoLinha>
        <CampoLinha rotulo="Tipo de cartão" desc={descricao[valores.tipo]}>
          <Segmentos<TipoDeCartao>
            atual={valores.tipo}
            aoTrocar={(t) => aoTrocar({ tipo: t })}
            rotulo="Tipo de cartão"
            opcoes={[
              ['lembrar', 'Lembrar'],
              ['digitar', 'Digitar'],
              ['escolha', 'Escolher'],
            ]}
          />
        </CampoLinha>
        <CampoLinha rotulo="Ouvir a palavra ao mostrar">
          <Interruptor
            ligado={valores.ouvir}
            aoTrocar={() => aoTrocar({ ouvir: !valores.ouvir })}
            rotulo="Ouvir a palavra ao mostrar"
          />
        </CampoLinha>
        <CampoLinha
          rotulo={`Meta de retenção · ${valores.retencao}%`}
          desc="Mais alta = palavras voltam mais cedo, mais revisões por dia."
        >
          <input
            type="range"
            className="trilho"
            min={80}
            max={97}
            value={valores.retencao}
            aria-label="Meta de retenção"
            style={{ '--p': `${((valores.retencao - 80) / 17) * 100}%` } as React.CSSProperties}
            onChange={(e) => aoTrocar({ retencao: Number(e.target.value) })}
          />
        </CampoLinha>
      </div>
      <div className="dlg-pe">
        <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={() => aoTrocar({ ...PADRAO })}>
          Voltar ao padrão
        </button>
        <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
          <Check aria-hidden /> Pronto
        </button>
      </div>
    </Dialogo>
  );
}
