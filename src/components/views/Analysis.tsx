import {
  Activity,
  AlertTriangle,
  AudioLines,
  BarChart3,
  BookMarked,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  FileAudio,
  FileText,
  Gamepad2,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  MessageSquare,
  MessagesSquare,
  Mic,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  Volume2,
  X,
  Youtube,
} from 'lucide-react';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';

import type { AppMetrics, UtteranceRow } from '../../data/api';
import { apiFetch, fetchDeck, fetchMetrics, fetchSessionTranscript, fetchSettings } from '../../data/api';
import { applyOutputDevice } from '../../lib/audioDevices';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang, langLabel } from '../../lib/languages';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
import { copyDoPerfil } from '../../lib/profile';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { toSentences } from '../../lib/sentences';
import { isTtsSupported, speak as ttsSpeak } from '../../lib/tts';
import type { WordOrigin } from '../../lib/vocabWord';
import { tokenizarTexto } from '../../lib/vocabWord';
import type { VocabWord } from '../../types';
import { Recording } from '../../types';
import { Confianca, SemDado } from '../Honestidade';
import NiveisDoConjunto from '../metrics/NiveisDoConjunto';
import PopoverFlutuante from '../PopoverFlutuante';
import TokensClicaveis from '../TokensClicaveis';
import VocabularyPanel from '../VocabularyPanel';
import AnalysisExpandedKpi, { AnalysisKpiType } from './AnalysisExpandedKpi';
import Reading from './Reading';
import Study from './Study';
/**
 * O lobby de jogos, SOB DEMANDA.
 *
 * `lazy` e não import direto porque o `App` já carrega o `Play` assim de propósito (ver o
 * comentário de code-splitting em `App.tsx`): ele é o chunk de 218 kB que puxa os nove jogos e a
 * trilha CEFR. Importado normalmente aqui, esse peso passaria a entrar junto com QUALQUER abertura
 * de sessão — inclusive de quem só quer ler a transcrição. Assim ele só chega quando a aba "Jogos"
 * é aberta de fato.
 *
 * O aliás é obrigatório: `Play` já é o nome do ícone da lucide-react importado acima.
 */
const PlayLobby = lazy(() => import('./Play'));
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { criarEdicaoDeFala } from '../../lib/analise/edicaoDeFala';
import { useMetricasDaSessao } from '../../lib/analise/metricasDaSessao';
import { criarPalavraDaAnalise, useCacheDeHover } from '../../lib/analise/palavraDaAnalise';
import { formatSeconds, usePlayerDaSessao } from '../../lib/analise/playerDaSessao';
import { caminhoDoAudio, useAudioDaSessao } from '../../lib/audioDaSessao';
import { data, numero } from '../../lib/i18n';
import type { DerivedProgress } from '../../lib/progress';
import { TranscriptSettings } from '../../lib/transcriptUtils';
import EditablePanel from '../EditablePanel';
import { Abas, CabecalhoDeTela, TituloDeSecao } from '../ui';
import PlayerInterativo from './analise/PlayerInterativo';

/** Selo de PROCEDÊNCIA da transcrição (honestidade): de onde vieram as falas desta sessão. */
function provenanceLabel(engine?: string | null): string | null {
  switch (engine) {
    case 'youtube-caption-manual':
      return 'Legenda YT (oficial)';
    case 'youtube-caption-auto':
      return 'Legenda YT (automática)';
    case 'whisper-local':
      return 'Whisper local';
    case 'groq-whisper':
      return 'Whisper nuvem (large-v3)';
    case 'web-speech':
      return 'Reconhecimento do navegador';
    case 'import-text':
      return 'Texto importado';
    default:
      return null;
  }
}

/**
 * EVOLUÇÃO SEMANAL — palavras capturadas por semana.
 *
 * Dois painéis desta tela diziam "Evolução ao longo do tempo — em breve (precisa de histórico de
 * sessões)". O histórico já chegava aqui: `AppMetrics.vocabByWeek` é exatamente uma série semanal, e
 * a prop `metrics` já era passada. Componente único porque os dois painéis mostram a MESMA série —
 * duas implementações do mesmo gráfico divergiriam no primeiro ajuste.
 *
 * Com UMA semana o gráfico aparece com o aviso de que um ponto não é tendência: esconder o dado
 * seria mentir por omissão, e traçar uma linha com um ponto seria mentir por sugestão.
 */

