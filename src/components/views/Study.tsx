import { countDue, Fsrs5Strategy, type Grade, isDueNow } from '@core';
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
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { fetchDeck, reviewCard, salvarRodada, updateCard } from '../../data/api';
import {
  ActiveProductionExercise,
  formatForCard,
  similarityPercentage,
  stabilityThreshold,
} from '../../lib/exercicios';
import { type AgeProfileType, copyDoPerfil, showsPowerUserAffordances } from '../../lib/profile';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { speak as ttsSpeak } from '../../lib/tts';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { ExerciseKind, Recording, SchedulerType, VocabCard } from '../../types';
import CommandPalette, { useCommandPalette } from '../CommandPalette';
import FraseComLacuna from '../FraseComLacuna';
import { toast } from '../Toast';
import { CabecalhoDeTela, IconeEmBloco, Tela } from '../ui';
import Dialogo, { CampoLinha, Interruptor, Segmentos } from './vocab/Dialogo';

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

/** O tipo de cartão (Opções da revisão). "Automático" é a progressão do app: escolher → digitar → escrever. */
type TipoDeCartao = 'lembrar' | 'digitar' | 'escolha' | 'auto';
const CHAVE_TIPO = 'revisao.tipoDeCartao';
const CHAVE_OUVIR = 'revisao.ouvirAoMostrar';

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

