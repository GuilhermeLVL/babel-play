import {
  AlertTriangle,
  AudioLines,
  BarChart3,
  BookMarked,
  BookOpen,
  Brain,
  Check,
  Cpu,
  Download,
  FileAudio,
  FileText,
  Gamepad2,
  KeyRound,
  LayoutGrid,
  Loader2,
  MessagesSquare,
  Mic,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Target,
  Volume2,
  Youtube,
} from 'lucide-react';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';

import type { AppMetrics, UtteranceRow } from '../../data/api';
import { fetchDeck, fetchSessionTranscript, fetchSettings } from '../../data/api';
import { applyOutputDevice } from '../../lib/audioDevices';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang, langLabel } from '../../lib/languages';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
import { copyDoPerfil } from '../../lib/profile';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { toSentences } from '../../lib/sentences';
import { speak as ttsSpeak } from '../../lib/tts';
import type { WordOrigin } from '../../lib/vocabWord';
import { tokenizarTexto } from '../../lib/vocabWord';
import type { VocabWord } from '../../types';
import { Recording } from '../../types';
import PopoverFlutuante from '../PopoverFlutuante';
import TokensClicaveis from '../TokensClicaveis';
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
import { useAudioDaSessao } from '../../lib/audioDaSessao';
import { numero } from '../../lib/i18n';
import type { DerivedProgress } from '../../lib/progress';
import { TranscriptSettings } from '../../lib/transcriptUtils';
import EditablePanel from '../EditablePanel';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, TituloDeSecao } from '../ui';
import AnalistaDaSessao from './analise/AnalistaDaSessao';
import ExportarSessao from './analise/ExportarSessao';
import PlayerInterativo from './analise/PlayerInterativo';
import SombraDaFala from './analise/SombraDaFala';

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

  const [overviewSubTab, setOverviewSubTab] = useState<'dashboard' | 'lexical' | 'fluency'>('dashboard');

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
      const temTempo = !!hasStart.get(s.id);
      const startTime = temTempo ? Math.round(s.startMs / 1000) : s.index * 8;
      return {
        id: s.id as string | undefined,
        original: s.text,
        translation: s.translation,
        // Idioma REAL do texto `original` desta fala (o TTS/STT desta tela segue este campo).
        lang: s.lang,
        speaker: s.speaker || '-',
        // Sem `tStartMs` gravado, o tempo NÃO aparece: os 8 s por frase são só o passo do player.
        time: temTempo ? formatSeconds(startTime) : '',
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
  const { stats, realWpm, realLongPauses, realVicios, realSilencio, topKeywords } = useMetricasDaSessao({
    realUtterances,
    sentences,
    parsedSentences,
    ttsLang,
    selectedLexicalWord: null,
    vocabCards,
  });

  /* MICRODADOS LEXICAIS (Visão geral → Inteligência lexical): as palavras desta sessão que estão no
     caderno (sem nenhuma, as palavras-chave) e as falas em que a escolhida aparece. */
  const [microPalavra, setMicroPalavra] = useState<string | null>(null);
  const palavrasDoMicro = React.useMemo(() => {
    const doCaderno = [
      ...new Set(vocabCards.filter((c) => c.sourceSessionId === recording.id).map((c) => c.word.toLowerCase())),
    ];
    return (doCaderno.length ? doCaderno : topKeywords.map((k) => k.toLowerCase())).slice(0, 12);
  }, [vocabCards, recording.id, topKeywords]);
  const microAtual = microPalavra ?? palavrasDoMicro[0] ?? '';
  const ocorrenciasDoMicro = React.useMemo(() => {
    if (!microAtual) return [];
    const alvo = microAtual.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\  // Dados reais do hover: imagem (Openverse), tradução (gateway) e frase de contexto, com cache',
    );
    const re = new RegExp(`(^|[^\\p{L}])${alvo}(?=$|[^\\p{L}])`, 'iu');
    return parsedSentences.filter((f) => re.test(f.original));
  }, [microAtual, parsedSentences]);

  /* RITMO POR FALANTE (Fluência): palavras por minuto de cada um, só com o tempo REAL das falas. */
  const ritmoPorFalante = React.useMemo(() => {
    const porNome = new Map<string, { ms: number; palavras: number }>();
    for (const u of realUtterances as UtteranceRow[]) {
      if (u.tStartMs == null || u.tEndMs == null || u.tEndMs <= u.tStartMs) continue;
      const nome = u.speakerName || 'Sem nome';
      const acc = porNome.get(nome) ?? { ms: 0, palavras: 0 };
      acc.ms += u.tEndMs - u.tStartMs;
      acc.palavras += (u.sourceText ?? '').trim().split(/\s+/).filter(Boolean).length;
      porNome.set(nome, acc);
    }
    const lista = [...porNome.entries()]
      .filter(([, v]) => v.ms >= 3000 && v.palavras > 0)
      .map(([nome, v]) => ({ nome, ppm: Math.round(v.palavras / (v.ms / 60000)) }));
    const maior = Math.max(1, ...lista.map((f) => f.ppm));
    return lista.map((f) => ({ ...f, pct: Math.round((f.ppm / maior) * 100) }));
  }, [realUtterances]);

  // Dados reais do hover: imagem (Openverse), tradução (gateway) e frase de contexto, com cache
  // por palavra. Em `lib/analise/palavraDaAnalise.ts`, junto do resto do vocabulário desta tela.
  const { hoverData } = useCacheDeHover({ hoveredWord, vocabCards, originOfWord, gateway });

  /**
   * O VOCABULÁRIO DENTRO DA ANÁLISE — examinar a palavra clicada, fichá-la no deck, mandá-la
   * praticar e pronunciá-la. Saiu para `lib/analise/palavraDaAnalise.ts`; o cabeçalho de lá
   * registra, item a item, por que NÃO compartilha código com `lib/captura/palavraDaFala.ts`, que
   * é o equivalente do outro lado (as quatro funções homônimas divergem no comportamento).
   */
  const { examineWord, handleAddWordToDeck, handlePracticeWord, speakWord, playWordTTS } = criarPalavraDaAnalise({
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
          sobrancelha={`Sessão de ${recording.type === 'video' ? 'vídeo' : recording.type === 'document' ? 'documento' : 'áudio'} · ${recording.type === 'document' ? 'texto' : recording.durationStr}`}
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
                onChange={(e) => {
                  const alvo = allRecordings.find((r) => r.id === e.target.value);
                  onChangeView('analysis', { id: e.target.value });
                  if (alvo) toast.info(`Sessão trocada: ${alvo.title}`);
                }}
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
                            stats.readingEase != null ? numero(Math.round(stats.readingEase)) : '—',
                            stats.readingEase != null
                              ? `de 100: texto ${stats.readingEase >= 70 ? 'fácil' : stats.readingEase >= 50 ? 'médio' : 'difícil'}`
                              : stats.syllableCount == null
                                ? `sem régua de legibilidade para ${langLabel(stats.idioma)}`
                                : 'precisa de mais texto',
                            'acc',
                          ],
                          [
                            'density',
                            'Densidade lexical',
                            stats.lexicalDensityPct != null ? `${Math.round(stats.lexicalDensityPct)}%` : '—',
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
                                  realWpm != null ? 'ritmo da fala' : 'requer timing das falas',
                                  'acc',
                                ],
                                [
                                  'fillers',
                                  'Vícios de linguagem',
                                  realVicios.palavras > 0 ? String(realVicios.total) : '—',
                                  realVicios.palavras > 0 ? '“tipo”, “né”, “uh”' : 'requer fala em português ou inglês',
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
                        ] as [string, string, string, string, string][]
                      ).map(([id, rotulo, valor, dica, tom]) => (
                        <div key={id} className="cartao ladrilho" title={dica}>
                          <span className="label-mono">{rotulo}</span>
                          <span className={`v ${tom}`}>{valor}</span>
                          <p className="mut" style={{ fontSize: 12, marginTop: 4 }}>
                            {dica}
                          </p>
                        </div>
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
                              onClick={() => {
                                setMicroPalavra(kw.toLowerCase());
                                setOverviewSubTab('lexical');
                              }}
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
                    </section>
                  </>
                )}

                {overviewSubTab === 'lexical' && (
                  /* INTELIGÊNCIA LEXICAL (protótipo): a topologia (palavras únicas × as que já estão no
                     caderno) e os microdados de uma palavra — onde ela aparece nesta sessão. */
                  <div className="g2" style={{ alignItems: 'start' }}>
                    <section className="cartao p5">
                      <TituloDeSecao icone={Brain} titulo="Topologia lexical da sessão" nivel="h3" />
                      <div className="ladrilhos" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="cartao ladrilho">
                          <span className="label-mono">Palavras únicas</span>
                          <span className="v">{stats.wordCount > 0 ? numero(stats.uniqueWords) : '—'}</span>
                        </div>
                        <div className="cartao ladrilho">
                          <span className="label-mono">No seu caderno</span>
                          <span className="v acc">{numero(palavrasDaSessao.length)}</span>
                        </div>
                      </div>
                      <p className="mut" style={{ fontSize: 12.5, marginTop: 12 }}>
                        {stats.wordCount > 0
                          ? `${numero(palavrasDaSessao.length)} das ${numero(stats.uniqueWords)} palavras únicas já estão no seu vocabulário. Clique numa palavra do texto para guardar outras.`
                          : 'Sem transcrição ainda: as contas aparecem quando houver texto.'}
                      </p>
                    </section>
                    <section className="cartao p5">
                      <TituloDeSecao icone={BookMarked} titulo="Microdados lexicais" nivel="h3" />
                      {palavrasDoMicro.length ? (
                        <>
                          <div className="chips">
                            {palavrasDoMicro.map((w) => (
                              <button
                                key={w}
                                type="button"
                                className="pill"
                                aria-pressed={microAtual === w}
                                onClick={() => setMicroPalavra(w)}
                              >
                                {w}
                              </button>
                            ))}
                          </div>
                          <h3 style={{ font: '900 24px var(--font-display)', margin: '14px 0 4px' }}>{microAtual}</h3>
                          <p className="mut" style={{ fontSize: 12.5 }}>
                            {ocorrenciasDoMicro.length === 1
                              ? '1 ocorrência nesta sessão'
                              : `${ocorrenciasDoMicro.length} ocorrências nesta sessão`}
                          </p>
                          <div className="pilha" style={{ marginTop: 10 }}>
                            {ocorrenciasDoMicro.map((f) => (
                              <div key={f.index} className="ocorre">
                                <button
                                  type="button"
                                  className="btn btn-outline peq"
                                  aria-label={f.time ? `Ouvir o trecho a partir de ${f.time}` : 'Ouvir o trecho'}
                                  onClick={() => {
                                    if (recording.type === 'document') {
                                      ttsSpeak(f.original, { lang: f.lang || ttsLang, rate: 0.9 });
                                      return;
                                    }
                                    onSubTabChange('transcript');
                                    playFrom(f.startTime);
                                  }}
                                >
                                  <Play aria-hidden /> {f.time}
                                </button>
                                <span>{f.original}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="mut" style={{ fontSize: 12.5 }}>
                          Nenhuma palavra desta sessão no caderno ainda: guarde uma pela transcrição para ver onde ela
                          aparece.
                        </p>
                      )}
                    </section>
                  </div>
                )}

                {overviewSubTab === 'fluency' && recording.type !== 'document' && (
                  <>
                    <div className="ladrilhos">
                      <div className="cartao ladrilho">
                        <span className="label-mono">Silêncio total</span>
                        <span className="v">
                          {realSilencio != null ? `${Math.round(realSilencio.ms / 1000)} s` : '—'}
                        </span>
                      </div>
                      <div className="cartao ladrilho">
                        <span className="label-mono">Vícios de linguagem</span>
                        <span className="v good">{realVicios.palavras > 0 ? numero(realVicios.total) : '—'}</span>
                      </div>
                      <div className="cartao ladrilho">
                        <span className="label-mono">Pausas longas</span>
                        <span className="v warn">{realLongPauses != null ? numero(realLongPauses) : '—'}</span>
                      </div>
                    </div>
                    <section className="cartao p5 secao">
                      <TituloDeSecao icone={AudioLines} titulo="Ritmo por falante" nivel="h3" />
                      {ritmoPorFalante.length ? (
                        <div className="pilha">
                          {ritmoPorFalante.map((f) => (
                            <div key={f.nome}>
                              <div className="entre" style={{ fontSize: 13 }}>
                                <b>{f.nome}</b>
                                <span className="mut tn">{f.ppm} palavras/min</span>
                              </div>
                              <div className="barra" style={{ marginTop: 6 }}>
                                <span style={{ width: `${f.pct}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mut" style={{ fontSize: 12.5 }}>
                          Requer o tempo de cada fala; esta gravação não tem.
                        </p>
                      )}
                    </section>
                  </>
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
                          {sentence.time && <span className="tempo tn">{sentence.time}</span>}
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
                                  setShadowingSentenceIndex((v) => (v === sentence.index ? null : sentence.index));
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
                        {shadowingSentenceIndex === sentence.index && recording.type !== 'document' && (
                          <SombraDaFala
                            key={sentence.index}
                            texto={sentence.original}
                            idioma={langOfSentence(sentence.index)}
                            aoOuvirOriginal={() => playFrom(sentence.startTime)}
                          />
                        )}
                      </div>
                    );
                  })}
                </section>
              </EditablePanel>

              {selectedExamWord ? (
                /* O analista do protótipo, ao lado da transcrição (`aside.analista`). */
                <AnalistaDaSessao
                  palavra={selectedExamWord}
                  nivel={
                    vocabCards.find((c) => c.word.toLowerCase() === selectedExamWord.word.toLowerCase())?.cefrLevel
                  }
                  nota={examMtNote}
                  velocidade={ttsSpeed}
                  aoTrocarVelocidade={setTtsSpeed}
                  aoOuvir={() => speakWord(selectedExamWord.word)}
                  aoFechar={() => {
                    setSelectedExamWord(null);
                    setExamMtNote(null);
                  }}
                  aoRevisar={() => void handlePracticeWord(selectedExamWord, 'review')}
                  aoDuelo={() => void handlePracticeWord(selectedExamWord, 'blitz')}
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

      {/* Exportar dados da sessão: o diálogo do protótipo (`dialogoExportarSessao`). */}
      {showExportModal && (
        <ExportarSessao
          recording={recording}
          vocabCards={palavrasDaSessao}
          stats={stats}
          ritmo={{
            ppm: realWpm,
            pausasLongas: realLongPauses,
            vicios: realVicios.palavras > 0 ? realVicios.total : null,
          }}
          aoFechar={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