export default function Analysis({
  onChangeView,
  recording,
  allRecordings,
  subTab,
  onSubTabChange,
  practiceSeed,
  onSeedConsumed,
  ageProfile = 'pro',
  progress,
  metrics,
}: {
  onChangeView: (view: string, data?: any) => void;
  recording: Recording;
  allRecordings: Recording[];
  subTab: string;
  onSubTabChange: (tab: string) => void;
  /** Semente vinda de outra tela ("praticar esta frase") — repassada ao Study/lobby de jogos. */
  practiceSeed?: PracticeSeed | null;
  onSeedConsumed?: () => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
  /** Só existem porque a aba "Jogos" monta o lobby aqui dentro e o `Play` os exige. */
  progress: DerivedProgress;
  metrics: AppMetrics | null;
}) {
  /* `selectedWord` foi removido junto com o overlay de pronúncia inalcançável que ele guardava. */
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const currentTab = subTab === 'study' ? 'practice' : subTab;
  /**
   * A aba 'practice' tem DOIS corpos e o alias 'study' é quem escolhe:
   *  - clicou na aba "Jogos" (`subTab === 'practice'`) → lobby de jogos desta sessão;
   *  - chegou por `onChangeView('study')` → revisão espaçada (`Study`).
   * Não é firula: `Study` — SRS/FSRS, Produção Ativa e "Meu vocabulário" — é montado só aqui, em
   * lugar nenhum mais do app. Trocar o corpo da aba pelo lobby sem manter este modo deixaria 13
   * pontos de navegação para 'study' (Hub, Métricas, Leitura, lib/progress…) apontando para uma
   * tela que não existiria mais. O id interno segue 'practice' porque mudá-lo quebraria a
   * normalização acima e os deep-links já gravados.
   */
  const modoRevisao = subTab === 'study';

  // Real-time Simulated Media Player states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [autoSlowEnabled, setAutoSlowEnabled] = useState<boolean>(false);
  const [loopMode, setLoopMode] = useState<boolean>(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);

  // Shadowing interactive tool states
  const [shadowingSentenceIndex, setShadowingSentenceIndex] = useState<number | null>(null);
  const [shadowingStep, setShadowingStep] = useState<'idle' | 'recording' | 'processing' | 'result'>('idle');
  const [shadowingScore, setShadowingScore] = useState<{
    fluency: number;
    accuracy: number;
    speed: number;
    feedback: string;
    transcript?: string;
  } | null>(null);
  // Reconhecimento de fala real (Web Speech) para o shadowing — sem simulação.
  const shadowRecRef = useRef<any>(null);
  const shadowStartRef = useRef<number>(0);
  const [overviewSubTab, setOverviewSubTab] = useState<'dashboard' | 'lexical' | 'fluency'>('dashboard');
  const [selectedLexicalWord, setSelectedLexicalWord] = useState<string | null>(null);
  const [expandedAnalysisKpi, setExpandedAnalysisKpi] = useState<AnalysisKpiType>(null);

  // Player REAL: áudio gravado (<audio>) quando existe; senão, narração TTS sincronizada.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [peaks, setPeaks] = useState<number[]>([]); // picos reais do waveform (0..1), decodificados
  const [seekNonce, setSeekNonce] = useState<number>(0); // força reinício da narração TTS ao buscar
  const activeSentenceIndexRef = useRef<number>(-1);
  const hasRealAudio = !!recording.audioUrl && recording.type !== 'document';

  /**
   * O ÁUDIO, BUSCADO COM AUTENTICAÇÃO.
   *
   * `recording.audioUrl` é o caminho da API (`/api/sessions/:id/audio`) e continua sendo a
   * IDENTIDADE do áudio — é o que `hasRealAudio` testa. Mas ele não serve mais como `src`: a rota
   * está atrás do `authMiddleware`, e `<audio src>` não manda cabeçalho nenhum. Com login ligado,
   * player, forma de onda e download levavam 401. O que vai para a tela é a URL de blob.
   */
  const audioDaSessao = useAudioDaSessao(recording.id, hasRealAudio);
  const audioSrc = audioDaSessao.url;

  // Aplica o dispositivo de SAÍDA escolhido (settings.ui.audioOutputId) ao player — real via setSinkId.
  useEffect(() => {
    if (!hasRealAudio) return;
    (async () => {
      const s = await fetchSettings();
      let ui: any;
      try {
        ui = s?.ui ? JSON.parse(s.ui) : {};
      } catch {
        ui = {};
      }
      if (ui.audioOutputId) await applyOutputDevice(audioRef.current, ui.audioOutputId);
    })();
  }, [hasRealAudio, recording.audioUrl]);

  // Fase 2: carrega a transcrição REAL da sessão (utterances do backend).
  const [realUtterances, setRealUtterances] = useState<any[]>([]);
  // Idiomas REAIS da sessão (linha `sessions`): fallback quando a fala não traz o seu.
  const [sessionLangs, setSessionLangs] = useState<{ src: string; tgt: string } | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetchSessionTranscript(recording.id)
      .then((r) => {
        if (!alive) return;
        setRealUtterances(r.utterances || []);
        setSessionLangs({ src: r.session?.sourceLang ?? '', tgt: r.session?.targetLang ?? '' });
      })
      .catch(() => {
        if (alive) {
          setRealUtterances([]);
          setSessionLangs(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [recording.id]);

  // Configuração de idioma do usuário — LEITOR ÚNICO (`lib/langConfig.ts`). Antes esta tela lia a
  // chave `ui.captureSourceLang/captureTargetLang` como `{src, tgt}` e o Estudo/Métricas liam a MESMA
  // chave INVERTIDA: o mesmo cartão saía com o idioma trocado dependendo da tela. Aqui só existem
  // `mine` (o que você fala) e `studying` (o que você estuda) — não há como inverter.
  const langConfig = useLangConfig();

  // FRASES CANÔNICAS (`Sentence[]`) — fonte única, normalizada em `lib/sentences.ts`. É o que
  // viaja para o Study/exercícios. Sem transcrição real → lista vazia (nada é fabricado).
  // `toSentences` deixa `lang` vazio quando o backend não gravou; aqui aplicamos a cadeia de
  // fallback REAL desta tela: fala → idioma da sessão → idioma configurado na Captura.
  const sentences = React.useMemo<Sentence[]>(() => {
    const fbSrc = baseLang(sessionLangs?.src || langConfig.mine);
    const fbTgt = baseLang(sessionLangs?.tgt || langConfig.studying);
    return toSentences(realUtterances as UtteranceRow[]).map((s) => ({
      ...s,
      lang: s.lang || fbSrc,
      translationLang: s.translationLang || fbTgt,
    }));
  }, [realUtterances, sessionLangs, langConfig]);

  // Adaptador local para o player/transcrito desta tela, que falam os nomes antigos e — o ponto
  // sensível — usam `startTime` em SEGUNDOS (o canônico `Sentence.startMs` é em MILISSEGUNDOS).
  // Quando a utterance não tem `tStartMs`, mantém-se o espaçamento sintético de 8s/frase que o
  // player sempre usou (por isso ainda consultamos a linha crua: `startMs: 0` não distingue
  // "começa em 0" de "não gravado").
  const parsedSentences = React.useMemo(() => {
    const hasStart = new Map<string, boolean>(
      (realUtterances as UtteranceRow[]).map((u) => [u.id, u.tStartMs != null]),
    );
    return sentences.map((s) => {
      const startTime = hasStart.get(s.id) ? Math.round(s.startMs / 1000) : s.index * 8;
      const mm = Math.floor(startTime / 60);
      const ss = startTime % 60;
      return {
        id: s.id as string | undefined,
        original: s.text,
        translation: s.translation,
        // Idioma REAL do texto `original` desta fala (o TTS/STT desta tela segue este campo).
        lang: s.lang,
        speaker: s.speaker || '-',
        time: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
        words: [] as string[],
        startTime,
        index: s.index,
      };
    });
  }, [sentences, realUtterances]);

  // Total duration in seconds based on durationStr
  const totalDurationSeconds = React.useMemo(() => {
    if (recording.type === 'document') return 0;
    // Fonte de verdade: a duração REAL do áudio quando carregado (<audio> metadata).
    if (audioDuration > 0) return Math.round(audioDuration);
    const parts = recording.durationStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 180; // fallback
  }, [recording.durationStr, recording.type, audioDuration]);

  /**
   * Idioma de FALLBACK da narração da sessão — usado APENAS quando uma frase não traz o seu próprio
   * idioma (`s.lang`). NÃO serve para decidir o idioma de uma PALAVRA: o idioma de uma palavra vem da
   * FRASE de onde ela saiu (ver `originOfWord` + `lib/vocabWord.ts`). Era exatamente esse o bug —
   * o idioma da PRIMEIRA fala da sessão era carimbado em toda palavra fichada.
   */
  const ttsLang = (realUtterances[0]?.sourceLang as string) || sessionLangs?.src || langConfig.mine || '';
  /** Idioma de uma frase específica (mistura mic/sistema numa mesma sessão é possível). */
  const langOfSentence = (idx: number | null): string => (idx != null && parsedSentences[idx]?.lang) || ttsLang;

  /**
   * A MÁQUINA DE REPRODUÇÃO — busca (`seekTo`/`playFrom`), sincronia da legenda, motor de áudio
   * gravado OU narração TTS, forma de onda decodificada, reset ao trocar de mídia e a
   * desaceleração automática em trechos complexos.
   *
   * Saiu inteira para `lib/analise/playerDaSessao.ts`, no mesmo bloco contíguo e na mesma ordem de
   * hooks em que estava aqui — o estado continua morando nesta tela e entra por parâmetro.
   */
  const { seekTo, playFrom } = usePlayerDaSessao({
    parsedSentences,
    hasRealAudio,
    audioSrc,
    audioRef,
    activeSentenceIndexRef,
    activeSentenceIndex,
    currentTime,
    isPlaying,
    playbackSpeed,
    loopMode,
    autoSlowEnabled,
    ttsLang,
    seekNonce,
    recordingId: recording.id,
    setCurrentTime,
    setActiveSentenceIndex,
    setSeekNonce,
    setIsPlaying,
    setPlaybackSpeed,
    setAudioDuration,
    setPeaks,
    setShadowingSentenceIndex,
    setShadowingStep,
    setShadowingScore,
  });

  // Text Interactive Settings & Hover Popover State
  const [tsSettings, setTsSettings] = useState<TranscriptSettings>({
    fontSize: 'medium',
    textColor: 'standard',
    fontFamily: 'sans',
    displayOrder: 'original-first',
    hideOriginal: false,
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  // Estado do cartão flutuante da palavra — em `lib/popoverDePalavra`, junto com a Leitura, que é
  // renderizada DENTRO desta tela e declarava as mesmas quatro peças.
  const popover = usePopoverDePalavra();
  const hoveredWord = popover.palavra;

  // Deck do BACKEND (mesmo deck do Study/FSRS), não mais localStorage.
  const [vocabCards, setVocabCards] = useState<any[]>([]);

  /**
   * F7 — MÉTRICAS DESTA SESSÃO, e não da conta.
   *
   * A prop `metrics` que esta tela recebe é do perfil INTEIRO. Enquanto não existia endpoint com
   * escopo, os painéis daqui usavam essa prop e exibiam dado da conta sob um cabeçalho que
   * anunciava uma gravação — o gráfico chegava a dizer "6 semanas do seu histórico" (achado D1).
   * Com `?sessao=<id>` (F4), a aba passa a perguntar o que ela realmente quer saber.
   */
  const [metricasDaSessao, setMetricasDaSessao] = useState<AppMetrics | null>(null);
  useEffect(() => {
    if (!recording?.id) {
      setMetricasDaSessao(null);
      return;
    }
    let vivo = true;
    fetchMetrics(recording.id)
      .then((m) => {
        if (vivo) setMetricasDaSessao(m);
      })
      .catch(() => {
        if (vivo) setMetricasDaSessao(null);
      });
    return () => {
      vivo = false;
    };
  }, [recording?.id]);

  // ── Analista de Vocabulário (painel compartilhado) ──
  // `selectedExamWord` = palavra clicada no transcript. null → painel não monta.
  // Nada aqui é fabricado: só `word` (real, do texto), `translation` (MT real) e
  // `example` (a frase real onde a palavra apareceu). cefr/phonetics/explanation
  // ficam `undefined` porque não temos fonte real para eles.
  const [selectedExamWord, setSelectedExamWord] = useState<VocabWord | null>(null);
  const [addedWords, setAddedWords] = useState<string[]>([]);
  const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
  /** Por que esta palavra ficou SEM tradução (par sem motor, falha do MT). null = há tradução. */
  const [examMtNote, setExamMtNote] = useState<string | null>(null);

  // ── Edição inline do transcript (corrigir o que o STT ouviu errado + a tradução) ──
  // `realUtterances` é a FONTE ÚNICA: ao salvar, atualizamos essa lista e todas as
  // derivações (parsedSentences, stats, WPM, player) recalculam via seus useMemo.
  const [editingUttId, setEditingUttId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<string>('');
  const [editTarget, setEditTarget] = useState<string>('');
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { startEditUtt, cancelEditUtt, saveEditUtt } = criarEdicaoDeFala({
    editSource,
    editTarget,
    setEditingUttId,
    setEditSource,
    setEditTarget,
    setEditSaving,
    setEditError,
    setRealUtterances,
  });

  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => {});
  }, []);

  // Gateway (uma vez) para traduções reais no hover e no "Adicionar ao Deck".
  const gateway = React.useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: () => true }), []);

  /**
   * ORIGEM de uma palavra: a FRASE de onde ela saiu e o idioma DAQUELA frase. É o único insumo
   * legítimo para decidir o idioma da palavra e a direção da tradução — quem decide é
   * `lib/vocabWord.ts` (`resolveWord`/`buildVocabWord`). Nada aqui escolhe direção.
   *
   * (Antes esta tela mandava TODA palavra para o MT como `sessão.source → sessão.target`, com o
   * idioma da PRIMEIRA fala. Numa sessão bilíngue isso manda a palavra inglesa ao motor declarada
   * como portuguesa — daí "palavra em português com descrição em inglês".)
   */
  const originOfWord = React.useCallback(
    (word: string, sentence?: string): WordOrigin => {
      const from = parsedSentences.find(
        (s) => (sentence && s.original === sentence) || s.original.toLowerCase().includes(word.toLowerCase()),
      );
      const context = sentence || from?.original || '';
      return {
        word,
        context: context || undefined,
        declaredLang: from?.lang || undefined,
        config: langConfig,
      };
    },
    [parsedSentences, langConfig],
  );

  /**
   * AS MÉTRICAS DESTA SESSÃO — WPM, pausas longas, sobreposição, detalhe lexical, vícios de
   * linguagem, silêncio, maior monólogo e palavras-chave.
   *
   * Os dez `useMemo` saíram para `lib/analise/metricasDaSessao.ts`, onde cada cálculo virou função
   * PURA com teste próprio (`tests/metricasDaSessao.test.ts`). A ordem dos hooks é a mesma: o
   * bloco era contíguo e foi movido como bloco.
   */
  const {
    stats,
    realWpm,
    realLongPauses,
    realSobreposicao,
    lexicalDetail,
    realVicios,
    realSilencio,
    realMonologue,
    topKeywords,
  } = useMetricasDaSessao({
    realUtterances,
    sentences,
    parsedSentences,
    ttsLang,
    selectedLexicalWord,
    vocabCards,
  });

  // Dados reais do hover: imagem (Openverse), tradução (gateway) e frase de contexto, com cache
  // por palavra. Em `lib/analise/palavraDaAnalise.ts`, junto do resto do vocabulário desta tela.
  const { hoverData } = useCacheDeHover({ hoveredWord, vocabCards, originOfWord, gateway });

  /**
   * O VOCABULÁRIO DENTRO DA ANÁLISE — examinar a palavra clicada, fichá-la no deck, mandá-la
   * praticar e pronunciá-la. Saiu para `lib/analise/palavraDaAnalise.ts`; o cabeçalho de lá
   * registra, item a item, por que NÃO compartilha código com `lib/captura/palavraDaFala.ts`, que
   * é o equivalente do outro lado (as quatro funções homônimas divergem no comportamento).
   */
  const { examineWord, handleAddWordToDeck, isWordAdded, handlePracticeWord, speakWord, playWordTTS } =
    criarPalavraDaAnalise({
      gateway,
      originOfWord,
      vocabCards,
      setVocabCards,
      addedWords,
      setAddedWords,
      setSelectedExamWord,
      setExamMtNote,
      selectedExamWordLang: selectedExamWord?.lang,
      ttsSpeed,
      ttsLang,
      recordingId: recording.id,
      recordingTitle: recording.title,
      onChangeView,
    });

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, cleanWord: string) => {
    popover.cancelarFechamento();
    // `currentTarget`, e não `target`: aqui o token já chega filtrado e o retângulo tem de ser o do
    // `<span>` da palavra, não o de um filho eventual.
    popover.abrirEm(e.currentTarget as HTMLElement, cleanWord);
  };

  const handleMouseLeave = popover.agendarFechamento;

  const updateSetting = <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => {
    setTsSettings((prev) => ({ ...prev, [key]: value }));
  };

  /* NUNCA `return null` aqui: era uma tela PRETA de verdade. Enquanto a lista de gravações ainda
     não chegou (abrir /sessao/<id> direto pela URL) mostra "abrindo"; se a lista chegou e o id
     não existe, diz isso e oferece o caminho de volta. */
  if (!recording) {
    const aindaCarregando = allRecordings.length === 0;
    return (
      <div className="flex-1 min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="label-mono mb-2">{aindaCarregando ? 'Abrindo a sessão' : 'Sessão não encontrada'}</p>
          <p className="text-[13px] text-ink-muted leading-snug">
            {aindaCarregando
              ? 'Um instante: carregando as suas gravações.'
              : 'Esta gravação não está mais na sua biblioteca, ou o endereço veio errado.'}
          </p>
          {!aindaCarregando && (
            <button onClick={() => onChangeView('library')} className="btn-outline mt-4">
              Voltar para Biblioteca
            </button>
          )}
        </div>
      </div>
    );
  }

  /* "Ajustar exibição" do protótipo: os mesmos cinco ajustes (`tsSettings`) em controles segmentados. */
  const TAMANHOS: [string, string, string][] = [
    ['small', 'pequeno', 'P'],
    ['medium', 'medio', 'M'],
    ['large', 'grande', 'G'],
    ['xlarge', 'gigante', 'GG'],
  ];
  const TEMAS: [string, string, string][] = [
    ['standard', 'padrao', 'Padrão'],
    ['sepia', 'sepia', 'Sépia'],
    ['highContrast', 'contraste', 'Contraste'],
    ['ocean', 'oceano', 'Oceano'],
    ['neon', 'neon', 'Neon'],
  ];
  const tamanhoAtual = tsSettings.fontSize === 'xxlarge' ? 'xlarge' : tsSettings.fontSize;
  const classesDoTranscrito = `t-${TEMAS.find(([v]) => v === tsSettings.textColor)?.[1] ?? 'padrao'} f-${tsSettings.fontFamily} s-${TAMANHOS.find(([v]) => v === tamanhoAtual)?.[1] ?? 'medio'}`;
  const segmento = (rotulo: string, opcoes: [string, string][], atual: string, aoEscolher: (v: string) => void) => (
    <div>
      <span className="label-mono">{rotulo}</span>
      <div className="seg" role="group" aria-label={rotulo}>
        {opcoes.map(([v, r]) => (
          <button key={v} type="button" aria-pressed={atual === v} onClick={() => aoEscolher(v)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
  const painelDeExibicao = (
    <div className="exib entra">
      {segmento(
        'Ordem',
        [
          ['original-first', 'Original primeiro'],
          ['translated-first', 'Tradução primeiro'],
        ],
        tsSettings.displayOrder,
        (v) => updateSetting('displayOrder', v as typeof tsSettings.displayOrder),
      )}
      {segmento(
        'Original',
        [
          ['mostrar', 'Mostrar'],
          ['ocultar', 'Ocultar'],
        ],
        tsSettings.hideOriginal ? 'ocultar' : 'mostrar',
        (v) => updateSetting('hideOriginal', v === 'ocultar'),
      )}
      {segmento(
        'Tamanho',
        TAMANHOS.map(([v, , r]) => [v, r]),
        tamanhoAtual,
        (v) => updateSetting('fontSize', v as typeof tsSettings.fontSize),
      )}
      {segmento(
        'Fonte',
        [
          ['sans', 'Sans'],
          ['serif', 'Serif'],
          ['mono', 'Mono'],
        ],
        tsSettings.fontFamily,
        (v) => updateSetting('fontFamily', v as typeof tsSettings.fontFamily),
      )}
      {segmento(
        'Tema do texto',
        TEMAS.map(([v, , r]) => [v, r]),
        tsSettings.textColor,
        (v) => updateSetting('textColor', v as typeof tsSettings.textColor),
      )}
    </div>
  );
  /** As palavras que ESTA gravação pôs no caderno (o deck inteiro vem do backend). */
  const palavrasDaSessao = vocabCards.filter((c) => c.sourceSessionId === recording.id);

  /* Marcação do protótipo aprovado (`T.sessao`), o "Figma" do app: cabeçalho com "voltar", rótulo
     do tipo e duração, título, apoio, o trocador de sessão e Exportar, e as abas sublinhadas. */
  const IconeDoTipo = recording.type === 'video' ? Youtube : recording.type === 'document' ? FileText : FileAudio;
  const procedencia = provenanceLabel(realUtterances[0]?.engine);
  // No perfil padrão os nomes são os do protótipo; kids e sênior mantêm a linguagem deles.
  const pro = ageProfile === 'pro';
  const abasDaSessao = [
    {
      id: 'transcript',
      rotulo: pro
        ? recording.type === 'document'
          ? 'Texto'
          : 'Transcrição'
        : copyDoPerfil(
            recording.type === 'document' ? 'sessionTab.transcript.doc' : 'sessionTab.transcript',
            ageProfile,
          ),
      icone: <MessagesSquare aria-hidden />,
    },
    {
      id: 'reading',
      rotulo: pro ? 'Leitura' : copyDoPerfil('sessionTab.reading', ageProfile),
      icone: <BookOpen aria-hidden />,
    },
    {
      id: 'practice',
      rotulo: pro ? 'Jogos' : copyDoPerfil('sessionTab.practice', ageProfile),
      icone: <Gamepad2 aria-hidden />,
    },
    {
      id: 'overview',
      rotulo: pro ? 'Visão geral & métricas' : copyDoPerfil('sessionTab.overview', ageProfile),
      icone: <BarChart3 aria-hidden />,
    },
  ];

  /* `/revisar` é uma tela própria no protótipo (`T.revisao`): cabeçalho "Revisão · 1 de N" e o
     cartão, sem o cabeçalho e as abas da sessão por cima (eram dois h1 na mesma página). A `key`
     pelo id da sessão remonta a fila ao trocar de sessão — ver o comentário na aba Jogos. */
  if (modoRevisao) {
    return (
      <Study
        key={recording.id}
        recording={recording}
        sentences={sentences}
        onChangeView={onChangeView}
        practiceSeed={practiceSeed}
        onSeedConsumed={onSeedConsumed}
        ageProfile={ageProfile}
      />
    );
  }

  return (
    <div className="rolagem flex-1 h-full">
      <div className="tela larga entra" style={{ paddingBottom: 0 }}>
        <CabecalhoDeTela
          voltar={{ rotulo: 'Biblioteca', aoClicar: () => onChangeView('library') }}
          icone={IconeDoTipo}
          sobrancelha={`Sessão de ${recording.type === 'video' ? 'vídeo' : recording.type === 'document' ? 'documento' : 'áudio'} · ${recording.type === 'document' ? 'texto' : recording.durationStr}${procedencia ? ` · ${procedencia}` : ''}`}
          titulo={recording.title}
          sub="Análise do texto, prática ativa e exercícios criados a partir desta mídia."
          acoes={
            <>
              <select
                aria-label="Alternar de sessão"
                id="analysis-session-switcher"
                name="analysis-session-switcher"
                className="campo"
                style={{ width: 'auto', minWidth: 200 }}
                value={recording.id}
                onChange={(e) => onChangeView('analysis', { id: e.target.value })}
              >
                {allRecordings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title.length > 30 ? r.title.substring(0, 30) + '…' : r.title}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-outline" onClick={() => setShowExportModal(true)}>
                <Download aria-hidden /> Exportar
              </button>
            </>
          }
          abas={
            <Abas
              rotuloDoGrupo="O que fazer com esta sessão"
              ativo={currentTab}
              aoTrocar={(id) => onSubTabChange(id as typeof currentTab)}
              itens={abasDaSessao}
            />
          }
        />
      </div>

      <div
        className="tela larga"
        style={{ paddingTop: 0 }}
        role="tabpanel"
        id={`painel-${currentTab}`}
        aria-labelledby={`aba-${currentTab}`}
      >
        {expandedAnalysisKpi && (
          <AnalysisExpandedKpi
            kpi={expandedAnalysisKpi}
            onClose={() => setExpandedAnalysisKpi(null)}
            utterances={realUtterances}
            vicios={realVicios}
          />
        )}
        {currentTab === 'overview' && (
          <EditablePanel
            viewKey="analysis"
            panelKey="overview"
            title="Visão Geral & Métricas"
            canResizeWidth={false}
            canResizeHeight={false}
            defaultHeight={0}
          >
            <div className="entra">
              {/* Marcação do protótipo aprovado (`abaVisao`): sub-abas em pílula e, no Painel, os
                  ladrilhos com a métrica e a explicação embaixo — todos com dado real desta sessão
                  (ou o motivo de não haver). Clicar num ladrilho abre o detalhe. */}
              <Abas
                variante="pilula"
                rotuloDoGrupo="Seções da visão geral"
                ativo={overviewSubTab}
                aoTrocar={(id) => setOverviewSubTab(id as typeof overviewSubTab)}
                itens={[
                  { id: 'dashboard', rotulo: 'Painel', icone: <LayoutGrid aria-hidden /> },
                  { id: 'lexical', rotulo: 'Inteligência lexical', icone: <Brain aria-hidden /> },
                  ...(recording.type === 'document'
                    ? []
                    : [{ id: 'fluency', rotulo: 'Fluência', icone: <AudioLines aria-hidden /> }]),
                ]}
              />
              <div
                style={{ marginTop: 18 }}
                role="tabpanel"
                id={`painel-${overviewSubTab}`}
                aria-labelledby={`aba-${overviewSubTab}`}
              >
                {overviewSubTab === 'dashboard' && (
                  <>
                    <div className="ladrilhos">
                      {(
                        [
                          [
                            'words_read',
                            'Palavras',
                            stats.wordCount > 0 ? numero(stats.wordCount) : '—',
                            'na transcrição inteira',
                            '',
                          ],
                          [
                            'study_time',
                            'Minutos de leitura',
                            stats.wordCount > 0 ? numero(Math.max(1, Math.round(stats.wordCount / 250))) : '—',
                            'no ritmo médio de leitura',
                            '',
                          ],
                          [
                            'flesch',
                            'Facilidade de leitura',
                            stats.readingEase != null ? String(stats.readingEase) : '—',
                            stats.readingEase != null
                              ? 'de 100 (maior = mais fácil)'
                              : stats.syllableCount == null
                                ? `sem régua de legibilidade para ${langLabel(stats.idioma)}`
                                : 'precisa de mais texto',
                            'acc',
                          ],
                          [
                            'density',
                            'Densidade lexical',
                            stats.lexicalDensityPct != null ? `${stats.lexicalDensityPct}%` : '—',
                            stats.lexicalDensityPct != null
                              ? 'palavras de conteúdo'
                              : `sem lista de stopwords para ${langLabel(stats.idioma)}`,
                            '',
                          ],
                          [
                            'jargons',
                            'Palavras únicas',
                            stats.wordCount > 0 ? numero(stats.uniqueWords) : '—',
                            'sem repetir',
                            'good',
                          ],
                          ...(recording.type === 'document'
                            ? []
                            : [
                                [
                                  'ppm',
                                  'Palavras por minuto',
                                  realWpm != null ? String(realWpm) : '—',
                                  realWpm != null ? 'ritmo da fala (timing real)' : 'requer timing das falas',
                                  'acc',
                                ],
                                [
                                  'fillers',
                                  'Vícios de linguagem',
                                  realVicios.palavras > 0 ? String(realVicios.total) : '—',
                                  realVicios.palavras > 0
                                    ? `${realVicios.porMilPalavras} a cada 1000 palavras`
                                    : 'requer fala em português ou inglês',
                                  '',
                                ],
                              ]),
                          [
                            'lexical_richness',
                            'Riqueza (TTR)',
                            stats.wordCount > 0 ? `${Math.round(stats.typeTokenRatio * 100)}%` : '—',
                            'variedade do vocabulário',
                            '',
                          ],
                          ...(recording.type === 'document'
                            ? []
                            : [
                                [
                                  'long_pauses',
                                  'Pausas longas',
                                  realLongPauses != null ? String(realLongPauses) : '—',
                                  realLongPauses != null ? 'acima de 3 segundos' : 'requer timing das falas',
                                  'warn',
                                ],
                              ]),
                        ] as [NonNullable<AnalysisKpiType>, string, string, string, string][]
                      ).map(([id, rotulo, valor, dica, tom]) => (
                        <button
                          key={id}
                          type="button"
                          className="cartao ladrilho clicavel"
                          style={{ textAlign: 'left' }}
                          onClick={() => setExpandedAnalysisKpi(id)}
                          title={dica}
                        >
                          <span className="label-mono">{rotulo}</span>
                          <span className={`v ${tom}`}>{valor}</span>
                          <p className="mut" style={{ fontSize: 12, marginTop: 4 }}>
                            {dica}
                          </p>
                        </button>
                      ))}
                    </div>
                    <section className="cartao p5 secao">
                      <TituloDeSecao icone={KeyRound} titulo="Palavras-chave da sessão" nivel="h3" />
                      {topKeywords.length > 0 ? (
                        <div className="chips">
                          {topKeywords.map((kw) => (
                            <button
                              key={kw}
                              type="button"
                              className="pill"
                              onClick={() => examineWord(kw.toLowerCase(), kw)}
                            >
                              {kw}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mut" style={{ fontSize: 12.5 }}>
                          Sem transcrição real para extrair palavras-chave.
                        </p>
                      )}
                      <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
                        Termos de maior saliência na transcrição real. São termos, não tópicos: agrupá-los sob um nome
                        de assunto exigiria um modelo de linguagem.
                      </p>
                    </section>
                  </>
                )}

                {overviewSubTab === 'lexical' && (
                  <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-right-4 items-start">
                    <div className="flex-1 flex flex-col space-y-6 min-w-0 w-full">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div
                          className="card-panel p-5 bg-gradient-to-br from-rare/10 to-transparent border-rare/20 cursor-pointer hover:border-rare/40 hover:shadow-md transition-all"
                          onClick={() => setExpandedAnalysisKpi('lexical_richness')}
                        >
                          <span className="label-mono block mb-2 font-semibold text-rare-ink">
                            Total de Vocábulos Únicos
                          </span>
                          <div className="font-display font-black text-3xl tracking-tight text-ink">
                            {stats.wordCount > 0 ? numero(stats.uniqueWords) : '-'}
                          </div>
                          <p className="text-[12px] text-ink-muted mt-2">
                            Palavras distintas na transcrição desta sessão.
                          </p>
                        </div>
                        <div
                          className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all"
                          onClick={() => setExpandedAnalysisKpi('jargons')}
                        >
                          <span className="label-mono block mb-2 font-semibold text-ink-muted">
                            Termos Técnicos/Jargões
                          </span>
                          {/* Jargão exige um LÉXICO DE DOMÍNIO que o projeto não tem — separar termo
                          técnico de palavra comum depende de saber o assunto. Não é "em breve". */}
                          <div className="font-display font-black text-3xl tracking-tight text-ink-muted">-</div>
                          <p className="text-[12px] text-ink-muted mt-2">
                            Distinguir jargão de palavra comum exige um léxico do domínio, que o app não tem.
                          </p>
                        </div>
                        <div
                          className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all"
                          onClick={() => setExpandedAnalysisKpi('study_time')}
                        >
                          <span className="label-mono block mb-2 font-semibold text-ink-muted">
                            Cards desta Sessão (SRS)
                          </span>
                          <div className="font-display font-black text-3xl tracking-tight text-accent">
                            {vocabCards.filter((c) => c.sourceSessionId === recording.id).length}
                          </div>
                          <p className="text-[12px] text-ink-muted mt-2">
                            Termos já enviados ao deck de revisão espaçada.
                          </p>
                        </div>
                      </div>

                      {/* C1 — AQUI HAVIA UMA TABELA FABRICADA, o pior defeito que este produto podia ter.
                      "Termo / Expressão · Tradução Contextual · Categoria · Ocorrências", com três
                      linhas cravadas no JSX (uma delas dizendo "5×"), idênticas para toda sessão de
                      todo usuário, contagens de ocorrência inventadas, apresentadas como análise
                      lexical do que a pessoa acabou de gravar.

                      Extrair expressões-chave exige reconhecimento de termo com peso de domínio, e
                      este painel não chama modelo nenhum. A resposta honesta é dizer isso, não
                      preencher o vazio com algo plausível, e era justamente a plausibilidade que
                      tornava a tabela difícil de notar: uma sessão sobre tecnologia bem que poderia
                      conter aquelas palavras.

                      A Topologia Lexical logo abaixo CONTINUA: ela é alimentada por `vocabCards`,
                      dado real do deck. Remover as duas seria trocar um erro por outro. */}
                      <SemDado motivo="Lista de expressoes-chave: exige extracao de termos com peso de dominio, que este painel nao calcula. Abaixo, a topologia lexical construida a partir dos cartoes REAIS do seu deck." />

                      {/* ESCOPO HONESTO (spec metricas-honestas-consertos): o título dizia "da Sessão"
                      e o scatter plotava o deck INTEIRO — ao contrário do KPI logo acima, que
                      filtra por sourceSessionId. Agora o filtro existe e, quando a sessão não tem
                      cartões, o vazio diz isso em vez de mostrar dados de outro escopo. */}
                      <div className="card-panel p-0 overflow-hidden">
                        <div className="p-5 border-b border-border-subtle bg-surface">
                          <h3 className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
                            <Brain className="w-4 h-4 text-rare" /> Topologia Lexical da Sessão
                          </h3>
                          <p className="text-[12px] text-ink-muted mt-1">
                            Cada ponto é um card salvo A PARTIR desta sessão: caixa Leitner (x) × estabilidade FSRS em
                            dias (y), tamanho pela dificuldade.
                          </p>
                        </div>
                        <div className="p-5 bg-canvas">
                          {vocabCards.filter((c) => c.sourceSessionId === recording.id).length > 0 ? (
                            <div className="w-full" style={{ height: 300 }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <ScatterChart
                                  margin={{ top: 20, right: 20, bottom: 20, left: -20 }}
                                  onClick={(e: any) => {
                                    if (e && e.activePayload && e.activePayload.length > 0) {
                                      setSelectedLexicalWord(e.activePayload[0].payload.name);
                                    }
                                  }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                                  <XAxis
                                    type="number"
                                    dataKey="x"
                                    name="Caixa Leitner"
                                    stroke="var(--ink-muted)"
                                    tick={{ fontSize: 11 }}
                                    domain={[0, 6]}
                                    allowDecimals={false}
                                  />
                                  <YAxis
                                    type="number"
                                    dataKey="y"
                                    name="Estabilidade (dias)"
                                    stroke="var(--ink-muted)"
                                    tick={{ fontSize: 11 }}
                                  />
                                  <ZAxis type="number" dataKey="z" range={[60, 320]} name="Dificuldade" />
                                  <Tooltip
                                    cursor={{ strokeDasharray: '3 3', stroke: 'var(--accent)', opacity: 0.5 }}
                                    contentStyle={{
                                      backgroundColor: 'var(--surface)',
                                      borderColor: 'var(--border-subtle)',
                                      borderRadius: '8px',
                                      color: 'var(--ink)',
                                    }}
                                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                  />
                                  <Scatter
                                    name="Vocabulário"
                                    data={vocabCards
                                      .filter((c) => c.sourceSessionId === recording.id)
                                      .map((c) => ({
                                        name: c.word,
                                        x: c.leitnerBox ?? 1,
                                        y: Math.round(((c.fsrsStability ?? c.stability ?? 0) as number) * 10) / 10,
                                        z: c.fsrsDifficulty ?? 5,
                                      }))}
                                    fill="var(--rare)"
                                    fillOpacity={0.7}
                                    className="cursor-pointer"
                                  />
                                </ScatterChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div
                              className="flex flex-col items-center justify-center text-center gap-3 text-ink-muted"
                              style={{ height: 300 }}
                            >
                              <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center">
                                <Brain className="w-6 h-6" />
                              </div>
                              <p className="text-[13px] font-medium max-w-xs leading-relaxed">
                                {vocabCards.length > 0
                                  ? 'Nenhum cartão do seu deck veio DESTA sessão. Passe o mouse sobre um termo na transcrição e adicione-o para ver a topologia dela.'
                                  : 'Nenhum vocábulo no deck ainda. Passe o mouse sobre um termo na transcrição e adicione-o para ver a topologia real.'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedLexicalWord && (
                      <div
                        className="w-full lg:w-[350px] xl:w-[400px] shrink-0 bg-canvas border border-border-subtle rounded-2xl shadow-sm flex flex-col sticky top-6 animate-in slide-in-from-right-4"
                        style={{ maxHeight: 'calc(100vh - 48px)' }}
                      >
                        <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
                          <h2 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2">
                            <BookMarked className="w-4 h-4 text-accent" /> Microdados Lexicais
                          </h2>
                          <button
                            onClick={() => setSelectedLexicalWord(null)}
                            className="p-1.5 hover:bg-surface-hover rounded-full transition-colors text-ink-muted hover:text-ink"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex-1 p-5 space-y-6 pb-6 overflow-y-auto custom-scrollbar">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-display font-black text-2xl tracking-tight text-ink break-words">
                                {selectedLexicalWord}
                              </h3>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {/* A fonética só aparece quando o cartão TEM `phonetics`. O app não tem
                                dicionário fonético para preencher o resto, e chutar IPA é inventar. */}
                                {lexicalDetail?.fonetica && (
                                  <span className="text-[13px] text-ink-muted font-mono bg-surface px-2 py-0.5 rounded">
                                    {lexicalDetail.fonetica}
                                  </span>
                                )}
                                <button
                                  onClick={() => speakWord(selectedLexicalWord, lexicalDetail?.lang)}
                                  disabled={!isTtsSupported()}
                                  title={
                                    isTtsSupported()
                                      ? `Ouvir "${selectedLexicalWord}"`
                                      : 'Este navegador não tem voz sintetizada'
                                  }
                                  aria-label={`Ouvir a pronúncia de ${selectedLexicalWord}`}
                                  className="text-accent hover:text-accent/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed p-1.5 -m-1.5"
                                >
                                  <Volume2 className="w-4 h-4" />
                                </button>
                              </div>
                              {lexicalDetail?.traducao && (
                                <p className="text-[13px] text-ink-muted mt-2">{lexicalDetail.traducao}</p>
                              )}
                            </div>
                            {lexicalDetail?.nivel && (
                              <div className="flex flex-col items-end shrink-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                                  Nível
                                </span>
                                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-surface text-ink-muted border border-border-subtle">
                                  {lexicalDetail.nivel}
                                </span>
                                {/* A estimativa CEFR é heurística de baixa confiança — o docstring de
                                `estimateCefr` pede que a UI diga isso, e antes ela dizia "C2 (Master)".

                                F3, aqui havia um limiar próprio de 0,6, contra 0,5 no resto do app.
                                Uma estimativa de 55% saía rotulada "estimativa" NESTA tela e sem
                                rótulo nenhum em Analytics. Agora o selo e o limiar são os mesmos
                                em todo lugar, e o percentual fica visível em vez de implícito. */}
                                {lexicalDetail.nivelConfianca != null && (
                                  <Confianca valor={lexicalDetail.nivelConfianca} estimativa className="mt-1" />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-surface border border-border-subtle rounded-xl p-3">
                              <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider block mb-1">
                                Ocorrências
                              </span>
                              <span className="font-mono text-lg font-bold text-ink">
                                {lexicalDetail?.ocorrencias ?? 0}
                              </span>
                              <span className="block text-[10px] text-ink-faint mt-0.5">nesta transcrição</span>
                            </div>
                            <div className="bg-surface border border-border-subtle rounded-xl p-3">
                              <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider block mb-1">
                                Retenção (FSRS)
                              </span>
                              <span
                                className={`font-mono text-lg font-bold ${lexicalDetail?.retencao != null ? 'text-accent' : 'text-ink-muted'}`}
                              >
                                {lexicalDetail?.retencao != null ? `${lexicalDetail.retencao}%` : '-'}
                              </span>
                              <span className="block text-[10px] text-ink-faint mt-0.5">
                                {lexicalDetail?.retencao != null ? 'na data de hoje' : 'só após a 1ª revisão'}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className="text-[13px] font-bold text-ink flex items-center gap-2">
                              <MessageSquare className="w-4 h-4 text-ink-muted" /> Trechos da Sessão
                            </h4>
                            {/* Era uma frase inventada em inglês ("We need to <palavra> our existing user
                            base…") mostrada para QUALQUER palavra, inclusive portuguesa. Agora são as
                            falas reais do transcrito, e o play vai para o instante certo. */}
                            {lexicalDetail && lexicalDetail.trechos.length > 0 ? (
                              <div className="space-y-2">
                                {lexicalDetail.trechos.map((t, i) => (
                                  <div
                                    key={i}
                                    className="p-3 bg-surface/50 border border-border-subtle/50 rounded-xl relative group"
                                  >
                                    <p className="text-[13px] leading-relaxed text-ink-muted italic pe-9">
                                      "{t.texto}"
                                    </p>
                                    <button
                                      onClick={() => playFrom(t.startTime)}
                                      title="Ouvir este trecho"
                                      aria-label={`Ouvir o trecho a partir de ${formatSeconds(t.startTime)}`}
                                      className="absolute right-2 top-2 p-2 bg-canvas rounded-full shadow-sm text-ink-muted hover:text-accent transition-all border border-border-subtle"
                                    >
                                      <Play className="w-3 h-3 ms-0.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[12px] text-ink-faint leading-relaxed p-3 bg-surface/50 border border-border-subtle/50 rounded-xl">
                                Esta palavra está no seu baralho, mas não aparece na transcrição desta sessão.
                              </p>
                            )}
                          </div>

                          {/* O botão era um "Enviar para SRS" sem `onClick`. E para a maioria das palavras
                          deste painel ele não faria sentido nenhum: elas JÁ estão no baralho, foi de
                          lá que vieram para o gráfico. Agora ele só existe quando há o que fazer. */}
                          {lexicalDetail?.noDeck ? (
                            <p className="text-[12px] text-ink-faint text-center flex items-center justify-center gap-1.5">
                              <Check className="w-3.5 h-3.5 text-good" /> Já está no seu baralho de revisão.
                            </p>
                          ) : (
                            <button
                              onClick={() => handleAddWordToDeck(selectedLexicalWord)}
                              className="w-full py-2.5 rounded-xl bg-ink text-canvas font-bold text-[13px] hover:bg-ink-hover transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                              <Sparkles className="w-4 h-4" /> Enviar para o baralho
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {overviewSubTab === 'fluency' && recording.type !== 'document' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="cartao p5 clicavel" onClick={() => setExpandedAnalysisKpi('dominant_tone')}>
                      <TituloDeSecao icone={AudioLines} titulo="Pausas e monólogos" nivel="h3" />
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                          <span className="text-[13px] text-ink-muted">Pausas longas (&gt;3s)</span>
                          <span className="font-bold text-[13px] text-ink">
                            {realLongPauses != null ? `${realLongPauses} (timing real)` : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                          <span className="text-[13px] text-ink-muted">Maior monólogo</span>
                          <span className="font-bold text-[13px] text-ink">
                            {realMonologue != null ? formatSeconds(Math.round(realMonologue / 1000)) : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pb-1">
                          <span className="text-[13px] text-ink-muted">Interrupções (sobreposição)</span>
                          {/* Era "requer diarização — em breve". A diarização existe; faltava a conta. */}
                          <span className={`font-bold text-[13px] ${realSobreposicao ? 'text-ink' : 'text-ink-faint'}`}>
                            {realSobreposicao
                              ? `${realSobreposicao.total} (${formatSeconds(Math.round(realSobreposicao.msSobrepostos / 1000))})`
                              : 'requer 2 falantes com timing'}
                          </span>
                        </div>
                        {realSobreposicao && (
                          <p className="text-[11px] text-ink-faint leading-relaxed pt-1">
                            Entre {realSobreposicao.falantes.length} falantes ({realSobreposicao.falantes.join(', ')});
                            a mais longa durou {formatSeconds(Math.round(realSobreposicao.maiorMs / 1000))}.
                            {/* Sem isto o total parece cobrir a gravação inteira quando não cobre. */}
                            {realSobreposicao.falasSemTiming > 0 &&
                              ` ${realSobreposicao.falasSemTiming} falas ficaram fora, sem timing ou sem falante.`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Silêncio MEDIDO entre as falas. Onde havia "45 seg · representa 12% da gravação,
                      ritmo saudável" cravado no JSX, número inventado apresentado como medição. O
                      juízo ("ritmo saudável") não volta: não há norma no app com que comparar. */}
                      <div className="card-panel p-5">
                        <span className="label-mono block mb-2 font-semibold text-ink-muted">
                          Pausas Articulatórias
                        </span>
                        <div className="font-display font-black text-3xl tracking-tight text-ink">
                          {realSilencio != null ? Math.round(realSilencio.ms / 1000) : '-'}
                          {realSilencio != null && <span className="text-[14px] text-ink-faint ms-1">seg</span>}
                        </div>
                        <p className="text-[12px] text-ink-muted mt-2">
                          {realSilencio != null
                            ? `Soma dos intervalos entre falas, ${realSilencio.pct}% do trecho falado (timing real).`
                            : 'Requer timing das falas; esta gravação não tem.'}
                        </p>
                      </div>
                      <div
                        className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all"
                        onClick={() => setExpandedAnalysisKpi('fillers')}
                      >
                        <span className="label-mono block mb-2 font-semibold text-ink-muted">Vícios Identificados</span>
                        <div className="font-display font-black text-3xl tracking-tight text-ink">
                          {realVicios.palavras > 0 ? realVicios.total : '-'}
                        </div>
                        <p className="text-[12px] text-ink-muted mt-2">
                          {realVicios.palavras === 0
                            ? 'Nenhuma fala em idioma com lista de marcadores (só português e inglês).'
                            : realVicios.total === 0
                              ? `Nenhum marcador de hesitação em ${realVicios.palavras} palavras.`
                              : `${realVicios.porMilPalavras} por mil palavras, ${realVicios.detalhe
                                  .slice(0, 3)
                                  .map((d) => `"${d.marcador}" ${d.vezes}×`)
                                  .join(', ')}.`}
                        </p>
                      </div>
                      <div className="card-panel p-5">
                        <span className="label-mono block mb-2 font-semibold text-ink-muted">Tom Predominante</span>
                        <div className="font-display font-black text-3xl tracking-tight text-ink-muted">-</div>
                        <p className="text-[12px] text-ink-muted mt-2">
                          Depende de variação de pitch, que exige análise acústica do áudio, o app não faz. Nada foi
                          estimado.
                        </p>
                      </div>
                    </div>

                    {/* Este painel se chamava "Assinatura Acústica & Densidade" e mostrava, embaixo do
                    título, um aviso sobre "evolução ao longo do tempo", título de uma coisa,
                    conteúdo de outra. Assinatura acústica exige análise do áudio, que o app não faz,
                    então o título saiu junto: manter o título de um gráfico que nunca vai existir é
                    prometer pelo cabeçalho. O que ficou é a evolução, que é real. */}
                    {/* F7 — idem: dado da conta num painel de sessão. */}
                    <NiveisDoConjunto metricas={metricasDaSessao} titulo="Níveis desta sessão" />
                  </div>
                )}
              </div>
            </div>
          </EditablePanel>
        )}

        {currentTab === 'transcript' && (
          <div className="entra">
            {/* Marcação do protótipo aprovado (`abaTranscricao`): o player compacto, e embaixo a grade
                com a transcrição (cada fala com ouvir, praticar a pronúncia e corrigir) e, ao lado,
                as palavras desta sessão — ou o Analista, quando uma palavra está aberta. */}
            <PlayerInterativo
              recording={recording}
              ageProfile={ageProfile}
              parsedSentences={parsedSentences}
              totalDurationSeconds={totalDurationSeconds}
              hasRealAudio={hasRealAudio}
              audioSrc={audioSrc}
              audioRef={audioRef}
              audioDuration={audioDuration}
              setAudioDuration={setAudioDuration}
              peaks={peaks}
              isPlaying={isPlaying}
              setIsPlaying={setIsPlaying}
              currentTime={currentTime}
              setCurrentTime={setCurrentTime}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              autoSlowEnabled={autoSlowEnabled}
              setAutoSlowEnabled={setAutoSlowEnabled}
              loopMode={loopMode}
              setLoopMode={setLoopMode}
              activeSentenceIndex={activeSentenceIndex}
              seekTo={seekTo}
              playFrom={playFrom}
              shadowingSentenceIndex={shadowingSentenceIndex}
              setShadowingSentenceIndex={setShadowingSentenceIndex}
              shadowingStep={shadowingStep}
              setShadowingStep={setShadowingStep}
              shadowingScore={shadowingScore}
              setShadowingScore={setShadowingScore}
              shadowRecRef={shadowRecRef}
              shadowStartRef={shadowStartRef}
              langOfSentence={langOfSentence}
              playWordTTS={playWordTTS}
              mostrarExib={showSettings}
              aoAlternarExib={() => setShowSettings(!showSettings)}
              exib={painelDeExibicao}
            />
            {/* Documento não tem player; o "Ajustar exibição" dele fica acima do texto. */}
            {recording.type === 'document' && (
              <section className="cartao p5 player" aria-label="Exibição do texto">
                <div className="linha" style={{ gap: 8 }}>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn btn-outline peq"
                    onClick={() => setShowSettings(!showSettings)}
                    aria-expanded={showSettings}
                  >
                    <SlidersHorizontal aria-hidden /> Ajustar exibição
                  </button>
                </div>
                {showSettings && painelDeExibicao}
              </section>
            )}

            <div className="sessao-grade">
              <EditablePanel
                viewKey="analysis"
                panelKey="transcript"
                title="Transcrição Integrada"
                canResizeWidth={false}
                canResizeHeight={false}
                defaultHeight={0}
              >
                <section className={`cartao transcrito ${classesDoTranscrito}`} aria-label="Transcrição da sessão">
                  <div className="entre transcrito-cab">
                    <div className="tsec-t">
                      <MessagesSquare aria-hidden />
                      <h2 style={{ fontSize: 16, fontWeight: 700 }}>Transcrição e tradução integradas</h2>
                    </div>
                    {procedencia && (
                      <span className="badge neu" title="Procedência da transcrição desta sessão">
                        <Cpu aria-hidden /> {procedencia}
                      </span>
                    )}
                  </div>
                  {parsedSentences.map((sentence, sIdx) => {
                    const propsDosTokens = {
                      tokens: tokenizarTexto(sentence.original),
                      estaNoDeck: (clean: string) => vocabCards.some((c) => c.word.toLowerCase() === clean && c.inDeck),
                      onMouseEnter: handleMouseEnter,
                      onMouseLeave: handleMouseLeave,
                      onExaminar: (clean: string) => examineWord(clean, sentence.original),
                    };
                    const isActive = sentence.index === activeSentenceIndex && recording.type !== 'document';
                    const uttId = sentence.id;
                    const isEditing = !!uttId && editingUttId === uttId;
                    const original = !tsSettings.hideOriginal && (
                      <TokensClicaveis {...propsDosTokens} className="orig" />
                    );
                    const traducao = <span className="trad">{sentence.translation}</span>;
                    return (
                      <div
                        key={sIdx}
                        className={`fala-s ${isActive ? 'ativa' : ''}`}
                        onClick={() => {
                          if (isEditing) return;
                          if (recording.type !== 'document') playFrom(sentence.startTime);
                        }}
                        onDoubleClick={() => {
                          if (uttId) startEditUtt(uttId, sentence.original, sentence.translation);
                        }}
                      >
                        <div className="fala-cab">
                          <span className="quem-s">{sentence.speaker}</span>
                          <span className="tempo tn">{sentence.time}</span>
                          <div className="fala-acoes">
                            <button
                              type="button"
                              className="btn btn-outline peq icone"
                              aria-label="Ouvir este trecho"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (recording.type !== 'document') playFrom(sentence.startTime);
                                else ttsSpeak(sentence.original, { lang: sentence.lang || ttsLang, rate: 0.9 });
                              }}
                            >
                              <Play aria-hidden />
                            </button>
                            {recording.type !== 'document' && (
                              <button
                                type="button"
                                className="btn btn-outline peq icone"
                                aria-label="Praticar a pronúncia deste trecho"
                                aria-pressed={shadowingSentenceIndex === sentence.index}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShadowingSentenceIndex(sentence.index);
                                  setShadowingStep('idle');
                                  setShadowingScore(null);
                                }}
                              >
                                <Mic aria-hidden />
                              </button>
                            )}
                            {uttId && (
                              <button
                                type="button"
                                className="btn btn-outline peq icone"
                                aria-label="Corrigir o texto e a tradução deste trecho"
                                aria-pressed={isEditing}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditUtt(uttId, sentence.original, sentence.translation);
                                }}
                              >
                                <Pencil aria-hidden />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="fala-corpo">
                          {isEditing ? (
                            <div
                              className="corrige"
                              onClick={(e) => e.stopPropagation()}
                              onDoubleClick={(e) => e.stopPropagation()}
                            >
                              <label className="sr" htmlFor="analysis-edit-source">
                                Texto original (o que foi falado)
                              </label>
                              <textarea
                                id="analysis-edit-source"
                                name="analysis-edit-source"
                                className="campo"
                                autoFocus
                                value={editSource}
                                onChange={(e) => setEditSource(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditUtt();
                                  }
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    if (uttId) saveEditUtt(uttId);
                                  }
                                }}
                                disabled={editSaving}
                              />
                              <label className="sr" htmlFor="analysis-edit-target">
                                Tradução
                              </label>
                              <textarea
                                id="analysis-edit-target"
                                name="analysis-edit-target"
                                className="campo"
                                value={editTarget}
                                onChange={(e) => setEditTarget(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditUtt();
                                  }
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    if (uttId) saveEditUtt(uttId);
                                  }
                                }}
                                disabled={editSaving}
                              />
                              {editError && (
                                <p style={{ color: 'var(--error-ink)', fontSize: 12.5, fontWeight: 600 }}>
                                  <AlertTriangle aria-hidden style={{ width: 14, height: 14, verticalAlign: -2 }} />{' '}
                                  {editError}
                                </p>
                              )}
                              <div className="linha" style={{ gap: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-solid peq"
                                  disabled={editSaving}
                                  onClick={() => uttId && saveEditUtt(uttId)}
                                >
                                  {editSaving ? (
                                    <Loader2 className="animate-spin" aria-hidden />
                                  ) : (
                                    <Check aria-hidden />
                                  )}{' '}
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline peq"
                                  disabled={editSaving}
                                  onClick={cancelEditUtt}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : tsSettings.displayOrder === 'original-first' ? (
                            <>
                              {original}
                              {traducao}
                            </>
                          ) : (
                            <>
                              {traducao}
                              {original}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </section>
              </EditablePanel>

              {selectedExamWord ? (
                /* O Analista de Vocabulário (compartilhado com Captura, Leitura, Estudo e Métricas). */
                <VocabularyPanel
                  viewKey="analysis"
                  word={selectedExamWord}
                  mtNote={examMtNote}
                  onClose={() => {
                    setSelectedExamWord(null);
                    setExamMtNote(null);
                  }}
                  onSpeak={speakWord}
                  onAddToDeck={handleAddWordToDeck}
                  isAdded={isWordAdded(selectedExamWord)}
                  ttsSpeed={ttsSpeed}
                  setTtsSpeed={setTtsSpeed}
                  onPractice={handlePracticeWord}
                />
              ) : (
                <aside className="cartao p5 analista" aria-label="Palavras desta sessão">
                  <TituloDeSecao icone={BookOpen} titulo="Palavras desta sessão" nivel="h3" />
                  <p className="mut" style={{ fontSize: 12.5, margin: '-6px 0 12px' }}>
                    Clique numa palavra sublinhada, aqui ou no texto, para abrir o analista.
                  </p>
                  {palavrasDaSessao.length ? (
                    <div className="pilha">
                      {palavrasDaSessao.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="linha-palavra"
                          onClick={() => examineWord(c.word.toLowerCase(), c.sentence || c.word)}
                        >
                          <b>{c.word}</b>
                          <span className="mut">{c.translation}</span>
                          {c.cefrLevel ? <span className="badge neu">{c.cefrLevel}</span> : <span />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mut" style={{ fontSize: 12.5 }}>
                      Nenhuma palavra desta sessão foi para o caderno ainda. Clique numa palavra do texto para
                      analisá-la e guardá-la.
                    </p>
                  )}
                </aside>
              )}
            </div>
          </div>
        )}

        {currentTab === 'reading' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 h-full flex-1 flex flex-col min-h-0">
            {/* `onChangeView` desce até a Leitura: sem ele, o "Praticar" do Analista de Vocabulário
                lá dentro não teria para onde ir (a Leitura é montada por esta tela). */}
            <Reading recording={recording} onChangeView={onChangeView} />
          </div>
        )}

        {currentTab === 'practice' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 h-full flex-1 flex flex-col min-h-0">
            {
              /* `embutido`: o lobby aqui é conteúdo de aba, não tela — sem cabeçalho próprio nem
                 voltar duplicado. `recording` filtra os jogos pelo material desta sessão.
                 O esqueleto do `Suspense` imita a grade de cartas em vez de um "carregando…": é o
                 mesmo desenho que aparece um instante depois, então nada salta de lugar. */
              <>
                {/* "Revisar as palavras desta sessão" (protótipo, `abaJogosSessao`): só quando esta
                  gravação já pôs palavras no caderno. Abre a revisão desta sessão. */}
                {palavrasDaSessao.length > 0 && (
                  <section
                    className="cartao faixa-rev"
                    style={{
                      borderTopWidth: 'var(--bw-card)',
                      borderColor: 'color-mix(in srgb,var(--accent) 45%,var(--border-subtle))',
                    }}
                  >
                    <span className="contador">{palavrasDaSessao.length}</span>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 800 }}>Revisar as palavras desta sessão</h2>
                      <p className="mut" style={{ fontSize: 13 }}>
                        {palavrasDaSessao
                          .slice(0, 6)
                          .map((c) => c.word)
                          .join(', ')}
                        {palavrasDaSessao.length > 6 ? '…' : ''} · rodada curta
                      </p>
                    </div>
                    <button type="button" className="btn btn-solid" onClick={() => onSubTabChange('study')}>
                      <Target aria-hidden /> Revisar agora
                    </button>
                  </section>
                )}
                <Suspense
                  fallback={
                    <div className="max-w-6xl mx-auto animate-in fade-in duration-200" aria-label="Carregando os jogos">
                      <div
                        className="h-24 rounded-2xl bg-surface border border-border-subtle animate-pulse mb-6"
                        aria-hidden
                      />
                      <div className="grid gap-3 sm:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse"
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                  }
                >
                  <PlayLobby
                    embutido
                    onChangeView={onChangeView}
                    ageProfile={ageProfile}
                    progress={progress}
                    metrics={metrics}
                    recording={recording}
                    seed={practiceSeed}
                  />
                </Suspense>
              </>
            }
          </div>
        )}
      </div>

      {/* Cartão flutuante da palavra sob o cursor. A MOLDURA é a mesma da Leitura (`PopoverFlutuante`);
          o conteúdo abaixo é só desta tela, aqui há imagem, significados e estado de carregamento. */}
      {hoveredWord && (
        <PopoverFlutuante {...popover.props}>
          {(() => {
            // Dados reais desta palavra (só quando já resolveram e é a palavra atual).
            const d = hoverData && hoverData.word === hoveredWord && !hoverData.loading ? hoverData : null;
            if (!d) {
              // Estado de carregamento/placeholder (mesmo visual honesto de antes).
              return (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-3">
                    <Search className="w-5 h-5 text-ink-muted" />
                  </div>
                  <h3 className="font-display font-bold text-ink mb-1 capitalize">{hoveredWord}</h3>
                  <p className="text-[13px] text-ink-muted">Buscando contexto visual e significados...</p>
                </div>
              );
            }
            return (
              <div className="flex flex-col">
                <div className="relative h-40 bg-ink">
                  {d.image ? (
                    <img
                      src={d.image.url || d.image.thumbnail}
                      alt={hoveredWord ?? ''}
                      className="w-full h-full object-cover opacity-90"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-ink-contrast/60">
                      <Search className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">sem imagem</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider">
                    <Search className="w-3 h-3" /> Imagem Associada
                  </div>
                </div>

                <div className="p-4 bg-surface flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-display font-bold text-lg text-ink capitalize">{hoveredWord}</h3>
                      {/* Tradução real ou o MOTIVO de não haver — nunca um texto inventado no lugar. */}
                      {d.translation ? (
                        <p className="text-[13px] font-mono text-ink-muted">{d.translation}</p>
                      ) : (
                        <p className="text-[12px] text-warn-ink">{d.note ?? 'tradução indisponível'}</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (hoveredWord) playWordTTS(hoveredWord);
                      }}
                      className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-muted hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
                      title="Ouvir Pronúncia"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {d.context && (
                    <p className="text-[13px] leading-relaxed text-ink-muted border-s-2 border-border-subtle ps-3 italic">
                      "{d.context}"
                    </p>
                  )}

                  <div className="mt-1 pt-3 border-t border-border-subtle flex gap-2">
                    {vocabCards.some((c) => c.word.toLowerCase() === (hoveredWord ?? '').toLowerCase() && c.inDeck) ? (
                      /* Rótulo de ESTADO, não controle: era um `<button>` sem `onClick`, que o leitor
                         de tela anuncia como botão e convida a clicar em nada. */
                      <span className="flex-1 py-2 px-3 text-[13px] rounded-lg bg-good-soft text-good font-bold flex items-center justify-center gap-1.5 w-full cursor-default">
                        <Check className="w-4 h-4" /> Já está no Deck
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          if (hoveredWord) handleAddWordToDeck(hoveredWord);
                        }}
                        className="flex-1 btn-solid bg-accent text-white border-none py-2 px-3 text-[13px] hover:scale-[1.02] flex items-center justify-center gap-1.5 w-full cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Adicionar ao Deck
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </PopoverFlutuante>
      )}

      {/* Dynamic Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-200">
          <div className="card-panel w-full max-w-2xl bg-surface shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-border-subtle flex justify-between items-center bg-canvas/30">
              <div>
                <h2 className="font-display font-extrabold text-lg md:text-xl text-ink">Exportar Dados da Sessão</h2>
                <p className="text-[12.5px] text-ink-muted mt-1">
                  Selecione o formato desejado para salvar seu progresso contextual.
                </p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-muted hover:text-ink transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Content Grid */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Metrics Markdown */}
              <button
                onClick={() => {
                  const content =
                    `# Relatório de Sessão - Babel Play\n\n` +
                    `**Sessão:** ${recording.title}\n` +
                    `**Tipo:** ${recording.type}\n` +
                    `**Total de Palavras:** ${recording.wordCount}\n\n` +
                    `## Estatísticas do Texto (transcrição)\n` +
                    `- Palavras: ${stats.wordCount}\n` +
                    `- Vocábulos únicos: ${stats.uniqueWords}\n` +
                    `- Frases: ${stats.sentenceCount}\n` +
                    `- Densidade lexical: ${stats.lexicalDensityPct != null ? `${stats.lexicalDensityPct}%` : 'sem régua para este idioma'}
` +
                    `- Razão tipo/token: ${Math.round(stats.typeTokenRatio * 100)}/100\n` +
                    `- Facilidade de leitura (Flesch): ${stats.readingEase != null ? stats.readingEase : '-'}\n\n` +
                    `Gerado em ${data(new Date())}`;

                  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.setAttribute('href', url);
                  link.setAttribute('download', `relatorio_sessao_${recording.id}.md`);
                  link.style.visibility = 'hidden';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setShowExportModal(false);
                }}
                className="p-5 border-2 border-border-subtle hover:border-accent bg-surface text-start rounded-xl transition-all cursor-pointer group flex flex-col justify-between h-44"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink">Métricas & Desempenho</span>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    Baixar relatório completo em formato Markdown contendo KPIs lexical, ritmo e resumo bilingue.
                  </p>
                </div>
                <span className="text-[11px] font-bold text-accent group-hover:underline mt-2">
                  Baixar Relatório (.md) →
                </span>
              </button>

              {/* Option 2: Flashcards CSV — deck REAL do usuário (nada hardcoded). */}
              <button
                onClick={() => {
                  const esc = (v: string) => (v || '').replace(/;/g, ',').replace(/\n/g, ' ');
                  const rows = vocabCards.map(
                    (c) => `${esc(c.word)};${esc(c.phonetics)};${esc(c.translation)};${esc(c.sentence || '')}`,
                  );
                  const content = `Word;Phonetic;Translation;Sentence\n` + rows.join('\n') + '\n';
                  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.setAttribute('href', url);
                  link.setAttribute('download', `vocab_anki_${recording.id}.csv`);
                  link.style.visibility = 'hidden';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  setShowExportModal(false);
                }}
                className="p-5 border-2 border-border-subtle hover:border-rare bg-surface text-start rounded-xl transition-all cursor-pointer group flex flex-col justify-between h-44"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-rare/10 flex items-center justify-center text-rare group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink">Flashcards para Anki</span>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    Baixar seu deck real de vocabulário ({vocabCards.length} cards) para importação direta no Anki SRS.
                  </p>
                </div>
                <span className="text-[11px] font-bold text-rare group-hover:underline mt-2">
                  Baixar Flashcards (.csv) →
                </span>
              </button>

              {/* Option 3: Session Audio — baixa o áudio REAL gravado; desabilita se não houver. */}
              <button
                disabled={!recording.audioUrl}
                onClick={async () => {
                  if (!recording.audioUrl) return;
                  try {
                    /* `apiFetch`, e não `fetch`: esta rota exige o Bearer no modo público, e o
                       download silenciosamente virava um arquivo de erro de 401. */
                    const r = await apiFetch(caminhoDoAudio(recording.id), { timeoutMs: 300_000 });
                    if (!r.ok) throw new Error(`áudio indisponível (${r.status})`);
                    const blob = await r.blob();
                    const t = blob.type || '';
                    const ext = t.includes('webm')
                      ? 'webm'
                      : t.includes('mpeg') || t.includes('mp3')
                        ? 'mp3'
                        : t.includes('wav')
                          ? 'wav'
                          : t.includes('ogg')
                            ? 'ogg'
                            : t.includes('mp4')
                              ? 'm4a'
                              : 'audio';
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', `audio_sessao_${recording.id}.${ext}`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch {
                    /* download best-effort */
                  }
                  setShowExportModal(false);
                }}
                className={`p-5 border-2 border-border-subtle bg-surface text-start rounded-xl transition-all group flex flex-col justify-between h-44 ${
                  recording.audioUrl ? 'hover:border-good cursor-pointer' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-good/10 flex items-center justify-center text-good group-hover:scale-105 transition-transform">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink">Áudio da Sessão</span>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    {recording.audioUrl
                      ? 'Baixar o arquivo de áudio real gravado nesta sessão.'
                      : 'Sem áudio gravado nesta sessão.'}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-good group-hover:underline mt-2">
                  {recording.audioUrl ? 'Baixar Áudio →' : 'Indisponível'}
                </span>
              </button>

              {/* Option 4: YouTube Video (Locked) */}
              <div className="p-5 border-2 border-dashed border-border-subtle bg-surface-hover/50 text-start rounded-xl flex flex-col justify-between h-44 relative opacity-60">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-ink-faint/10 flex items-center justify-center text-ink-faint">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink-muted">Vídeo da Sessão (Protegido)</span>
                  </div>
                  <p className="text-[12px] text-ink-faint leading-relaxed">
                    Download de vídeo indisponível para respeitar políticas de direitos autorais de plataformas de
                    terceiros.
                  </p>
                </div>
                <span className="text-[11px] font-bold text-ink-faint">Download Bloqueado</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-canvas/30 border-t border-border-subtle flex justify-end gap-2">
              <button onClick={() => setShowExportModal(false)} className="btn-outline py-1.5 px-4">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
