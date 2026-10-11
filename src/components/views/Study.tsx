import '../../styles/cartoes.css';
import '../../styles/questRevisao.css';

import { countDue, ganhoDaNota, ganhoDaRevisao, type Grade, isDueNow, makeFsrs5, MINIGAMES } from '@core';
import { Brain, Zap } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  desfazerRevisao,
  type EstadoAntesDaNota,
  fetchDeck,
  type RegistroDaNota,
  reviewCard,
  salvarRodada,
  updateCard,
} from '../../data/api';
import { cartoesDoConteudo } from '../../lib/conteudo/cartoes';
import type { Conteudo } from '../../lib/conteudo/estado';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { ActiveProductionExercise, similarityPercentage, stabilityThreshold } from '../../lib/exercicios';
import { data as dataPorExtenso, t, tp } from '../../lib/i18n';
import { ganho } from '../../lib/juice';
import { classesDaPalavra } from '../../lib/pelesDeCartao';
import { sentir } from '../../lib/polimento/sentidos';
import { type AgeProfileType, copyDoPerfil, showsPowerUserAffordances } from '../../lib/profile';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { recompensasV2Ligadas } from '../../lib/recompensasV2';
import {
  cenaJuntada,
  esquecerCenaDoCartao,
  esquecerCenas,
  juntarCena,
  lerOrigemDoCartao,
  type OrigemDoCartao,
} from '../../lib/revisao/cena';
import {
  itensDaPratica,
  palavraDificil,
  pedeDizer,
  relogio,
  type TipoDePratica,
} from '../../lib/revisao/enxuta';
import { criarTocador, type Tocador } from '../../lib/revisao/falaOriginal';
import type { RecorteDaPratica } from '../../lib/revisao/pratica';
import {
  gravarOpcoesDaRevisao,
  gravarVozNaRevisao,
  lerOpcoesDaRevisao,
  lerVozNaRevisao,
  OPCOES_PADRAO,
  type OpcoesDaRevisao,
  type OrdemDaRodada,
  type TipoDeCartao,
} from '../../lib/revisao/preferencias';
import { vozesGuardadas } from '../../lib/revisao/vozGuardada';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { speak as ttsSpeak } from '../../lib/tts';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { haVozPara } from '../../lib/voz/haVoz';
import { ExerciseKind, Recording, SchedulerType, VocabCard } from '../../types';
import CommandPalette, { useCommandPalette } from '../CommandPalette';
import { useResumoDaPratica } from '../progress/ResumoDaPratica';
import { toast } from '../Toast';
import type { PraticasDisponiveis } from './revisao/enxuta/FolhaPraticar';
import type { ItemDaPratica, NotasDaPratica, PraticaDeRecordar } from './revisao/enxuta/Pratica';
import {
  type AvisoDaRodada,
  BaralhoVazioNoQuest,
  EsperaDaRevisaoNoQuest,
  FimDaRodadaNoQuest,
  ForaDaRodadaNoQuest,
  type GrupoQueMudou,
  type NotaDoQuest,
  type OndeDaFrase,
  OpcoesDaRevisaoNoQuest,
  RodadaDoQuest,
} from './revisao/quest/RevisaoDoQuest';
import GavetaDaPalavra from './vocab/GavetaDaPalavra';

/* O que só existe depois de um toque não entra no arranque da revisão: as folhas, o gravador e as
   práticas chegam em pedaços próprios, na hora em que abrem. */
const FolhaDoMais = lazy(() => import('./revisao/enxuta/FolhaDoMais'));
const FolhaDasSaidas = lazy(() => import('./revisao/enxuta/FolhaDasSaidas'));
const FolhaMinhaVoz = lazy(() => import('./revisao/enxuta/FolhaMinhaVoz'));
const FolhaPraticar = lazy(() => import('./revisao/enxuta/FolhaPraticar'));
const Pratica = lazy(() => import('./revisao/enxuta/Pratica'));
const InfoDoCartao = lazy(() => import('./revisao/enxuta/DialogosDaRevisao').then((m) => ({ default: m.InfoDoCartao })));
const AtalhosDaRevisao = lazy(() =>
  import('./revisao/enxuta/DialogosDaRevisao').then((m) => ({ default: m.AtalhosDaRevisao })),
);

/**
 * REVISÃO — a rodada de estudo, na VERSÃO ENXUTA aprovada pelo dono em 10/10/2026
 * (`docs/prototipos/cartoes-enxuto.html`, fontes em `cartoes-enxuto-src/cartoes2.js` e `cartoes4.js`).
 *
 * `/cartoes/estudar` é "Revisar agora", então a tela ABRE NA RODADA: o cartão, "Mostrar resposta" (ou
 * Espaço) e as notas do FSRS. Tudo o mais mora na folha do "…". No verso, o cartão nascido de uma
 * captura mostra a cena; "Minha voz" grava e compara; o fim da sessão oferece "Praticar de outro jeito".
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
  /**
   * O RECORTE DA RODADA que a tela Cartões pede: "Só 10 agora" (`limite`) e "Mais 5 novas"
   * (`soNovas`, só palavras nunca vistas). Sem ele, a rodada é a de sempre.
   */
  rodada?: RecorteDaRodada;
  /** As sessões do app: o título e o áudio da sessão de onde cada cartão veio (a cena do verso). */
  gravacoes?: Recording[];
  /**
   * "PRATICAR DE OUTRO JEITO" pedido de fora (Hoje, um baralho, a seleção de Palavras): a tela abre com
   * a folha das práticas sobre este recorte, sem começar uma rodada (`lib/revisao/pratica.ts`).
   */
  praticar?: RecorteDaPratica;
  /**
   * O CONTEÚDO ESCOLHIDO (a ficha do cabeçalho de Cartões): a fila, a folha das práticas e as contagens
   * desta tela só enxergam os cartões da fonte, no idioma dela (`lib/conteudo/cartoes.ts`). Sem ele, o
   * baralho inteiro. Com `recording`, quem recorta é a sessão.
   */
  conteudo?: Conteudo | null;
}

export interface RecorteDaRodada {
  /** No máximo tantos cartões, na ordem da rodada (as vencidas há mais tempo primeiro). */
  limite?: number;
  /** Só palavras nunca vistas: é pedir mais novas com o dia em dia, sem adiantar revisão. */
  soNovas?: boolean;
}

