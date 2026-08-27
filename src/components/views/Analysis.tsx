import { Download, Edit2, Sparkles, MessageSquare, Search, CheckCircle2, Activity, Zap, Volume2, Mic, Video, Play, FileText, Pencil, BookOpen, ArrowLeft, ChevronDown, SlidersHorizontal, Plus, Check, Pause, RefreshCw, Headphones, Lock, MessageSquareWarning, Crosshair, AlertTriangle, TrendingUp, BarChart2, Clock, Brain, LayoutGrid, BookMarked, X, Loader2, MoreHorizontal, Gamepad2 } from 'lucide-react';
import { t, coreOnly } from '../../lib/profile';
import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import AnalysisExpandedKpi, { AnalysisKpiType } from './AnalysisExpandedKpi';
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ScatterChart, Scatter, ZAxis, AreaChart, Area } from 'recharts';
import { Recording } from '../../types';
import type { VocabWord } from '../../types';
import { fetchSessionTranscript, fetchDeck, searchImages, updateUtterance, fetchSettings, fetchMetrics, apiFetch } from '../../data/api';
import type { ImageResult, UtteranceRow, AppMetrics } from '../../data/api';
import { applyOutputDevice } from '../../lib/audioDevices';
import { speak as ttsSpeak, pickVoice, getVoicePref, isTtsSupported } from '../../lib/tts';
import { baseLang, toBcp47, langLabel } from '../../lib/languages';
import { DEFAULT_LANG_CONFIG, useLangConfig } from '../../lib/langConfig';
import type { LangConfig } from '../../lib/langConfig';
import { buildVocabWord, mtNoteFor, resolveWord, tokenizarTexto } from '../../lib/vocabWord';
import { ficharCartao } from '../../lib/adicionarAoDeck';
import TokensClicaveis from '../TokensClicaveis';
import PopoverFlutuante from '../PopoverFlutuante';
import type { WordOrigin, ResolvedWord } from '../../lib/vocabWord';
import { toSentences, seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import type { Sentence, PracticeSeed, ExerciseId } from '../../lib/sentences';
import VocabularyPanel from '../VocabularyPanel';
import { Confianca, SemDado } from '../Honestidade';
import NiveisDoConjunto from '../metrics/NiveisDoConjunto';
import { makeCloze, scorePronunciation, computeTextStats, extractKeywords, contarViciosDasFalas, retrievability, contarSobreposicoes, sentenceHasComplexWord } from '@core';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
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
import type { DerivedProgress } from '../../lib/progress';
import { TranscriptSettings, getTranscriptStyleClasses } from '../../lib/transcriptUtils';
import EditablePanel from '../EditablePanel';
import { useAudioDaSessao, caminhoDoAudio } from '../../lib/audioDaSessao';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { toast } from '../Toast';
import { mediaErrorMessage, speechErrorMessage } from '../../lib/mediaErrors';

/** Selo de PROCEDÊNCIA da transcrição (honestidade): de onde vieram as falas desta sessão. */
function provenanceLabel(engine?: string | null): string | null {
  switch (engine) {
    case 'youtube-caption-manual': return 'Legenda YT (oficial)';
    case 'youtube-caption-auto': return 'Legenda YT (automática)';
    case 'whisper-local': return 'Whisper local';
    case 'groq-whisper': return 'Whisper nuvem (large-v3)';
    case 'web-speech': return 'Reconhecimento do navegador';
    case 'import-text': return 'Texto importado';
    default: return null;
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
  metrics
}: {
  onChangeView: (view: string, data?: any) => void,
  recording: Recording,
  allRecordings: Recording[],
  subTab: string,
  onSubTabChange: (tab: string) => void,
  /** Semente vinda de outra tela ("praticar esta frase") — repassada ao Study/lobby de jogos. */
  practiceSeed?: PracticeSeed | null,
  onSeedConsumed?: () => void,
  ageProfile?: 'kids' | 'pro' | 'senior',
  /** Só existem porque a aba "Jogos" monta o lobby aqui dentro e o `Play` os exige. */
  progress: DerivedProgress,
  metrics: AppMetrics | null
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
  // Revela a aba mais densa em Kids/Sênior. Uma vez aberta, fica — quem procurou já sabe onde está.
  const [showAllTabs, setShowAllTabs] = useState<boolean>(false);

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
  const [shadowingScore, setShadowingScore] = useState<{ fluency: number; accuracy: number; speed: number; feedback: string; transcript?: string } | null>(null);
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
      try { ui = s?.ui ? JSON.parse(s.ui) : {}; } catch { ui = {}; }
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
      .then(r => {
        if (!alive) return;
        setRealUtterances(r.utterances || []);
        setSessionLangs({ src: r.session?.sourceLang ?? '', tgt: r.session?.targetLang ?? '' });
      })
      .catch(() => { if (alive) { setRealUtterances([]); setSessionLangs(null); } });
    return () => { alive = false; };
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
    return toSentences(realUtterances as UtteranceRow[]).map(s => ({
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
      (realUtterances as UtteranceRow[]).map(u => [u.id, u.tStartMs != null])
    );
    return sentences.map(s => {
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
  const ttsLang =
    (realUtterances[0]?.sourceLang as string) || sessionLangs?.src || langConfig.mine || '';
  /** Idioma de uma frase específica (mistura mic/sistema numa mesma sessão é possível). */
  const langOfSentence = (idx: number | null): string =>
    (idx != null && parsedSentences[idx]?.lang) || ttsLang;

  // Mantém um ref do índice ativo para a narração TTS retomar do ponto certo sem re-disparar o efeito.
  React.useEffect(() => { activeSentenceIndexRef.current = activeSentenceIndex; }, [activeSentenceIndex]);

  // Helpers de reprodução (usados pelos controles/hotspots).
  const seekTo = React.useCallback((t: number) => {
    setCurrentTime(t);
    if (hasRealAudio && audioRef.current) {
      try { audioRef.current.currentTime = t; } catch { /* metadata ainda não carregou */ }
    } else {
      // TTS: posiciona a frase de partida e força reinício da narração se estiver tocando.
      let idx = 0;
      for (let i = 0; i < parsedSentences.length; i++) if (parsedSentences[i].startTime <= t) idx = i;
      activeSentenceIndexRef.current = idx;
      setActiveSentenceIndex(idx);
      setSeekNonce((n) => n + 1);
    }
  }, [hasRealAudio, parsedSentences]);

  const playFrom = React.useCallback((t: number) => { seekTo(t); setIsPlaying(true); }, [seekTo]);

  // Sync activeSentenceIndex with currentTime
  React.useEffect(() => {
    if (parsedSentences.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < parsedSentences.length; i++) {
      if (parsedSentences[i].startTime <= currentTime) {
        activeIdx = i;
      }
    }
    setActiveSentenceIndex(activeIdx);
  }, [currentTime, parsedSentences]);

  // Motor de reprodução REAL (substitui o setInterval falso):
  //  • Com áudio gravado → controla o elemento <audio> (play/pause/velocidade). O tempo/waveform
  //    vem do evento `timeupdate` (ver JSX do <audio>). Loop de frase tratado no timeupdate.
  //  • Sem áudio → narração via SpeechSynthesis lendo o transcrito, com highlight sincronizado
  //    pelos eventos `onstart`/`onboundary` (nada é inventado; o usuário OUVE de fato).
  React.useEffect(() => {
    if (hasRealAudio) {
      const a = audioRef.current;
      if (!a) return;
      a.playbackRate = playbackSpeed;
      if (isPlaying) a.play().catch(() => setIsPlaying(false));
      else a.pause();
      return;
    }

    if (!isPlaying) { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); return; }
    if (!('speechSynthesis' in window) || parsedSentences.length === 0) return;

    let cancelled = false;
    const synth = window.speechSynthesis;
    synth.cancel();
    const startIdx = Math.max(0, activeSentenceIndexRef.current);

    const speakFrom = (i: number) => {
      if (cancelled) return;
      if (i >= parsedSentences.length) { setIsPlaying(false); return; }
      const s = parsedSentences[i];
      const nextStart = i < parsedSentences.length - 1 ? parsedSentences[i + 1].startTime : s.startTime + 6;
      const text = s.original || s.translation || '';
      if (!text) { speakFrom(i + 1); return; }
      const u = new SpeechSynthesisUtterance(text);
      // Idioma POR FALA: uma sessão pode misturar mic (seu idioma) e sistema (o estudado).
      const lang = s.lang || ttsLang;
      // Utterance manual (precisa de onstart/onboundary/onend para a barra de progresso), então a
      // voz preferida do usuário para ESTE idioma tem de ser resolvida aqui — o `speak()` não passa.
      const voice = pickVoice(lang, getVoicePref(lang));
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = lang; }
      u.rate = playbackSpeed;
      u.onstart = () => { if (!cancelled) { setActiveSentenceIndex(i); setCurrentTime(s.startTime); } };
      u.onboundary = (ev: SpeechSynthesisEvent) => {
        if (cancelled) return;
        const frac = Math.min(1, (ev.charIndex || 0) / Math.max(1, text.length));
        setCurrentTime(s.startTime + (nextStart - s.startTime) * frac);
      };
      u.onend = () => { if (!cancelled) speakFrom(loopMode ? i : i + 1); };
      synth.speak(u);
    };
    speakFrom(startIdx);

    return () => { cancelled = true; synth.cancel(); };
    // seekNonce força reinício quando o usuário busca durante a narração TTS.
  }, [isPlaying, hasRealAudio, playbackSpeed, loopMode, parsedSentences, ttsLang, seekNonce]);

  // Reset player when switching media
  React.useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setActiveSentenceIndex(-1);
    setShadowingSentenceIndex(null);
    setShadowingStep('idle');
    setShadowingScore(null);
    setAudioDuration(0);
    setPeaks([]);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, [recording.id]);

  // Waveform REAL: decodifica o áudio gravado e reduz para 44 picos (0..1). Sem áudio → vazio
  // (o render mostra barras neutras — não inventamos um "espectro"). Substitui o array hardcoded.
  React.useEffect(() => {
    // Espera o blob autenticado: `fetch` cru nesta URL dá 401 no modo público.
    if (!hasRealAudio || !audioSrc) { setPeaks([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(audioSrc);
        const buf = await res.arrayBuffer();
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new Ctx();
        const decoded = await ctx.decodeAudioData(buf);
        const data = decoded.getChannelData(0);
        const N = 44;
        const block = Math.floor(data.length / N) || 1;
        const out: number[] = [];
        let max = 0.0001;
        for (let i = 0; i < N; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) sum += Math.abs(data[i * block + j] || 0);
          const rms = sum / block;
          out.push(rms);
          if (rms > max) max = rms;
        }
        ctx.close();
        if (alive) setPeaks(out.map((v) => Math.max(0.08, Math.min(1, v / max))));
      } catch {
        if (alive) setPeaks([]);
      }
    })();
    return () => { alive = false; };
  }, [hasRealAudio, audioSrc]);

  // Auto-slow down on complex sentences
  React.useEffect(() => {
    if (!autoSlowEnabled || activeSentenceIndex === -1 || activeSentenceIndex >= parsedSentences.length) {
      return;
    }
    // BL-01: heurística REAL (palavra longa/polissilábica) no lugar de 4 palavras hardcoded.
    const text = parsedSentences[activeSentenceIndex].original;
    setPlaybackSpeed(sentenceHasComplexWord(text) ? 0.8 : 1.0);
  }, [activeSentenceIndex, autoSlowEnabled, parsedSentences]);

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
    if (!recording?.id) { setMetricasDaSessao(null); return; }
    let vivo = true;
    fetchMetrics(recording.id)
      .then(m => { if (vivo) setMetricasDaSessao(m); })
      .catch(() => { if (vivo) setMetricasDaSessao(null); });
    return () => { vivo = false; };
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

  const startEditUtt = (uttId: string, source: string, translation: string) => {
    setEditingUttId(uttId);
    setEditSource(source);
    setEditTarget(translation);
    setEditError(null);
  };

  const cancelEditUtt = () => {
    setEditingUttId(null);
    setEditError(null);
  };

  const saveEditUtt = async (uttId: string) => {
    setEditSaving(true);
    setEditError(null);
    const row = await updateUtterance(uttId, { sourceText: editSource, translatedText: editTarget });
    setEditSaving(false);
    // Erro honesto: mantém o texto editado nos campos para não perder o trabalho.
    if (!row) { setEditError('Não foi possível salvar. Verifique a conexão e tente de novo.'); return; }
    setRealUtterances(prev => prev.map(u => (u.id === row.id ? { ...u, ...row } : u)));
    setEditingUttId(null);
  };

  useEffect(() => {
    fetchDeck().then(setVocabCards).catch(() => {});
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
        s => (sentence && s.original === sentence) ||
             s.original.toLowerCase().includes(word.toLowerCase())
      );
      const context = sentence || from?.original || '';
      return {
        word,
        context: context || undefined,
        declaredLang: from?.lang || undefined,
        config: langConfig,
      };
    },
    [parsedSentences, langConfig]
  );


  // Estatísticas determinísticas do texto real (transcrição). Fonte dos KPIs.
  const fullTranscriptText = React.useMemo(
    () => parsedSentences.map(s => s.original).join(' '),
    [parsedSentences]
  );
  const stats = React.useMemo(() => computeTextStats(fullTranscriptText), [fullTranscriptText]);

  // WPM REAL da sessão: palavras / tempo falado (do primeiro tStartMs ao último tEndMs).
  // Sem timing confiável → null (a UI mostra "—", nunca um número inventado).
  const realWpm = React.useMemo(() => {
    if (realUtterances.length === 0 || stats.wordCount === 0) return null;
    const first = realUtterances.find(u => u.tStartMs != null);
    const last = [...realUtterances].reverse().find(u => u.tEndMs != null);
    if (!first || !last || first.tStartMs == null || last.tEndMs == null) return null;
    const secs = (last.tEndMs - first.tStartMs) / 1000;
    if (secs < 1) return null;
    return Math.round(stats.wordCount / (secs / 60));
  }, [realUtterances, stats.wordCount]);

  // Pausas longas (>3s) REAIS: intervalos entre utterances consecutivas com timing.
  // Sem timing confiável → null (a UI mostra "—", nunca um número inventado).
  const realLongPauses = React.useMemo(() => {
    if (realUtterances.length < 2) return null;
    let hasTiming = false;
    let count = 0;
    for (let i = 1; i < realUtterances.length; i++) {
      const prev = realUtterances[i - 1];
      const cur = realUtterances[i];
      if (prev.tEndMs == null || cur.tStartMs == null) continue;
      hasTiming = true;
      if (cur.tStartMs - prev.tEndMs > 3000) count++;
    }
    return hasTiming ? count : null;
  }, [realUtterances]);

  /**
   * SOBREPOSIÇÃO DE FALA MEDIDA. O indicador dizia "requer diarização — em breve", e a diarização
   * está aqui: `speaker` vem de `utterances.speaker_name` e esta mesma tela já o renderiza três
   * vezes. Faltava a comparação, que é intersecção de intervalos (ver `core/learning/sobreposicao`).
   */
  /* `sentences`, NÃO `parsedSentences`: o adaptador desta tela troca `startMs`/`endMs` (ms) por um
     `startTime` em SEGUNDOS e não carrega `source`. Sobreposição precisa dos milissegundos crus. */
  const realSobreposicao = React.useMemo(
    () => contarSobreposicoes(
      sentences.map(s => ({ speaker: s.speaker, source: s.source, startMs: s.startMs, endMs: s.endMs }))
    ),
    [sentences]
  );

  /**
   * EVOLUÇÃO SEMANAL REAL. Dois painéis diziam "em breve (precisa de histórico de sessões)" — e o
   * histórico já chegava nesta tela pela prop `metrics`, em `vocabByWeek`.
   */

  /**
   * MICRODADOS LEXICAIS REAIS da palavra selecionada no gráfico de topologia.
   *
   * O painel que isto alimenta era uma demonstração cravada para TRÊS palavras (`heuristics`,
   * `leverage`, `bottleneck`) — e como toda a lógica era ternário com `else`, qualquer outra palavra
   * recebia os dados de `bottleneck`. Clicar em "casa" afirmava que casa se pronuncia /ˈbɒtəlnɛk/,
   * é nível C1, apareceu 3 vezes, tem 45% de retenção e foi usada em "We need to casa our existing
   * user base to drive growth". Cinco campos falsos sobre um cartão REAL do baralho de quem usa.
   *
   * Nada disso precisava ser inventado: `vocab_cards` já guarda `phonetics`, `cefr_level`,
   * `cefr_confidence`, `stability` e `last_review`, e as ocorrências e os trechos estão no
   * transcrito desta mesma tela. O painel não estava sem dado — ele não lia o cartão que a pessoa
   * acabou de clicar.
   */
  const lexicalDetail = React.useMemo(() => {
    if (!selectedLexicalWord) return null;
    const alvo = selectedLexicalWord.toLowerCase();
    const card = vocabCards.find(c => String(c.word ?? '').toLowerCase() === alvo);

    /* Trechos REAIS: falas do transcrito que contêm a palavra, com o tempo para poder ouvir. */
    const trechos = parsedSentences
      .filter(s => s.original.toLowerCase().includes(alvo))
      .slice(0, 4)
      .map(s => ({ texto: s.original, startTime: s.startTime }));

    /* Ocorrências CONTADAS no transcrito, com fronteira por letra (o `\b` quebra em acento). */
    let ocorrencias: number;
    try {
      const re = new RegExp('(?<!\\p{L})' + alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'giu');
      ocorrencias = (fullTranscriptText.toLowerCase().match(re) ?? []).length;
    } catch {
      /* Palavra com forma que quebra o RegExp: cai na contagem de trechos, que não usa regex. */
      ocorrencias = trechos.length;
    }

    /* Retenção pelo FSRS: só existe depois de uma revisão. Antes disso é `null`, não 45%. */
    let retencao: number | null = null;
    const estabilidade = Number(card?.fsrsStability ?? card?.stability ?? 0);
    const ultima = Number(card?.lastReview ?? 0);
    if (estabilidade > 0 && ultima > 0) {
      const dias = Math.max(0, (Date.now() - ultima) / 86_400_000);
      retencao = Math.round(retrievability(dias, estabilidade) * 100);
    }

    return {
      card,
      trechos,
      ocorrencias,
      retencao,
      /* `phonetics` vem do dicionário na captura; muitos cartões não têm. Sem ela a linha não
         aparece, o app não tem dicionário fonético para preencher, e chutar IPA é inventar. */
      fonetica: (card?.phonetics ? String(card.phonetics) : '').trim() || null,
      nivel: card?.cefrLevel ? String(card.cefrLevel) : null,
      nivelConfianca: card?.cefrConfidence != null ? Number(card.cefrConfidence) : null,
      noDeck: !!card?.inDeck,
      traducao: (card?.back ? String(card.back) : '').trim() || null,
      lang: card?.srcLang ? String(card.srcLang) : undefined,
    };
  }, [selectedLexicalWord, vocabCards, parsedSentences, fullTranscriptText]);

  /**
   * VÍCIOS DE LINGUAGEM MEDIDOS. Onde havia **8** cravado no JSX com a legenda "uso excessivo de
   * marcadores como 'tipo' e 'ah'" — e, três painéis acima, o MESMO indicador dizendo "em breve".
   *
   * Cada fala é contada com a lista do PRÓPRIO idioma (`sentences` já traz `lang` resolvido pela
   * cadeia de fallback desta tela), porque uma gravação é frequentemente mista e `um` é hesitação
   * em inglês e artigo em português — no banco desta máquina, 171 das 172 ocorrências eram artigo.
   */
  const realVicios = React.useMemo(
    /* `s.text` — NÃO `s.original`. `Sentence` (lib/sentences) usa `text`; é o `parsedSentences`
       desta tela que renomeia para `original`. Escrevi `s.original` aqui e o cartão ficou mudo,
       porque `@types/react` não está instalado e todo hook devolve `any`: o tsc não pega. */
    () => contarViciosDasFalas(sentences.map(s => ({ text: s.text, lang: s.lang }))),
    [sentences]
  );

  /**
   * SILÊNCIO TOTAL REAL: a soma dos intervalos entre falas consecutivas, em ms, mais a fração da
   * gravação que ele representa. `null` sem timing.
   *
   * Existe porque o cartão "Pausas Articulatórias" mostrava **"45 seg"** e **"Representa 12% da
   * gravação, ritmo saudável"** cravados no JSX — números inventados apresentados como medição, no
   * mesmo painel em que a linha vizinha diz corretamente "requer análise de áudio". O dado sempre
   * esteve aqui: é o mesmo laço de `realLongPauses`, sem o corte de 3 segundos.
   *
   * O julgamento ("ritmo saudável") NÃO volta. Não existe norma no app com que comparar, e afirmar
   * que 12% é saudável seria inventar de novo — agora com uma casa decimal a mais.
   */
  const realSilencio = React.useMemo(() => {
    if (realUtterances.length < 2) return null;
    let hasTiming = false;
    let somaMs = 0;
    let primeiro: number | null = null;
    let ultimo: number | null = null;
    for (let i = 0; i < realUtterances.length; i++) {
      const cur = realUtterances[i];
      if (cur.tStartMs != null && primeiro == null) primeiro = cur.tStartMs;
      if (cur.tEndMs != null) ultimo = cur.tEndMs;
      if (i === 0) continue;
      const prev = realUtterances[i - 1];
      if (prev.tEndMs == null || cur.tStartMs == null) continue;
      hasTiming = true;
      const vao = cur.tStartMs - prev.tEndMs;
      if (vao > 0) somaMs += vao;
    }
    if (!hasTiming || primeiro == null || ultimo == null || ultimo <= primeiro) return null;
    return { ms: somaMs, pct: Math.round((somaMs / (ultimo - primeiro)) * 100) };
  }, [realUtterances]);

  // Maior monólogo REAL: maior duração de uma única fala (tEnd − tStart). Null sem timing.
  const realMonologue = React.useMemo(() => {
    let maxMs = 0; let hasTiming = false;
    for (const u of realUtterances) {
      if (u.tStartMs == null || u.tEndMs == null) continue;
      hasTiming = true;
      if (u.tEndMs - u.tStartMs > maxMs) maxMs = u.tEndMs - u.tStartMs;
    }
    return hasTiming ? maxMs : null;
  }, [realUtterances]);

  // Tópicos REAIS = palavras-chave extraídas deterministicamente do transcrito (não rótulos inventados).
  const topKeywords = React.useMemo(
    () => extractKeywords(fullTranscriptText, { max: 6 }),
    [fullTranscriptText]
  );

  // Dados reais do hover: imagem (Openverse), tradução (gateway) e frase de contexto.
  // `note` = motivo de NÃO haver tradução (nunca um texto fabricado no lugar dela).
  // Cache por palavra evita refetch ao re-passar o mouse.
  interface HoverEntry { image: ImageResult | null; translation: string | null; note: string | null; context: string | null; lang: string | null }
  const hoverCacheRef = useRef<Map<string, HoverEntry>>(new Map());
  const [hoverData, setHoverData] = useState<(HoverEntry & { word: string; loading: boolean }) | null>(null);

  React.useEffect(() => {
    const word = hoveredWord;
    if (!word) { setHoverData(null); return; }
    const cached = hoverCacheRef.current.get(word);
    if (cached) { setHoverData({ word, ...cached, loading: false }); return; }
    setHoverData({ word, image: null, translation: null, note: null, context: null, lang: null, loading: true });
    let alive = true;
    (async () => {
      const origin = originOfWord(word);
      let image: ImageResult | null;
      try { const imgs = await searchImages(word); image = imgs[0] ?? null; } catch { image = null; }
      // O produtor único resolve idioma + direção + motor. Aqui não se escolhe direção nenhuma.
      const { vocab, resolved } = await buildVocabWord(origin, gateway.mt);
      const entry: HoverEntry = {
        image,
        translation: vocab.translation || null,
        note: mtNoteFor(resolved, vocab.translation),
        context: origin.context ?? null,
        lang: resolved.lang || null,
      };
      // Corrida: só aplica se a palavra ainda é a mesma quando a promessa resolve.
      if (!alive) return;
      hoverCacheRef.current.set(word, entry);
      setHoverData({ word, ...entry, loading: false });
    })();
    return () => { alive = false; };
  }, [hoveredWord, originOfWord, gateway]);

  /**
   * Abre o Analista de Vocabulário para a palavra clicada.
   *
   * O idioma da palavra e a direção da tradução saem do produtor único (`buildVocabWord`), a partir
   * da FRASE de onde a palavra veio. Se não houver motor para o par — ou se o MT falhar —, a palavra
   * fica SEM tradução e `examMtNote` diz o motivo (antes o painel ficava em "traduzindo…" para
   * sempre, porque o `catch {}` engolia a falha).
   */
  const examineWord = async (wordStr: string, sentence?: string) => {
    const origin = originOfWord(wordStr, sentence);
    setExamMtNote(null);
    // Mostra a palavra na hora (o painel indica "traduzindo…" enquanto o MT roda).
    setSelectedExamWord({ word: wordStr, translation: '', example: origin.context });
    const { vocab, resolved } = await buildVocabWord(origin, gateway.mt);
    setSelectedExamWord(prev => (prev && prev.word === wordStr ? vocab : prev));
    setExamMtNote(mtNoteFor(resolved, vocab.translation));
  };

  // Aceita a string (popover de hover) ou o VocabWord (Analista de Vocabulário).
  const handleAddWordToDeck = async (input: string | VocabWord) => {
    const wordStr = typeof input === 'string' ? input : input.word;
    const known = typeof input === 'string' ? '' : (input.translation || '');
    const exists = vocabCards.find(c => c.word.toLowerCase() === wordStr.toLowerCase());
    if (exists) return;
    setAddedWords(prev => (prev.includes(wordStr) ? prev : [...prev, wordStr]));

    const origin = originOfWord(wordStr, typeof input === 'string' ? undefined : input.example);
    // Frase de contexto real (quando existe) alimenta o cloze; sem ela, o título da gravação.
    const sentence = origin.context || recording.title || '';

    // Idioma da palavra e direção da tradução: SEMPRE do produtor único. Se já temos a tradução
    // (veio do painel), só resolvemos os idiomas — sem chamar o MT de novo.
    let back = known;
    let resolved: ResolvedWord;
    if (back) {
      resolved = await resolveWord(origin);
    } else {
      const built = await buildVocabWord(origin, gateway.mt);
      resolved = built.resolved;
      back = built.vocab.translation;
    }

    const cloze = sentence ? makeCloze(sentence, wordStr) : null;
    // Gravação e aviso de recusa em `lib/adicionarAoDeck` — o mesmo caminho da Leitura, que é
    // renderizada DENTRO desta tela na aba Leitura e mantinha uma cópia byte a byte deste bloco.
    // Os idiomas REAIS da PALAVRA (o da frase de onde saiu → o alvo decidido por ele) viajam em
    // `resolved`: antes esta tela gravava o idioma da PRIMEIRA fala da sessão em toda palavra.
    const created = await ficharCartao({ word: wordStr, back, sentence, resolved, cloze, sessionId: recording.id });
    if (created.length) setVocabCards(prev => [...prev, ...created]);
  };

  /** A palavra já está fichada (deck do backend ou adicionada nesta sessão de tela)? */
  const isWordAdded = (w: VocabWord) =>
    addedWords.includes(w.word) ||
    vocabCards.some(c => c.word.toLowerCase() === w.word.toLowerCase() && c.inDeck);

  /**
   * "Praticar esta palavra" a partir do Analista de Vocabulário.
   *
   *  • `review` → a revisão só existe para cartões DO DECK. Então fichamos a palavra ANTES (reusando
   *    o `handleAddWordToDeck` desta tela) e só então abrimos a revisão. É o que troca o velho
   *    "adicionar e torcer para reencontrar" por "adicionar e revisar agora".
   *  • demais → semente com a palavra + idioma REAL dela (o da frase de origem), e o Estudo abre o
   *    exercício direto nela.
   */
  const handlePracticeWord = async (w: VocabWord, exercise: ExerciseId) => {
    if (exercise === 'review' && !isWordAdded(w)) {
      await handleAddWordToDeck(w);
    }
    const resolved = await resolveWord(originOfWord(w.word, w.example));
    const seed: PracticeSeed = {
      ...seedFromSelection(w.word, resolved.lang, exercise, recording.id),
      word: w.word,
    };
    onChangeView(telaDoExercicio(exercise), { seed, id: recording.id });
  };

  /**
   * TTS compartilhado (src/lib/tts.ts). O idioma é o da PALAVRA (resolvido a partir da frase de
   * origem), não o da primeira fala da sessão — senão uma palavra portuguesa numa sessão bilíngue
   * sairia com voz inglesa. Sem idioma conhecido, cai na narração da sessão.
   */
  const speakWord = (wordStr: string, lang?: string) => {
    const l = lang || selectedExamWord?.lang || ttsLang;
    ttsSpeak(wordStr, { lang: l ? toBcp47(l) : undefined, rate: ttsSpeed });
  };
  /** Pronúncia fora do painel (popover de hover): idioma da frase de onde a palavra saiu. */
  const playWordTTS = (wordStr: string) =>
    speakWord(wordStr, originOfWord(wordStr).declaredLang);

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, cleanWord: string) => {
    popover.cancelarFechamento();
    // `currentTarget`, e não `target`: aqui o token já chega filtrado e o retângulo tem de ser o do
    // `<span>` da palavra, não o de um filho eventual.
    popover.abrirEm(e.currentTarget as HTMLElement, cleanWord);
  };

  const handleMouseLeave = popover.agendarFechamento;


  const updateSetting = <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => {
    setTsSettings(prev => ({ ...prev, [key]: value }));
  };

  const formatSeconds = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  };

  const renderInteractivePlayer = () => {
    if (recording.type === 'document') return null;

    const activeSentence = activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length
      ? parsedSentences[activeSentenceIndex]
      : null;

    // WPM REAL da frase ativa: palavras / duração real (start da próxima − start desta). Sem timing
    // confiável (ex.: só 1 frase) → null, e a UI mostra "—" em vez de um número inventado.
    const activeWpm = (() => {
      if (!activeSentence) return null;
      const next = activeSentenceIndex < parsedSentences.length - 1
        ? parsedSentences[activeSentenceIndex + 1].startTime
        : (totalDurationSeconds || activeSentence.startTime);
      const durSec = next - activeSentence.startTime;
      const words = (activeSentence.original || '').trim().split(/\s+/).filter(Boolean).length;
      if (durSec < 1 || words === 0) return null;
      return Math.round(words / (durSec / 60));
    })();

    return (
      <div className="border-b border-border-subtle bg-surface-hover/30 p-5 flex flex-col gap-5 shrink-0 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse"></span>
            <span className="font-display font-black text-sm md:text-base tracking-tight uppercase text-ink">
              {/* Chamava-se "Estúdio de Sombra (Shadowing)" e prometia um exercício que não
                  existe mais, e que, mesmo antes, não era isto: este painel é o PLAYER, com a
                  legenda acompanhando o áudio. O nome passa a ser o que ele faz. Repetir em voz
                  alta virou o Karaokê, no Jogar. */}
              {ageProfile === 'kids'
                ? 'Ouça e acompanhe a legenda'
                : ageProfile === 'senior'
                ? 'Leitura acompanhando o áudio'
                : 'Player com legenda sincronizada'}
            </span>
            <span className="badge-tag ok text-[10px] font-bold">
              {recording.type === 'video' ? 'Vídeo Sincronizado' : 'Áudio Interativo'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-Slow Mo Control */}
            <button
              onClick={() => setAutoSlowEnabled(!autoSlowEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-bold border transition-all ${
                autoSlowEnabled 
                  ? 'bg-warn-soft border-warn/30 text-warn-ink' 
                  : 'bg-surface hover:bg-surface-hover border-border-subtle text-ink-muted'
              }`}
              title="Diminui a velocidade automaticamente em trechos com vocabulário complexo"
            >
              <Zap className={`w-3.5 h-3.5 ${autoSlowEnabled ? 'text-warn animate-bounce' : ''}`} />
              <span>Smart Slow-Mo</span>
            </button>

            {/* Speed Multiplier selector */}
            <div className="flex items-center gap-1 bg-surface border border-border-subtle p-1 rounded-lg">
              {[0.75, 1, 1.25, 1.5].map(sp => (
                <button
                  key={sp}
                  onClick={() => {
                    setPlaybackSpeed(sp);
                    setAutoSlowEnabled(false); // turn off auto-slow if manually overridden
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                    playbackSpeed === sp && !autoSlowEnabled
                      ? 'bg-ink text-ink-contrast'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Player Window */}
        <div className="relative aspect-video max-h-[380px] w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center border border-border-subtle group shadow-inner">
          {/* Áudio REAL gravado da sessão — fonte de verdade do tempo/seek quando presente. */}
          {hasRealAudio && (
            <audio
              ref={audioRef}
              src={audioSrc ?? undefined}
              preload="metadata"
              // O áudio da sessão não tinha `onError`: falha de carga deixava o player parado sem
              // explicação — que é o caminho do achado D1.
              onError={(e) => toast.error(mediaErrorMessage(e.currentTarget))}
              onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (isFinite(d) && d > 0) setAudioDuration(d); }}
              onTimeUpdate={(e) => {
                const a = e.currentTarget;
                setCurrentTime(a.currentTime);
                if (loopMode && activeSentenceIndex !== -1 && activeSentenceIndex < parsedSentences.length) {
                  const start = parsedSentences[activeSentenceIndex].startTime;
                  const nextStart = activeSentenceIndex < parsedSentences.length - 1
                    ? parsedSentences[activeSentenceIndex + 1].startTime
                    : (audioDuration || start + 25);
                  if (a.currentTime >= nextStart) { try { a.currentTime = start; } catch { /* noop */ } }
                }
              }}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          )}
          {/* Simulated Video or Waveform View */}
          {recording.type === 'video' ? (
            // VIDEO PLAYER CANVAS
            <div className="absolute inset-0 bg-gradient-to-t from-black via-zinc-950 to-zinc-900 flex flex-col items-center justify-center overflow-hidden">
              {/* Dynamic Abstract Tech Background that moves slightly or has lines */}
              <div className="absolute inset-0 opacity-15 pointer-events-none flex items-center justify-center">
                <div className={`w-full h-full border-t border-b border-accent-subtle/30 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent transition-all duration-700 ${isPlaying ? 'scale-110' : 'scale-100'}`}></div>
                <div className="absolute grid grid-cols-6 gap-2 w-full h-full p-6">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <div key={i} className={`bg-accent-subtle/10 border border-accent/5 rounded-lg transition-all duration-1000 ${isPlaying ? 'opacity-30' : 'opacity-10'}`} style={{ transitionDelay: `${i * 50}ms` }}></div>
                  ))}
                </div>
              </div>

              {/* Dynamic Icon centered based on state */}
              <div className="z-10 w-20 h-20 rounded-full bg-surface/10 border border-white/15 flex items-center justify-center backdrop-blur-md shadow-2xl transition-transform duration-300 group-hover:scale-105">
                {isPlaying ? (
                  <Video className="w-10 h-10 text-white animate-pulse" />
                ) : (
                  <Play className="w-10 h-10 text-white ml-1" />
                )}
              </div>

              {/* Status Tags */}
              <div className="absolute top-4 left-4 bg-black/60 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold text-white flex items-center gap-1.5 backdrop-blur-md">
                <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? 'bg-good' : 'bg-warn'} animate-pulse`}></span>
                {isPlaying ? 'EXECUTANDO FEED INTEGRADO' : 'PAUSADO'}
              </div>

              <div className="absolute top-4 right-4 bg-black/60 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-mono font-extrabold text-white flex items-center gap-1.5 backdrop-blur-md">
                <span>WPM: {activeWpm ?? '-'}</span>
              </div>
            </div>
          ) : (
            // AUDIO PLAYER WAVEFORM CANVAS
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-zinc-900 flex flex-col items-center justify-center overflow-hidden p-6">
              {/* WAVEFORM BAR GRID */}
              {/* Sem `gap` entre as barras: o vão de 4px era ZONA MORTA — clicar ali não fazia
                  nada, e vão + barra dava 36% da faixa sem resposta. Agora cada botão ocupa a
                  fatia inteira e a folga vira padding DENTRO dele, então o desenho é o mesmo e a
                  faixa toda busca. */}
              {/*
                UM slider, não 44 botões.

                As barras eram `<button>` de ~2px cada. O axe acusava 44 violações de
                `target-size` numa tela só, 44 dos 45 do produto inteiro, e alargá-las para os
                24px exigidos destruiria o waveform. O erro era o PADRÃO: busca em áudio é uma
                faixa contínua, não 44 destinos discretos.

                Agora a faixa inteira é um `slider` com teclado (setas, Home/End) e as barras são
                `aria-hidden`, desenho, não controle. Para leitor de tela isso deixa de ser uma
                fileira de 44 botões e vira "posição no áudio", que é o que de fato é.
              */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Posição no áudio"
                aria-valuemin={0}
                aria-valuemax={Math.round(totalDurationSeconds)}
                aria-valuenow={Math.round(currentTime)}
                aria-valuetext={formatSeconds(currentTime)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seekTo(((e.clientX - r.left) / r.width) * totalDurationSeconds);
                }}
                onKeyDown={(e) => {
                  const passo = e.shiftKey ? 10 : 5;
                  if (e.key === 'ArrowRight') { e.preventDefault(); seekTo(Math.min(totalDurationSeconds, currentTime + passo)); }
                  else if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo(Math.max(0, currentTime - passo)); }
                  else if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
                  else if (e.key === 'End') { e.preventDefault(); seekTo(totalDurationSeconds); }
                }}
                className="w-full flex items-center justify-between max-w-lg z-10 h-32 px-4 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {Array.from({ length: 44 }).map((_, i) => {
                  const barProgress = i / 44;
                  const isActive = barProgress <= currentTime / totalDurationSeconds;
                  // Altura REAL do waveform (picos decodificados). Sem áudio → barras neutras baixas
                  // (placeholder honesto — não fabricamos um espectro de frequências).
                  const heightPercentage = peaks.length === 44 ? Math.round(peaks[i] * 100) : 22;

                  return (
                    <div key={i} aria-hidden="true" className="flex-1 h-full flex items-center justify-center px-[2px]">
                      <div
                        className={`w-full rounded-full transition-all duration-300 ${
                          isActive
                            ? 'bg-accent shadow-[0_0_10px_color-mix(in_srgb,var(--accent)_50%,transparent)]'
                            : 'bg-white/15'
                        }`}
                        style={{ height: `${heightPercentage}%` }}
                      ></div>
                    </div>
                  );
                })}
              </div>

              {/* Headphones Icon background */}
              <div className="absolute opacity-5 pointer-events-none">
                <Mic className="w-56 h-56 text-white" />
              </div>

              <div className="absolute bottom-16 text-[10px] font-mono text-white/50 tracking-widest uppercase">
                Espectro de frequências de áudio capturado
              </div>
            </div>
          )}

          {/* Dynamic Smart Subtitles (Floating Bilingual Overlay) */}
          <div className="absolute bottom-6 left-6 right-6 z-20 bg-black/80 hover:bg-black/90 border border-white/10 rounded-2xl p-4 backdrop-blur-md shadow-2xl flex flex-col gap-1.5 transition-all text-center select-none">
            {activeSentence ? (
              <div className="animate-in fade-in duration-300">
                <div className="font-sans font-extrabold text-[15px] text-white leading-relaxed tracking-wide">
                  {activeSentence.original}
                </div>
                <div className="font-sans font-medium text-[13px] text-accent-soft leading-relaxed mt-1">
                  {activeSentence.translation}
                </div>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-[10px] text-white/50 font-mono">
                    Falado às {activeSentence.time} por {activeSentence.speaker}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-white/60 font-medium text-[13px] py-1">
                Aperte o Play para acompanhar a legenda bilíngue integrada e a transcrição interativa.
              </div>
            )}
          </div>
        </div>

        {/* Seek and Bottom Controls Panel */}
        <div className="bg-surface border border-border-subtle p-4 rounded-xl flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {/* Time label elapsed */}
            <span className="font-mono text-[12px] font-bold text-ink-muted w-12 text-right">
              {formatSeconds(currentTime)}
            </span>

            {/* Slider Seekbar */}
            <div className="flex-1 relative flex items-center">
              {/* C2/C5 — este `range` carrega duas responsabilidades. Fecha a violação `label`,
                  e é a ALTERNATIVA ACESSÍVEL que legitima a exceção da C5: os 104 segmentos
                  clicáveis da linha do tempo têm 4,9 px e não podem ter 24 (a largura codifica a
                  posição no tempo, a isenção "apresentação essencial" da WCAG 2.5.8). A exceção
                  só se sustenta porque existe este controle, operável por teclado e nomeado.
                  `aria-valuetext` troca "248" por "4:08", que é o que a pessoa precisa ouvir. */}
              <input
                id="analysis-seekbar"
                name="analysis-seekbar"
                aria-label="Posição na gravação"
                aria-valuetext={`${Math.floor(currentTime / 60)}:${String(Math.floor(currentTime % 60)).padStart(2, '0')} de ${Math.floor(totalDurationSeconds / 60)}:${String(Math.floor(totalDurationSeconds % 60)).padStart(2, '0')}`}
                type="range"
                min="0"
                max={totalDurationSeconds}
                step="0.5"
                value={currentTime}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full h-1.5 rounded-lg appearance-none bg-canvas border border-border-subtle cursor-pointer accent-accent outline-none focus:outline-none"
              />
              
              {/* Marcadores de fala na linha do tempo: um por trecho, todos iguais.
                  F2, antes, um trecho era pintado de âmbar e ficava PULSANDO quando continha
                  uma de quatro palavras cravadas no código (`heuristics`, `leverage`, `synergy`,
                  `volatility`). O destaque afirmava "aqui tem um trecho difícil" com base numa
                  lista fixa em inglês: numa gravação sem nenhuma dessas palavras, nada nunca era
                  destacado; numa que tivesse "leverage" por acaso, um ponto qualquer pulsava.
                  Sinal inventado é pior que sinal nenhum, porque o usuário confia nele.

                  Marcar dificuldade de verdade é possível, o cartão já guarda `cefr_level` e
                  `difficulty_score`, mas é trabalho de outra fase, e inventar enquanto isso não
                  é opção. O ponto continua fazendo o que sempre fez de fato: pular para a fala. */}
              {parsedSentences.map((s, idx) => {
                const percentage = (s.startTime / totalDurationSeconds) * 100;
                const rotulo = `Pular para o trecho de ${s.speaker} (${s.time})`;
                return (
                  <button
                    key={idx}
                    onClick={() => playFrom(s.startTime)}
                    /**
                     * F7 — 238 PARADAS DE TABULAÇÃO A MENOS.
                     *
                     * Medido nesta tela: dos 312 botões visíveis, 238 eram estes pontos — e
                     * NENHUM tinha nome acessível (só `title`, que leitor de tela não usa como
                     * nome). Quem navega por teclado passava por 238 "botão" mudos antes de
                     * chegar a qualquer outro controle da sessão.
                     *
                     * `aria-label` dá nome ao que ficou; `tabIndex={-1}` tira da navegação
                     * sequencial — sem perder nada, porque a MESMA navegação existe de forma
                     * acessível logo abaixo: a lista de falas do transcrito e os botões
                     * "Ir para <tempo>". Estes pontos são um atalho de mouse sobre a linha do
                     * tempo, e continuam funcionando como tal.
                     */
                    aria-label={rotulo}
                    tabIndex={-1}
                    className={`absolute w-2.5 h-2.5 -ml-1.25 rounded-full border border-surface shadow-sm transition-all hover:scale-125 z-10 cursor-pointer bg-accent ${
                      activeSentenceIndex === idx ? 'ring-2 ring-ink scale-125' : ''
                    }`}
                    style={{ left: `${percentage}%` }}
                    title={rotulo}
                  />
                );
              })}
            </div>

            {/* Total time label */}
            <span className="font-mono text-[12px] font-bold text-ink-muted w-12">
              {recording.durationStr}
            </span>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
            {/* Play/Pause controls */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accent-faint text-accent-ink flex items-center justify-center transition-all shadow-md cursor-pointer"
                title={isPlaying ? 'Pausar' : 'Reproduzir'}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 text-white" />
                ) : (
                  <Play className="w-5 h-5 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={() => playFrom(0)}
                className="p-2 hover:bg-surface-hover rounded-lg text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title="Reiniciar"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setLoopMode(!loopMode)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  loopMode 
                    ? 'bg-accent-soft border-accent/20 text-accent' 
                    : 'bg-surface hover:bg-surface-hover border-border-subtle text-ink-muted'
                }`}
                title="Repetir continuamente o trecho ativo (ideal para fixação de pronúncia)"
              >
                <RefreshCw className={`w-3 h-3 ${loopMode ? 'animate-spin' : ''}`} />
                <span>Modo Loop</span>
              </button>
            </div>

            {/* Displaying Current Phrase Info */}
            {activeSentence && (
              <div className="flex items-center gap-2 bg-accent-soft/35 border border-accent/15 rounded-lg px-3 py-1.5 animate-in fade-in">
                <Sparkles className="w-3.5 h-3.5 text-accent shrink-0 animate-pulse" />
                <span className="text-[11.5px] font-bold text-accent">
                  Foco de Estudo: {activeSentence.speaker} ({activeSentence.time})
                </span>
                <button
                  onClick={() => {
                    setShadowingSentenceIndex(activeSentence.index);
                    setShadowingStep('idle');
                    setShadowingScore(null);
                  }}
                  className="ml-2 btn-solid text-[10.5px] py-1 px-2 rounded-md cursor-pointer flex items-center gap-1"
                >
                  <Mic className="w-3 h-3 text-white" /> Treinar Sombra
                </button>
              </div>
            )}

            {/* Quick Action Info badge */}
            <div className="text-[11.5px] text-ink-muted font-medium bg-canvas border border-border-subtle rounded-lg px-2.5 py-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-ink-muted" />
              <span>Dificuldade Geral: <b className="text-warn font-extrabold">Médio/Avançado</b></span>
            </div>
          </div>
        </div>

        {/* Inline Shadowing Board when activated */}
        {shadowingSentenceIndex !== null && shadowingSentenceIndex < parsedSentences.length && (
          <div className="bg-surface border-2 border-accent/30 rounded-2xl p-5 shadow-xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                  <Mic className="w-4 h-4 animate-pulse text-accent" />
                </div>
                <div>
                  <h4 className="font-display font-extrabold text-[14px]">Prática Ativa de Pronúncia (Shadowing)</h4>
                  <p className="text-[11px] text-ink-muted">Trecho falado aos {parsedSentences[shadowingSentenceIndex].time}</p>
                </div>
              </div>
              <button 
                onClick={() => setShadowingSentenceIndex(null)}
                className="text-ink-muted hover:text-ink text-[11.5px] font-bold bg-canvas border border-border-subtle px-2.5 py-1 rounded-lg cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-xl p-4 mb-4 text-center">
              <span className="text-[9.5px] font-mono uppercase text-ink-muted tracking-wider block mb-1">Repita a frase abaixo</span>
              <p className="font-sans font-extrabold text-[16px] text-ink leading-relaxed">
                "{parsedSentences[shadowingSentenceIndex].original}"
              </p>
              <span className="text-[12.5px] text-ink-muted block mt-2 italic">
                "{parsedSentences[shadowingSentenceIndex].translation}"
              </span>
            </div>

            {/* Step actions inside Shadowing Board */}
            {shadowingStep === 'idle' && (
              <div className="flex flex-col items-center py-2">
                <button
                  onClick={() => {
                    const idx = shadowingSentenceIndex;
                    if (idx === null) return;
                    const target = parsedSentences[idx].original;
                    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                    if (!SR) {
                      setShadowingScore({ fluency: 0, accuracy: 0, speed: 0, feedback: 'Reconhecimento de voz não é suportado neste navegador.' });
                      setShadowingStep('result');
                      return;
                    }
                    // Grava a fala REAL do usuário e pontua por similaridade com o alvo.
                    // Escuta no idioma REAL da frase-alvo (era 'en-US' fixo).
                    const rec = new SR();
                    rec.lang = langOfSentence(idx);
                    rec.interimResults = false;
                    rec.maxAlternatives = 1;
                    rec.continuous = false;
                    shadowRecRef.current = rec;
                    shadowStartRef.current = Date.now();
                    let got = '';
                    rec.onresult = (e: any) => { got = e.results?.[0]?.[0]?.transcript || ''; };
                    // Era `() => {}`: o shadowing simplesmente parava, sem dizer por quê. Mic negado,
                    // rede caída e idioma sem suporte davam o mesmo silêncio.
                    rec.onerror = (e: any) => {
                      const msg = speechErrorMessage(e?.error);
                      if (msg) toast.warn(msg);
                    };
                    rec.onend = () => {
                      shadowRecRef.current = null;
                      setShadowingStep('processing');
                      const durationMs = Date.now() - shadowStartRef.current;
                      setShadowingScore(scorePronunciation(target, got, { durationMs }));
                      setShadowingStep('result');
                    };
                    setShadowingStep('recording');
                    try { rec.start(); } catch { setShadowingStep('idle'); }
                  }}
                  className="btn-solid flex items-center gap-2 px-6 py-3 rounded-full shadow-lg bg-error hover:brightness-110 text-white border-none text-[13px] cursor-pointer"
                >
                  <Mic className="w-4 h-4 text-white" />
                  <span>Iniciar Gravação de Áudio</span>
                </button>
                <p className="text-[11px] text-ink-muted mt-2">Clique para permitir o microfone local e começar a falar</p>
              </div>
            )}

            {shadowingStep === 'recording' && (
              <div className="flex flex-col items-center py-3 animate-in fade-in">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-14 h-14 bg-error/20 rounded-full animate-ping"></div>
                  <div className="absolute w-10 h-10 bg-error/40 rounded-full animate-pulse"></div>
                  <button
                    onClick={() => { try { shadowRecRef.current?.stop(); } catch {} }}
                    className="relative w-8 h-8 rounded-full bg-error hover:brightness-110 flex items-center justify-center text-white cursor-pointer border-none"
                  >
                    <Pause className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
                <span className="text-[13px] font-bold text-error-ink animate-pulse mt-4">GRAVANDO SUA VOZ...</span>
                <p className="text-[11.5px] text-ink-muted mt-1">Fale agora. O estúdio analisará o ritmo e a fonologia em tempo real.</p>
              </div>
            )}

            {shadowingStep === 'processing' && (
              <div className="flex flex-col items-center py-4 animate-in fade-in">
                <div className="w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"></div>
                <span className="text-[13px] font-bold text-ink mt-3">Analisando ondas de áudio com IA...</span>
                <p className="text-[11.5px] text-ink-muted mt-1">Mapeando pitch vocal, velocidade de entrega e correspondência de fonemas...</p>
              </div>
            )}

            {shadowingStep === 'result' && shadowingScore && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  {/* Circular visual score */}
                  <div className="card-panel bg-canvas p-4 flex flex-col items-center justify-center border-accent/20">
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" className="stroke-canvas-subtle fill-none" strokeWidth="6" />
                        <circle cx="40" cy="40" r="34" className="stroke-accent fill-none" strokeWidth="6" strokeDasharray={`${2 * Math.PI * 34}`} strokeDashoffset={`${2 * Math.PI * 34 * (1 - shadowingScore.fluency / 100)}`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute font-display font-black text-xl text-ink">
                        {shadowingScore.fluency}%
                      </div>
                    </div>
                    <span className="font-bold text-[11px] text-ink-muted uppercase mt-2">Score Final</span>
                  </div>

                  {/* Stats breakdown */}
                  <div className="md:col-span-3 grid grid-cols-3 gap-3">
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">Fluência</span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.fluency}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-accent h-full" style={{ width: `${shadowingScore.fluency}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">Precisão</span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.accuracy}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-good h-full" style={{ width: `${shadowingScore.accuracy}%` }}></div>
                      </div>
                    </div>
                    <div className="bg-canvas border border-border-subtle p-3 rounded-xl">
                      <span className="text-[10px] uppercase font-mono text-ink-muted font-bold block mb-0.5">Ritmo / Tempo</span>
                      <div className="font-display font-black text-lg text-ink">{shadowingScore.speed}%</div>
                      <div className="w-full bg-surface-hover h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-warn h-full" style={{ width: `${shadowingScore.speed}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phoneme visual feedback */}
                <div className="bg-canvas border border-border-subtle rounded-xl p-4 mb-4">
                  <span className="text-[9.5px] font-mono uppercase text-ink-muted tracking-wider block mb-2">Mapeamento de Fonemas Vocalizados</span>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {parsedSentences[shadowingSentenceIndex].original.split(' ').map((word, wIdx) => {
                      const clean = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
                      // Removido: `isTarget` comparava com uma lista de 5 palavras HARDCODED
                      // ('heuristics', 'leverage', 'synergy', 'volatility', 'new') e não era lida
                      // por ninguém — resíduo do mesmo padrão que o BL-01 já tinha eliminado.
                      // Color code word targets for high interactive value
                      let colorClass = 'bg-good-soft text-good border-good/20';
                      let tip = 'Correto';
                      if (clean === 'new') {
                        colorClass = 'bg-warn-soft text-warn-ink border-warn/30';
                        tip = 'Sotaque nativo leve';
                      }

                      return (
                        <div key={wIdx} className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex flex-col items-center ${colorClass}`} title={tip}>
                          <span>{word}</span>
                          <span className="text-[9px] font-mono opacity-60 font-normal">{tip}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-accent-soft/20 border border-accent/20 rounded-xl mb-4 text-[12.5px] text-ink leading-relaxed">
                  <b className="font-bold text-accent">Análise Vocálica:</b> {shadowingScore.feedback}
                </div>

                <div className="flex gap-3 justify-end flex-wrap">
                  <button
                    onClick={() => {
                      setShadowingStep('recording');
                      setShadowingScore(null);
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                  <button
                    onClick={() => {
                      playWordTTS(parsedSentences[shadowingSentenceIndex].original);
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Ouvir Original</span>
                  </button>
                  <button
                    onClick={() => {
                      // Reprodução da tentativa: mesma frase, no idioma REAL dela (era 'en-US' fixo).
                      ttsSpeak(parsedSentences[shadowingSentenceIndex].original, {
                        lang: langOfSentence(shadowingSentenceIndex) || undefined,
                        rate: 0.8,
                        pitch: 1.1,
                      });
                    }}
                    className="btn-outline flex items-center gap-1.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Ouvir Minha Gravação</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!recording) return null;

  const isVideo = recording.type === 'video';
  const isDoc = recording.type === 'document';
  const isAudio = recording.type === 'audio';

  const themeBgClass = 'bg-canvas text-ink';
  let headerBgClass = 'bg-surface/30 border-b border-border-subtle/50';
  let badgeClass = 'bg-accent-soft text-accent-ink';
  let backLinkClass = 'text-accent hover:text-accent/80';
  let selectClass = 'bg-surface border border-border-subtle text-ink';
  let exportBtnClass = 'btn-ink hover:bg-ink-muted border-none';
  let activeTabClass = 'bg-surface border-b-2 border-accent text-accent shadow-sm font-extrabold';
  let inactiveTabClass = 'text-ink-muted hover:text-ink font-bold';
  let tabContainerClass = 'bg-surface border border-border-subtle p-1 rounded-xl w-fit mb-6 flex overflow-x-auto max-w-full shadow-sm';

  // Cada tipo de gravação ganha um acento semântico (não decorativo): vídeo→error,
  // documento→good, áudio→rare. Usa sempre -soft (preenchimento) + -ink (texto sobre
  // superfície) para permanecer legível nos 6 temas — nunca cores cruas do Tailwind.
  if (isVideo) {
    headerBgClass = 'bg-surface/30 border-b border-error/20';
    badgeClass = 'bg-error-soft text-error-ink border border-error/20';
    backLinkClass = 'text-error-ink hover:text-error';
    selectClass = 'bg-surface border border-border-subtle text-ink';
    exportBtnClass = 'btn-solid bg-error-soft text-error-ink border-none';
    activeTabClass = 'bg-surface border-b-2 border-error text-error-ink shadow-sm font-extrabold';
    inactiveTabClass = 'text-ink-muted hover:text-ink font-bold';
    tabContainerClass = 'bg-surface border border-border-subtle p-1 rounded-xl w-fit mb-6 flex overflow-x-auto max-w-full shadow-sm';
  } else if (isDoc) {
    headerBgClass = 'bg-surface/30 border-b border-good/20';
    badgeClass = 'bg-good-soft text-good-ink border border-good/20';
    backLinkClass = 'text-good-ink hover:text-good';
    selectClass = 'bg-surface border border-border-subtle text-ink';
    exportBtnClass = 'btn-solid bg-good-soft text-good-ink border-none';
    activeTabClass = 'bg-surface border-b-2 border-good text-good-ink shadow-sm font-extrabold';
    inactiveTabClass = 'text-ink-muted hover:text-ink font-bold';
    tabContainerClass = 'bg-surface border border-border-subtle p-1 rounded-xl w-fit mb-6 flex overflow-x-auto max-w-full shadow-sm';
  } else if (isAudio) {
    headerBgClass = 'bg-surface/30 border-b border-rare/20';
    badgeClass = 'bg-rare-soft text-rare-ink border border-rare/20';
    backLinkClass = 'text-rare-ink hover:text-rare';
    selectClass = 'bg-surface border border-border-subtle text-ink';
    exportBtnClass = 'btn-solid bg-rare-soft text-rare-ink border-none';
    activeTabClass = 'bg-surface border-b-2 border-rare text-rare-ink shadow-sm font-extrabold';
    inactiveTabClass = 'text-ink-muted hover:text-ink font-bold';
    tabContainerClass = 'bg-surface border border-border-subtle p-1 rounded-xl w-fit mb-6 flex overflow-x-auto max-w-full shadow-sm';
  }

  return (
    <div className={`flex-1 overflow-y-auto h-full relative ${themeBgClass}`}>
      
      {/* O overlay "Praticar Pronúncia" que existia aqui era INALCANÇÁVEL — `selectedWord` nascia
          `null` e o único `setSelectedWord` do arquivo era o `null` do próprio botão de fechar. O
          comentário dele dizia "(Mockup)". Além de morto, prometia comparar ondas sonoras com uma
          referência, que é exatamente o que o docstring de `scorePronunciation` declara que o
          projeto NÃO faz ("não 'fonemas' que não temos como analisar sem um alinhador acústico"), e
          cravava um significado ("em essência, de forma fundamental") para qualquer palavra.
          A prática de pronúncia real é o Karaokê, na tela de Jogar. */}

      <div className={`px-6 md:px-10 py-6 md:py-8 shrink-0 pb-0 border-b ${headerBgClass}`}>
        {/* Back Link to Library */}
        <button 
          onClick={() => onChangeView('library')}
          className={`flex items-center gap-1.5 text-[12.5px] font-bold transition-colors mb-3 py-1 group ${backLinkClass}`}
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Voltar para Biblioteca</span>
        </button>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded ${badgeClass}`}>
                Sessão de {recording.type === 'video' ? 'YouTube' : recording.type === 'document' ? 'PDF/Documento' : 'Áudio'}
              </span>
              {/* C11 — `opacity-70` saiu: era a terceira vez que opacidade sobre texto aparecia
                  na medição (4,32:1 aqui). A hierarquia já vem do tamanho e do peso; a
                  opacidade só subtraía contraste. `text-ink-muted` diz a mesma coisa com um
                  token que o teste de paletas consegue verificar. */}
              <span className="text-[11.5px] font-semibold flex items-center gap-1 text-ink-muted">
                {recording.type === 'video' ? <Video className="w-3.5 h-3.5" /> : recording.type === 'document' ? <FileText className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />} 
                {recording.type === 'video' ? 'Vídeo Aula' : recording.type === 'document' ? 'Documento Editorial' : 'Gravação de Áudio'}
              </span>
            </div>
            <h1 className="font-display font-black text-xl md:text-2xl tracking-tight flex items-center gap-2 flex-wrap">
              {recording.title}
              {(() => {
                const label = provenanceLabel(realUtterances[0]?.engine);
                return label ? (
                  <span className="badge-tag bg-surface border border-border-subtle text-[10px] font-bold" title="Procedência da transcrição desta sessão">
                    {label}
                  </span>
                ) : null;
              })()}
            </h1>
            <p className="text-[12.5px] text-ink-muted mt-1 leading-snug">
              Análise linguística contextual, práticas ativas e exercícios criados a partir desta mídia específica.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            {/* Elegant Session Switcher Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-ink-muted hidden sm:inline">Alternar de Sessão:</span>
              <div className="relative">
                {/* C2 — este único `<select>` respondia por 18 dos 23 nós críticos da medição:
                    ele é renderizado em TODA aba de Sessão, então o mesmo defeito aparecia 6
                    vezes. O rótulo ao lado é `hidden sm:inline`, ou seja, some no mobile e nunca
                    foi associado por `for`. `aria-label` vale nos dois viewports. */}
                <select
                  aria-label="Alternar de sessão"
                  id="analysis-session-switcher"
                  name="analysis-session-switcher"
                  value={recording.id}
                  onChange={(e) => onChangeView('analysis', { id: e.target.value })}
                  className={`appearance-none rounded-xl py-2 pl-3.5 pr-9 text-[12.5px] font-bold outline-none cursor-pointer transition-colors ${selectClass}`}
                >
                  {allRecordings.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.title.length > 30 ? r.title.substring(0, 30) + '...' : r.title}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-3 opacity-60 pointer-events-none" />
              </div>
            </div>

            {/* Saiu daqui o botão "Jogar com esta sessão": era um destino de tela inteira escondido
                entre os controles do cabeçalho, ao lado de "Exportar". O mesmo conteúdo agora é a
                aba "Jogos", visível na barra de sub-abas. A tela global de jogos continua existindo
                pelo menu, ela vive do baralho e não pode depender de uma sessão (`types.ts:80-84`). */}
            <button className={exportBtnClass} onClick={() => setShowExportModal(true)}>
              <Download className="w-4 h-4" /> <span>Exportar</span>
            </button>
          </div>
        </div>

        {/* Sub-abas — a ORDEM é a mesma nos três perfis (prática antes de métrica); o que muda é a
            linguagem e quantas abrem de uma vez. Em Kids/Sênior, "Visão Geral & Métricas" entra no
            "Ver mais": é a aba mais densa e a menos acionável para quem está começando. Ela continua
            a um clique, nenhuma aba deixa de existir. */}
        <div className={tabContainerClass}>
          <button
            className={`px-4 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all ${currentTab === 'transcript' ? activeTabClass : inactiveTabClass}`}
            onClick={() => onSubTabChange('transcript')}
            aria-pressed={currentTab === 'transcript'}
          >
            {t(recording.type === 'document' ? 'sessionTab.transcript.doc' : 'sessionTab.transcript', ageProfile)}
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all ${currentTab === 'reading' ? activeTabClass : inactiveTabClass}`}
            onClick={() => onSubTabChange('reading')}
            aria-pressed={currentTab === 'reading'}
          >
            <BookOpen className="w-3.5 h-3.5" /> {t('sessionTab.reading', ageProfile)}
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all ${currentTab === 'practice' ? activeTabClass : inactiveTabClass}`}
            onClick={() => onSubTabChange('practice')}
            aria-pressed={currentTab === 'practice'}
          >
            <Gamepad2 className="w-3.5 h-3.5" /> {t('sessionTab.practice', ageProfile)}
          </button>
          {(!coreOnly(ageProfile) || showAllTabs || currentTab === 'overview') && (
            <button
              className={`px-4 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap transition-all ${currentTab === 'overview' ? activeTabClass : inactiveTabClass}`}
              onClick={() => onSubTabChange('overview')}
            aria-pressed={currentTab === 'overview'}
            >
              {t('sessionTab.overview', ageProfile)}
            </button>
          )}
          {coreOnly(ageProfile) && !showAllTabs && currentTab !== 'overview' && (
            <button
              onClick={() => setShowAllTabs(true)}
              className={`${inactiveTabClass} flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-bold whitespace-nowrap`}
              title={t('sessionTab.overview', ageProfile)}
            >
              <MoreHorizontal className="w-3.5 h-3.5" /> Mais
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 p-6 md:p-10 bg-canvas">
        {expandedAnalysisKpi && <AnalysisExpandedKpi kpi={expandedAnalysisKpi} onClose={() => setExpandedAnalysisKpi(null)} utterances={realUtterances} vicios={realVicios} />}
        {currentTab === 'overview' && (
          <EditablePanel
            viewKey="analysis"
            panelKey="overview"
            title="Visão Geral & Métricas"
            canResizeWidth={false}
            canResizeHeight={false}
            defaultHeight={0}
          >
          <div className="animate-in fade-in slide-in-from-bottom-2 space-y-6">
            <div className="flex gap-4 border-b border-border-subtle mb-6">
              <button 
                onClick={() => setOverviewSubTab('dashboard')}
                className={`pb-3 px-4 text-[13px] font-bold border-b-2 transition-colors flex items-center gap-2 ${overviewSubTab === 'dashboard' ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                <LayoutGrid className="w-4 h-4" /> Visão Geral
              </button>
              <button 
                onClick={() => setOverviewSubTab('lexical')}
                className={`pb-3 px-4 text-[13px] font-bold border-b-2 transition-colors flex items-center gap-2 ${overviewSubTab === 'lexical' ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
              >
                <Brain className="w-4 h-4" /> Vocabulário da Sessão
              </button>
              {recording.type !== 'document' && (
                <button 
                  onClick={() => setOverviewSubTab('fluency')}
                  className={`pb-3 px-4 text-[13px] font-bold border-b-2 transition-colors flex items-center gap-2 ${overviewSubTab === 'fluency' ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`}
                >
                  <Mic className="w-4 h-4" /> Desempenho & Fluência
                </button>
              )}
            </div>
            
            {overviewSubTab === 'dashboard' && (
              <div className="space-y-6 animate-in fade-in">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {recording.type === 'document' ? (
                <>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('words_read')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" /> Palavras Lidas</span>
                    <div className="font-display font-black text-2xl tracking-tight">{recording.wordCount.toLocaleString('pt-BR')}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">Extraídas do arquivo original</div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('study_time')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Tempo de Estudo</span>
                    <div className="font-display font-black text-2xl tracking-tight">{Math.max(1, Math.floor(recording.wordCount / 250))}<span className="text-[14px] text-ink-faint ml-0.5">min</span></div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">Estimativa de leitura ativa</div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('flesch')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" /> Complexidade (Flesch)</span>
                    <div className="font-display font-black text-2xl tracking-tight text-accent-ink">{stats.readingEase != null ? stats.readingEase : '-'}{stats.readingEase != null && <span className="text-[14px] text-ink-faint ml-0.5">pts</span>}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">{stats.readingEase != null ? 'Flesch Reading Ease (maior = mais fácil)' : 'requer +texto'}</div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('density')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Densidade Lexical</span>
                    <div className="font-display font-black text-2xl tracking-tight">{stats.wordCount > 0 ? stats.lexicalDensityPct : '-'}{stats.wordCount > 0 && <span className="text-[14px] text-ink-faint ml-0.5">%</span>}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">Palavras de conteúdo</div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('jargons')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" /> Vocábulos Únicos</span>
                    <div className="font-display font-black text-2xl tracking-tight text-good">{stats.wordCount > 0 ? stats.uniqueWords.toLocaleString('pt-BR') : '-'}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">Palavras distintas no texto</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('ppm')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Ritmo de Fala (PPM)</span>
                    <div className="font-display font-black text-2xl tracking-tight text-accent-ink">{realWpm != null ? realWpm : '-'}{realWpm != null && <span className="text-[14px] text-ink-faint ml-0.5">ppm</span>}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">{realWpm != null ? 'Palavras/min (timing real)' : 'requer timing das falas'}</div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('fillers')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><MessageSquareWarning className="w-3.5 h-3.5" /> Vícios de Linguagem</span>
                    <div className="font-display font-black text-2xl tracking-tight text-ink">
                      {realVicios.palavras > 0 ? realVicios.total : '-'}
                    </div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">
                      {realVicios.palavras > 0
                        ? `${realVicios.porMilPalavras}/1000 palavras (${realVicios.idiomas.join(', ')})`
                        : 'requer fala em português ou inglês'}
                    </div>
                  </div>
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('lexical_richness')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><Crosshair className="w-3.5 h-3.5" /> Riqueza Lexical (TTR)</span>
                    <div className="font-display font-black text-2xl tracking-tight">{stats.wordCount > 0 ? Math.round(stats.typeTokenRatio * 100) : '-'}{stats.wordCount > 0 && <span className="text-[14px] text-ink-faint ml-0.5">/100</span>}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">Razão tipo/token do texto</div>
                  </div>
                  {/* F7 — "Tom Vocal Predominante" SAIU da faixa de herói.
                      Ocupava 1/5 da faixa mais nobre da tela exibindo "-", porque o app não
                      analisa pitch do áudio (achado C2). A honestidade estava certa; a POSIÇÃO
                      estava errada, um dado que não existe não disputa espaço com os que
                      existem. Ele continua na tela, com o motivo, na faixa de baixo. */}
                  <div className="card-panel p-4 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('long_pauses')}>
                    <span className="label-mono block mb-1 font-semibold text-ink-muted flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Pausas Longas (&gt;3s)</span>
                    <div className="font-display font-black text-2xl tracking-tight text-error">{realLongPauses != null ? realLongPauses : '-'}</div>
                    <div className="text-[11.5px] text-ink-muted mt-1 font-medium">{realLongPauses != null ? 'Entre falas (timing real)' : 'requer timing das falas'}</div>
                  </div>
                </>
              )}
            </div>

            {/* ── AINDA SEM DADOS SUFICIENTES ──
                A faixa que recebe o que saiu do herói. Nada é escondido: o dado continua na tela,
                com o motivo pelo qual não existe. O que muda é o que a tela GRITA. */}
            {recording.type !== 'document' && (
              <SemDado
                compacto
                className="mb-6"
                motivo="Tom vocal predominante: exige análise de pitch do áudio, que este app não faz."
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Text Analysis */}
              <div className="space-y-6 flex flex-col">
                <div className="card-panel flex flex-col flex-1">
                  <div className="px-5 py-4 border-b border-border-subtle bg-surface flex justify-between items-center">
                    <span className="font-display font-extrabold text-[14px]">Abertura da Transcrição</span>
                    {/* Este 🔊 não tinha `onClick`. Agora fala o que está logo abaixo — a primeira
                        fala REAL, no idioma dela. O título mudou junto: "Resumo Executivo Bilíngue"
                        prometia um resumo, e o que o painel mostra é a abertura crua do transcrito. */}
                    <button
                      onClick={() => {
                        const primeira = parsedSentences[0];
                        if (primeira) speakWord(primeira.original, primeira.lang);
                      }}
                      disabled={!isTtsSupported() || parsedSentences.length === 0}
                      title={parsedSentences.length === 0 ? 'Sem transcrição para ouvir' : 'Ouvir a abertura da transcrição'}
                      aria-label="Ouvir a abertura da transcrição"
                      className="w-11 h-11 rounded bg-canvas border border-border-subtle flex items-center justify-center hover:border-accent group transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Volume2 className="w-4 h-4 text-ink-muted group-hover:text-accent" />
                    </button>
                  </div>
                  <div className="p-5 space-y-4 flex-1 flex flex-col justify-center">
                    <div className="bg-canvas border border-border-subtle rounded-xl p-4">
                      {parsedSentences.length > 0 ? (
                        <>
                          {/* Sem fabricar um "resumo": mostramos a 1ª fala real como abertura + aviso honesto. */}
                          <p className="text-[13.5px] leading-relaxed font-medium mb-2 text-ink">
                            {parsedSentences[0].original}
                          </p>
                          {parsedSentences[0].translation && (
                            <p className="text-[13px] leading-relaxed text-ink-muted italic mb-3">
                              {parsedSentences[0].translation}
                            </p>
                          )}
                          <div className="h-[1px] bg-border-subtle w-full mb-3"></div>
                          <p className="text-[12px] leading-relaxed text-ink-faint">
                            {/* Sem "em breve": resumir exige um modelo de linguagem, que gastaria token
                                do provedor a cada abertura de tela e não funcionaria no perfil
                                Privado/Local. É uma feature com custo e consentimento a decidir, não
                                algo que está a caminho. */}
                            Acima, a abertura REAL da transcrição, não um resumo. Resumo automático exige
                            um modelo de linguagem, que este painel não chama. A transcrição completa está
                            na aba correspondente.
                          </p>
                        </>
                      ) : (
                        <p className="text-[13px] text-ink-muted">Sem transcrição real para resumir ainda.</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('articulatory_pauses')}>
                  <span className="font-display font-extrabold text-[14px] block mb-3">Palavras-chave da Sessão</span>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {topKeywords.length > 0 ? (
                      topKeywords.map((kw, i) => (
                        <span key={kw} className={`badge-tag font-bold ${i === 0 ? 'ok border border-good' : 'bg-surface border border-border-subtle'}`}>{kw}</span>
                      ))
                    ) : (
                      <span className="text-[12.5px] text-ink-muted">Sem transcrição real para extrair palavras-chave.</span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-ink-muted leading-relaxed">
                    Termos de maior saliência extraídos da transcrição real (determinístico). O vocabulário formará a base dos seus exercícios.
                    {/* Estes termos são REAIS (extração determinística). O que não existe é agrupá-los
                        em tópicos nomeados, isso exige um modelo de linguagem. Sem "em breve". */}
                    <span className="text-ink-faint"> São termos, não tópicos: agrupá-los sob um nome de assunto exigiria um modelo de linguagem.</span>
                  </p>
                </div>

                {recording.type !== 'document' && (
                  <div className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('dominant_tone')}>
                    <span className="font-display font-extrabold text-[14px] block mb-3">Pausas e Monólogos</span>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                        <span className="text-[13px] text-ink-muted">Pausas longas (&gt;3s)</span>
                        <span className="font-bold text-[13px] text-ink">{realLongPauses != null ? `${realLongPauses} (timing real)` : '-'}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                        <span className="text-[13px] text-ink-muted">Maior monólogo</span>
                        <span className="font-bold text-[13px] text-ink">{realMonologue != null ? formatSeconds(Math.round(realMonologue / 1000)) : '-'}</span>
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
                )}
              </div>

              {/* Right Column: Visual Charts & Analytics */}
              <div className="space-y-6">
                {/* O painel "Benchmarking: Você vs. Perfil Executivo" saiu. Comparar alguém com um
                    "perfil executivo" exige um CORPUS DE REFERÊNCIA que o projeto não tem, não é
                    questão de ligar uma IA, é que a régua não existe. Prometê-lo como "em breve"
                    anunciava uma comparação que nunca foi possível fazer. */}

                {/* F7 — era `EvolucaoSemanal` com `metrics.vocabByWeek`, ou seja, a série da
                    CONTA INTEIRA dentro da aba de uma gravação (achado D1). Uma sessão única não
                    tem evolução semanal; a pergunta certa neste escopo é a composição de nível. */}
                <NiveisDoConjunto metricas={metricasDaSessao} titulo="Níveis desta sessão" />
              </div>
            </div>
            </div>
            )}
            
            {overviewSubTab === 'lexical' && (
              <div className="flex flex-col lg:flex-row gap-6 animate-in fade-in slide-in-from-right-4 items-start">
                <div className="flex-1 flex flex-col space-y-6 min-w-0 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card-panel p-5 bg-gradient-to-br from-rare/10 to-transparent border-rare/20 cursor-pointer hover:border-rare/40 hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('lexical_richness')}>
                      <span className="label-mono block mb-2 font-semibold text-rare-ink">Total de Vocábulos Únicos</span>
                      <div className="font-display font-black text-3xl tracking-tight text-ink">{stats.wordCount > 0 ? stats.uniqueWords.toLocaleString('pt-BR') : '-'}</div>
                      <p className="text-[12px] text-ink-muted mt-2">Palavras distintas na transcrição desta sessão.</p>
                    </div>
                    <div className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('jargons')}>
                      <span className="label-mono block mb-2 font-semibold text-ink-muted">Termos Técnicos/Jargões</span>
                      {/* Jargão exige um LÉXICO DE DOMÍNIO que o projeto não tem — separar termo
                          técnico de palavra comum depende de saber o assunto. Não é "em breve". */}
                      <div className="font-display font-black text-3xl tracking-tight text-ink-muted">-</div>
                      <p className="text-[12px] text-ink-muted mt-2">Distinguir jargão de palavra comum exige um léxico do domínio, que o app não tem.</p>
                    </div>
                    <div className="card-panel p-5 cursor-pointer hover:border-accent hover:shadow-md transition-all" onClick={() => setExpandedAnalysisKpi('study_time')}>
                      <span className="label-mono block mb-2 font-semibold text-ink-muted">Cards desta Sessão (SRS)</span>
                      <div className="font-display font-black text-3xl tracking-tight text-accent">{vocabCards.filter(c => c.sourceSessionId === recording.id).length}</div>
                      <p className="text-[12px] text-ink-muted mt-2">Termos já enviados ao deck de revisão espaçada.</p>
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
                  
                  <div className="card-panel p-0 overflow-hidden">
                    <div className="p-5 border-b border-border-subtle bg-surface">
                      <h3 className="font-display font-extrabold text-[15px] text-ink flex items-center gap-2">
                        <Brain className="w-4 h-4 text-rare" /> Topologia Lexical da Sessão
                      </h3>
                      <p className="text-[12px] text-ink-muted mt-1">
                        Cada ponto é um card real do seu deck: caixa Leitner (x) × estabilidade FSRS em dias (y), tamanho pela dificuldade.
                      </p>
                    </div>
                    <div className="p-5 bg-canvas">
                      {vocabCards.length > 0 ? (
                        <div className="w-full" style={{ height: 300 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }} onClick={(e: any) => { if(e && e.activePayload && e.activePayload.length > 0) { setSelectedLexicalWord(e.activePayload[0].payload.name); } }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" opacity={0.5} />
                              <XAxis type="number" dataKey="x" name="Caixa Leitner" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} domain={[0, 6]} allowDecimals={false} />
                              <YAxis type="number" dataKey="y" name="Estabilidade (dias)" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                              <ZAxis type="number" dataKey="z" range={[60, 320]} name="Dificuldade" />
                              <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'var(--accent)', opacity: 0.5 }} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border-subtle)', borderRadius: '8px', color: 'var(--ink)' }} itemStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                              <Scatter name="Vocabulário" data={vocabCards.map((c) => ({
                                name: c.word,
                                x: c.leitnerBox ?? 1,
                                y: Math.round(((c.fsrsStability ?? c.stability ?? 0) as number) * 10) / 10,
                                z: c.fsrsDifficulty ?? 5,
                              }))} fill="var(--rare)" fillOpacity={0.7} className="cursor-pointer" />
                            </ScatterChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center gap-3 text-ink-muted" style={{ height: 300 }}>
                          <div className="w-12 h-12 rounded-xl bg-surface-hover flex items-center justify-center">
                            <Brain className="w-6 h-6" />
                          </div>
                          <p className="text-[13px] font-medium max-w-xs leading-relaxed">
                            Nenhum vocábulo no deck ainda. Passe o mouse sobre um termo na transcrição e adicione-o para ver a topologia real.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedLexicalWord && (
                  <div className="w-full lg:w-[350px] xl:w-[400px] shrink-0 bg-canvas border border-border-subtle rounded-2xl shadow-sm flex flex-col sticky top-6 animate-in slide-in-from-right-4" style={{ maxHeight: "calc(100vh - 48px)" }}>
                    <div className="flex items-center justify-between p-5 border-b border-border-subtle shrink-0">
                      <h2 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2">
                        <BookMarked className="w-4 h-4 text-accent" /> Microdados Lexicais
                      </h2>
                      <button onClick={() => setSelectedLexicalWord(null)} className="p-1.5 hover:bg-surface-hover rounded-full transition-colors text-ink-muted hover:text-ink">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex-1 p-5 space-y-6 pb-6 overflow-y-auto custom-scrollbar">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-display font-black text-2xl tracking-tight text-ink break-words">{selectedLexicalWord}</h3>
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
                              title={isTtsSupported() ? `Ouvir "${selectedLexicalWord}"` : 'Este navegador não tem voz sintetizada'}
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
                            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Nível</span>
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
                          <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider block mb-1">Ocorrências</span>
                          <span className="font-mono text-lg font-bold text-ink">{lexicalDetail?.ocorrencias ?? 0}</span>
                          <span className="block text-[10px] text-ink-faint mt-0.5">nesta transcrição</span>
                        </div>
                        <div className="bg-surface border border-border-subtle rounded-xl p-3">
                          <span className="text-[11px] text-ink-muted font-semibold uppercase tracking-wider block mb-1">Retenção (FSRS)</span>
                          <span className={`font-mono text-lg font-bold ${lexicalDetail?.retencao != null ? 'text-accent' : 'text-ink-muted'}`}>
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
                              <div key={i} className="p-3 bg-surface/50 border border-border-subtle/50 rounded-xl relative group">
                                <p className="text-[13px] leading-relaxed text-ink-muted italic pr-9">"{t.texto}"</p>
                                <button
                                  onClick={() => playFrom(t.startTime)}
                                  title="Ouvir este trecho"
                                  aria-label={`Ouvir o trecho a partir de ${formatSeconds(t.startTime)}`}
                                  className="absolute right-2 top-2 p-2 bg-canvas rounded-full shadow-sm text-ink-muted hover:text-accent transition-all border border-border-subtle"
                                >
                                  <Play className="w-3 h-3 ml-0.5" />
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Silêncio MEDIDO entre as falas. Onde havia "45 seg · representa 12% da gravação,
                      ritmo saudável" cravado no JSX, número inventado apresentado como medição. O
                      juízo ("ritmo saudável") não volta: não há norma no app com que comparar. */}
                  <div className="card-panel p-5">
                    <span className="label-mono block mb-2 font-semibold text-ink-muted">Pausas Articulatórias</span>
                    <div className="font-display font-black text-3xl tracking-tight text-ink">
                      {realSilencio != null ? Math.round(realSilencio.ms / 1000) : '-'}
                      {realSilencio != null && <span className="text-[14px] text-ink-faint ml-1">seg</span>}
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
                          : `${realVicios.porMilPalavras} por mil palavras, ${realVicios.detalhe.slice(0, 3).map(d => `"${d.marcador}" ${d.vezes}×`).join(', ')}.`}
                    </p>
                  </div>
                  <div className="card-panel p-5">
                    <span className="label-mono block mb-2 font-semibold text-ink-muted">Tom Predominante</span>
                    <div className="font-display font-black text-3xl tracking-tight text-ink-muted">-</div>
                    <p className="text-[12px] text-ink-muted mt-2">
                      Depende de variação de pitch, que exige análise acústica do áudio, o app não faz.
                      Nada foi estimado.
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
          </EditablePanel>
        )}

        {currentTab === 'transcript' && (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col lg:flex-row gap-6">
            
            <EditablePanel
              viewKey="analysis"
              panelKey="transcript"
              title="Transcrição Integrada"
              canResizeWidth={false}
              canResizeHeight={false}
              className="flex-1"
              defaultWidth={800} // or something
              defaultHeight={0}
            >
            <div className="card-panel flex flex-col h-full">
              <div className="px-5 py-4 border-b border-border-subtle flex flex-wrap gap-3 items-center justify-between bg-surface">
                <span className="font-display font-extrabold text-[14px]">Transcrição e Tradução Integrada</span>
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-1.5 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-bold ${showSettings ? 'bg-accent border-accent text-white' : 'bg-surface hover:bg-surface-hover border-border-subtle text-ink-muted'}`}
                    title="Ajustar exibição do texto"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Configurações</span>
                  </button>
                  {/* Era um `<button className="kpi-pill active">` sem `onClick`: parecia um controle
                      ligado e não fazia nada, com o agravante de continuar aceso quando o botão ao
                      lado escondia o original, ou seja, dizia "Bilíngue" numa exibição que não era.
                      Não é controle nenhum, é o ESTADO de `hideOriginal`, e agora é um rótulo. */}
                  <span
                    className={`kpi-pill ${tsSettings.hideOriginal ? '' : 'active'} cursor-default`}
                    title="Modo de exibição atual do transcrito"
                  >
                    {tsSettings.hideOriginal ? 'Monolíngue' : 'Bilíngue'}
                  </span>
                  <button 
                    onClick={() => {
                      updateSetting('hideOriginal', !tsSettings.hideOriginal);
                    }}
                    className={`kpi-pill ${tsSettings.hideOriginal ? 'active' : ''}`}
                  >
                    {tsSettings.hideOriginal ? 'Só Tradução' : 'Mostrar Original'}
                  </button>
                </div>
              </div>

              {showSettings && (
                <div className="p-4 bg-canvas border-b border-border-subtle grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px] animate-in slide-in-from-top-2 duration-200 shrink-0">
                  <div className="space-y-1">
                    <label className="font-bold text-ink-muted text-[9px] uppercase tracking-wide" htmlFor="analysis-font-size">Tamanho</label>
                    <select
                      id="analysis-font-size"
                      name="analysis-font-size"
                      value={tsSettings.fontSize}
                      onChange={(e) => updateSetting('fontSize', e.target.value as any)}
                      className="w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent"
                    >
                      <option value="small">Pequeno</option>
                      <option value="medium">Médio</option>
                      <option value="large">Grande</option>
                      <option value="xlarge">Extra G.</option>
                      <option value="xxlarge">Gigante</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-ink-muted text-[9px] uppercase tracking-wide" htmlFor="analysis-text-color">Tema de Cor</label>
                    <select
                      id="analysis-text-color"
                      name="analysis-text-color"
                      value={tsSettings.textColor}
                      onChange={(e) => updateSetting('textColor', e.target.value as any)}
                      className="w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent"
                    >
                      <option value="standard">Padrão</option>
                      <option value="highContrast">Contraste</option>
                      <option value="sepia">Sépia</option>
                      <option value="ocean">Oceano</option>
                      <option value="neon">Neon</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-ink-muted text-[9px] uppercase tracking-wide" htmlFor="analysis-font-family">Fonte</label>
                    <select
                      id="analysis-font-family"
                      name="analysis-font-family"
                      value={tsSettings.fontFamily}
                      onChange={(e) => updateSetting('fontFamily', e.target.value as any)}
                      className="w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent"
                    >
                      <option value="sans">Sans (Inter)</option>
                      <option value="serif">Serif (Warm)</option>
                      <option value="mono">Mono (Tech)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-ink-muted text-[9px] uppercase tracking-wide" htmlFor="analysis-display-order">Ordem</label>
                    <select
                      id="analysis-display-order"
                      name="analysis-display-order"
                      value={tsSettings.displayOrder}
                      onChange={(e) => updateSetting('displayOrder', e.target.value as any)}
                      className="w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent"
                    >
                      <option value="original-first">Orig. Primeiro</option>
                      <option value="translated-first">Trad. Primeiro</option>
                    </select>
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="font-bold text-ink-muted text-[9px] uppercase tracking-wide" htmlFor="analysis-hide-original">Ocultar Orig.</label>
                    <select
                      id="analysis-hide-original"
                      name="analysis-hide-original"
                      value={tsSettings.hideOriginal ? "true" : "false"}
                      onChange={(e) => updateSetting('hideOriginal', e.target.value === "true")}
                      className="w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent"
                    >
                      <option value="false">Mostrar Orig.</option>
                      <option value="true">Ocultar Orig.</option>
                    </select>
                  </div>
                </div>
              )}

              {renderInteractivePlayer()}

              {/*
                `tabIndex={0}` + rótulo: região com rolagem precisa ser alcançável pelo teclado.
                Sem isso, quem não usa mouse não consegue rolar a transcrição, e ela é o conteúdo
                principal desta tela. Era a violação `scrollable-region-focusable` do axe.
              */}
              <div
                tabIndex={0}
                role="region"
                aria-label="Transcrição da sessão"
                className="p-5 space-y-4 max-h-[600px] overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
              >
                {parsedSentences.map((sentence, sIdx) => {
                  const { sizeClasses, fontClass, colorClasses } = getTranscriptStyleClasses(tsSettings);
                  const originalTokens = tokenizarTexto(sentence.original);
                  /* Os dois ramos de `displayOrder` desenham a MESMA linha de palavras e só trocam
                     a ordem em relação à tradução. Tudo o que não é a margem sai daqui uma vez,
                     senão a duplicação volta na forma de dois blocos de props idênticos. */
                  const propsDosTokens = {
                    tokens: originalTokens,
                    estaNoDeck: (clean: string) => vocabCards.some(c => c.word.toLowerCase() === clean && c.inDeck),
                    onMouseEnter: handleMouseEnter,
                    onMouseLeave: handleMouseLeave,
                    onExaminar: (clean: string) => examineWord(clean, sentence.original),
                  };
                  const isActive = sentence.index === activeSentenceIndex;
                  const uttId = sentence.id;
                  const isEditing = !!uttId && editingUttId === uttId;

                  return (
                    <div
                      key={sIdx}
                      onClick={() => {
                        // Em modo de edição, o clique não deve buscar/reproduzir.
                        if (isEditing) return;
                        if (recording.type !== 'document') playFrom(sentence.startTime);
                      }}
                      onDoubleClick={() => { if (uttId) startEditUtt(uttId, sentence.original, sentence.translation); }}
                      className={`group relative p-3.5 rounded-xl border-l-4 transition-all duration-300 ${isEditing ? 'cursor-default' : 'cursor-pointer'} ${
                        isEditing
                          ? 'bg-surface-hover/40 border-accent shadow-sm'
                          : isActive && recording.type !== 'document'
                          ? 'bg-accent-soft/10 border-accent shadow-sm animate-pulse-subtle'
                          : 'border-transparent hover:bg-surface-hover/40 hover:border-border-subtle'
                      } ${colorClasses.container}`}
                      style={{ fontFamily: fontClass }}
                    >
                      <div className="absolute -left-2 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-20">
                        <button 
                          className="p-1.5 bg-surface border border-border-subtle rounded-lg hover:text-accent shadow-sm transition-colors cursor-pointer" 
                          /* F7 — este botão só aparece no hover do trecho e não tinha nome
                             acessível: eram 177 "botão" mudos na tela. `aria-label` nomeia;
                             `tabIndex={-1}` tira da tabulação sequencial, porque clicar no
                             próprio trecho (logo ao lado, acessível) faz exatamente a mesma
                             coisa, é atalho de mouse, não um segundo caminho. */
                          aria-label={recording.type !== 'document' ? 'Reproduzir este trecho no Estúdio' : 'Ouvir este trecho'}
                          tabIndex={-1}
                          title={recording.type !== 'document' ? 'Reproduzir no Estúdio' : 'Ouvir TTS'} 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (recording.type !== 'document') {
                              playFrom(sentence.startTime);
                            } else {
                              // Idioma REAL desta fala (cai para o da sessão quando ausente).
                              ttsSpeak(sentence.original, { lang: (sentence.lang || ttsLang) || undefined, rate: 0.9 });
                            }
                          }}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        {recording.type !== 'document' && (
                          <button
                            className="p-1.5 bg-surface border border-border-subtle rounded-lg hover:text-accent shadow-sm transition-colors cursor-pointer"
                            aria-label="Praticar a pronúncia deste trecho"
                            tabIndex={-1}
                            title="Praticar Pronúncia (Sombra)"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShadowingSentenceIndex(sentence.index);
                              setShadowingStep('idle');
                              setShadowingScore(null);
                            }}
                          >
                            <Mic className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {uttId && !isEditing && (
                          <button
                            className="p-1.5 bg-surface border border-border-subtle rounded-lg hover:text-accent shadow-sm transition-colors cursor-pointer"
                            aria-label="Corrigir o texto e a tradução deste trecho"
                            tabIndex={-1}
                            title="Corrigir texto e tradução"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditUtt(uttId, sentence.original, sentence.translation);
                            }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="pl-4 transition-colors">
                        <div className="text-[10.5px] font-bold text-ink-faint uppercase tracking-widest mb-1.5 flex items-center gap-2">
                          <span className="font-mono text-ink-muted normal-case tracking-normal">{sentence.time}</span>
                          <span className="bg-surface-hover px-1.5 py-0.5 rounded text-[9px] font-extrabold text-accent">{sentence.speaker}</span>
                        </div>

                        {isEditing ? (
                          // Edição inline: dois campos (original + tradução). Esc cancela,
                          // Ctrl/Cmd+Enter salva. Salvar → updateUtterance → recalcula tudo.
                          <div
                            className="flex flex-col gap-2.5"
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                          >
                            <div className="space-y-1">
                              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted" htmlFor="analysis-edit-source">Texto original (o que foi falado)</label>
                              <textarea
                                id="analysis-edit-source"
                                name="analysis-edit-source"
                                autoFocus
                                value={editSource}
                                onChange={(e) => setEditSource(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') { e.preventDefault(); cancelEditUtt(); }
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (uttId) saveEditUtt(uttId); }
                                }}
                                rows={2}
                                disabled={editSaving}
                                className="w-full px-3 py-2 bg-canvas text-[14px] border border-border-subtle rounded-lg outline-none text-ink font-medium focus:border-accent resize-y disabled:opacity-60"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted" htmlFor="analysis-edit-target">Tradução</label>
                              <textarea
                                id="analysis-edit-target"
                                name="analysis-edit-target"
                                value={editTarget}
                                onChange={(e) => setEditTarget(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') { e.preventDefault(); cancelEditUtt(); }
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (uttId) saveEditUtt(uttId); }
                                }}
                                rows={2}
                                disabled={editSaving}
                                className="w-full px-3 py-2 bg-canvas text-[13px] border border-border-subtle rounded-lg outline-none text-ink-muted font-medium focus:border-accent resize-y disabled:opacity-60"
                              />
                            </div>
                            {editError && (
                              <p className="text-[11.5px] text-error font-semibold flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {editError}
                              </p>
                            )}
                            <div className="flex items-center justify-end gap-2 pt-0.5">
                              <button
                                onClick={cancelEditUtt}
                                disabled={editSaving}
                                className="btn-outline text-[12px] py-1.5 cursor-pointer disabled:opacity-60"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => { if (uttId) saveEditUtt(uttId); }}
                                disabled={editSaving}
                                className="btn-solid text-[12px] py-1.5 cursor-pointer disabled:opacity-60"
                              >
                                {editSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : tsSettings.displayOrder === 'original-first' ? (
                          <>
                            {!tsSettings.hideOriginal && (
                              <TokensClicaveis
                                {...propsDosTokens}
                                className={`leading-relaxed mb-2 flex flex-wrap gap-x-1 gap-y-0.5 ${sizeClasses.original} ${colorClasses.original}`}
                              />
                            )}
                            <div className={`leading-relaxed ${sizeClasses.translated} ${colorClasses.translated} bg-canvas/30 p-2.5 rounded-lg border border-border-subtle/30`}>
                              {sentence.translation}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className={`leading-relaxed mb-2 ${sizeClasses.translated} ${colorClasses.translated} bg-canvas/30 p-2.5 rounded-lg border border-border-subtle/30`}>
                              {sentence.translation}
                            </div>
                            {!tsSettings.hideOriginal && (
                              <TokensClicaveis
                                {...propsDosTokens}
                                className={`leading-relaxed flex flex-wrap gap-x-1 gap-y-0.5 ${sizeClasses.original} ${colorClasses.original}`}
                              />
                            )}
                          </>
                        )}

                        {/* F2 — AS "DICAS DE VOCABULÁRIO" FORAM REMOVIDAS, NÃO SUBSTITUÍDAS.
                            Eram quatro cards com texto fixo, disparados por `includes()` nas
                            strings literais `basically`, `leverage`, `heuristics` e `synergy`:
                            apareciam em qualquer sessão que contivesse a palavra, com um conselho
                            escrito à mão que nada tinha a ver com o conteúdo da gravação, e
                            sumiam em qualquer outra, dando a impressão de uma análise que não
                            existia.

                            Três linhas acima, este mesmo arquivo declara que o produto não
                            fabrica dado. Não há substituto "real" aqui: gerar uma dica exigiria
                            um modelo de linguagem, que este painel não chama. Quando não há dica
                            derivada da sessão, não há card, é o mesmo padrão que a app já aplica
                            em `AntessalaDaRodada` ("nenhuma palavra difícil neste recorte") e no
                            selo `sem nível` do catálogo.

                            O caminho real para entender uma palavra continua onde sempre esteve
                            e funciona para TODAS elas: clicar nela abre o `VocabularyPanel`. */}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            </EditablePanel>

            {/* Analista de Vocabulário — painel compartilhado, só monta ao clicar numa palavra. */}
            <VocabularyPanel
              viewKey="analysis"
              word={selectedExamWord}
              mtNote={examMtNote}
              onClose={() => { setSelectedExamWord(null); setExamMtNote(null); }}
              onSpeak={speakWord}
              onAddToDeck={handleAddWordToDeck}
              isAdded={!!selectedExamWord && isWordAdded(selectedExamWord)}
              ttsSpeed={ttsSpeed}
              setTtsSpeed={setTtsSpeed}
              onPractice={handlePracticeWord}
            />
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
            {modoRevisao ? (
              <>
                {/* Saída explícita da revisão. Sem ela, o único caminho de volta seria clicar na aba
                    que já está destacada como ativa, ninguém tenta clicar no que parece selecionado. */}
                <button
                  onClick={() => onSubTabChange('practice')}
                  className={`flex items-center gap-1.5 text-[12.5px] font-bold transition-colors mb-3 py-1 group ${backLinkClass}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  <span>Voltar aos jogos</span>
                </button>
                {/* `key` pelo id da sessão: sem ela, trocar de sessão REUSA a mesma instância e o
                    estado interno sobrevive, a fila de revisão (`reviewCards`), o índice, o
                    "mostrar resposta". Quando as contagens das duas sessões coincidem, nada na tela
                    denuncia, e a pessoa revisa os cartões da sessão anterior achando que são desta.
                    Remontar é o comportamento certo: a sessão é a identidade desta tela. */}
                <Study
                  key={recording.id}
                  recording={recording}
                  sentences={sentences}
                  onChangeView={onChangeView}
                  practiceSeed={practiceSeed}
                  onSeedConsumed={onSeedConsumed}
                  ageProfile={ageProfile}
                />
              </>
            ) : (
              /* `embutido`: o lobby aqui é conteúdo de aba, não tela — sem cabeçalho próprio nem
                 voltar duplicado. `recording` filtra os jogos pelo material desta sessão.
                 O esqueleto do `Suspense` imita a grade de cartas em vez de um "carregando…": é o
                 mesmo desenho que aparece um instante depois, então nada salta de lugar. */
              <Suspense fallback={
                <div className="max-w-6xl mx-auto animate-in fade-in duration-200" aria-label="Carregando os jogos">
                  <div className="h-24 rounded-2xl bg-surface border border-border-subtle animate-pulse mb-6" aria-hidden />
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" aria-hidden />)}
                  </div>
                </div>
              }>
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
            )}
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
                      onClick={() => { if (hoveredWord) playWordTTS(hoveredWord); }}
                      className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-muted hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer"
                      title="Ouvir Pronúncia"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {d.context && (
                    <p className="text-[13px] leading-relaxed text-ink-muted border-l-2 border-border-subtle pl-3 italic">
                      "{d.context}"
                    </p>
                  )}

                  <div className="mt-1 pt-3 border-t border-border-subtle flex gap-2">
                    {vocabCards.some(c => c.word.toLowerCase() === (hoveredWord ?? '').toLowerCase() && c.inDeck) ? (
                      /* Rótulo de ESTADO, não controle: era um `<button>` sem `onClick`, que o leitor
                         de tela anuncia como botão e convida a clicar em nada. */
                      <span className="flex-1 py-2 px-3 text-[13px] rounded-lg bg-good-soft text-good font-bold flex items-center justify-center gap-1.5 w-full cursor-default">
                        <Check className="w-4 h-4" /> Já está no Deck
                      </span>
                    ) : (
                      <button
                        onClick={() => { if (hoveredWord) handleAddWordToDeck(hoveredWord); }}
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
                <p className="text-[12.5px] text-ink-muted mt-1">Selecione o formato desejado para salvar seu progresso contextual.</p>
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
                  const content = `# Relatório de Sessão - Babel Play\n\n` +
                    `**Sessão:** ${recording.title}\n` +
                    `**Tipo:** ${recording.type}\n` +
                    `**Total de Palavras:** ${recording.wordCount}\n\n` +
                    `## Estatísticas do Texto (transcrição)\n` +
                    `- Palavras: ${stats.wordCount}\n` +
                    `- Vocábulos únicos: ${stats.uniqueWords}\n` +
                    `- Frases: ${stats.sentenceCount}\n` +
                    `- Densidade lexical: ${stats.lexicalDensityPct}%\n` +
                    `- Razão tipo/token: ${Math.round(stats.typeTokenRatio * 100)}/100\n` +
                    `- Facilidade de leitura (Flesch): ${stats.readingEase != null ? stats.readingEase : '-'}\n\n` +
                    `Gerado em ${new Date().toLocaleDateString('pt-BR')}`;
                    
                  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.setAttribute("href", url);
                  link.setAttribute("download", `relatorio_sessao_${recording.id}.md`);
                  link.style.visibility = 'hidden';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  setShowExportModal(false);
                }}
                className="p-5 border-2 border-border-subtle hover:border-accent bg-surface text-left rounded-xl transition-all cursor-pointer group flex flex-col justify-between h-44"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                      <Activity className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink">Métricas & Desempenho</span>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-relaxed">Baixar relatório completo em formato Markdown contendo KPIs lexical, ritmo e resumo bilingue.</p>
                </div>
                <span className="text-[11px] font-bold text-accent group-hover:underline mt-2">Baixar Relatório (.md) →</span>
              </button>

              {/* Option 2: Flashcards CSV — deck REAL do usuário (nada hardcoded). */}
              <button
                onClick={() => {
                  const esc = (v: string) => (v || '').replace(/;/g, ',').replace(/\n/g, ' ');
                  const rows = vocabCards.map(c => `${esc(c.word)};${esc(c.phonetics)};${esc(c.translation)};${esc(c.sentence || '')}`);
                  const content = `Word;Phonetic;Translation;Sentence\n` + rows.join('\n') + '\n';
                  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.setAttribute("href", url);
                  link.setAttribute("download", `vocab_anki_${recording.id}.csv`);
                  link.style.visibility = 'hidden';
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                  setShowExportModal(false);
                }}
                className="p-5 border-2 border-border-subtle hover:border-rare bg-surface text-left rounded-xl transition-all cursor-pointer group flex flex-col justify-between h-44"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-rare/10 flex items-center justify-center text-rare group-hover:scale-105 transition-transform">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink">Flashcards para Anki</span>
                  </div>
                  <p className="text-[12px] text-ink-muted leading-relaxed">Baixar seu deck real de vocabulário ({vocabCards.length} cards) para importação direta no Anki SRS.</p>
                </div>
                <span className="text-[11px] font-bold text-rare group-hover:underline mt-2">Baixar Flashcards (.csv) →</span>
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
                    const ext = t.includes('webm') ? 'webm'
                      : (t.includes('mpeg') || t.includes('mp3')) ? 'mp3'
                      : t.includes('wav') ? 'wav'
                      : t.includes('ogg') ? 'ogg'
                      : t.includes('mp4') ? 'm4a'
                      : 'audio';
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.setAttribute("href", url);
                    link.setAttribute("download", `audio_sessao_${recording.id}.${ext}`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch { /* download best-effort */ }
                  setShowExportModal(false);
                }}
                className={`p-5 border-2 border-border-subtle bg-surface text-left rounded-xl transition-all group flex flex-col justify-between h-44 ${
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
              <div 
                className="p-5 border-2 border-dashed border-border-subtle bg-surface-hover/50 text-left rounded-xl flex flex-col justify-between h-44 relative opacity-60"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-ink-faint/10 flex items-center justify-center text-ink-faint">
                      <Lock className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-[14px] text-ink-muted">Vídeo da Sessão (Protegido)</span>
                  </div>
                  <p className="text-[12px] text-ink-faint leading-relaxed">Download de vídeo indisponível para respeitar políticas de direitos autorais de plataformas de terceiros.</p>
                </div>
                <span className="text-[11px] font-bold text-ink-faint">Download Bloqueado</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-canvas/30 border-t border-border-subtle flex justify-end gap-2">
              <button 
                onClick={() => setShowExportModal(false)}
                className="btn-outline py-1.5 px-4"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