/** "3,5 d", "agora" — o intervalo que o FSRS dá a esta nota, a partir do estado real do cartão. */
function intervaloDaNota(card: VocabCard, grade: Grade, agora: number): string {
  const extra = card as VocabCard & { difficulty?: number | null; lapses?: number | null };
  const proximo = Fsrs5Strategy.review(
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

  /** XP por cartão revisado. Regra DECLARADA (não é medição) — e é o número que o resumo exibe. */
  const XP_PER_REVIEWED_CARD = 5;

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
    return v === 'digitar' || v === 'escolha' || v === 'auto' ? v : 'lembrar';
  });
  const [ouvirAoMostrar, setOuvirAoMostrar] = useState<boolean>(() => lerPreferencia(CHAVE_OUVIR) !== 'false');
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  const [editando, setEditando] = useState<VocabCard | null>(null);

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
  const handleFsrsFeedback = async (cardId: string, rating: 1 | 2 | 3 | 4, exerciseKind?: ExerciseKind) => {
    let effectiveRating = rating;
    if (exerciseKind === 'active-production' && rating === 3) {
      effectiveRating = 4; // produção ativa é mais difícil: um acerto vale Easy
    }
    setNotasDaRodada((prev) => [...prev, effectiveRating]);

    try {
      const updated = await reviewCard(cardId, effectiveRating);
      setVocabCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    } catch {
      // Offline/erro: não inventamos um agendamento novo. O cartão fica como está.
    }

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
    const finalQueue = due.length > 0 ? due : noBaralho;
    if (finalQueue.length > 0) abrirRodada(finalQueue, false);
  }, [activeVocabCards, scheduler]);

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
      : tipo === 'auto'
        ? formatForCard(currentCard)
        : tipo === 'digitar'
          ? 'typing'
          : tipo === 'escolha'
            ? 'mc'
            : 'cloze';

  const mostrarResposta = () => {
    setShowAnswer(true);
    if (ouvirAoMostrar) playWordTTS(currentCard?.word);
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
        void handleFsrsFeedback(currentCard.id, Number(e.key) as 1 | 2 | 3 | 4);
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
    toast.ok(`“${card.word}” suspensa: não aparece na revisão até você reativar`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          void updateCard(card.id, { inDeck: true })
            .then((c) => {
              setVocabCards((prev) => prev.map((x) => (x.id === c.id ? c : x)));
              toast.ok(`“${card.word}” volta para a revisão`);
            })
            .catch((e) => toast.error('Não consegui reativar a palavra.', { detail: e }));
        },
      },
    });
  };

  const salvarEdicao = async (card: VocabCard, traducao: string) => {
    try {
      const atualizado = await updateCard(card.id, { translation: traducao });
      setVocabCards((prev) => prev.map((c) => (c.id === card.id ? atualizado : c)));
      setReviewCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, translation: atualizado.translation } : c)));
      toast.ok('Palavra atualizada');
      setEditando(null);
    } catch (e) {
      toast.error('Não consegui salvar a alteração.', { detail: e });
    }
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
          tipo={tipo}
          aoTrocarTipo={(t) => {
            setTipo(t);
            gravarPreferencia(CHAVE_TIPO, t);
          }}
          ouvir={ouvirAoMostrar}
          aoTrocarOuvir={(v) => {
            setOuvirAoMostrar(v);
            gravarPreferencia(CHAVE_OUVIR, String(v));
          }}
          producao={{
            dica: copyDoPerfil('ex.active_production.hint', ageProfile, { n: producibleCount }),
            bloqueio: bloqueioDaProducao,
            comecar: () => {
              setOpcoesAbertas(false);
              startActiveProductionSession();
            },
          }}
          aoFechar={() => setOpcoesAbertas(false)}
        />
      )}
      {editando && (
        <EditarCartao
          card={editando}
          aoSalvar={(t) => void salvarEdicao(editando, t)}
          aoFechar={() => setEditando(null)}
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
    const xp = reviewCards.length * XP_PER_REVIEWED_CARD;
    return (
      <Tela largura="larga">
        <CabecalhoDeTela
          voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
          sobrancelha="Revisão"
          icone={Target}
          titulo="Rodada concluída"
          sub={`${feitas === 1 ? 'A palavra foi revisada' : `As ${feitas} palavras foram revisadas`}. Os próximos prazos vêm do FSRS.`}
        />
        <section className="cartao p6 fim-rev entra">
          <div className="vazio" style={{ padding: '12px 0 20px' }}>
            <IconeEmBloco icone={PartyPopper} />
            <h3>Você fechou a rodada</h3>
            <p>
              {dueCount > 0
                ? `Ainda ${dueCount === 1 ? 'vence 1 palavra' : `vencem ${dueCount} palavras`} agora.`
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
          </div>
          <div className="linha" style={{ gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-solid" onClick={() => onChangeView?.('play')}>
              <Gamepad2 aria-hidden /> Jogar com as mesmas
            </button>
            <button type="button" className="btn btn-outline" onClick={() => onChangeView?.('metrics')}>
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
  const avancar = (kind: ExerciseKind) => {
    if (scheduler === 'fsrs') void handleFsrsFeedback(currentCard.id, typingCorrect ? 3 : 1, kind);
    else handleLeitnerFeedback(currentCard.id, typingCorrect, kind);
  };
  const verificarDigitacao = () => {
    const score = similarityPercentage(currentCard.word, typingAttempt);
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
        onClick={() => avancar(format === 'mc' ? 'mc' : 'typing')}
      >
        Avançar
      </button>
    </div>
  );

  return (
    <Tela largura="larga">
      <CabecalhoDeTela
        voltar={{ rotulo: 'Vocabulário', aoClicar: voltarAoVocabulario }}
        sobrancelha={`Revisão · ${currentReviewIndex + 1} de ${reviewCards.length}`}
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
          </>
        }
      />

      <section className="cartao flash">
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
            <FraseComLacuna sentence={currentCard.sentence} word={currentCard.word} />
            <p className="exemplo">{currentCard.translation}</p>
            {!typingVerified ? (
              <div className="resp" style={{ border: 0, paddingTop: 0 }}>
                <label className="sr" htmlFor="rev-digitar">
                  Digite a palavra
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
                  placeholder="Digite a palavra..."
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
                  <>Correto! A resposta era “{currentCard.word}”</>
                ) : (
                  <>
                    Incorreto. A resposta correta era “<b style={{ font: 'inherit' }}>{currentCard.word}</b>” (você
                    escreveu “{typingAttempt}”)
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
            {currentCard.sentence && <p className="exemplo">“{currentCard.sentence}”</p>}
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
                        onClick={() => void handleFsrsFeedback(currentCard.id, nota)}
                      >
                        {rotulo}
                        <small>{intervaloDaNota(currentCard, nota, agora)}</small>
                        <kbd>{nota}</kbd>
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
                <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
                  ou aperte <kbd>Espaço</kbd>
                </p>
              </div>
            )}
          </>
        )}
      </section>

      <div className="rev-ferr" role="toolbar" aria-label="Ações do cartão">
        <button type="button" className="btn btn-outline peq" onClick={() => playWordTTS(currentCard.word)}>
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

/** "Opções da revisão" — o diálogo R1 do protótipo, com o que o app tem de verdade. */
function OpcoesDaRevisao({
  tipo,
  aoTrocarTipo,
  ouvir,
  aoTrocarOuvir,
  producao,
  aoFechar,
}: {
  tipo: TipoDeCartao;
  aoTrocarTipo: (t: TipoDeCartao) => void;
  ouvir: boolean;
  aoTrocarOuvir: (v: boolean) => void;
  producao: { dica: string; bloqueio?: string; comecar: () => void };
  aoFechar: () => void;
}) {
  const descricao: Record<TipoDeCartao, string> = {
    lembrar: 'Você pensa e mostra a resposta.',
    digitar: 'Você escreve a palavra que falta na frase.',
    escolha: 'Quatro alternativas.',
    auto: 'Pelo quanto você já sabe a palavra: escolher, depois digitar, depois escrever a frase.',
  };
  return (
    <Dialogo
      icone={SlidersHorizontal}
      titulo="Opções da revisão"
      sub="Valem para todas as rodadas. A agenda é do FSRS."
      aoFechar={aoFechar}
    >
      <div className="dlg-corpo pilha rola-dlg">
        <CampoLinha rotulo="Tipo de cartão" desc={descricao[tipo]}>
          <Segmentos<TipoDeCartao>
            atual={tipo}
            aoTrocar={aoTrocarTipo}
            rotulo="Tipo de cartão"
            opcoes={[
              ['lembrar', 'Lembrar'],
              ['digitar', 'Digitar'],
              ['escolha', 'Escolher'],
              ['auto', 'Automático'],
            ]}
          />
        </CampoLinha>
        <CampoLinha rotulo="Ouvir a palavra ao mostrar">
          <Interruptor ligado={ouvir} aoTrocar={() => aoTrocarOuvir(!ouvir)} rotulo="Ouvir a palavra ao mostrar" />
        </CampoLinha>
        <CampoLinha rotulo="Produção ativa" desc={producao.bloqueio ?? producao.dica}>
          <button
            type="button"
            className="btn btn-outline peq"
            disabled={!!producao.bloqueio}
            onClick={producao.comecar}
          >
            <Brain aria-hidden /> Começar
          </button>
        </CampoLinha>
      </div>
      <div className="dlg-pe">
        <button
          type="button"
          className="link"
          style={{ marginRight: 'auto' }}
          onClick={() => {
            aoTrocarTipo('lembrar');
            aoTrocarOuvir(true);
          }}
        >
          Voltar ao padrão
        </button>
        <button type="button" className="btn btn-solid" onClick={aoFechar}>
          <Check aria-hidden /> Pronto
        </button>
      </div>
    </Dialogo>
  );
}

/** "Editar cartão" — a tradução, que é o que o servidor deixa editar (`PATCH /api/vocab/:id`). */
function EditarCartao({
  card,
  aoSalvar,
  aoFechar,
}: {
  card: VocabCard;
  aoSalvar: (traducao: string) => void;
  aoFechar: () => void;
}) {
  const [traducao, setTraducao] = useState(card.translation ?? '');
  const id = useId();
  return (
    <Dialogo icone={Pencil} titulo="Editar cartão" sub={card.word} aoFechar={aoFechar}>
      <form
        className="dlg-corpo pilha"
        onSubmit={(e) => {
          e.preventDefault();
          if (traducao.trim()) aoSalvar(traducao.trim());
        }}
      >
        <div>
          <label className="rot" htmlFor={`${id}-t`}>
            Tradução
          </label>
          <input
            className="campo"
            id={`${id}-t`}
            required
            autoFocus
            value={traducao}
            onChange={(e) => setTraducao(e.target.value)}
          />
        </div>
        <div className="dlg-pe" style={{ padding: '8px 0 0' }}>
          <button type="button" className="btn btn-outline" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-solid" disabled={!traducao.trim()}>
            <Check aria-hidden /> Salvar
          </button>
        </div>
      </form>
    </Dialogo>
  );
}