function lerPreferencia(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

type ComMemoria = VocabCard & { difficulty?: number | null; lapses?: number | null };

/** O estado do agendador que o cartão tem AGORA — o que o "Desfazer" devolve depois da nota. */
function estadoDoCartao(card: VocabCard): EstadoAntesDaNota {
  const extra = card as ComMemoria;
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
  const extra = card as ComMemoria;
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

/** Meia-noite de amanhã, no relógio da pessoa: até quando "Deixar para amanhã" adia. */
function amanha(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Uma nota desta rodada: o estado de antes (para desfazer) e o que foi mandado (para tentar de novo). */
interface NotaDada {
  card: VocabCard;
  antes: EstadoAntesDaNota;
  indice: number;
  xp: number;
  nota: number;
  aceita: boolean;
  registro: RegistroDaNota;
}

type Folha = null | 'mais' | 'saidas' | 'voz';

export default function Study({
  recording,
  onChangeView,
  practiceSeed = null,
  onSeedConsumed,
  ageProfile = 'pro',
  rodada,
  gravacoes,
  praticar,
  conteudo = null,
}: StudyProps = {}) {
  /* DO APARELHO, não do desenho: o mesmo desenho vale no computador, onde há teclado físico. As teclas
     (Espaço, 1 a 4, Z…) e o foco no campo de digitar perguntam por aqui. */
  const temTeclado = useMemo(() => recursosDoAparelho(perfilDoDispositivo()).tecladoFisico, []);
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
    () =>
      recording
        ? vocabCards.filter((c) => c.sourceSessionId === recording.id)
        : conteudo
          ? cartoesDoConteudo(vocabCards, conteudo)
          : vocabCards,
    [vocabCards, recording, conteudo],
  );
  const [scheduler] = useState<SchedulerType>('fsrs');
  const sessoes = useMemo(() => gravacoes ?? (recording ? [recording] : []), [gravacoes, recording]);

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
  /** As notas dadas nesta rodada (a nota efetiva, a que foi ao servidor) — base do "Lembradas". */
  const [notasDaRodada, setNotasDaRodada] = useState<number[]>([]);
  const [inicioDaRodada, setInicioDaRodada] = useState(0);
  const [fimDaRodada, setFimDaRodada] = useState(0);
  /** O usuário encerrou a rodada sem navegar: não reabrir sozinha. */
  const [encerrada, setEncerrada] = useState(false);
  /** Quando o cartão atual apareceu: a nota leva o tempo de resposta (só registro, não muda a agenda). */
  const mostradoEm = useRef(0);
  /** De que lado o cartão entra: 1 depois de uma nota, -1 depois de desfazer. */
  const [direcao, setDirecao] = useState<1 | -1>(1);
  /** Acertos seguidos nesta rodada (`R.seguidas`, `cartoes2.js:418`): o selo aparece a partir de 3. */
  const [seguidas, setSeguidas] = useState(0);

  const [llmValidation] = useState<boolean>(() => {
    return lerPreferencia('practice.activeProduction.llmValidation') === 'true';
  });

  const [isActiveProductionOnly, setIsActiveProductionOnly] = useState(false);

  // Ajustes da memória (diálogo) — preferências locais (`lib/revisao/preferencias`), valem para as
  // próximas rodadas.
  const [opcoesIniciais] = useState(lerOpcoesDaRevisao);
  const [tipo, setTipo] = useState<TipoDeCartao>(opcoesIniciais.tipo);
  const [ouvirAoMostrar, setOuvirAoMostrar] = useState<boolean>(opcoesIniciais.ouvir);
  const [novasPorDia, setNovasPorDia] = useState(opcoesIniciais.novas);
  const [revisoesPorDia, setRevisoesPorDia] = useState(opcoesIniciais.revisoes);
  const [ordem, setOrdem] = useState<OrdemDaRodada>(opcoesIniciais.ordem);
  const [retencao, setRetencao] = useState(opcoesIniciais.retencao);
  const [botoes, setBotoes] = useState<2 | 4>(opcoesIniciais.botoes);
  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  const [editando, setEditando] = useState<VocabCard | null>(null);
  /** As notas desta rodada, com o estado de ANTES de cada uma — o "Desfazer" (Z) volta uma a uma. */
  const [historico, setHistorico] = useState<NotaDada[]>([]);

  /* ── O que é da versão enxuta ─────────────────────────────────────────────────────────────────── */
  const [voz, setVoz] = useState(lerVozNaRevisao);
  /** "Agora não" no convite de dizer: vale até o fim desta rodada (`R.semDizer`, `cartoes2.js:680`). */
  const [semDizer, setSemDizer] = useState(false);
  const [folha, setFolha] = useState<Folha>(null);
  const [info, setInfo] = useState(false);
  const [atalhosAbertos, setAtalhosAbertos] = useState(false);
  /** A origem de cada cartão já lida (a cena, as outras frases): só é lida quando a pessoa pede a resposta. */
  const [origens, setOrigens] = useState<Record<string, OrigemDoCartao>>({});
  const pedidasDeOrigem = useRef(new Set<string>());
  /** Os cartões trazidos cuja cena a pessoa juntou (neste aparelho). */
  const [juntadas, setJuntadas] = useState<Record<string, boolean>>({});
  /** Qual das frases do cartão está à vista ("Outra frase", só nesta rodada). */
  const [fraseDaVez, setFraseDaVez] = useState<Record<string, number>>({});
  const [tocando, setTocando] = useState<'original' | 'voz' | null>(null);
  const [comVozGuardada, setComVozGuardada] = useState<Record<string, boolean>>({});
  /** O cartão que acabou de escapar e é "difícil": a linha de aviso (`R.aviso`, `cartoes2.js:414`). */
  const [avisoDificil, setAvisoDificil] = useState<string | null>(null);
  const avisados = useRef(new Set<string>());
  const [saidasDe, setSaidasDe] = useState<VocabCard | null>(null);
  /** A folha "Praticar de outro jeito" aberta sobre um recorte, e a prática em curso. */
  const [recortePedido, setRecortePedido] = useState<RecorteDaPratica | null>(null);
  const [pratica, setPratica] = useState<{
    tipo: PraticaDeRecordar;
    recorte: RecorteDaPratica;
    itens: ItemDaPratica[];
  } | null>(null);
  const praticaDeForaAberta = useRef(false);
  /* Vivos para o fechar da folha das práticas, que decide 300 ms depois: há prática aberta? a pessoa escolheu? */
  const emPratica = useRef(false);
  emPratica.current = !!pratica;
  const quemEscolheu = useRef(false);

  /* A casca sabe que a revisão está aberta (`aoMostrar.estudo` e `aoSair.estudo`, `cartoes2.js:352-365`):
     no celular a barra de baixo sai da frente do cartão. */
  useEffect(() => {
    const casca = document.querySelector('.q-casca');
    casca?.classList.add('ct-em-estudo');
    return () => casca?.classList.remove('ct-em-estudo');
  }, []);

  const tocador = useRef<Tocador | null>(null);
  const oTocador = (): Tocador => (tocador.current ??= criarTocador());
  useEffect(
    () => () => {
      tocador.current?.soltar();
      tocador.current = null;
      esquecerCenas();
    },
    [],
  );

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
  const idiomaDe = (card: VocabCard): string => langPairOf(card).src || studyLang;

  // TTS de uma palavra do deck: idioma REAL do cartão (`srcLang`), com fallback para o estudado.
  const playWordTTS = (word?: string) => {
    if (!word) return;
    const lang = langPairOf(cardFor(word)).src || studyLang;
    ttsSpeak(word, { lang, rate: 0.9 });
  };

  /** Lê (uma vez) de onde o cartão veio: a cena, a palavra achada nas sessões, as outras frases. */
  const pedirOrigem = useCallback(
    (card: VocabCard): Promise<OrigemDoCartao> => {
      const p = lerOrigemDoCartao(card, sessoes);
      if (!pedidasDeOrigem.current.has(card.id)) {
        pedidasDeOrigem.current.add(card.id);
        void p.then((o) => setOrigens((m) => ({ ...m, [card.id]: o })));
        if (cenaJuntada(card.id)) setJuntadas((j) => ({ ...j, [card.id]: true }));
      }
      return p;
    },
    [sessoes],
  );
  /** A cena que vale para o cartão: a da frase dele, ou a que a pessoa juntou. */
  const cenaDe = (card: VocabCard, o: OrigemDoCartao | undefined = origens[card.id]) =>
    o?.cena ?? (juntadas[card.id] ? (o?.achada ?? null) : null);

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
    oTocador().parar();
    setTocando(null);
    setNotasDaRodada((prev) => [...prev, effectiveRating]);
    const antes = vocabCards.find((c) => c.id === cardId);
    const indice = currentReviewIndex;
    /* O retângulo é lido ANTES do await: depois dele o cartão já pode ter trocado. Só Digitar,
       Escolher e a produção ativa mostram o "+N XP" subindo do botão; no Lembrar o que sobe da nota é
       "volta em…" (`cartoes2.js:427`), e o ganho aparece no fim da sessão. */
    const rect = exerciseKind ? (origem ?? document.querySelector('.flash'))?.getBoundingClientRect() : undefined;
    let xp = 0;
    let aceita = false;
    const registro: RegistroDaNota = {
      origem: 'revisao',
      formato: exerciseKind === 'active-production' ? 'producao-ativa' : tipo,
      respostaMs: mostradoEm.current ? Math.max(0, Date.now() - mostradoEm.current) : undefined,
    };
    let lapsos = (antes as ComMemoria | undefined)?.lapses ?? 0;
    try {
      const updated = await reviewCard(cardId, effectiveRating, retencao / 100, registro);
      setVocabCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      lapsos = (updated as ComMemoria).lapses ?? lapsos;
      // Só depois de o servidor gravar: o XP que sobe é o que de fato entrou na conta.
      xp = xpDaNota(effectiveRating);
      aceita = true;
      if (rect) ganho(rect, `+${xp} XP`);
    } catch {
      // Offline/erro: não inventamos um agendamento novo. O cartão fica como está, e a linha de
      // "Sem rede" oferece mandar a nota de novo.
    }
    if (antes)
      setHistorico((h) => [
        ...h,
        { card: antes, antes: estadoDoCartao(antes), indice, xp, nota: effectiveRating, aceita, registro },
      ]);
    setDirecao(1);
    setSeguidas((s) => (effectiveRating === 1 ? 0 : s + 1));
    /* PALAVRA QUE NÃO ENTRA (`cartoes2.js:414`): escapou de novo e já passou do limite de erros. O aviso
       aparece uma vez por cartão e por rodada, na linha acima do próximo cartão. */
    if (effectiveRating === 1 && palavraDificil(lapsos) && !avisados.current.has(cardId)) {
      avisados.current.add(cardId);
      setAvisoDificil(cardId);
    } else setAvisoDificil(null);

    /* PELO MESMO FUNIL DOS JOGOS (auditoria de 2026-09-07, achado A53): uma revisão vira uma rodada
       de um item em `/rodada`, com `roundId` — uma porta só para o mesmo dado. */
    void salvarRodada({
      roundId: `study-${cardId}-${Date.now()}`,
      exerciseKind,
      origem: recording?.id ? `sessao:${recording.id}` : 'estudo',
      sessionId: recording?.id,
      fonte: recording?.id ? 'sessao' : 'estudo',
      fonteRef: recording?.id,
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
    setSeguidas(0);
    setSemDizer(false);
    setAvisoDificil(null);
    setDirecao(1);
    avisados.current.clear();
    setReviewing(true);
  };

  /* `useCallback`: vai empacotada no catálogo da paleta ⌘K (um `useMemo`). Sem identidade que mude
     junto com `activeVocabCards`, a paleta guardaria uma closure com os cartões de antes. */
  const startReviewSession = useCallback(() => {
    /* Os VENCIDOS primeiro, pela data real (`isDueNow`). A comparação antiga era com a string
       'hoje', que a API nunca grava — a fila nunca achava vencido e caía sempre no baralho inteiro. */
    const noBaralho = activeVocabCards.filter((c) => c.inDeck);
    /* "Mais N novas" (tela Cartões, dia cumprido): só palavras nunca vistas, sem adiantar revisão. */
    if (rodada?.soNovas) {
      const nuncaVistas = noBaralho.filter((c) => c.fsrsState === 'New').slice(0, rodada.limite ?? novasPorDia);
      if (nuncaVistas.length > 0) abrirRodada(nuncaVistas, false);
      return;
    }
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
    /* "Só 10 agora": as primeiras da fila, que na ordem padrão são as vencidas há mais tempo. */
    if (rodada?.limite) fila = fila.slice(0, rodada.limite);
    if (fila.length > 0) abrirRodada(fila, false);
     
  }, [activeVocabCards, scheduler, novasPorDia, revisoesPorDia, ordem, rodada?.limite, rodada?.soNovas]);

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

  /* `/cartoes/estudar` É o "Revisar agora": com o deck carregado e sem semente pendente, a rodada abre
     sozinha — a tela do protótipo é o cartão, não um menu antes dele. Quem chegou para PRATICAR não
     começa rodada: a folha das práticas abre no lugar. */
  useEffect(() => {
    if (!deckLoaded || reviewing || sessionCompleted || encerrada || praticar) return;
    if (practiceSeed?.exercise === 'review' || practiceSeed?.exercise === 'active_production') return;
    startReviewSession();
  }, [deckLoaded, reviewing, sessionCompleted, encerrada, practiceSeed, startReviewSession, praticar]);
  useEffect(() => {
    if (!deckLoaded || !praticar || praticaDeForaAberta.current) return;
    praticaDeForaAberta.current = true;
    setRecortePedido(praticar);
  }, [deckLoaded, praticar]);

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
  /* O relógio do tempo de resposta recomeça a cada cartão mostrado. */
  const idDoCartaoAtual = currentCard?.id;
  useEffect(() => {
    mostradoEm.current = reviewing && idDoCartaoAtual ? Date.now() : 0;
  }, [reviewing, idDoCartaoAtual, currentReviewIndex]);

  /* A frase à vista: a do cartão, a da cena juntada, ou a "outra frase" escolhida nesta rodada. */
  const frasesDe = (card: VocabCard): string[] => {
    const o = origens[card.id];
    const principal = (juntadas[card.id] && !o?.cena && o?.achada ? o.achada.frase : card.sentence) ?? '';
    return [principal, ...(o?.outrasFrases.map((f) => f.frase) ?? [])].filter(
      (f, i, l) => f.trim() && l.indexOf(f) === i,
    );
  };
  const fraseDe = (card: VocabCard): string => {
    const l = frasesDe(card);
    return l[(fraseDaVez[card.id] ?? 0) % Math.max(1, l.length)] ?? '';
  };

  /** A fala original soa (a gravação da sessão; sem ela, a voz do aparelho lendo a frase). */
  const ouvirOriginal = async (card: VocabCard) => {
    const lang = idiomaDe(card);
    setTocando('original');
    const o = await pedirOrigem(card);
    const cena = o.cena ?? (cenaJuntada(card.id) ? o.achada : null);
    const frase = fraseDe(card) || card.word;
    /* a cena é a da frase do cartão: com "Outra frase" à vista, quem lê é a voz do aparelho */
    await (cena && cena.frase === frase ? oTocador().original(cena, lang) : oTocador().voz(frase, lang));
    setTocando((x) => (x === 'original' ? null : x));
  };
  const ouvirVoz = async (card: VocabCard) => {
    setTocando('voz');
    await oTocador().voz(card.word, idiomaDe(card), 0.95);
    setTocando((x) => (x === 'voz' ? null : x));
  };

  const mostrarResposta = () => {
    if (!currentCard) return;
    setShowAnswer(true);
    sentir('vira');
    void pedirOrigem(currentCard);
    const id = currentCard.id;
    if (comVozGuardada[id] === undefined)
      void vozesGuardadas()
        .listar(id)
        .then((l) => setComVozGuardada((m) => ({ ...m, [id]: l.length > 0 })));
    if (ouvirAoMostrar) playWordTTS(currentCard.word);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.flash .fsrs button')?.focus());
  };

  /** Manda de novo as notas que o servidor não gravou (a linha "Sem rede"). */
  const pendentes = historico.filter((h) => !h.aceita).length;
  const tentando = useRef(false);
  const tentarDeNovo = async (avisar: boolean) => {
    if (tentando.current) return;
    tentando.current = true;
    let gravadas = 0;
    for (const h of historico.filter((x) => !x.aceita)) {
      try {
        const updated = await reviewCard(h.card.id, h.nota as Grade, retencao / 100, h.registro);
        gravadas++;
        setVocabCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setHistorico((l) => l.map((x) => (x === h ? { ...x, aceita: true, xp: xpDaNota(h.nota) } : x)));
      } catch {
        break;
      }
    }
    tentando.current = false;
    if (!avisar) return;
    if (gravadas) toast.ok(tp(gravadas, 'A nota foi gravada.', 'As {n} notas foram gravadas.'));
    else toast.warn(t('Ainda sem rede. As notas continuam esperando nesta tela.'));
  };
  useEffect(() => {
    if (!pendentes) return;
    const aoVoltarARede = () => void tentarDeNovo(false);
    window.addEventListener('online', aoVoltarARede);
    return () => window.removeEventListener('online', aoVoltarARede);
  });

  /** Desfaz a última nota: o cartão volta ao estado de antes (no servidor) e à frente da fila. */
  const desfazer = async () => {
    const ultimo = historico[historico.length - 1];
    if (!ultimo) return;
    /* Uma nota que o servidor não gravou não tem o que desfazer lá: só sai desta tela. */
    if (ultimo.aceita) {
      try {
        const volta = await desfazerRevisao(ultimo.card.id, ultimo.antes);
        setVocabCards((prev) => prev.map((c) => (c.id === volta.id ? volta : c)));
      } catch (e) {
        toast.error('Não deu para desfazer a última resposta.', { detail: e });
        return;
      }
    }
    oTocador().parar();
    setTocando(null);
    setHistorico((h) => h.slice(0, -1));
    setNotasDaRodada((n) => n.slice(0, -1));
    setSessionCompleted(false);
    setReviewing(true);
    setDirecao(-1);
    setSeguidas(0);
    setAvisoDificil(null);
    avisados.current.delete(ultimo.card.id);
    setCurrentReviewIndex(ultimo.indice);
    setShowAnswer(true);
    sentir('fecha');
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

  /** Tira o cartão desta rodada (suspenso, adiado): o próximo assume o lugar. */
  const tirarDaRodada = (card: VocabCard) => {
    const resto = reviewCards.filter((c) => c.id !== card.id);
    setReviewCards(resto);
    setShowAnswer(false);
    setAvisoDificil((a) => (a === card.id ? null : a));
    oTocador().parar();
    setTocando(null);
    if (currentReviewIndex >= resto.length) {
      if (resto.length) setCurrentReviewIndex(resto.length - 1);
      concluir();
    }
  };
  const devolverARodada = (c: VocabCard) => {
    setVocabCards((prev) => prev.map((x) => (x.id === c.id ? c : x)));
    setReviewCards((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    setSessionCompleted(false);
    setReviewing(true);
  };

  /** Suspender = tirar do baralho (`inDeck: false`) sem apagar; sai desta rodada na hora. */
  const suspender = async (card: VocabCard) => {
    try {
      const atualizado = await updateCard(card.id, { inDeck: false });
      setVocabCards((prev) => prev.map((c) => (c.id === card.id ? atualizado : c)));
    } catch (e) {
      toast.error('Não consegui suspender a palavra.', { detail: e });
      return;
    }
    tirarDaRodada(card);
    toast.ok(`“${card.word}” suspensa e tirada desta rodada.`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          void updateCard(card.id, { inDeck: true })
            .then((c) => {
              devolverARodada(c);
              toast.ok(`“${card.word}” volta para a revisão`);
            })
            .catch((e) => toast.error('Não consegui reativar a palavra.', { detail: e }));
        },
      },
    });
  };

  /**
   * "Deixar para amanhã" e "Descansar 30 dias" (`ctTirar`, `cartoes2.js:472-491`): o cartão só volta a
   * vencer na data nova. Não é nota: nada entra no histórico de revisões e a memória do cartão não
   * muda (`PATCH /api/vocab/:id` com `adiarAte`). O "Desfazer" do aviso devolve a data de antes.
   */
  const adiar = async (card: VocabCard, dias: 1 | 30) => {
    const antes = card.dueAtMs ?? Date.now();
    const ate = dias === 1 ? amanha() : Date.now() + dias * 86_400_000;
    try {
      const atualizado = await updateCard(card.id, { adiarAte: ate });
      setVocabCards((prev) => prev.map((c) => (c.id === card.id ? atualizado : c)));
    } catch (e) {
      toast.error(t('Não consegui adiar a palavra.'), { detail: e });
      return;
    }
    sentir('fecha');
    tirarDaRodada(card);
    toast.ok(
      dias === 1
        ? t('“{palavra}” fica para amanhã, sem contar como erro.', { palavra: card.word })
        : t('“{palavra}” descansa 30 dias e volta sozinha em {dia}.', {
            palavra: card.word,
            dia: dataPorExtenso(ate, { day: 'numeric', month: 'long' }),
          }),
      {
        action: {
          label: 'Desfazer',
          onClick: () => {
            void updateCard(card.id, { adiarAte: antes })
              .then((c) => {
                devolverARodada(c);
                toast.ok(t('“{palavra}” volta para a revisão', { palavra: card.word }));
              })
              .catch((e) => toast.error(t('Não consegui devolver a palavra à revisão.'), { detail: e }));
          },
        },
      },
    );
  };

  /** "Trocar a frase" (`cartoes2.js:585-592`): o cartão passa a usar outra frase em que a palavra apareceu. */
  const trocarFrase = async (card: VocabCard, frase: string) => {
    try {
      const novo = await updateCard(card.id, { sentence: frase });
      setVocabCards((prev) => prev.map((c) => (c.id === novo.id ? novo : c)));
      setReviewCards((prev) => prev.map((c) => (c.id === novo.id ? novo : c)));
    } catch (e) {
      toast.error(t('Não consegui trocar a frase.'), { detail: e });
      return;
    }
    esquecerCenaDoCartao(card.id);
    pedidasDeOrigem.current.delete(card.id);
    setOrigens(({ [card.id]: _fora, ...resto }) => resto);
    setFraseDaVez(({ [card.id]: _qual, ...resto }) => resto);
    setAvisoDificil(null);
    sentir('liga');
    toast.ok(t('“{palavra}” passa a usar outra frase: “{frase}”', { palavra: card.word, frase }));
  };

  /* ── Praticar de outro jeito ──────────────────────────────────────────────────────────────────── */
  /** Os cartões de um recorte: os ids recebidos, os da sessão, ou os que vencem agora. */
  const cartoesDoRecorte = (r: RecorteDaPratica): VocabCard[] => {
    /* Sem ids, o recorte é o do conteúdo em uso (`activeVocabCards`): praticar "Difíceis" pratica as difíceis. */
    const noBaralho = activeVocabCards.filter((c) => c.inDeck);
    if (r.ids) {
      const ids = new Set(r.ids);
      return vocabCards.filter((c) => ids.has(c.id));
    }
    if (r.sessionId) return noBaralho.filter((c) => c.sourceSessionId === r.sessionId);
    const vencidos = noBaralho.filter((c) => isDueNow(c, scheduler));
    return vencidos.length ? vencidos : noBaralho;
  };
  const paraPratica = (l: VocabCard[]) => l.map((c) => ({ id: c.id, palavra: c.word, frase: c.sentence ?? '', c }));
  const praticasDe = (r: RecorteDaPratica): PraticasDisponiveis => {
    const cs = paraPratica(cartoesDoRecorte(r));
    const semFrase = t('Estes cartões não têm frase para esta prática.');
    const comSom = (l: typeof cs) =>
      l.filter((x) => haVozPara(idiomaDe(x.c)) || !!sessoes.find((g) => g.id === x.c.sourceSessionId)?.audioUrl);
    const comTraducao = cs.filter((x) => x.c.translation).length;
    const minimo = MINIGAMES.memory.minItems;
    return {
      falar: { ok: itensDaPratica('falar', cs).length > 0, motivo: semFrase },
      ditado: {
        ok: itensDaPratica('ditado', comSom(cs)).length > 0,
        motivo: itensDaPratica('ditado', cs).length
          ? t('Este aparelho não tem voz para o idioma destes cartões.')
          : t('Estes cartões não têm frase curta para o ditado.'),
      },
      completar: { ok: itensDaPratica('completar', cs).length > 0, motivo: semFrase },
      jogo: {
        ok: comTraducao >= minimo && !!onChangeView,
        motivo: t('O jogo pede pelo menos {n} cartões com tradução.', { n: minimo }),
      },
    };
  };
  const comecarPratica = async (tipoDaPratica: TipoDePratica, r: RecorteDaPratica) => {
    const cs = cartoesDoRecorte(r);
    if (tipoDaPratica === 'jogo') {
      /* JOGO RÁPIDO: a rodada abre no Jogar só com estas palavras e SEM mandar nota ao agendador
         (`semAgenda`): é o que o selo "não mexe na sua agenda" promete. */
      onChangeView?.('play', {
        recorte: {
          palavras: cs.filter((c) => c.translation).map((c) => c.word),
          semAgenda: true,
          rotulo: r.rotulo,
        },
      });
      return;
    }
    const escolhidos = itensDaPratica(
      tipoDaPratica,
      paraPratica(cs).filter(
        (x) =>
          tipoDaPratica !== 'ditado' ||
          haVozPara(idiomaDe(x.c)) ||
          !!sessoes.find((g) => g.id === x.c.sourceSessionId)?.audioUrl,
      ),
    );
    if (!escolhidos.length) {
      if (praticar) voltarAoVocabulario();
      return;
    }
    /* A cena de cada cartão (três ou quatro leituras pequenas): dá a voz original e a tradução da fala. */
    const itens = await Promise.all(
      escolhidos.map(async ({ c }) => {
        const o = await pedirOrigem(c);
        return { cartao: c, cena: o.cena ?? (cenaJuntada(c.id) ? o.achada : null) };
      }),
    );
    setPratica({ tipo: tipoDaPratica, recorte: r, itens });
  };
  /** O fim de uma prática de recordar: uma nota por cartão, pelo caminho da revisão. */
  const gravarPratica = async (
    tipoDaPratica: PraticaDeRecordar,
    resultados: Array<{ id: string; lembrou: boolean }>,
  ): Promise<NotasDaPratica> => {
    let gravadas = 0;
    let falhas = 0;
    for (const r of resultados) {
      try {
        const updated = await reviewCard(r.id, r.lembrou ? 3 : 1, retencao / 100, {
          origem: `pratica:${tipoDaPratica}`,
          formato: tipoDaPratica,
        });
        gravadas++;
        setVocabCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } catch {
        falhas++;
      }
    }
    return { gravadas, falhas };
  };

  /* ── Teclado (`cartoes2.js:754-793`) ──────────────────────────────────────────────────────────── */
  const notasDaTecla: Array<1 | 2 | 3 | 4> = botoes === 2 ? [1, 3] : [1, 2, 3, 4];
  useEffect(() => {
    if (!reviewing || sessionCompleted || !currentCard || pratica) return;
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && /INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const lembrar = format === 'cloze';
      if (lembrar && !showAnswer && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        mostrarResposta();
        return;
      }
      if (lembrar && showAnswer && /^[1-4]$/.test(e.key)) {
        const nota = notasDaTecla[Number(e.key) - 1];
        if (!nota) return;
        e.preventDefault();
        void handleFsrsFeedback(
          currentCard.id,
          nota,
          undefined,
          document.querySelectorAll('.flash .fsrs button')[Number(e.key) - 1] ?? null,
        );
        return;
      }
      if (format === 'active-production') return;
      const k = e.key.toLowerCase();
      const faz = (acao: () => void) => {
        e.preventDefault();
        acao();
      };
      if (k === 'r') return faz(() => void (temFalaOriginal(currentCard) ? ouvirOriginal(currentCard) : ouvirVoz(currentCard)));
      if (k === 'v') return faz(() => void ouvirVoz(currentCard));
      if (k === 'n' && frasesDe(currentCard).length > 1) return faz(() => outraFrase(currentCard));
      if (k === 'e') return faz(() => setEditando(currentCard));
      if (k === '-') return faz(() => void adiar(currentCard, 1));
      if (k === 's') return faz(() => void suspender(currentCard));
      if (k === 'i') return faz(() => setInfo(true));
      if (k === 'm' && lembrar && showAnswer) return faz(() => setFolha('voz'));
      if (e.key === '?') return faz(() => setAtalhosAbertos(true));
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });
  // Z desfaz a última resposta — também na tela de fim de rodada.
  useEffect(() => {
    if (pratica) return;
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

  /** O cartão tem fala de sessão para ouvir? Sabido sem ler nada: a sessão de origem tem áudio. */
  const temFalaOriginal = (card: VocabCard): boolean =>
    !!cenaDe(card)?.temAudio ||
    (!!card.sourceSessionId && !!card.sentence && !!sessoes.find((g) => g.id === card.sourceSessionId)?.audioUrl);
  const outraFrase = (card: VocabCard) => {
    setFraseDaVez((m) => ({ ...m, [card.id]: ((m[card.id] ?? 0) + 1) % Math.max(1, frasesDe(card).length) }));
    sentir('aba');
  };

  /* A revisão mora em Cartões (10/10/2026): o voltar leva para lá, e não mais ao Vocabulário. */
  const voltarAoVocabulario = () => onChangeView?.('cartoes');
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

  const valoresDaRevisao: ValoresDaRevisao = {
    novas: novasPorDia,
    revisoes: revisoesPorDia,
    ordem,
    tipo,
    ouvir: ouvirAoMostrar,
    retencao,
    botoes,
  };
  const trocarOpcoes = (v: Partial<ValoresDaRevisao>) => {
    if (v.novas !== undefined) setNovasPorDia(v.novas);
    if (v.revisoes !== undefined) setRevisoesPorDia(v.revisoes);
    if (v.ordem !== undefined) setOrdem(v.ordem);
    if (v.tipo !== undefined) setTipo(v.tipo);
    if (v.ouvir !== undefined) setOuvirAoMostrar(v.ouvir);
    if (v.retencao !== undefined) setRetencao(v.retencao);
    if (v.botoes !== undefined) setBotoes(v.botoes);
    gravarOpcoesDaRevisao(v);
  };
  const trocarVoz = (v: Partial<typeof voz>) => {
    setVoz((a) => ({ ...a, ...v }));
    gravarVozNaRevisao(v);
    if (v.dizer !== undefined) {
      sentir(v.dizer ? 'liga' : 'desliga');
      setSemDizer(false);
    }
    if (v.guardarVoz !== undefined) sentir(v.guardarVoz ? 'liga' : 'desliga');
  };

  /* PRODUÇÃO ATIVA NO DESENHO NOVO: o mesmo exercício da paleta de comandos, com um botão (no headset
     não há teclado; no computador o botão soma, e a paleta continua abrindo pelo teclado). */
  const producaoNoQuest = {
    rotulo: EXERCISES[1].label,
    dica: EXERCISES[1].hint,
    bloqueio: EXERCISES[1].disabledReason,
    aoComecar: startActiveProductionSession,
  };

  /* As missões e a sequência do dia, lidas depois de a sessão fechar (só com as recompensas v2). */
  const resumoDoDia = useResumoDaPratica(sessionCompleted);

  const folhaDasPraticas = recortePedido && (
    <Suspense fallback={null}>
      <FolhaPraticar
        rotulo={recortePedido.rotulo}
        quantos={cartoesDoRecorte(recortePedido).length}
        disponiveis={praticasDe(recortePedido)}
        aoEscolher={(tipoDaPratica) => {
          quemEscolheu.current = true;
          void comecarPratica(tipoDaPratica, recortePedido);
        }}
        aoFechar={() => {
          setRecortePedido(null);
          /* Quem veio só para praticar e fechou a folha sem escolher volta para Cartões (a escolha
             chega 260 ms depois de a folha fechar, `FolhaPraticar`). */
          window.setTimeout(() => {
            if (praticar && !emPratica.current && !quemEscolheu.current) voltarAoVocabulario();
            quemEscolheu.current = false;
          }, 300);
        }}
      />
    </Suspense>
  );
  const dialogos = (
    <>
      {opcoesAbertas && (
        <OpcoesDaRevisaoNoQuest
          valores={valoresDaRevisao}
          padrao={OPCOES_PADRAO}
          temVoz={haVozPara(studyLang)}
          producao={producaoNoQuest}
          aoTrocar={trocarOpcoes}
          aoFechar={() => setOpcoesAbertas(false)}
        />
      )}
      {editando && (
        <GavetaDaPalavra
          key={editando.id}
          cartao={vocabCards.find((c) => c.id === editando.id) ?? editando}
          gravacoes={sessoes}
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
      {folhaDasPraticas}
    </>
  );

  // ── Carregando ─────────────────────────────────────────────────────────────
  if (!deckLoaded) {
    return <EsperaDaRevisaoNoQuest titulo={tituloDaRevisao} aoVoltar={voltarAoVocabulario} />;
  }

  // ── Uma prática em curso (Falar, Ouvir e escrever, Completar) ──────────────
  if (pratica) {
    return (
      <Suspense fallback={<EsperaDaRevisaoNoQuest titulo={tituloDaRevisao} aoVoltar={voltarAoVocabulario} />}>
        <Pratica
          key={`${pratica.tipo}:${pratica.itens.map((x) => x.cartao.id).join(',')}`}
          tipo={pratica.tipo}
          rotulo={pratica.recorte.rotulo}
          itens={pratica.itens}
          idiomaDe={idiomaDe}
          tocador={oTocador()}
          atalhos={temTeclado}
          voltaSeErrar={(c) => {
            const quando = intervaloDaNota(c, 1, Date.now(), retencao);
            return quando === 'agora' ? t('ainda hoje') : t('em {quando}', { quando });
          }}
          aoGravar={(resultados) => gravarPratica(pratica.tipo, resultados)}
          aoTrocar={() => setRecortePedido(pratica.recorte)}
          aoSair={(interrompida) => {
            if (interrompida) toast.info(t('Prática interrompida: o que você já respondeu não foi contado.'));
            setPratica(null);
            /* De onde a prática veio: do fim de uma sessão (volta para ele) ou de fora (volta para Cartões). */
            if (!sessionCompleted) voltarAoVocabulario();
          }}
        >
          {folhaDasPraticas}
        </Pratica>
      </Suspense>
    );
  }

  // ── Baralho vazio: o estado que ensina de onde as palavras vêm ─────────────
  if (deckSize === 0) {
    return (
      <BaralhoVazioNoQuest
        titulo={tituloDaRevisao}
        motivo={copyDoPerfil('block.emptyDeck', ageProfile)}
        aoVoltar={voltarAoVocabulario}
        aoCapturar={onChangeView ? () => onChangeView('capture') : undefined}
      >
        {paleta}
      </BaralhoVazioNoQuest>
    );
  }

  // ── Fim da sessão ──────────────────────────────────────────────────────────
  if (sessionCompleted) {
    const feitas = notasDaRodada.length;
    const acertos = notasDaRodada.filter((n) => n > 1).length;
    const seg = inicioDaRodada && fimDaRodada ? Math.round((fimDaRodada - inicioDaRodada) / 1000) : 0;
    /* O QUE FOI CREDITADO, pela mesma conta do perfil (`ganhoDaRevisao`, core): só as notas que o
       servidor aceitou. XP e Seeds do resumo são os que entraram na conta (spec 10.2). */
    const creditado = ganhoDaRevisao(historico.filter((h) => h.aceita).map((h) => h.nota));
    const v2 = recompensasV2Ligadas();
    /* Quando abre a próxima rodada: o vencimento mais próximo e quantas vencem naquele dia. */
    const proxima = (() => {
      const dues = activeVocabCards.filter((c) => c.inDeck && c.dueAtMs).map((c) => c.dueAtMs as number);
      if (!dues.length) return null;
      const d = Math.min(...dues);
      const fimDoDia = new Date(d);
      fimDoDia.setHours(24, 0, 0, 0);
      const depoisDeHoje = amanha();
      const dias = Math.round((fimDoDia.getTime() - depoisDeHoje) / 86_400_000);
      const quando = d < depoisDeHoje ? 'ainda hoje' : dias <= 1 ? 'amanhã' : `em ${dias} dias`;
      return { quando, n: dues.filter((x) => x < fimDoDia.getTime()).length };
    })();
    /* O QUE MUDOU (`cxSubiram`, `cartoes2.js:870-879`), pelo estado de antes de cada nota e o de agora. */
    const agoraDe = (id: string) => vocabCards.find((c) => c.id === id);
    const unicos = (l: NotaDada[]) => l.filter((h, i) => l.findIndex((x) => x.card.id === h.card.id) === i);
    const chips = (l: NotaDada[]) => unicos(l).map((h) => ({ id: h.card.id, palavra: h.card.word, idioma: idiomaDe(h.card) }));
    const comecaram = historico.filter((h) => h.aceita && h.nota > 1 && h.card.fsrsState === 'New');
    const subiram = historico.filter(
      (h) => h.aceita && h.nota > 1 && h.card.fsrsState !== 'New' && h.card.fsrsState !== 'Review' && agoraDe(h.card.id)?.fsrsState === 'Review',
    );
    const escapou = historico.filter((h) => h.nota === 1);
    const grupos: GrupoQueMudou[] = [
      { classe: 'ct-nv' as const, icone: 'comecaram' as const, titulo: t('Começaram'), palavras: chips(comecaram) },
      {
        classe: 'ct-rv' as const,
        icone: 'subiram' as const,
        titulo: t('Passaram para “em revisão”'),
        palavras: chips(subiram),
      },
      { classe: 'ct-ap' as const, icone: 'escaparam' as const, titulo: t('Escaparam'), palavras: chips(escapou) },
    ].filter((g) => g.palavras.length);
    const idsQueEscaparam = unicos(escapou).map((h) => h.card.id);
    const idsDaSessao = unicos(historico).map((h) => h.card.id);
    const recorteDoFim: RecorteDaPratica = idsQueEscaparam.length
      ? {
          origem: 'escaparam',
          rotulo: tp(idsQueEscaparam.length, 'A que escapou', 'As {n} que escaparam'),
          ids: idsQueEscaparam,
        }
      : { origem: 'sessao', rotulo: tp(idsDaSessao.length, 'A desta sessão', 'As {n} desta sessão'), ids: idsDaSessao };
    const daParaPraticar = Object.values(praticasDe(recorteDoFim)).some((p) => p.ok);
    const fechouODia = dueCount === 0 && !recording && !rodada?.limite && !rodada?.soNovas;
    /* A missão de revisar do dia e a sequência: só quando o servidor as devolve (recompensas v2). */
    const missaoDeRevisar = resumoDoDia.missoes?.missoes.find((m) => m.tipo === 'revisar');
    const sequencia = resumoDoDia.ofensiva !== null && resumoDoDia.ofensiva > 0 && !perfilProtegido() ? resumoDoDia.ofensiva : 0;
    return (
      <FimDaRodadaNoQuest
        titulo={fechouODia ? t('Você fechou o dia') : t('Você fechou a sessão')}
        feitoEm={tp(feitas, 'A palavra foi revisada.', 'As {n} palavras foram revisadas.')}
        proximo={
          dueCount > 0
            ? tp(dueCount, 'Ainda vence {n} palavra agora.', 'Ainda vencem {n} palavras agora.')
            : proxima
              ? tp(proxima.n, 'A próxima abre {quando} com {n} palavra.', 'A próxima abre {quando} com {n} palavras.', {
                  quando: proxima.quando,
                })
              : t('Nada mais vence agora.')
        }
        cartoes={feitas}
        lembradas={feitas ? `${Math.round((acertos / feitas) * 100)}%` : '—'}
        tempo={seg ? relogio(seg) : '—'}
        xp={creditado.xp}
        seeds={v2 ? creditado.seeds : null}
        grupos={grupos}
        missao={
          missaoDeRevisar
            ? t('{feito} de {alvo} revisões', {
                feito: Math.min(missaoDeRevisar.atual, missaoDeRevisar.alvo),
                alvo: missaoDeRevisar.alvo,
              })
            : undefined
        }
        sequencia={sequencia ? tp(sequencia, '{n} dia', '{n} dias') : undefined}
        escaparam={idsQueEscaparam.length}
        podeDesfazer={historico.length > 0}
        aoDesfazer={() => void desfazer()}
        aoPraticar={daParaPraticar ? () => setRecortePedido(recorteDoFim) : undefined}
        aoAbrirPalavra={(id) => setEditando(agoraDe(id) ?? null)}
        aoVoltar={voltarAoVocabulario}
      >
        {dialogos}
        {paleta}
      </FimDaRodadaNoQuest>
    );
  }

  // ── Fora de uma rodada (encerrada sem sair da tela, ou à espera de escolher a prática) ─────────
  if (!reviewing || !currentCard) {
    if (praticar)
      return (
        <div className="q-palco q-revisao" data-testid="revisao-no-quest" data-estado="praticar">
          {dialogos}
        </div>
      );
    return (
      <ForaDaRodadaNoQuest
        titulo={tituloDaRevisao}
        quantas={dueCount || deckSize}
        chamada={
          dueCount > 0
            ? copyDoPerfil('now.due.title', ageProfile, { n: dueCount })
            : copyDoPerfil('now.clear.title', ageProfile)
        }
        explicacao={copyDoPerfil('now.due.sub', ageProfile, { sched: scheduler === 'fsrs' ? 'FSRS-5' : 'Leitner' })}
        producao={producaoNoQuest}
        aoComecar={startReviewSession}
        aoOpcoes={() => setOpcoesAbertas(true)}
        aoVoltar={voltarAoVocabulario}
      >
        {dialogos}
        {paleta}
      </ForaDaRodadaNoQuest>
    );
  }

  // ── A rodada ───────────────────────────────────────────────────────────────
  const agora = Date.now();
  const notas: Array<[1 | 2 | 3 | 4, string, string]> =
    botoes === 2
      ? [
          [1, 'e', 'Esqueci'],
          [3, 'b', 'Lembrei'],
        ]
      : [
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
    sentir(score >= 0.85 ? 'acerto' : 'desliga');
  };
  const encerrar = () => {
    setReviewing(false);
    setEncerrada(true);
    if (onChangeView) voltarAoVocabulario();
  };
  /** Múltipla escolha: marca a alternativa e grava o resultado do exercício. */
  const escolherAlternativa = (option: string) => {
    const isCorrect = option.toLowerCase() === currentCard.word.toLowerCase();
    setTypingCorrect(isCorrect);
    setTypingAttempt(option);
    setTypingVerified(true);
    sentir(isCorrect ? 'acerto' : 'desliga');
    // Persiste o resultado do exercício (best-effort) → alimenta métricas.
    void salvarRodada({
      roundId: `study-mc-${currentCard.id}-${Date.now()}`,
      exerciseKind: 'multiple-choice',
      origem: 'estudo',
      sessionId: currentCard.sourceSessionId,
      score: isCorrect ? 1 : 0,
      itens: [{ cardId: currentCard.id, correct: isCorrect ? 1 : 0, kind: 'drill' }],
    });
  };
  /* HÁ VOZ PARA ESTA PALAVRA, AQUI? O idioma é o do cartão (o mesmo que `playWordTTS` usa). No Quest
     a voz é a do site, e só em alguns idiomas: o botão de ouvir aparece quando ela existe. */
  const temVoz = haVozPara(idiomaDe(currentCard));
  const producaoAtiva = (
    <ActiveProductionExercise
      card={currentCard}
      llmValidationEnabled={llmValidation}
      playTTS={playWordTTS}
      temVoz={temVoz}
      onVerify={(res: any) => {
        (currentCard as any)._lastResult = res;
      }}
      onNext={() => {
        const res = (currentCard as any)._lastResult || { correct: false };
        if (scheduler === 'fsrs') void handleFsrsFeedback(currentCard.id, res.correct ? 3 : 1, 'active-production');
        else handleLeitnerFeedback(currentCard.id, res.correct, 'active-production');
      }}
    />
  );

  const notasDoQuest: NotaDoQuest[] =
    scheduler === 'fsrs'
      ? notas.map(([nota, classe, rotulo], i) => ({
          id: String(nota),
          classe,
          rotulo: t(rotulo),
          detalhe: intervaloDaNota(currentCard, nota, agora, retencao),
          tecla: String(i + 1),
          aoDar: (origem: Element | null) => void handleFsrsFeedback(currentCard.id, nota, undefined, origem),
        }))
      : [
          {
            id: 'errei',
            classe: 'e',
            rotulo: t('Errei'),
            detalhe: t('volta à caixa 1'),
            aoDar: () => handleLeitnerFeedback(currentCard.id, false),
          },
          {
            id: 'acertei',
            classe: 'b',
            rotulo: t('Acertei'),
            detalhe: t('avança a caixa'),
            aoDar: () => handleLeitnerFeedback(currentCard.id, true),
          },
        ];

  const origem = origens[currentCard.id];
  const cena = cenaDe(currentCard);
  const frase = fraseDe(currentCard);
  const frases = frasesDe(currentCard);
  const eraErrada = historico.some((h) => h.card.id === currentCard.id && h.nota === 1);
  const sessaoDeOrigem = currentCard.sourceSessionId
    ? sessoes.find((g) => g.id === currentCard.sourceSessionId)
    : undefined;
  const onde: OndeDaFrase | undefined = currentCard.sourceSessionId
    ? sessaoDeOrigem?.title || currentCard.sourceSessionTitle
      ? { texto: sessaoDeOrigem?.title || currentCard.sourceSessionTitle || '', tipo: 'sessao' }
      : undefined
    : currentCard.daTrilha
      ? { texto: t('Trilha'), tipo: 'trilha' }
      : currentCard.daAnki
        ? { texto: 'Anki', tipo: 'baralho' }
        : undefined;
  const sessaoDaCena = cena?.sessionId ?? currentCard.sourceSessionId;
  const abrirSessao = sessaoDaCena && onChangeView ? () => onChangeView('analysis', { id: sessaoDaCena }) : undefined;
  const cartaoDoAviso = avisoDificil ? vocabCards.find((c) => c.id === avisoDificil) : undefined;
  const aviso: AvisoDaRodada | undefined = cartaoDoAviso
    ? {
        tipo: 'dificil',
        palavra: cartaoDoAviso.word,
        idioma: idiomaDe(cartaoDoAviso),
        aoVerSaidas: () => {
          void pedirOrigem(cartaoDoAviso);
          setSaidasDe(cartaoDoAviso);
          setFolha('saidas');
        },
        aoDispensar: () => setAvisoDificil(null),
      }
    : pendentes
      ? { tipo: 'sem-rede', pendentes, aoTentar: () => void tentarDeNovo(true) }
      : undefined;
  const instrucoes: Record<string, string> = {
    cloze: t('Tente lembrar a tradução antes de mostrar a resposta. Depois diga como foi.'),
    typing: t('Escreva a tradução da palavra e confira.'),
    mc: t('Escolha a palavra que completa a frase.'),
    'active-production': t('Escreva de memória a palavra que falta na frase.'),
  };
  /* A cena à vista é a da frase à vista: com "Outra frase" escolhida, o verso fica simples. */
  const cenaAVista = cena && cena.frase === frase ? cena : null;
  const achada = !cena && !juntadas[currentCard.id] ? origem?.achada : null;
  const podeGravar = format === 'cloze' && !!frase;
  const cartaoDasSaidas = saidasDe ? (vocabCards.find((c) => c.id === saidasDe.id) ?? saidasDe) : null;

  return (
    <RodadaDoQuest
      titulo={isActiveProductionOnly ? copyDoPerfil('ex.active_production', ageProfile) : tituloDaRevisao}
      rotulo={isActiveProductionOnly ? t('Produção ativa') : t('Revisão de hoje')}
      indice={currentReviewIndex}
      total={reviewCards.length}
      direcao={direcao}
      cartao={currentCard}
      frase={frase}
      idioma={idiomaDe(currentCard)}
      selo={seloDoCartao(currentCard)}
      selos={{
        nova: currentCard.fsrsState === 'New',
        deNovo: eraErrada,
        dificil: palavraDificil((currentCard as ComMemoria).lapses),
        seguidas,
      }}
      pele={classesDaPalavra(currentCard)}
      onde={onde}
      /* A instrução só nos 3 primeiros cartões (`cxLinha`, `cartoes2.js:278`). */
      instrucao={currentReviewIndex < 3 && notasDaRodada.length < 3 ? instrucoes[format] : undefined}
      aviso={aviso}
      formato={format}
      notas={notasDoQuest}
      mostrandoResposta={showAnswer}
      aoMostrarResposta={mostrarResposta}
      convidaDizer={pedeDizer(currentCard.id, {
        ligado: voz.dizer,
        semDizerNestaRodada: semDizer,
        formatoLembrar: format === 'cloze',
      })}
      aoAgoraNao={() => {
        setSemDizer(true);
        toast.info(t('Sem o convite nesta revisão. Para desligar de vez: “…” › Dizer antes de virar.'));
      }}
      tocando={tocando}
      aoOuvirOriginal={temFalaOriginal(currentCard) ? () => void ouvirOriginal(currentCard) : undefined}
      quemFalou={cenaAVista?.quem}
      aoOuvir={temVoz ? () => void ouvirVoz(currentCard) : undefined}
      cena={cenaAVista}
      traducaoDaFrase={cenaAVista?.traducao || undefined}
      achadaEm={achada ? achada.titulo || t('uma sessão sua') : undefined}
      aoJuntarCena={
        achada
          ? () => {
              juntarCena(currentCard.id);
              setJuntadas((j) => ({ ...j, [currentCard.id]: true }));
              setFraseDaVez(({ [currentCard.id]: _qual, ...resto }) => resto);
              sentir('chega');
              toast.ok(
                achada.temAudio
                  ? t('Cena juntada neste aparelho: “{palavra}” ganhou a frase, a voz da sessão e o caminho até ela.', {
                      palavra: currentCard.word,
                    })
                  : t('Cena juntada neste aparelho: “{palavra}” ganhou a frase e o caminho até a sessão.', {
                      palavra: currentCard.word,
                    }),
              );
            }
          : undefined
      }
      aoAbrirSessao={abrirSessao}
      aoMinhaVoz={podeGravar ? () => setFolha('voz') : undefined}
      temVozGuardada={!!comVozGuardada[currentCard.id]}
      tentativa={typingAttempt}
      aoDigitar={setTypingAttempt}
      verificado={typingVerified}
      certo={typingCorrect}
      aoVerificar={verificarDigitacao}
      alternativas={alternativas}
      aoEscolher={escolherAlternativa}
      aoAvancar={(de) => avancar(format === 'mc' ? 'mc' : 'typing', de)}
      consequencia={
        typingVerified
          ? typingCorrect
            ? t('Conta como “{nota}”: volta em {quando}.', {
                nota: botoes === 2 ? t('Lembrei') : t('Bom'),
                quando: intervaloDaNota(currentCard, 3, agora, retencao),
              })
            : t('Conta como esquecida.')
          : undefined
      }
      producao={producaoAtiva}
      podeDesfazer={historico.length > 0}
      aoDesfazer={() => void desfazer()}
      aoMais={() => {
        void pedirOrigem(currentCard);
        setFolha('mais');
      }}
      aoVoltar={voltarAoVocabulario}
      atalhos={temTeclado}
    >
      {dialogos}
      {paleta}
      <Suspense fallback={null}>
        {folha === 'mais' && (
          <FolhaDoMais
            palavra={currentCard.word}
            idioma={idiomaDe(currentCard)}
            glosa={showAnswer || typingVerified ? currentCard.translation : undefined}
            outraFrase={
              frases.length > 1
                ? t('{qual} de {total}', {
                    qual: ((fraseDaVez[currentCard.id] ?? 0) % frases.length) + 1,
                    total: frases.length,
                  })
                : undefined
            }
            dizer={voz.dizer}
            guardarVoz={voz.guardarVoz}
            atalhos={temTeclado}
            aoEditar={() => setEditando(currentCard)}
            aoAdiar={() => void adiar(currentCard, 1)}
            aoSuspender={() => void suspender(currentCard)}
            aoInfo={() => setInfo(true)}
            aoAbrirSessao={abrirSessao}
            aoOutraFrase={frases.length > 1 ? () => outraFrase(currentCard) : undefined}
            aoMinhaVoz={podeGravar ? () => setFolha('voz') : undefined}
            aoTrocarDizer={(dizer) => trocarVoz({ dizer })}
            aoTrocarGuardarVoz={(guardarVoz) => trocarVoz({ guardarVoz })}
            aoAjustes={() => setOpcoesAbertas(true)}
            aoAtalhos={() => setAtalhosAbertos(true)}
            aoEncerrar={encerrar}
            aoFechar={() => setFolha((f) => (f === 'mais' ? null : f))}
          />
        )}
        {folha === 'voz' && (
          <FolhaMinhaVoz
            idDoCartao={currentCard.id}
            palavra={currentCard.word}
            frase={frase}
            idioma={idiomaDe(currentCard)}
            quem={cenaAVista?.quem}
            originalGravada={!!cenaAVista?.temAudio}
            aoOuvirOriginal={
              cenaAVista || temVoz
                ? () =>
                    cenaAVista
                      ? oTocador().original(cenaAVista, idiomaDe(currentCard))
                      : oTocador().voz(frase, idiomaDe(currentCard))
                : undefined
            }
            aoFechar={() => {
              oTocador().parar();
              setVoz(lerVozNaRevisao());
              setFolha((f) => (f === 'voz' ? null : f));
            }}
            aoMudarGuardadas={(tem) => setComVozGuardada((m) => ({ ...m, [currentCard.id]: tem }))}
          />
        )}
        {folha === 'saidas' && cartaoDasSaidas && (
          <FolhaDasSaidas
            palavra={cartaoDasSaidas.word}
            traducao={cartaoDasSaidas.translation}
            idioma={idiomaDe(cartaoDasSaidas)}
            lapsos={(cartaoDasSaidas as ComMemoria).lapses ?? 0}
            origem={origens[cartaoDasSaidas.id] ?? null}
            aoTrocarFrase={(nova) => void trocarFrase(cartaoDasSaidas, nova)}
            aoOuvirCena={() => {
              const c = cenaDe(cartaoDasSaidas);
              if (c) void oTocador().original(c, idiomaDe(cartaoDasSaidas));
            }}
            aoDescansar={() => void adiar(cartaoDasSaidas, 30)}
            aoFechar={() => {
              oTocador().parar();
              setFolha((f) => (f === 'saidas' ? null : f));
            }}
          />
        )}
        {info && (
          <InfoDoCartao cartao={currentCard} baralho={seloDoCartao(currentCard)} aoFechar={() => setInfo(false)} />
        )}
        {atalhosAbertos && (
          <AtalhosDaRevisao
            doisBotoes={botoes === 2}
            temMinhaVoz={podeGravar}
            aoFechar={() => setAtalhosAbertos(false)}
          />
        )}
      </Suspense>
    </RodadaDoQuest>
  );
}

/** Os campos dos "Ajustes da memória" (`OpcoesDaRevisaoNoQuest`), todos valendo de verdade. */
type ValoresDaRevisao = OpcoesDaRevisao;
