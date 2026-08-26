import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PerfilAdaptativoDeIdioma, destinoDaTraducao } from '../../lib/perfilDeIdioma';
import { OrdemDasTraducoes } from '../../lib/ordemDaTraducao';
import { traduzirVersos, explicarParada } from '../../lib/versosDoVocabulario';
import { apiFetch } from '../../data/api';
import { EDICAO_LEVE } from '../../lib/edicao';
import BuscaDeCapa from '../BuscaDeCapa';
import { buildGateway } from '../../gateway';
import { startSystemAudioCapture, startSystemLoopbackCapture, startServerLoopbackCapture, startMicCapture, probeSystemAudio, probeLoopback, probeServerLoopback, serverLoopbackSupported, type AudioCapture, type SystemAudioProbe } from '../../gateway/capture/systemAudio';
import { capMetrics, type CapSource } from '../../gateway/capture/captureMetrics';
import { WebSpeechStt } from '../../gateway/adapters/webSpeech';
import type { SttSession } from '../../gateway/capabilities';
import { mtCoverage, langLabel, baseLang, toBcp47 } from '../../lib/languages';
import { detectLanguage } from '../../lib/langDetect';
// Configuração de idioma: fonte ÚNICA (`mine` = o que VOCÊ fala no mic; `studying` = o que você
// ESTUDA, o áudio estrangeiro). Antes os defaults nasciam aqui, em `useState`.
import { fetchLangConfig, saveLangConfig, onLangConfigChange, DEFAULT_LANG_CONFIG, type LangConfig } from '../../lib/langConfig';
// Produtor ÚNICO de palavra/cartão: o idioma vem da FRASE de onde a palavra saiu e a direção da
// tradução é decidida pelo idioma DA PALAVRA (não pelo par da sessão).
import { resolveWord, buildVocabWord, cardLangs, type WordOrigin } from '../../lib/vocabWord';
import { speak as ttsSpeak, isTtsActive } from '../../lib/tts';
import { listDevices, onDeviceChange, supportsSinkId, filterLoopbackDevices, type AudioDevice } from '../../lib/audioDevices';
import { getActiveProfile, getProviderMode } from '../../gateway/activeProfile';
import { areModelsCached, expectedModelIds } from '../../gateway/modelCache';
import { routeStt, getSttQuality, setSttQualityMirror, type SttQuality } from '../../gateway/sttRouter';
import {
  createSession, bulkAddCards, uploadSessionAudio,
  patchSessionMeta, updateSession, replaceSessionUtterances, fetchSessionTranscript,
  searchImages, fetchSettings, patchUiSettings, type ImageResult, type NewUtterancePayload,
} from '../../data/api';
import ModelPrepPanel, { type ModelPrepState } from '../ModelPrepPanel';
import { makeCloze, extractKeywords, resumoDosPulados, motivoLegivel } from '@core';
import { 
  Mic,
  Headphones,
  ArrowDown,
  MonitorPlay,
  MessagesSquare,
  StopCircle, 
  Settings2, 
  Cpu, 
  AlertCircle, 
  RefreshCw, 
  Activity, 
  Layout, 
  Check, 
  Plus, 
  ArrowRight, 
  Monitor, 
  Sliders,
  Edit2,
  Users,
  Gamepad2,
  Eye,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  ChevronDown,
  Image as ImageIcon,
  Ticket
} from 'lucide-react';
import Overlay, { OverlayCaption } from '../Overlay';
import LangPicker from '../LangPicker';
import { setNavGuard } from '../../lib/navGuard';
// A conversa em balões (lados opostos, agrupamento por pessoa, estado vazio que ensina).
// Um componente só serve a tela embutida E o Modo Foco — antes eram dois blocos que divergiam.
import ChatTranscript from '../ChatTranscript';
import BingoPanel from '../minigames/BingoPanel';
// Identificação automática de voz (diarização leve): embedding WeSpeaker por enunciado
// (worker WASM, 6,7MB) + agrupamento online → "Pessoa 1/2/3" com cor própria.
import { SpeakerClusterer } from '../../lib/speakerCluster';
import { DominantLangTracker } from '../../lib/convoLang';
import { preloadSpeakerId, embedUtterance, disposeSpeakerId } from '../../lib/speakerId';
import { play } from '../../lib/soundFx';
import { burstFromElement } from '../../lib/effects';
import { coreOnly } from '../../lib/profile';
import { toast } from '../Toast';
import DocumentPiP, { isDocumentPiPSupported } from '../DocumentPiP';
import VocabularyPanel from '../VocabularyPanel';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import type { PracticeSeed, ExerciseId } from '../../lib/sentences';
import { Recording, type VocabWord } from '../../types';
import EditablePanel from '../EditablePanel';
import GuidePanel from '../GuidePanel';
import { TranscriptSettings, DEFAULT_TRANSCRIPT_SETTINGS } from '../../lib/transcriptUtils';

// Voice transcript structures
// Logger de diagnóstico da captura — prefixo colorido no console do navegador (observabilidade).
const clog = (...args: any[]) => console.log('%c[cap]', 'color:#F04E23;font-weight:bold', ...args);

interface SpeechSegment {
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
}

// `VocabWord` agora vive em `src/types.ts` — é o contrato compartilhado do <VocabularyPanel/>,
// usado por Captura, Análise, Leitura, Estudo e Métricas. A invariante de honestidade (campos
// ricos só quando há fonte REAL) está documentada lá.

/**
 * Palavras de vocabulário derivadas de uma fala REAL (determinístico, sem IA nem
 * lista fixa). A tradução do verso é preenchida depois pelo gateway de MT.
 */
function wordsFromText(text: string): VocabWord[] {
  return extractKeywords(text, { max: 6 }).map((w) => ({ word: w, translation: '' }));
}

// Speaker definition
interface SpeakerProfile {
  id: string;
  name: string;
  /** Cor da PESSOA (hex). Vale para o ponto do avatar, a borda do balão e o overlay —
   *  hex em vez de classe Tailwind para poder ir via inline style a qualquer superfície. */
  color: string;
  isActive: boolean;
}

/** Paleta das pessoas identificadas (voz N usa a cor N; recicla depois do fim). */
const SPEAKER_COLORS = [
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
const USER_COLOR = '#EA580C';
/** Voz do sistema ainda não identificada (cinza neutro: "alguém", não uma pessoa nomeada). */
const UNKNOWN_VOICE_COLOR = '#64748B';

/**
 * Painel "Visual" da transcrição — componente ÚNICO usado tanto inline quanto no Modo Foco
 * (antes eram dois blocos JSX quase idênticos que divergiam a cada ajuste).
 */
function TranscriptVisualSettings({ idPrefix, dense, tsSettings, updateSetting }: {
  idPrefix: string;
  dense: boolean;
  tsSettings: TranscriptSettings;
  updateSetting: <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => void;
}) {
  const wrap = dense
    ? 'p-4 bg-canvas border border-border-subtle rounded-xl mb-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-[11px] animate-in slide-in-from-top-2 duration-200'
    : 'bg-surface border border-border-subtle rounded-2xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs animate-in slide-in-from-top-2 duration-200 shadow-card shrink-0';
  const labelCls = dense ? 'font-bold text-ink-muted text-[9px] uppercase tracking-wide' : 'font-bold text-ink-muted text-[10px] uppercase';
  const selectCls = dense
    ? 'w-full bg-surface border border-border-subtle rounded-lg p-1.5 font-bold text-ink cursor-pointer outline-none focus:border-accent'
    : 'w-full bg-canvas border border-border-subtle rounded-lg p-2 font-semibold text-ink cursor-pointer outline-none focus:border-accent';
  const fields: Array<{ id: string; label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]>; span?: boolean }> = [
    { id: 'font-size', label: 'Tamanho', value: tsSettings.fontSize, onChange: v => updateSetting('fontSize', v as any), options: [['small', 'Pequeno'], ['medium', 'Médio'], ['large', 'Grande'], ['xlarge', 'Extra Grande'], ['xxlarge', 'Gigante']] },
    { id: 'text-color', label: 'Tema de Cor', value: tsSettings.textColor, onChange: v => updateSetting('textColor', v as any), options: [['standard', 'Padrão'], ['highContrast', 'Alto Contraste'], ['sepia', 'Sépia'], ['ocean', 'Oceano'], ['neon', 'Neon']] },
    { id: 'font-family', label: 'Fonte', value: tsSettings.fontFamily, onChange: v => updateSetting('fontFamily', v as any), options: [['sans', 'Sans (padrão)'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { id: 'display-order', label: 'Ordem', value: tsSettings.displayOrder, onChange: v => updateSetting('displayOrder', v as any), options: [['original-first', 'Original primeiro'], ['translated-first', 'Tradução primeiro']] },
    { id: 'hide-original', label: 'Original', value: tsSettings.hideOriginal ? 'true' : 'false', onChange: v => updateSetting('hideOriginal', v === 'true'), options: [['false', 'Mostrar'], ['true', 'Ocultar']], span: true },
  ];
  return (
    <div className={wrap}>
      {fields.map(f => (
        <div key={f.id} className={`space-y-1 ${f.span ? 'col-span-2 sm:col-span-1' : ''}`}>
          <label htmlFor={`${idPrefix}-${f.id}`} className={labelCls}>{f.label}</label>
          <select id={`${idPrefix}-${f.id}`} name={`${idPrefix}-${f.id}`} value={f.value} onChange={(e) => f.onChange(e.target.value)} className={selectCls}>
            {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

/**
 * Rótulo + <LangPicker/>: uma escolha só (o "Detectar automaticamente" é a primeira opção da
 * lista), com bandeira TAMBÉM na lista — o que a `<option>` nativa não permite (só aceita texto).
 */
function LangSelect({ id, label, icon, value, auto = false, allowAuto = false, accent = false, onPick }: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** BCP-47 selecionado (mostrado quando NÃO está no automático). */
  value: string;
  auto?: boolean;
  allowAuto?: boolean;
  /** Caixa destacada (o idioma do conteúdo/estudo). */
  accent?: boolean;
  onPick: (v: { auto: boolean; code?: string }) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[8px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1">
        {icon} {label}
      </span>
      <LangPicker
        id={id}
        ariaLabel={label}
        value={value}
        auto={auto}
        allowAuto={allowAuto}
        accent={accent}
        onPick={onPick}
      />
    </div>
  );
}

export default function LiveCapture({ onSave, onTranscriptChange, resumingRecordingId, recordings, onChangeView, ageProfile = 'pro' }: {
  onSave: (recording: Recording, shouldRedirect?: boolean) => void;
  onTranscriptChange?: (text: string) => void;
  resumingRecordingId?: string | null;
  recordings?: Recording[];
  /** Navegação entre telas (ex.: "praticar esta frase" a partir da captura ao vivo). */
  onChangeView?: (view: string, data?: any) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
}) {
  const [showOverlay, setShowOverlay] = useState(false);
  /** BINGO DA ESCUTA: cartela que acende com as palavras ouvidas (ver minigames/BingoPanel). */
  const [showBingo, setShowBingo] = useState(false);
  // 'transparent' e não '#000000': o padrão do overlay é fundo invisível, e começar em preto
  // fazia a janela flutuante abrir PRETA e só depois clarear, quando o Overlay montava.
  const [overlayBgColor, setOverlayBgColor] = useState('transparent');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  // Diagnóstico de captura do áudio do sistema (botão "Testar").
  const [probe, setProbe] = useState<SystemAudioProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const handleProbeSystem = async () => {
    setProbing(true); setProbe(null);
    try {
      setProbe(systemSource === 'server'
        ? await probeServerLoopback()
        : systemSource === 'loopback'
          ? await probeLoopback(loopbackDeviceId || undefined)
          : await probeSystemAudio());
    } catch (e) {
      setFeedbackMsg('Teste cancelado/bloqueado: ' + (e as Error).message);
      setTimeout(() => setFeedbackMsg(''), 5000);
    } finally { setProbing(false); }
  };

  // --- MODAL DE ENCERRAMENTO DA SESSÃO ---
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [customSessionTitle, setCustomSessionTitle] = useState('');
  const [customSessionImage, setCustomSessionImage] = useState('');   // capa escolhida (URL ou data URL)
  const [imgQuery, setImgQuery] = useState('');
  const [imgResults, setImgResults] = useState<ImageResult[]>([]);
  const [imgLoading, setImgLoading] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);
  // Áudio real gravado nesta sessão — guardado até o usuário confirmar o save no modal.
  const recordedAudioRef = useRef<Blob | null>(null);

  // --- MODO RETOMAR ---
  // Espelho LOCAL do id em retomada: começa com a prop e pode ser limpo pelo botão
  // "sair do modo retomar" (o App só zera a prop DEPOIS de salvar). Toda a lógica de
  // persistência olha para `resumeId`, não para a prop.
  const [resumeId, setResumeId] = useState<string | null>(resumingRecordingId ?? null);


  // --- TRANSCRIPT CUSTOM CUSTOMIZATION SETTINGS ---
  const [tsSettings, setTsSettings] = useState<TranscriptSettings>(() => {
    const saved = localStorage.getItem('transcriptSettings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch { /* leitura opcional: sem ajustes salvos, segue o padrão */ }
    }
    return DEFAULT_TRANSCRIPT_SETTINGS;
  });

  const updateSetting = <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => {
    setTsSettings(prev => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem('transcriptSettings', JSON.stringify(updated));
      window.dispatchEvent(new Event('transcriptSettingsChanged'));
      return updated;
    });
  };

  useEffect(() => {
    const handleSettingsChange = () => {
      const saved = localStorage.getItem('transcriptSettings');
      if (saved) {
        try {
          setTsSettings(JSON.parse(saved));
        } catch { /* idem: ausência de ajuste não é erro */ }
      }
    };
    window.addEventListener('transcriptSettingsChanged', handleSettingsChange);
    window.addEventListener('storage', handleSettingsChange);
    return () => {
      window.removeEventListener('transcriptSettingsChanged', handleSettingsChange);
      window.removeEventListener('storage', handleSettingsChange);
    };
  }, []);

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showVisualSettings, setShowVisualSettings] = useState(false);

  // --- PERSISTENT SESSION CONFIGURATIONS ---
  // Dispositivos de áudio REAIS (enumerados via enumerateDevices). '' = padrão do SO.
  const [inputDeviceId, setInputDeviceId] = useState('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([]);
  const [deviceLabelsReady, setDeviceLabelsReady] = useState(false);
  // Motor de transcrição do MICROFONE: 'browser' = Web Speech (rápido, leve, ótimo p/ PT — PADRÃO)
  // ou 'whisper' = getUserMedia+VAD+Whisper local (offline, escolhe dispositivo). Persistido.
  const [micEngine, setMicEngine] = useState<'browser' | 'whisper'>('browser');
  const webSpeechSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  // Velocidade do TTS (escutar tradução/palavra). Persistida em settings.ui.
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  // Waveform REAL: histórico de níveis (0..1) que segue o áudio capturado, não animação falsa.
  const [levels, setLevels] = useState<number[]>(() => new Array(48).fill(0));
  const currentLevelRef = useRef(0); // peak-hold do nível instantâneo (as fontes escrevem aqui)
  const meterRef = useRef<{ stop: () => void } | null>(null); // medidor de mic p/ o motor navegador
  const pushLevel = (v: number) => { if (v > currentLevelRef.current) currentLevelRef.current = v; };
  // Nome do perfil que de fato roda no gateway (Configurações → Perfil de IA).
  const activeProfileName = getActiveProfile().name;
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  /** Gaveta do passo-a-passo de setup (Stereo Mix / VB-Cable). Ver o efeito logo abaixo. */
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  /** Em Kids/Sênior, a escolha de ROTA técnica começa recolhida (`coreOnly`). */
  const [showAdvancedRoutes, setShowAdvancedRoutes] = useState(false);
  const configCloseRef = useRef<HTMLButtonElement | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  // Rota STT ativa (selo honesto do header) + preferência de qualidade (roteador).
  const [sttRouteLabel, setSttRouteLabel] = useState('');
  const [sttQuality, setSttQuality] = useState<SttQuality>(() => getSttQuality());

  // --- SPEAKER DIARIZATION STATE ---
  // Só os dois falantes REAIS por origem de áudio (você = mic, sistema = aba/loopback). Nada de
  // perfis pré-populados com estatísticas inventadas — % de fala é derivado dos segmentos reais
  // (talkTimePct abaixo) e outros falantes entram via "Adicionar Falante".
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([
    { id: 'user', name: 'Você', color: USER_COLOR, isActive: true },
    { id: 'system', name: 'Outros', color: UNKNOWN_VOICE_COLOR, isActive: false }
  ]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [editingSpeakerName, setEditingSpeakerName] = useState('');

  const handleAddSpeaker = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextLetter = letters[speakerProfiles.length % letters.length];
    const newId = `speaker_${Date.now()}`;
    const newSpeaker: SpeakerProfile = {
      id: newId,
      name: `Falante ${nextLetter}`,
      color: SPEAKER_COLORS[speakerProfiles.length % SPEAKER_COLORS.length],
      isActive: false
    };
    setSpeakerProfiles(prev => [...prev, newSpeaker]);
    setFeedbackMsg(`Novo orador "${newSpeaker.name}" adicionado!`);
    setTimeout(() => setFeedbackMsg(''), 2000);
  };

  // ── IDENTIFICAÇÃO AUTOMÁTICA DE VOZ (cenário Conversa) ─────────────────────────────
  // Cada enunciado do SISTEMA ganha um embedding de voz (worker WASM) e cai num cluster:
  // cluster N ↔ perfil 'voice_N' ("Pessoa N", cor própria, renomeável no painel Falantes).
  // Best-effort de ponta a ponta: sem modelo (offline/1º uso) a captura segue com "Outros".
  const [speakerAutoId, setSpeakerAutoId] = useState(true);
  const speakerAutoIdRef = useRef(true);
  useEffect(() => { speakerAutoIdRef.current = speakerAutoId; }, [speakerAutoId]);
  /** Estado honesto p/ o painel Falantes: off | loading | ready | unavailable. */
  const [speakerIdStatus, setSpeakerIdStatus] = useState<'off' | 'loading' | 'ready' | 'unavailable'>('off');
  const clustererRef = useRef(new SpeakerClusterer());
  /** Última voz identificada — enunciados curtos demais para identificar herdam esta. */
  const lastVoiceIdRef = useRef<string | null>(null);
  /** Falas de vozes AINDA provisórias (id do cluster → ids das falas), reetiquetadas na promoção. */
  const provisionalUttsRef = useRef<Map<number, string[]>>(new Map());
  /** Idioma dominante das falas DELES (multi-idioma: é para ele que a SUA fala é verta). */
  const dominantLangRef = useRef(new DominantLangTracker());
  /**
   * PERFIL ADAPTATIVO — o idioma que está sendo falado DE VERDADE, aprendido ao longo da sessão.
   *
   * Diferente do `DominantLangTracker`, que responde "para onde mando a MINHA fala", este
   * responde "o que eles estão falando" e CONVERGE: uma vez concluído, resiste a detecções
   * isoladas erradas (uma sessão real em português teve um trecho detectado como russo e um
   * "Thank you." como inglês). Sem ele, a decisão de destino era refeita a cada fala e a
   * interface nunca refletia o que o sistema já sabia.
   */
  const perfilIdiomaRef = useRef(new PerfilAdaptativoDeIdioma());
  /** O que o perfil concluiu, para a interface exibir. Vazio = ainda ouvindo. */
  const [idiomaObservado, setIdiomaObservado] = useState('');
  const idiomaObservadoRef = useRef('');
  useEffect(() => { idiomaObservadoRef.current = idiomaObservado; }, [idiomaObservado]);

  /** Garante o perfil 'voice_N' (criado na 1ª fala daquela voz; nome/cor padrão renomeáveis). */
  const ensureVoiceProfile = (clusterId: number) => {
    const vid = `voice_${clusterId}`;
    setSpeakerProfiles(prev => prev.some(p => p.id === vid) ? prev : [...prev, {
      id: vid,
      name: `Pessoa ${clusterId}`,
      color: SPEAKER_COLORS[(clusterId - 1) % SPEAKER_COLORS.length],
      isActive: false,
    }]);
    return vid;
  };

  // --- REAL-TIME VOICE TRANSCRIPTION STREAM ---
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  // `sourceLang` ≡ config.mine (o idioma que VOCÊ fala) e `targetLang` ≡ config.studying (o que você
  // ESTUDA). Os valores iniciais vêm de `langConfig.ts` — este arquivo não é mais o dono do padrão de
  // idioma da app; a config real é carregada logo abaixo (fetchLangConfig) e gravada com saveLangConfig.
  const [sourceLang, setSourceLang] = useState(DEFAULT_LANG_CONFIG.mine);
  const [targetLang, setTargetLang] = useState(DEFAULT_LANG_CONFIG.studying);
  const [manualSpeakerInput, setManualSpeakerInput] = useState('');
  // Ferramentas de dev (simulador de fala na UI): opt-in por localStorage, fora da UI normal.
  const devToolsEnabled = useMemo(() => { try { return localStorage.getItem('babel.devTools') === '1'; } catch { return false; } }, []);
  const [isProcessingManualInput, setIsProcessingManualInput] = useState(false);

  // Segmentos de fala capturados AO VIVO (começa vazio; sem simulação).
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);

  // % de tempo de fala REAL por falante, somando a duração (tEnd−tStart) dos enunciados finais.
  // null enquanto não há nenhum enunciado com timing — a UI então omite o número em vez de exibir 0% falso.
  const talkTimePct = useMemo<Record<string, number> | null>(() => {
    const durBySpeaker = new Map<string, number>();
    let total = 0;
    for (const s of speechSegments) {
      if (s.isPartial || s.tStartMs == null || s.tEndMs == null) continue;
      const dur = Math.max(0, s.tEndMs - s.tStartMs);
      durBySpeaker.set(s.speakerId, (durBySpeaker.get(s.speakerId) ?? 0) + dur);
      total += dur;
    }
    if (total <= 0) return null;
    const pct: Record<string, number> = {};
    for (const [id, dur] of durBySpeaker) pct[id] = Math.round((dur / total) * 100);
    return pct;
  }, [speechSegments]);

  // Legendas do relay (overlay), derivadas das falas REAIS. Cronológico; sem parciais
  // vazios. 'system' = eles (áudio da aba/sistema), o resto = você (microfone).
  const overlayCaptions: OverlayCaption[] = useMemo(() => {
    const profileOf = (id: string) => speakerProfiles.find(p => p.id === id);
    return speechSegments
      .filter(s => s.originalText && s.originalText.trim())
      .slice(-200)
      .map(s => {
        const isSys = s.source === 'system';
        return {
          id: s.id,
          speaker: profileOf(s.speakerId)?.name ?? s.speakerId,
          original: s.originalText,
          translated: s.translatedText,
          side: (isSys ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
          // Cor da PESSOA identificada + idiomas REAIS da linha (multi-idioma) — o overlay
          // usa para colorir o balão por pessoa e para o TTS falar no idioma certo.
          speakerColor: profileOf(s.speakerId)?.color,
          origLang: s.lang ? (toBcp47(s.lang) || s.lang) : (isSys ? targetLang : sourceLang),
          transLang: isSys ? sourceLang : targetLang,
        };
      });
  }, [speechSegments, speakerProfiles, sourceLang, targetLang]);

  // Dispositivos de loopback candidatos (Stereo Mix / VB-Cable) entre os inputs enumerados.
  // `detected` = casou por heurística; se false, é o fallback com todos os inputs.
  const { devices: loopbackDevices, detected: loopbackDetected } = useMemo(
    () => filterLoopbackDevices(audioInputs),
    [audioInputs]
  );

  // Captura DUPLA e simultânea (como o desktop): microfone (sua voz) + sistema/aba (outros falantes).
  // AMBAS ligadas por PADRÃO: o caso de uso real é conversa/aula/chamada — você fala E ouve o outro
  // lado. Vir só com o mic marcado obrigava o usuário a descobrir e ligar o sistema toda vez (atrito
  // desnecessário). Quem quiser só uma das fontes desmarca a outra com um clique no hero card.
  // Padrão casa com o cenário inicial 'media' (assistir mídia): só o sistema ligado.
  const [micEnabled, setMicEnabled] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(true);
  // COMO capturar o áudio do sistema: 'display' = compartilhar aba/tela (getDisplayMedia; zero
  // setup, mas o áudio de TELA sofre a limitação NotReadableError no Windows) ou 'loopback' =
  // dispositivo de entrada de loopback (Stereo Mix / VB-Cable via getUserMedia; à prova de falhas,
  // capta o sistema INTEIRO incl. Discord/jogos, com setup único). Persistido em settings.ui.
  const [systemSource, setSystemSource] = useState<'display' | 'loopback' | 'server'>('display');
  // MODO DESEMPENHO (jogos): pula os decodes PARCIAIS (a legenda só aparece no fim de cada frase).
  // Corta a maior fatia de GPU/CPU da captura contínua — o decode final continua intacto.
  const [perfMode, setPerfMode] = useState(false);
  const perfModeRef = useRef(false);
  useEffect(() => { perfModeRef.current = perfMode; }, [perfMode]);
  // MULTI-IDIOMA: em vez de fixar "Eles falam = X", o Whisper detecta o idioma de CADA fala do
  // sistema (lobby com gente de vários países, chamadas mistas) e o Tradutor IA do servidor
  // (que dispensa origem declarada) traduz tudo para o SEU idioma.
  // LIGADO por padrão (decisão de atrito): o usuário novo não precisa saber de antemão o
  // idioma do que vai ouvir — cada fala é detectada e traduzida para o idioma dele. Quem
  // escolher um idioma fixo no seletor desliga isto na hora (a escolha fica persistida).
  const [autoDetectLang, setAutoDetectLang] = useState(true);
  const autoDetectLangRef = useRef(true);
  useEffect(() => { autoDetectLangRef.current = autoDetectLang; }, [autoDetectLang]);
  // O MESMO para "Eu falo": conteúdo no idioma nativo, fala misturada, ou o usuário alternando
  // idiomas — o Whisper detecta cada fala do MIC e traduz para o idioma de estudo. (A Web Speech
  // não autodetecta; nesse motor a escolha vale só para o Whisper do mic.)
  const [autoDetectMyLang, setAutoDetectMyLang] = useState(false);
  const autoDetectMyLangRef = useRef(false);
  useEffect(() => { autoDetectMyLangRef.current = autoDetectMyLang; }, [autoDetectMyLang]);

  // CENÁRIO DE CAPTURA — a intenção do usuário decide fontes, rótulos e painéis.
  // 'media' = assistir vídeo/aula/podcast (só sistema) · 'conversation' = chamada/reunião
  // (mic+sistema) · 'mic' = praticar a própria voz (só mic). Trocar de cenário só ajusta as
  // FONTES; os idiomas escolhidos permanecem.
  type CaptureScenario = 'media' | 'conversation' | 'mic';
  const [captureScenario, setCaptureScenario] = useState<CaptureScenario>('media');
  // Espelho p/ os handlers assíncronos (a identificação de voz só roda no cenário Conversa).
  const captureScenarioRef = useRef<CaptureScenario>('media');
  useEffect(() => { captureScenarioRef.current = captureScenario; }, [captureScenario]);
  /**
   * O usuário JÁ escolheu um cenário nesta montagem? Se sim, a reidratação assíncrona das
   * configurações não pode mais sobrescrever a escolha dele.
   *
   * BUG QUE ISTO CORRIGE (observado): `fetchSettings()` é assíncrono e o `applyScenario` da
   * reidratação roda quando a resposta chega. Numa máquina lenta isso acontece DEPOIS de a tela
   * já estar clicável — o usuário escolhia "Conversa" e a tela pulava sozinha de volta para o
   * cenário salvo, segundos depois, sem nenhuma explicação. Escolha do usuário sempre vence.
   */
  const scenarioTouchedRef = useRef(false);
  /** Idem para os IDIOMAS: escolha feita antes de a carga assíncrona chegar não pode ser desfeita. */
  const langTouchedRef = useRef(false);
  const applyScenario = (s: CaptureScenario, fromUser = true) => {
    if (fromUser) scenarioTouchedRef.current = true;
    else if (scenarioTouchedRef.current) return; // reidratação chegou tarde — não desfaz o clique
    setCaptureScenario(s);
    setMicEnabled(s !== 'media');
    setSystemEnabled(s !== 'mic');
  };
  // A rota "servidor local" (WASAPI loopback no Node) só existe quando o backend roda no
  // Windows com o módulo nativo — sondamos uma vez e só então mostramos a opção.
  const [serverCaptureAvailable, setServerCaptureAvailable] = useState(false);
  useEffect(() => { void serverLoopbackSupported().then(setServerCaptureAvailable); }, []);
  // Dispositivo de loopback escolhido ('' = padrão do SO — útil só se o default já for loopback).
  const [loopbackDeviceId, setLoopbackDeviceId] = useState('');

  /**
   * RESGATE DE UMA ESCOLHA QUE FICOU IMPOSSÍVEL.
   *
   * `systemSource` é PERSISTIDO. Quem escolheu "Dispositivo de loopback" um dia — numa máquina com
   * VB-Cable, ou só experimentando — fica com essa escolha gravada para sempre. Se o dispositivo
   * não existe mais (ou nunca existiu), a rota não tem de onde ler o som: a captura simplesmente
   * não funciona, e a tela não diz o porquê. Foi exatamente o que aconteceu numa demonstração.
   *
   * Aqui a escolha salva é trocada por "Som do computador" QUANDO, e só quando, as três coisas
   * valem: a rota do servidor existe, os rótulos dos dispositivos estão visíveis, e nenhum dos
   * inputs é de loopback.
   *
   * A CONDIÇÃO DOS RÓTULOS É O QUE IMPEDE UM FALSO NEGATIVO. Sem permissão de microfone concedida,
   * o navegador esconde os rótulos e `filterLoopbackDevices` devolve `detected: false` mesmo com um
   * VB-Cable instalado. Trocar aí seria passar por cima de uma escolha legítima por falta de
   * informação — pior que o problema que isto conserta.
   *
   * Roda UMA vez (o ref), e avisa na tela: silenciosamente mudar o que a pessoa configurou é o tipo
   * de "ajuda" que faz alguém desconfiar do app inteiro.
   */
  const resgatouRotaRef = useRef(false);
  useEffect(() => {
    if (resgatouRotaRef.current) return;
    if (!serverCaptureAvailable || systemSource !== 'loopback') return;
    resgatouRotaRef.current = true;
    void (async () => {
      const { inputs, hasLabels } = await listDevices();
      if (!hasLabels) return;                       // sem rótulos não dá para concluir nada
      if (filterLoopbackDevices(inputs).detected) return;  // existe dispositivo: a escolha vale
      setSystemSource('server');
      setFeedbackMsg('Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) foi encontrado — mudei para "Som do computador", que não precisa de configuração.');
      setTimeout(() => setFeedbackMsg(''), 8000);
    })();
  }, [serverCaptureAvailable, systemSource]);
  // Preparação do modelo local (Whisper + opus-mt) — cache-aware, com barras e erro/retry.
  // null = ocioso; caso contrário, o painel ModelPrepPanel é exibido.
  const [modelPrep, setModelPrep] = useState<ModelPrepState | null>(null);

  // AI Gateway do perfil ativo — tradução ao vivo provider-agnóstica.
  const gateway = useMemo(
    () =>
      buildGateway({
        profile: getActiveProfile(),
        cloudConsent: () => true,
      }),
    []
  );

  // Expõe o gateway no console para diagnóstico/testes (ex.: window.__babelGateway.stt.transcribePcm).
  useEffect(() => {
    (window as any).__babelGateway = gateway;
  }, [gateway]);

  useEffect(() => {
    if (onTranscriptChange) {
      onTranscriptChange(speechSegments.map(s => s.originalText).join(' '));
    }
  }, [speechSegments, onTranscriptChange]);

  // Ref espelhando isRecording (usado pelos fluxos de start/stop das capturas).
  const isRecordingRef = useRef(false);
  // Id do bloco parcial em andamento (streaming ao vivo); null quando não há enunciado aberto.
  const partialIdRef = useRef<string | null>(null);
  // Cache de traduções por (src|tgt|texto) para não re-traduzir repetições (espelha o LRU do desktop).
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const focusScrollRef = useRef<HTMLDivElement>(null);

  // ACOMPANHAMENTO INTELIGENTE da conversa (mesma UX do overlay): segue o fim
  // automaticamente ENQUANTO o usuário está lá; se ele rolar para cima para reler,
  // paramos de puxar e um botão "Ir para a fala atual" volta num clique.
  const transcriptPinnedRef = useRef(true);
  const focusPinnedRef = useRef(true);
  const [showJumpTranscript, setShowJumpTranscript] = useState(false);
  const [showJumpFocus, setShowJumpFocus] = useState(false);
  const NEAR_BOTTOM_PX = 72;
  const handleTranscriptScroll = () => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    transcriptPinnedRef.current = pinned;
    if (pinned) setShowJumpTranscript(false);
  };
  const handleFocusScroll = () => {
    const el = focusScrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    focusPinnedRef.current = pinned;
    if (pinned) setShowJumpFocus(false);
  };
  const jumpToCurrent = (which: 'transcript' | 'focus') => {
    const el = which === 'transcript' ? transcriptScrollRef.current : focusScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (which === 'transcript') { transcriptPinnedRef.current = true; setShowJumpTranscript(false); }
    else { focusPinnedRef.current = true; setShowJumpFocus(false); }
  };
  useEffect(() => {
    const t = transcriptScrollRef.current;
    if (t) {
      if (transcriptPinnedRef.current) t.scrollTop = t.scrollHeight;
      else setShowJumpTranscript(true);
    }
    const f = focusScrollRef.current;
    if (f) {
      if (focusPinnedRef.current) f.scrollTop = f.scrollHeight;
      else setShowJumpFocus(true);
    }
  }, [speechSegments, isRecording]);

  // Manual select speaker helper
  const handleSelectActiveSpeaker = (id: string) => {
    setSpeakerProfiles(prev => prev.map(p => p.id === id ? { ...p, isActive: true } : { ...p, isActive: false }));
    const selected = speakerProfiles.find(p => p.id === id);
    if (selected) {
      setFeedbackMsg(`Orador ativo alterado para ${selected.name}!`);
      setTimeout(() => setFeedbackMsg(''), 2500);
    }
  };

  // Timer run loop
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Stable tracking refs to avoid rapid Web Speech API restarts
  const timerRef = useRef(timer);
  const speakerProfilesRef = useRef(speakerProfiles);
  const sourceLangRef = useRef(sourceLang);
  const targetLangRef = useRef(targetLang);
  // A config no formato que `vocabWord.ts` consome. Espelhada em ref porque os caminhos que resolvem
  // idioma de palavra são assíncronos (clique → detecção → MT) e não podem ler estado obsoleto.
  const langConfigRef = useRef<LangConfig>({ mine: sourceLang, studying: targetLang });

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  useEffect(() => {
    speakerProfilesRef.current = speakerProfiles;
  }, [speakerProfiles]);

  useEffect(() => {
    sourceLangRef.current = sourceLang;
  }, [sourceLang]);

  useEffect(() => {
    targetLangRef.current = targetLang;
  }, [targetLang]);

  useEffect(() => {
    langConfigRef.current = { mine: sourceLang, studying: targetLang };
  }, [sourceLang, targetLang]);

  useEffect(() => {
    inputDeviceIdRef.current = inputDeviceId;
  }, [inputDeviceId]);

  useEffect(() => { systemSourceRef.current = systemSource; }, [systemSource]);
  useEffect(() => { loopbackDeviceIdRef.current = loopbackDeviceId; }, [loopbackDeviceId]);

  // Enumera os dispositivos de áudio REAIS e reage a plugar/desplugar. Os rótulos só
  // aparecem depois que a permissão de mic é concedida — a UI trata o estado sem rótulo.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { inputs, outputs, hasLabels } = await listDevices();
      if (cancelled) return;
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setDeviceLabelsReady(hasLabels);
    };
    void refresh();
    const off = onDeviceChange(() => { void refresh(); });
    return () => { cancelled = true; off(); };
  }, []);

  // Carrega as preferências persistidas (idiomas, dispositivos, velocidade do TTS) do
  // blob `settings.ui` na montagem. Antes essas prefs eram efêmeras (perdiam ao recarregar).
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    (async () => {
      // Idiomas: SEMPRE pelo leitor único. Reidratar `ui.captureSourceLang`/`ui.captureTargetLang` na
      // mão aqui era o que permitia a cada tela interpretar o par com um significado diferente.
      const cfg = await fetchLangConfig();
      // Mesma regra do cenário: se a pessoa já escolheu um idioma enquanto isto carregava,
      // a escolha dela vence (senão o seletor "voltava sozinho" segundos depois).
      if (!langTouchedRef.current) {
        setSourceLang(cfg.mine);
        setTargetLang(cfg.studying);
      }

      const s = await fetchSettings();
      let ui: Record<string, any>;
      try { ui = s?.ui ? JSON.parse(s.ui) : {}; } catch { ui = {}; }
      if (ui.audioInputId) setInputDeviceId(ui.audioInputId);
      if (ui.audioOutputId) setOutputDeviceId(ui.audioOutputId);
      if (ui.systemSource === 'display' || ui.systemSource === 'loopback' || ui.systemSource === 'server') setSystemSource(ui.systemSource);
      if (ui.loopbackDeviceId) setLoopbackDeviceId(ui.loopbackDeviceId);
      if (typeof ui.ttsSpeed === 'number') setTtsSpeed(ui.ttsSpeed);
      if (ui.micEngine === 'browser' || ui.micEngine === 'whisper') setMicEngine(ui.micEngine);
      if (typeof ui.perfMode === 'boolean') setPerfMode(ui.perfMode);
      if (!langTouchedRef.current && typeof ui.autoDetectLang === 'boolean') setAutoDetectLang(ui.autoDetectLang);
      if (!langTouchedRef.current && typeof ui.autoDetectMyLang === 'boolean') setAutoDetectMyLang(ui.autoDetectMyLang);
      if (typeof ui.speakerAutoId === 'boolean') setSpeakerAutoId(ui.speakerAutoId);
      // `fromUser = false`: se a pessoa já clicou num cenário enquanto isto carregava, a escolha
      // dela vence (ver `scenarioTouchedRef`).
      if (ui.captureScenario === 'media' || ui.captureScenario === 'conversation' || ui.captureScenario === 'mic') applyScenario(ui.captureScenario, false);
      /* Esta linha estava DUPLICADA, caractere por caractere. Sem efeito visível — atribuir o mesmo
         valor duas vezes é idempotente — mas quem lesse depois ficaria procurando a diferença. */
      if (ui.sttQuality === 'auto' || ui.sttQuality === 'fast' || ui.sttQuality === 'accurate' || ui.sttQuality === 'cloud') { setSttQuality(ui.sttQuality); setSttQualityMirror(ui.sttQuality); }
      settingsLoadedRef.current = true;
    })();
    /* Deps VAZIAS de propósito: isto carrega os ajustes salvos UMA vez, na montagem. `applyScenario`
       é recriada a cada render; incluí-la faria a carga inicial rodar de novo e sobrescrever, com o
       valor gravado, o cenário que a pessoa acabou de escolher na tela — exatamente o que o
       `fromUser = false` acima existe para evitar. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outra tela mudou o idioma (Configurações, por exemplo)? Reflete aqui — a config é uma só.
  useEffect(() => {
    return onLangConfigChange(() => {
      void (async () => {
        const cfg = await fetchLangConfig();
        setSourceLang(prev => (prev === cfg.mine ? prev : cfg.mine));
        setTargetLang(prev => (prev === cfg.studying ? prev : cfg.studying));
      })();
    });
  }, []);

  // Persiste os IDIOMAS pelo escritor único (que mantém `settings.targetLanguage` e o blob `ui` em
  // sincronia — é o que evita a próxima geração do bug de idioma trocado entre telas).
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    const t = setTimeout(() => {
      void saveLangConfig({ mine: sourceLang, studying: targetLang });
    }, 500);
    return () => clearTimeout(t);
  }, [sourceLang, targetLang]);

  // Persiste as demais prefs (debounce 500ms; serializado por patchUiSettings ser read-modify-write).
  // Só depois do load inicial (para não sobrescrever o que veio do servidor com os defaults).
  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    const t = setTimeout(() => {
      void patchUiSettings({
        audioInputId: inputDeviceId,
        audioOutputId: outputDeviceId,
        ttsSpeed,
        micEngine,
        systemSource,
        loopbackDeviceId,
        perfMode,
        autoDetectLang,
        autoDetectMyLang,
        captureScenario,
        speakerAutoId,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [inputDeviceId, outputDeviceId, ttsSpeed, micEngine, systemSource, loopbackDeviceId, perfMode, autoDetectLang, autoDetectMyLang, captureScenario, speakerAutoId]);

  // Amostrador do waveform: enquanto grava, desloca o histórico a ~20fps lendo o peak-hold das
  // fontes (com decaimento suave). Fora de gravação, zera. Barato: um setInterval + array de 48.
  useEffect(() => {
    if (!isRecording) { setLevels(new Array(48).fill(0)); currentLevelRef.current = 0; return; }
    const iv = setInterval(() => {
      const v = currentLevelRef.current;
      currentLevelRef.current = v * 0.55; // decai para o pico "cair" entre amostras
      setLevels(prev => [...prev.slice(1), v]);
    }, 50);
    return () => clearInterval(iv);
  }, [isRecording]);

  // Sessões de captura (getDisplayMedia/getUserMedia + VAD); null quando não ativas.
  const systemCaptureRef = useRef<AudioCapture | null>(null);
  const micCaptureRef = useRef<AudioCapture | null>(null);
  // Sessão de reconhecimento do MICROFONE via Web Speech (quando micEngine === 'browser').
  const webSpeechRef = useRef<SttSession | null>(null);
  const webSpeechPartialIdRef = useRef<string | null>(null);
  // Espelho do dispositivo de entrada escolhido (lido no momento de abrir o mic).
  const inputDeviceIdRef = useRef('');
  // Espelhos da fonte de sistema e do device de loopback (lidos ao abrir a captura de sistema).
  const systemSourceRef = useRef<'display' | 'loopback' | 'server'>('display');
  const loopbackDeviceIdRef = useRef('');
  // Mapa seq→id do segmento do sistema. Cada enunciado tem um `seq` monotônico (do VAD);
  // isso garante que parciais e final atualizem SEMPRE o balão certo e na ordem certa,
  // mesmo que os decodes assíncronos do Whisper resolvam fora de ordem.
  const seqToSegmentRef = useRef<Map<number, string>>(new Map());
  // Último texto parcial traduzido por seq — evita re-traduzir o mesmo parcial repetido.
  const lastPartialTextRef = useRef<Map<number, string>>(new Map());
  // O modelo Whisper terminou de carregar? (false enquanto baixa). Enquanto false, os trechos
  // do sistema são DESCARTADOS — só a barra de progresso aparece; a transcrição ao vivo começa
  // quando o modelo fica pronto (evita balões vazios e uma fila gigante de áudio já velho).
  const modelReadyRef = useRef(false);
  /** Guard da preparação de modelo: a captura dupla chama `prepareModels` 2× (A-P3-14). */
  const prepareEmVooRef = useRef(false);

  // Relógio da sessão (epoch ms do START). tStart/tEnd de cada enunciado são medidos
  // RELATIVOS a isso → habilita WPM real e sincronização do player (o áudio grava a
  // partir do mesmo instante). 0 quando não há gravação em curso.
  const sessionStartMsRef = useRef<number>(0);
  const nowRel = () => (sessionStartMsRef.current ? Math.max(0, Date.now() - sessionStartMsRef.current) : 0);

  // ── Ancoragem do relógio ao recorder (alinha LEGENDA × ÁUDIO na página da sessão) ──
  // O relógio zera no CLIQUE em START, mas o MediaRecorder do áudio salvo só começa depois (após a
  // caixa de compartilhamento do getDisplayMedia). Esse GAP variável fazia a legenda descolar. Aqui
  // re-ancoramos sessionStartMsRef ao t=0 REAL do recorder quando a captura fica ativa.
  const shouldAnchorClockRef = useRef<boolean>(false); // só em sessão NOVA (retomada mantém o recuo)
  const micStartedAtRef = useRef<number>(0);           // t=0 do recorder do mic (fallback se o sistema falhar)
  /**
   * Re-zera o relógio da sessão para o t=0 do recorder que produz o áudio salvo. O áudio salvo
   * prefere o do SISTEMA (recordedAudioRef = sysBlob ?? micBlob), então o mic só ancora quando o
   * sistema NÃO é fonte (mic-only) ou quando o sistema FALHOU ('mic-fallback'). Primeira âncora vence.
   */
  const anchorSessionClock = (startedAtMs: number, source: 'system' | 'mic' | 'mic-fallback') => {
    if (!shouldAnchorClockRef.current || !startedAtMs) return;
    if (source === 'mic' && systemEnabled) return; // o sistema é a fonte do áudio salvo → ele ancora
    sessionStartMsRef.current = startedAtMs;
    shouldAnchorClockRef.current = false;
    clog('⏱ relógio ancorado ao início do recorder (', source, ') — legenda alinhada ao áudio salvo');
  };

  // Tradução DESACOPLADA, deduplicada e com cache — nunca bloqueia a exibição do texto.
  // Compartilhada pelas DUAS fontes (mic Web Speech + sistema Whisper). Espelha o LRU do desktop.
  // Aviso único por sessão quando a tradução degrada (nunca silencioso).
  const mtFailNotifiedRef = useRef(false);

  /** Avisa UMA vez por sessão que o destino da tradução foi redirecionado (ver abaixo). */
  const altTargetNotifiedRef = useRef(false);

  /**
   * Um balão recebe várias traduções (uma por parcial + a do final) e todas escrevem no MESMO
   * lugar. Sem ordenação, a resposta atrasada de um parcial sobrescrevia a tradução do final —
   * o texto pela metade ficava na tela porque nada mais escreve ali depois.
   */
  const ordemMtRef = useRef(new OrdemDasTraducoes());

  const translateSegment = (
    segId: string,
    text: string,
    srcCode?: string,
    tgtCode?: string,
    opts?: { descartarSeOcupado?: boolean },
  ) => {
    /* PARCIAL NÃO ENFILEIRA TRADUÇÃO. Cada refinamento do parcial gastava uma chamada de MT
       inteira que era descartada segundos depois pelo refinamento seguinte. Com uma tradução já
       em voo para este balão, o parcial seguinte simplesmente não é pedido — o decode final
       sempre traduz, então nenhum balão fica sem legenda por causa disto. */
    if (opts?.descartarSeOcupado && ordemMtRef.current.ocupado(segId)) return;
    const selo = ordemMtRef.current.abrir(segId);

    const src = srcCode ?? sourceLangRef.current.split('-')[0];
    let tgt = tgtCode ?? targetLangRef.current.split('-')[0];

    /**
     * NUNCA TRADUZIR PARA O PRÓPRIO IDIOMA (bug relatado). O áudio do sistema é sempre vertido
     * para "o seu idioma" — mas quem assiste um vídeo EM português tendo o português como idioma
     * nativo recebia origem = destino, e a "tradução" saía idêntica ao original: a tela parecia
     * quebrada, e o caso é justamente o de quem consome conteúdo na própria língua para praticar
     * a outra ("assisto em PT e quero ver em inglês").
     *
     * Regra: se origem e destino coincidem, o destino passa a ser o OUTRO idioma do par. Se os
     * dois lados do par forem o mesmo idioma, não há para onde traduzir — o balão fica só com o
     * original (honesto), em vez de repetir a frase como se fosse tradução.
     */
    const mine = baseLang(sourceLangRef.current);
    const studying = baseLang(targetLangRef.current);

    /* A DECISÃO VEM DO PERFIL, não de uma dedução refeita a cada fala.
       O idioma OBSERVADO na sessão (já convergido, resistente a detecção isolada errada) tem
       precedência sobre o desta fala: numa conversa em português, um "Thank you." solto não
       deve mudar o destino da tradução do trecho inteiro. Sem observação ainda, cai no idioma
       desta fala — que é o melhor palpite disponível no começo. */
    const observado = idiomaObservadoRef.current || baseLang(src);
    const decisao = destinoDaTraducao(observado, mine, studying);

    if (decisao.motivo === 'sem-destino') {
      // Os dois lados do par são a mesma língua: não há para onde traduzir. Limpa o "…" para o
      // balão não ficar preso esperando para sempre — e não repete a frase fingindo tradução.
      if (ordemMtRef.current.encerrar(segId, selo)) {
        setSpeechSegments(prev => prev.map(seg => seg.id === segId ? { ...seg, translatedText: '' } : seg));
      }
      return;
    }
    if (decisao.motivo === 'redirecionado' && decisao.destino !== baseLang(tgt)) {
      tgt = decisao.destino;
      /* AVISO ÚNICO, e agora ele é honesto sobre a NATUREZA da decisão: antes dizia "o áudio já
         está em X" a partir de UMA fala, e repetia a dedução 40 vezes no log. Agora só fala
         quando o perfil convergiu, e diz que foi detecção da sessão inteira. */
      if (!altTargetNotifiedRef.current && perfilIdiomaRef.current.observado()) {
        altTargetNotifiedRef.current = true;
        const conf = Math.round(perfilIdiomaRef.current.ler().confianca * 100);
        clog('perfil de idioma convergiu:', observado, `(${conf}% das falas)`, '→ traduzindo para', decisao.destino);
        setFeedbackMsg(
          `Detectei que o áudio está em ${langLabel(observado)} (${conf}% das falas) — traduzindo para ${langLabel(decisao.destino)}.`,
        );
        setTimeout(() => setFeedbackMsg(''), 7000);
      }
    }

    /* ORIGEM VAZIA DESQUALIFICA TRÊS DOS QUATRO TRADUTORES.
       `chrome-translator`, `mymemory` e `opus-mt-local` recusam `src` nulo no `supports()` —
       precisam do par explícito. Sobra o `server-llm-mt`, e quando ele está fora o gateway
       responde `NoRouteError`. Era a causa dos erros intermitentes no log: com detecção
       automática, `src` chegava vazio sempre que a detecção daquela fala falhava.

       O perfil da sessão preenche a lacuna: já sabemos, com confiança medida, o que está sendo
       falado. Usar isso como origem devolve os três tradutores à cascata — e é informação
       melhor que o palpite de uma fala isolada, não pior. */
    const origem = src || idiomaObservadoRef.current || '';
    const cacheKey = `${origem}|${tgt}|${text}`;
    const applyTranslation = (translated: string, aproximada = false) => {
      // "≈" na frente: o último recurso público (MyMemory) acerta frases comuns e erra gíria e
      // contexto. Dizer que é aproximada é o que separa "tradução ruim" de "app mentindo".
      const capitalized = (aproximada ? '≈ ' : '') + translated.charAt(0).toUpperCase() + translated.slice(1);
      // As palavras de vocabulário já foram extraídas da fala real no commit do
      // enunciado (wordsFromText); a tradução só atualiza o texto traduzido.
      setSpeechSegments(prev => prev.map(seg => seg.id === segId ? {
        ...seg,
        translatedText: capitalized,
      } : seg));
    };
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      if (ordemMtRef.current.encerrar(segId, selo)) applyTranslation(cached);
      return;
    }
    const mtT0 = performance.now();

    // Rede de segurança: a tradução NUNCA pode deixar o balão preso em "…". Se vier vazia, der
    // erro, OU travar (timeout) — degrada para o texto ORIGINAL entre parênteses (honesto e útil
    // offline: você ao menos lê o que foi dito). Só degrada se ainda estiver em "…" (não sobrescreve
    // uma tradução já mostrada). `settled` evita corrida entre resposta tardia e o timeout.
    let settled = false;
    const degrade = () => {
      setSpeechSegments(prev => prev.map(seg =>
        (seg.id === segId && seg.translatedText === '…') ? { ...seg, translatedText: `(${text})` } : seg));
      // Degradação NUNCA mais é silenciosa (achado da auditoria): avisa UMA vez por sessão
      // que a tradução caiu e o que o usuário está vendo é o texto original.
      if (!mtFailNotifiedRef.current) {
        mtFailNotifiedRef.current = true;
        setFeedbackMsg('Tradução indisponível agora (motores locais e web falharam) — mostrando o texto original entre parênteses.');
        setTimeout(() => setFeedbackMsg(''), 8000);
      }
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (ordemMtRef.current.encerrar(segId, selo)) degrade();
    }, 8000);

    /* `origem` já caiu para o idioma OBSERVADO da sessão quando esta fala não foi detectada —
       ver o bloco acima. Só chega `null` aqui quando nem o perfil convergiu ainda, e aí o
       Tradutor IA do servidor detecta a origem sozinho, como antes. */
    gateway.mt.translate(text, origem || null, tgt)
      .then(({ text: translated, engine, approximate }) => {
        if (settled) return;               // timeout já degradou → ignora resposta tardia
        settled = true; clearTimeout(timeout);
        capMetrics.mt(Math.round(performance.now() - mtT0), engine || 'mt');
        // `atual` = este pedido ainda é o mais recente do balão. Um resultado ATRASADO não escreve
        // na tela (sobrescreveria a tradução do final pelo texto pela metade), mas ainda é uma
        // tradução válida deste texto: entra no cache, e o próximo pedido igual chega instantâneo.
        const atual = ordemMtRef.current.encerrar(segId, selo);
        if (!translated) { if (atual) degrade(); return; }   // vazio → degrada (antes: ficava em "…")
        translationCacheRef.current.set(cacheKey, translated);
        if (translationCacheRef.current.size > 300) {
          const firstKey = translationCacheRef.current.keys().next().value;
          if (firstKey !== undefined) translationCacheRef.current.delete(firstKey);
        }
        if (atual) applyTranslation(translated, approximate === true);
      })
      .catch(err => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        console.warn("Live translation error:", err);
        if (ordemMtRef.current.encerrar(segId, selo)) degrade();
      });
  };

  // Handlers de captura por FONTE (sistema/mic). Um único pipeline VAD→Whisper serve as duas
  // fontes; muda a direção da tradução, o prefixo do id e o falante conforme a fonte.
  // Direção — SISTEMA: conteúdo estrangeiro no idioma-ALVO → transcreve com hint do ALVO e
  // traduz PARA o idioma-FONTE (você lê no seu idioma). MIC: sua voz no idioma-FONTE →
  // transcreve no FONTE e traduz PARA o ALVO (você lê como se diz). São inversas.
  // O `seq` do VAD começa em 1 em CADA fonte; deslocamos o do mic (+MIC_SEQ_OFFSET) para que
  // as chaves (seqToSegment/capMetrics) nunca colidam quando as duas fontes rodam juntas.
  const MIC_SEQ_OFFSET = 1_000_000;
  const makeCaptureHandlers = (source: CapSource) => {
    const isSys = source === 'system';
    const idPrefix = isSys ? 'sys' : 'mic';
    const offset = isSys ? 0 : MIC_SEQ_OFFSET;
    // MIC = você → orador ativo (se houver) ou 'user'. SISTEMA = 'system' (eles).
    const speakerIdFor = (): string => isSys
      ? 'system'
      : (speakerProfilesRef.current.find(p => p.isActive && p.id !== 'system')?.id ?? 'user');
    const langs = () => {
      // MULTI-IDIOMA: hint vazio → Whisper detecta o idioma da fala; origem vazia → o
      // Tradutor IA do servidor detecta e traduz para o alvo. Sistema traduz para o idioma
      // do usuário; mic traduz para o idioma de estudo (mesmo alvo do modo fixo).
      if (isSys && autoDetectLangRef.current) {
        /* A DICA DE IDIOMA PASSA A VIR DO PERFIL — e isto conserta um defeito com sintoma feio.
           Sem dica, o Whisper LOCAL (fallback, `whisper-base`) não recebe idioma fixo. O
           comentário no worker já avisava por quê: "idioma FIXO pula a auto-detecção e evita
           traduzir sozinho". Sem ele, o modelo pequeno TRADUZIA para inglês em vez de
           transcrever — num vídeo em espanhol o log alternava entre `groq-whisper` devolvendo
           "le pillamos desprevenido por detrás" e `whisper-local` devolvendo "Let's continue.
           Now we can do it". Texto inglês entrava no detector, o perfil via inglês, e o rótulo
           mentia.

           Também é latência de verdade: sem dica, o modelo gasta uma passada só para descobrir
           o idioma, a cada fala. Com o perfil convergido, essa passada some.

           As primeiras falas seguem sem dica (o perfil ainda ouve) — é o único jeito de
           descobrir o idioma sem pedir ao usuário. A partir da convergência, fixa. */
        return { hint: idiomaObservadoRef.current || '', from: '', to: sourceLangRef.current.split('-')[0] };
      }
      if (!isSys && autoDetectMyLangRef.current) {
        // Sua fala vai para o IDIOMA DOMINANTE da conversa (o que os outros de fato falam,
        // detectado ao vivo) — num lobby misto não existe "o idioma deles" fixo. Sem falas
        // deles ainda, cai no idioma de estudo configurado.
        const convoLang = captureScenarioRef.current === 'conversation' ? dominantLangRef.current.dominant() : '';
        return { hint: '', from: '', to: convoLang || targetLangRef.current.split('-')[0] };
      }
      return isSys
        ? { hint: targetLangRef.current.split('-')[0], from: targetLangRef.current.split('-')[0], to: sourceLangRef.current.split('-')[0] }
        : { hint: sourceLangRef.current.split('-')[0], from: sourceLangRef.current.split('-')[0], to: targetLangRef.current.split('-')[0] };
    };

    // Início de fala (seq monotônico): cria o balão. Sem "ouvindo…" — o texto real flui no 1º parcial.
    const onSpeechStart = (rawSeq: number) => {
      const seq = rawSeq + offset;
      // ANTI-ECO: se o próprio app está falando (TTS de pronúncia/frase), o que a captura
      // "ouviu" é o NOSSO áudio voltando pelos alto-falantes — descarta o enunciado inteiro
      // (senão cada clique em palavra virava uma fala nova transcrita e traduzida).
      if (isTtsActive()) {
        suppressedSeqsRef.current.add(seq);
        clog('anti-eco: fala', seq, source, 'iniciada durante TTS — suprimida');
        return;
      }
      if (!modelReadyRef.current) return; // modelo ainda baixando → não cria balão vazio
      const uttId = `${idPrefix}-${seq}`;
      seqToSegmentRef.current.set(seq, uttId);
      capMetrics.start(seq, source);
      setSpeechSegments(prev => prev.some(s => s.id === uttId) ? prev : [...prev, {
        id: uttId, speakerId: speakerIdFor(), source, timestamp: formatTime(timerRef.current),
        originalText: '', translatedText: '…', words: [], isPartial: true, tStartMs: nowRel(),
      }]);
    };

    // Ruído curto (misfire): remove o balão provisório para não deixar bloco órfão.
    const onMisfire = (rawSeq: number) => {
      const seq = rawSeq + offset;
      suppressedSeqsRef.current.delete(seq); // anti-eco: não deixa entrada órfã no set
      const id = seqToSegmentRef.current.get(seq);
      seqToSegmentRef.current.delete(seq);
      lastPartialTextRef.current.delete(seq);
      capMetrics.drop(seq);
      if (id) setSpeechSegments(prev => prev.filter(s => s.id !== id));
    };

    // PARCIAL: transcreve o buffer-até-agora SÓ SE o Whisper estiver ocioso (idle-gating →
    // nunca enfileira → sem backlog). O texto aparece e refina em tempo real; a tradução acompanha.
    const onPartialAudio = (pcm: Float32Array, sr: number, rawSeq: number) => {
      if (perfModeRef.current) return; // modo desempenho: sem decodes parciais (só o final)
      const seq = rawSeq + offset;
      if (suppressedSeqsRef.current.has(seq)) return; // anti-eco: enunciado é o nosso TTS
      const uttId = seqToSegmentRef.current.get(seq);
      if (!uttId) return; // enunciado já finalizado/descartado
      const { hint, from, to } = langs();
      /* ENQUANTO NÃO SABEMOS O IDIOMA, O PARCIAL ATRAPALHA MAIS DO QUE AJUDA.
         Parcial roda SEMPRE no Whisper local, e o Whisper local sem dica de idioma às vezes
         traduz para inglês em vez de transcrever. Resultado visível: num vídeo em espanhol, o
         balão piscava um texto em inglês antes de o final trazer o espanhol.

         Pior, ele cobra por isso: o decode do parcial ocupa o worker, e o final da fala seguinte
         espera — justo nas primeiras falas, que são as que fazem o perfil convergir. Pular o
         parcial aqui ACELERA a convergência e apaga o flash em inglês; assim que o perfil conclui,
         `hint` deixa de ser vazio e os parciais voltam pelo resto da sessão.

         DECLARADO: isto cobre o áudio do SISTEMA. Na sua própria voz em modo automático não há
         perfil sobre o qual convergir, então lá o parcial segue como antes. */
      if (isSys && !from && !hint) return;
      gateway.stt.transcribePartial(pcm, sr, { languageHint: hint })
        .then(res => {
          if (!res) { capMetrics.saturated(seq); return; } // worker ocupado → parcial descartado
          if (!seqToSegmentRef.current.has(seq)) return;   // já finalizou → o final é autoritativo
          const clean = (res.text ?? '').trim();
          if (!clean) return;
          capMetrics.partial(seq);
          setSpeechSegments(prev => prev.map(s =>
            (s.id === uttId && s.isPartial) ? { ...s, originalText: clean } : s));
          if (lastPartialTextRef.current.get(seq) !== clean) {
            lastPartialTextRef.current.set(seq, clean);
            // `descartarSeOcupado`: já há tradução em voo para este balão → não pede outra. Cada
            // refinamento do parcial custava uma chamada de MT que o refinamento seguinte jogava
            // fora; o final sempre traduz, então nenhuma legenda deixa de existir por causa disto.
            translateSegment(uttId, clean, from, to, { descartarSeOcupado: true });
          }
        })
        .catch(() => { capMetrics.saturated(seq); });
    };

    // Fim da fala → decode FINAL (autoritativo) → commit do texto + tradução.
    const onUtterance = (pcm: Float32Array, sr: number, rawSeq: number) => {
      // anti-eco: o enunciado inteiro era o NOSSO TTS voltando — descarta e limpa.
      if (suppressedSeqsRef.current.has(rawSeq + offset)) {
        suppressedSeqsRef.current.delete(rawSeq + offset);
        clog('anti-eco: enunciado', rawSeq + offset, source, 'descartado (era o TTS do app)');
        return;
      }
      if (!modelReadyRef.current) {
        // NÃO descarta: guarda o enunciado e transcreve assim que o modelo ficar pronto.
        // Limite de ~24 trechos (~2 min de fala) para não crescer sem fim se a carga travar.
        if (pendingUtterancesRef.current.length < 24) {
          pendingUtterancesRef.current.push({ pcm: pcm.slice(), sr, rawSeq, source });
          clog('modelo ainda carregando — trecho', rawSeq, source, 'GUARDADO p/ transcrever depois (', pendingUtterancesRef.current.length, 'na fila)');
          if (pendingUtterancesRef.current.length === 1) {
            setFeedbackMsg('O modelo ainda está carregando — sua fala está sendo GUARDADA e será transcrita assim que ele ficar pronto.');
            setTimeout(() => setFeedbackMsg(''), 5000);
          }
        } else {
          clog('modelo ainda carregando — fila cheia, trecho', rawSeq, source, 'descartado');
        }
        return;
      }
      const seq = rawSeq + offset;
      const uttId = seqToSegmentRef.current.get(seq) ?? `${idPrefix}-${seq}`;
      capMetrics.speechEnd(seq);
      clog('enunciado', source, '(seq', seq, ') →', pcm.length, 'amostras @', sr, 'Hz — decode final');
      setSpeechSegments(prev => prev.some(s => s.id === uttId) ? prev : [...prev, {
        id: uttId, speakerId: speakerIdFor(), source, timestamp: formatTime(timerRef.current),
        originalText: '', translatedText: '…', words: [], isPartial: true, tStartMs: nowRel(),
      }]);

      // IDENTIFICAÇÃO DE VOZ (paralela ao decode; nunca atrasa a legenda): quem falou?
      // Só nas vozes do SISTEMA em Conversa — a sua voz já é "Você" por definição.
      if (isSys && captureScenarioRef.current === 'conversation' && speakerAutoIdRef.current) {
        void embedUtterance(pcm, sr).then((emb) => {
          if (!emb) {
            // Curto demais p/ identificar → herda a última voz (é quase sempre a mesma pessoa
            // terminando a frase). Sem voz anterior, fica no genérico "Outros".
            const inherit = lastVoiceIdRef.current;
            if (inherit) setSpeechSegments(prev => prev.map(s => (s.id === uttId && s.speakerId === 'system') ? { ...s, speakerId: inherit } : s));
            return;
          }
          const { clusterId, isNew, provisional, promoted, uncertain, similarity, merged } = clustererRef.current.assign(emb);

          // VOZ PROVISÓRIA: ainda não é uma pessoa na tela. A fala fica com a voz anterior (ou no
          // genérico) e é GUARDADA sob este id; se uma segunda fala confirmar, ela é reetiquetada.
          // É o que impede um trecho ruidoso isolado de virar "Pessoa 5" para sempre.
          if (provisional) {
            clog('voz nova PROVISÓRIA', clusterId, '(sim', similarity.toFixed(2), ') — aguarda confirmação');
            const pendentes = provisionalUttsRef.current.get(clusterId) ?? [];
            pendentes.push(uttId);
            provisionalUttsRef.current.set(clusterId, pendentes);
            const heranca = lastVoiceIdRef.current;
            if (heranca) setSpeechSegments(prev => prev.map(s => (s.id === uttId && s.speakerId === 'system') ? { ...s, speakerId: heranca } : s));
            return;
          }

          const vid = ensureVoiceProfile(clusterId);
          lastVoiceIdRef.current = vid;
          if (isNew) clog('voz NOVA identificada → Pessoa', clusterId, '(sim', similarity.toFixed(2), ')');
          else if (uncertain) clog('voz em DÚVIDA (sim', similarity.toFixed(2), ') → atribuída a Pessoa', clusterId, 'sem alterar a referência');
          if (promoted) clog('voz provisória CONFIRMADA → Pessoa', promoted);

          // Falas guardadas enquanto a voz era provisória agora passam a ser dela.
          const guardadas = promoted ? (provisionalUttsRef.current.get(promoted) ?? []) : [];
          if (promoted) provisionalUttsRef.current.delete(promoted);

          setSpeechSegments(prev => {
            let next = prev.map(s => (s.id === uttId || guardadas.includes(s.id)) ? { ...s, speakerId: vid } : s);
            // FUSÃO: pessoas que se revelaram a mesma voz. Reetiqueta o que já está na tela —
            // é assim que os fantasmas do começo da conversa desaparecem sozinhos.
            for (const { from, into } of merged) {
              next = next.map(s => s.speakerId === `voice_${from}` ? { ...s, speakerId: `voice_${into}` } : s);
            }
            return next;
          });

          if (merged.length) {
            for (const { from, into } of merged) {
              clog('vozes fundidas: Pessoa', from, '→ Pessoa', into, '(eram a mesma pessoa)');
              if (lastVoiceIdRef.current === `voice_${from}`) lastVoiceIdRef.current = `voice_${into}`;
            }
            const mortos = new Set(merged.map(m => `voice_${m.from}`));
            setSpeakerProfiles(prev => prev.filter(p => !mortos.has(p.id)));
            setFeedbackMsg(`Vozes parecidas foram unidas — agora são ${clustererRef.current.count} pessoa(s).`);
            setTimeout(() => setFeedbackMsg(''), 4000);
          }
        });
      }

      const { hint, from, to } = langs();
      const t0 = performance.now();
      const audioMs = Math.round((pcm.length / sr) * 1000);
      const queueDepth = gateway.stt.pendingCount();
      gateway.stt.transcribePcm(pcm, sr, {
        languageHint: hint,
        // STREAMING: mostra os tokens do decode final crescendo no balão em tempo real.
        onUpdate: (streamed) => {
          const partial = (streamed ?? '').trim();
          if (!partial || !seqToSegmentRef.current.has(seq)) return;
          setSpeechSegments(prev => prev.map(s =>
            (s.id === uttId && s.isPartial) ? { ...s, originalText: partial } : s));
        },
      })
        .then(({ text, engine, language }) => {
          const clean = (text ?? '').trim();
          const decodeMs = Math.round(performance.now() - t0);
          clog('Whisper final', source, '(seq', seq, ',', decodeMs, 'ms,', engine ?? '?', ') →', clean ? JSON.stringify(clean).slice(0, 80) : '(vazio)');
          seqToSegmentRef.current.delete(seq);
          lastPartialTextRef.current.delete(seq);
          if (!clean) {
            /* Final vazio: o decode COMPLETO do trecho não achou fala. Antes, se um parcial já tinha
               mostrado texto, ele era COMMITADO "para evitar flicker" — e era assim que uma frase
               inventada sobre ruído ficava na tela para sempre. O final é a leitura melhor; se ele
               diz vazio, o parcial era alucinação e sai. */
            capMetrics.final(seq, { decodeMs, queueDepth, text: '', audioMs });
            clog('Whisper final vazio → parcial descartado (seq', seq, ')');
            setSpeechSegments(prev => prev.filter(s => s.id !== uttId));
            return;
          }
          /* O IDIOMA DEIXOU DE FICAR NA FRENTE DO TEXTO.
             Antes, `await detectLanguage(clean)` acontecia ANTES de commitar a legenda e de pedir
             a tradução: toda fala esperava a detecção, e a PRIMEIRA esperava também a criação do
             detector on-device do navegador. Agora o texto vai para a tela imediatamente.

             E há uma fonte melhor que o detector de texto: o `language` que o motor devolve. O
             Whisper de nuvem identifica o idioma dentro do decode, a partir do ÁUDIO — não do
             texto. Fala curta ("Vale, vamos") não dá sinal para palavras-função, e era exatamente
             onde a identificação falhava. Medido pelo áudio, dá. */
          const idiomaDoMotor = baseLang(language || '');
          capMetrics.final(seq, { decodeMs, queueDepth, text: clean, audioMs });
          setSpeechSegments(prev => prev.map(s => s.id === uttId
            ? { ...s, originalText: clean, translatedText: '…', words: wordsFromText(clean), isPartial: false, tEndMs: nowRel(), lang: (from || idiomaDoMotor) || undefined, engine }
            : s));

          /** Alimenta o perfil da sessão e devolve o idioma desta fala ('' = não descobrimos). */
          const observarIdioma = async (): Promise<string> => {
            // Idioma medido pelo motor dispensa o detector de texto — é medição, não palpite.
            let detectado = idiomaDoMotor;
            if (!detectado) {
              try { detectado = baseLang((await detectLanguage(clean))?.lang || ''); } catch { /* '' = desconhecido */ }
            }
            if (!isSys || !detectado) return detectado;
            // Alimenta o "idioma dominante da conversa" (destino da SUA fala no multi-idioma).
            dominantLangRef.current.push(detectado);
            // E o PERFIL ADAPTATIVO, que é quem transforma detecções soltas em conclusão: ele
            // resiste ao tropeço isolado (histerese) e é lido pela interface e pela tradução.
            const antes = perfilIdiomaRef.current.observado();
            /* Transcrição do motor LOCAL sem dica de idioma vale MENOS: é justamente a
               combinação em que o `whisper-base` traduz para inglês em vez de transcrever, e o
               texto resultante envenenaria o perfil com "en". Não descartamos (pode ser inglês de
               verdade), mas não deixamos decidir sozinha. Idioma vindo do motor nunca é suspeito. */
            const suspeita = !idiomaDoMotor && engine === 'whisper-local' && !hint;
            perfilIdiomaRef.current.observar(detectado, suspeita ? 0.5 : 1);
            const leitura = perfilIdiomaRef.current.ler();
            /* O ESTADO DO PERFIL VAI PARA O LOG SEMPRE, não só quando muda o destino da tradução.
               Antes ele só aparecia no caso "redirecionado" — num vídeo em espanhol com usuário em
               português não há redirecionamento, então o perfil trabalhava em silêncio absoluto. */
            if (leitura.idioma !== antes) {
              clog('perfil de idioma:', antes || '(ouvindo)', '→', leitura.idioma,
                `(${Math.round(leitura.confianca * 100)}% de ${leitura.amostras} falas)`);
            }
            if (leitura.estado === 'convergido' && leitura.idioma !== idiomaObservadoRef.current) {
              setIdiomaObservado(leitura.idioma);
            }
            return detectado;
          };

          if (from) {
            // Idioma FIXO: não há o que observar nem por que esperar.
            translateSegment(uttId, clean, from, to);
            return;
          }
          /* A detecção só volta a SEGURAR a tradução no caso frio em que ela é a única fonte de
             origem — nem o motor informou, nem o perfil convergiu. Sem origem, três dos quatro
             tradutores se recusam a atuar (`supports()` exige o par), e sobra só o LLM do
             servidor: esperar alguns milissegundos ali compra a cascata inteira. Fora desse caso,
             a tradução parte na hora e a observação corre por fora. */
          const origemConhecida = idiomaDoMotor || idiomaObservadoRef.current;
          if (origemConhecida) {
            translateSegment(uttId, clean, origemConhecida, to);
            void observarIdioma().then((d) => {
              if (d && d !== idiomaDoMotor) {
                setSpeechSegments(prev => prev.map(s => s.id === uttId ? { ...s, lang: d } : s));
              }
            });
            return;
          }
          void observarIdioma().then((d) => {
            if (d) setSpeechSegments(prev => prev.map(s => s.id === uttId ? { ...s, lang: d } : s));
            translateSegment(uttId, clean, d, to);
          });
        })
        .catch(err => {
          clog('Whisper final', source, '(seq', seq, ') ERRO:', String(err));
          seqToSegmentRef.current.delete(seq);
          lastPartialTextRef.current.delete(seq);
          capMetrics.final(seq, { queueDepth });
          setSpeechSegments(prev => prev.map(s => s.id === uttId
            ? { ...s, originalText: s.originalText || '(falha na transcrição)', translatedText: s.originalText ? s.translatedText : `(${String(err).slice(0, 80)})`, isPartial: false }
            : s));
        });
    };

    return { onSpeechStart, onMisfire, onPartialAudio, onUtterance };
  };

  const sysHandlers = makeCaptureHandlers('system');
  const micHandlers = makeCaptureHandlers('mic');

  // Enunciados que chegaram ENQUANTO o modelo carregava — transcritos no flush (nada se perde).
  const pendingUtterancesRef = useRef<Array<{ pcm: Float32Array; sr: number; rawSeq: number; source: CapSource }>>([]);
  // ANTI-ECO: seqs cuja fala começou enquanto o TTS do app tocava (é o nosso áudio voltando).
  const suppressedSeqsRef = useRef<Set<number>>(new Set());
  const flushPendingUtterances = () => {
    const pending = pendingUtterancesRef.current;
    if (!pending.length) return;
    pendingUtterancesRef.current = [];
    clog('modelo pronto — transcrevendo', pending.length, 'trecho(s) guardado(s) durante a carga');
    for (const u of pending) {
      (u.source === 'system' ? sysHandlers : micHandlers).onUtterance(u.pcm, u.sr, u.rawSeq);
    }
  };

  // Prepara os modelos locais (Whisper + opus-mt) com barras honestas, detecção de cache e retry.
  // Nuvem: NÃO baixa modelo nenhum (a transcrição/tradução vai pela chave do usuário).
  const prepareModels = async () => {
    if (getProviderMode() === 'cloud') { modelReadyRef.current = true; setModelPrep(null); return; }
    // A-P3-14: na captura dupla (mic + sistema) esta função era chamada DUAS vezes sem guard —
    // as duas resetavam `modelPrep` e sobrescreviam o `onProgress` do adapter, e a barra zerava
    // no meio. O guard é liberado no fim (sucesso ou erro) para o retry continuar possível.
    if (prepareEmVooRef.current) { clog('preparação já em andamento — ignorando chamada duplicada'); return; }
    prepareEmVooRef.current = true;
    try {
      await prepareModelsInterno();
    } finally {
      prepareEmVooRef.current = false;
    }
  };

  const prepareModelsInterno = async () => {
    const listenLang = targetLangRef.current.split('-')[0]; // você OUVE o idioma-alvo
    const myLang = sourceLangRef.current.split('-')[0];

    // ROTEADOR DE MODELO STT: escolhe o motor pela QUALIDADE exigida pelo idioma do
    // conteúdo (tiny erra feio fora do EN) — nuvem-primeiro quando disponível, senão o
    // melhor modelo local viável no dispositivo. O selo da UI reflete a rota.
    // Pelo funil: sem conta responde 501 → `cloudAvailable=false` → rota local, que é o correto.
    const cloudAvailable = EDICAO_LEVE ? false : await apiFetch('/api/ai/stt/available').then(r => r.ok).catch(() => false);
    const route = routeStt({
      contentLang: listenLang,
      autoDetect: autoDetectLangRef.current || autoDetectMyLangRef.current,
      quality: getSttQuality(),
      hasWebGpu: !!(navigator as any).gpu,
      cloudAvailable,
      profileId: getActiveProfile().id,
    });
    gateway.stt.setRoute({ preferCloud: route.preferCloud, localModel: route.localModel });
    setSttRouteLabel(route.label);
    clog('roteador STT:', route.label, '| modelo local:', route.localModel, '| nuvem primeiro:', route.preferCloud);

    const cached = await areModelsCached(expectedModelIds(listenLang, myLang, route.localModel));

    // NUVEM-PRIMEIRO: o motor principal é o Groq — a captura NÃO espera o download do
    // modelo local (que é só a RESERVA). Libera o pipeline já e baixa a reserva em
    // background; se a nuvem falhar num trecho, o adapter local aguarda o próprio load.
    if (route.preferCloud) {
      modelReadyRef.current = true;
      flushPendingUtterances();
      setModelPrep({ whisper: 0, mt: null, fromCache: cached, error: null, done: false });
      gateway.mt.preload(listenLang, myLang, (p, _l, bytes) =>
        setModelPrep((s) => (s ? { ...s, mt: p >= 1 ? 1 : p, mtBytes: bytes ?? s.mtBytes } : s)));
      gateway.stt.preloadModel((p, _l, bytes) =>
        setModelPrep((s) => (s ? { ...s, whisper: p >= 1 ? 1 : p, whisperBytes: bytes ?? s.whisperBytes } : s)))
        .then(() => {
          clog('reserva local pronta ✓ (nuvem segue como principal)');
          setModelPrep((s) => (s ? { ...s, whisper: 1, done: true } : s));
          setTimeout(() => setModelPrep((s) => (s?.done ? null : s)), 1800);
        })
        .catch((e) => {
          // A-P1-5: aqui só havia um clog(). Com a nuvem como principal, a falha do modelo local
          // é degradação — não é fatal — mas ficava INVISÍVEL: medido, 150 s com a rede caída e
          // o painel ainda dizendo "Baixando modelo", sem erro algum e sem botão de retry.
          // Agora o estado de erro do ModelPrepPanel é alcançável nesta rota também.
          clog('reserva local falhou (nuvem segue como principal):', String(e));
          const msg = String((e as Error)?.message ?? e);
          setModelPrep((s) => (s ? { ...s, error: msg } : s));
        });
      return;
    }

    modelReadyRef.current = false;
    setModelPrep({ whisper: 0, mt: null, fromCache: cached, error: null, done: false });
    try {
      // Tradutor local (best-effort; direção "ouço → meu idioma"). Emite barra própria.
      gateway.mt.preload(listenLang, myLang, (p, _l, bytes) =>
        setModelPrep((s) => (s ? { ...s, mt: p >= 1 ? 1 : p, mtBytes: bytes ?? s.mtBytes } : s)));
      // Whisper (obrigatório para transcrever o áudio do sistema/aba).
      await gateway.stt.preloadModel((p, _l, bytes) =>
        setModelPrep((s) => (s ? { ...s, whisper: p >= 1 ? 1 : p, whisperBytes: bytes ?? s.whisperBytes } : s)));
      clog('modelos locais prontos ✓');
      modelReadyRef.current = true;
      flushPendingUtterances();
      setModelPrep((s) => (s ? { ...s, whisper: 1, done: true } : s));
      setTimeout(() => setModelPrep((s) => (s?.done ? null : s)), 1800);
    } catch (e) {
      clog('preparação do modelo FALHOU:', String(e));
      const msg = String((e as Error)?.message ?? e);
      setModelPrep((s) => (s ? { ...s, error: msg } : { whisper: null, mt: null, fromCache: cached, error: msg, done: false }));
    }
  };

  // Inicia a captura do áudio do sistema/aba: pede a fonte (gesto do usuário) e prepara o modelo.
  const handleStartSystemCapture = async () => {
    // O estado de gravação (isRecording/timer) já foi ligado por handleStartRecording (captura dupla).
    const source = systemSourceRef.current;
    clog('sistema: preparar modelos locais + fonte:', source);
    void prepareModels();
    try {
      const cb = {
        onUtterance: sysHandlers.onUtterance,
        onSpeechStart: (seq: number) => { clog('VAD: início de fala (sistema, seq', seq, ')'); sysHandlers.onSpeechStart(seq); },
        onPartialAudio: sysHandlers.onPartialAudio,
        onMisfire: (seq: number) => sysHandlers.onMisfire(seq),
        onLevel: pushLevel,
        onStatus: (msg: string) => { clog('sistema:', msg); setFeedbackMsg(msg); setTimeout(() => setFeedbackMsg(''), 4000); },
        onError: (err: Error) => { clog('sistema ERRO assíncrono:', err.message); setFeedbackMsg('Erro na captura do sistema: ' + err.message); setTimeout(() => setFeedbackMsg(''), 6000); },
      };
      systemCaptureRef.current = source === 'server'
        ? await startServerLoopbackCapture(cb)
        : source === 'loopback'
          ? await (async () => {
              /* Sem dispositivo escolhido E sem nenhum candidato (Stereo Mix / VB-Cable) o getUserMedia
                 abriria o MICROFONE padrão — e a pessoa acharia que o "loopback" estava ligado enquanto
                 ouvia o próprio ambiente. Medido no teste do dono (2026-08-26): sem legenda nenhuma.
                 Melhor recusar com o caminho certo do que capturar a fonte errada em silêncio. */
              if (!loopbackDeviceIdRef.current) {
                const { inputs } = await listDevices();
                if (!filterLoopbackDevices(inputs).detected) {
                  throw new Error('Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) existe neste computador — sem ele, esta rota captaria o microfone. Use "Compartilhar aba/tela" (marque "compartilhar áudio") ou instale o VB-Audio Cable.');
                }
              }
              return startSystemLoopbackCapture(loopbackDeviceIdRef.current || undefined, cb);
            })()
          : await startSystemAudioCapture(cb);
      clog('captura do sistema ATIVA ✓');
      if (systemCaptureRef.current) anchorSessionClock(systemCaptureRef.current.startedAtMs, 'system');
      setFeedbackMsg(micEnabled
        ? 'Captura DUPLA ativa: microfone (você) + sistema/aba (outros). A transcrição do sistema aparece e refina em tempo real.'
        : 'Capturando áudio do sistema/aba. A transcrição aparece e refina em tempo real (Whisper local).');
      setTimeout(() => setFeedbackMsg(''), 5000);
    } catch (err) {
      clog('getDisplayMedia FALHOU:', (err as Error).message);
      setFeedbackMsg((err as Error).message);
      setTimeout(() => setFeedbackMsg(''), 7000);
      // mantém o painel se estava em erro de modelo; só limpa se não havia erro
      setModelPrep((s) => (s?.error ? s : null));
      // Se o sistema era a ÚNICA fonte, encerra a gravação (se o mic também estiver ligado, ele continua).
      if (!micEnabled) {
        setIsRecording(false);
        isRecordingRef.current = false;
      } else if (micStartedAtRef.current) {
        // Sistema falhou, mas o mic segue: o áudio salvo passa a ser o do mic → ancora nele.
        anchorSessionClock(micStartedAtRef.current, 'mic-fallback');
      }
    }
  };

  // Inicia a captura do MICROFONE (sua voz) — mesmo pipeline VAD+Whisper do sistema, no
  // dispositivo de entrada escolhido. Substitui a antiga Web Speech API (que não deixava
  // escolher o dispositivo nem funcionava offline).
  const handleStartMicCapture = async () => {
    clog('mic: preparar modelos locais + getUserMedia…');
    void prepareModels();
    try {
      micCaptureRef.current = await startMicCapture(inputDeviceIdRef.current || undefined, {
        onUtterance: micHandlers.onUtterance,
        onSpeechStart: (seq) => { clog('VAD: início de fala (mic, seq', seq, ')'); micHandlers.onSpeechStart(seq); },
        onPartialAudio: micHandlers.onPartialAudio,
        onMisfire: (seq) => micHandlers.onMisfire(seq),
        onLevel: pushLevel,
        onStatus: (msg) => { clog('mic:', msg); setFeedbackMsg(msg); setTimeout(() => setFeedbackMsg(''), 4000); },
        onError: (err) => { clog('mic ERRO assíncrono:', err.message); setFeedbackMsg('Erro no microfone: ' + err.message); setTimeout(() => setFeedbackMsg(''), 6000); },
      });
      clog('captura do microfone ATIVA ✓');
      micStartedAtRef.current = micCaptureRef.current?.startedAtMs ?? 0;
      anchorSessionClock(micStartedAtRef.current, 'mic'); // ancora só se o mic for a fonte do áudio salvo
      if (!systemEnabled) {
        setFeedbackMsg('Microfone ativo (Whisper local). Fale — a transcrição aparece e refina em tempo real.');
        setTimeout(() => setFeedbackMsg(''), 3500);
      }
    } catch (err) {
      clog('getUserMedia(mic) FALHOU:', (err as Error).message);
      setFeedbackMsg((err as Error).message);
      setTimeout(() => setFeedbackMsg(''), 7000);
      setModelPrep((s) => (s?.error ? s : null));
      if (!systemEnabled) { // mic era a única fonte → encerra a gravação
        setIsRecording(false);
        isRecordingRef.current = false;
      }
    }
  };

  // Medidor de nível LEVE (só p/ o waveform) — necessário no motor navegador, pois a Web Speech
  // não expõe o áudio. Abre um getUserMedia próprio e mede RMS. Best-effort.
  const startMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceIdRef.current ? { deviceId: { exact: inputDeviceIdRef.current } } : true,
      });
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const iv = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        pushLevel(Math.min(1, Math.sqrt(s / buf.length) * 4));
      }, 50);
      meterRef.current = { stop: () => { clearInterval(iv); stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}); } };
    } catch { /* medidor é opcional */ }
  };

  // MICROFONE via Web Speech API (navegador) — motor PADRÃO: leve, sem baixar modelo, ótimo p/
  // português. Usa o adaptador WebSpeechStt do gateway. Não escolhe dispositivo (usa o padrão do
  // SO) — para isso, o usuário troca para o motor Whisper. Sem streaming de PCM: partials/finais.
  const startWebSpeechMic = () => {
    const speakerId = 'user';
    const from = sourceLangRef.current.split('-')[0];
    const to = targetLangRef.current.split('-')[0];
    try {
      webSpeechRef.current = new WebSpeechStt().startLive(sourceLangRef.current, {
        onPartial: (text: string) => {
          if (isTtsActive()) return; // anti-eco: o mic ouviu o TTS do app pelos alto-falantes
          const clean = text.trim();
          if (!clean) return;
          if (!webSpeechPartialIdRef.current) webSpeechPartialIdRef.current = Math.random().toString(36).slice(2, 11);
          const pid = webSpeechPartialIdRef.current;
          setSpeechSegments(prev => {
            const idx = prev.findIndex(s => s.id === pid);
            if (idx !== -1) { const u = [...prev]; u[idx] = { ...u[idx], originalText: clean }; return u; }
            return [...prev, { id: pid, speakerId, source: 'mic' as const, timestamp: formatTime(timerRef.current), originalText: clean, translatedText: '…', words: [], isPartial: true, tStartMs: nowRel() }];
          });
        },
        onFinal: ({ text }: { text: string }) => {
          if (isTtsActive()) { webSpeechPartialIdRef.current = null; return; } // anti-eco no final também
          const clean = text.trim();
          if (!clean) return;
          const uttId = webSpeechPartialIdRef.current ?? Math.random().toString(36).slice(2, 11);
          webSpeechPartialIdRef.current = null;
          setSpeechSegments(prev => {
            const existing = prev.find(s => s.id === uttId);
            const committed: SpeechSegment = {
              id: uttId, speakerId, source: 'mic', timestamp: formatTime(timerRef.current),
              originalText: clean, translatedText: '…', words: wordsFromText(clean), isPartial: false,
              tStartMs: existing?.tStartMs ?? nowRel(), tEndMs: nowRel(),
            };
            const idx = prev.findIndex(s => s.id === uttId);
            if (idx !== -1) { const u = [...prev]; u[idx] = committed; return u; }
            return [...prev, committed];
          });
          translateSegment(uttId, clean, from, to);
        },
        onError: (e: Error) => { clog('web-speech mic erro:', String(e)); },
      });
      clog('microfone (Web Speech) ATIVO ✓');
      void startMeter(); // waveform real (a Web Speech não fornece nível)
      if (!systemEnabled) {
        setFeedbackMsg('Microfone (navegador) ativo — transcrição instantânea. Fale à vontade.');
        setTimeout(() => setFeedbackMsg(''), 3000);
      }
    } catch (e) {
      setFeedbackMsg('Web Speech indisponível: ' + (e as Error).message + ' — troque para o motor Whisper.');
      setTimeout(() => setFeedbackMsg(''), 5000);
      if (!systemEnabled) { setIsRecording(false); isRecordingRef.current = false; }
    }
  };

  // Liga o microfone conforme o motor escolhido (navegador vs Whisper).
  const startMic = () => {
    if (micEngine === 'browser' && webSpeechSupported) startWebSpeechMic();
    else void handleStartMicCapture();
  };

  // Harness OFFLINE de teste (dev): injeta um PCM conhecido pelo MESMO caminho do sistema
  // (speechStart → parciais crescentes → utterance final), sem precisar de um compartilhamento
  // real. Permite testar ordem/parciais/latência via chrome-devtools MCP `evaluate_script`.
  // Uso no console: await window.__simSystem()            → 1 enunciado (JFK)
  //                 await window.__simSystem('jfk', 3)      → 3 sobrepostos (testa ordem por seq)
  useEffect(() => {
    let simSeq = 10000; // faixa própria p/ não colidir com o seq real do VAD
    const JFK_URL = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const loadPcm = async (input?: Float32Array | 'jfk'): Promise<Float32Array> => {
      if (input instanceof Float32Array) return input;
      const buf = await (await fetch(JFK_URL)).arrayBuffer();
      const ac = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const decoded = await ac.decodeAudioData(buf);
      await ac.close();
      return decoded.getChannelData(0);
    };

    const runOne = async (pcm: Float32Array) => {
      const seq = ++simSeq;
      sysHandlers.onSpeechStart(seq);
      const stepSamples = 16000; // ~1s de novo áudio por parcial
      for (let end = stepSamples; end < pcm.length; end += stepSamples) {
        sysHandlers.onPartialAudio(pcm.slice(0, end), 16000, seq);
        await sleep(900); // deixa o parcial decodificar antes do próximo (idle-gating)
      }
      sysHandlers.onUtterance(pcm.slice(), 16000, seq);
    };

    (window as any).__simSystem = async (input?: Float32Array | 'jfk', count = 1) => {
      modelReadyRef.current = true; // harness assume modelo já pré-carregado
      const pcm = await loadPcm(input ?? 'jfk');
      clog(`__simSystem: ${count} enunciado(s), ${pcm.length} amostras cada`);
      // count>1: dispara em paralelo (com pequeno atraso) para testar a ORDEM por seq.
      const runs: Promise<void>[] = [];
      for (let i = 0; i < count; i++) { runs.push(runOne(pcm)); await sleep(120); }
      await Promise.all(runs);
      clog('__simSystem concluído — window.__capSummary():', capMetrics.summary());
      return capMetrics.summary();
    };

    // BENCHMARK (#0): mede o custo RAW e STEADY-STATE de decode (Whisper) e de tradução (MT),
    // SEQUENCIALMENTE (await em cada passo) — sem contenção auto-infligida de fila. É o número
    // que os wins #1–#3 (warmup/dtype/knobs) e #4 (MT local) devem melhorar. Reflete o "acompanha
    // o tempo real?": se decodeMs < chunkSec*1000, a fila drena. Uso: await window.__simBench(6, 6)
    (window as any).__simBench = async (chunkSec = 6, n = 6) => {
      const full = await loadPcm('jfk');
      const chunk = full.slice(0, Math.min(full.length, Math.round(16000 * chunkSec)));
      const audioMs = Math.round((chunk.length / 16000) * 1000);
      const g = (window as any).__babelGateway;
      const dec: number[] = [], mt: number[] = [];
      const pctl = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]); };
      const st = (xs: number[]) => ({ p50: pctl(xs, 50), p95: pctl(xs, 95), avg: Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)) });
      // O benchmark mede o caminho REAL do usuário: áudio no idioma ESTUDADO → traduzido para o DELE.
      // Fixar 'en'→'pt' aqui media um par que talvez ele nem use.
      const studying = baseLang(langConfigRef.current.studying);
      const mine = baseLang(langConfigRef.current.mine);
      clog(`__simBench: ${n}× trechos de ${chunkSec}s (raw/sequencial, ${studying}→${mine}), aquecendo…`);
      await g.stt.transcribePcm(chunk.slice(), 16000, { languageHint: studying }); // warmup 1×
      let engine = 'mt';
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        const { text } = await g.stt.transcribePcm(chunk.slice(), 16000, { languageHint: studying });
        dec.push(Math.round(performance.now() - t0));
        // MT com texto levemente variado p/ furar cache do servidor e medir custo real
        const t1 = performance.now();
        const r = await g.mt.translate(`${text} #${i}`, studying, mine);
        mt.push(Math.round(performance.now() - t1));
        engine = r.engine || engine;
      }
      const result = {
        model: localStorage.getItem('babel.whisperModel') ?? 'default',
        chunkSec, n, audioMs,
        decodeMs: st(dec),
        rtf: +(st(dec).p50 / audioMs).toFixed(3),   // < 1 = acompanha tempo real
        keepsUp: st(dec).p50 < audioMs,
        mtMs: st(mt), mtEngine: engine,
        endToEndMs: st(dec).p50 + st(mt).p50,        // decode + tradução (latência sentida)
      };
      clog('__simBench concluído:', result);
      return result;
    };
    /* `sysHandlers` fica fora: é uma FÁBRICA de handlers recriada a cada render, e este efeito só
       publica utilitários de bancada (`__simBench`) no `window` para depuração. Incluí-la faria o
       efeito reinstalar tudo em cada render sem nenhum ganho, e é `gateway` que decide o resultado
       da medição. O `sysHandlers` usado aqui dentro é lido no momento da CHAMADA, não no da
       instalação, então a versão nova sempre vale. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateway]);

  // (O microfone agora usa o MESMO pipeline VAD+Whisper do sistema — ver handleStartMicCapture
  // e makeCaptureHandlers('mic'). A antiga Web Speech API foi removida: não deixava escolher o
  // dispositivo de entrada nem funcionava offline.)

  // Ao parar a gravação, desmarca o orador ativo (sem simulação de falas).
  useEffect(() => {
    if (!isRecording) {
      setSpeakerProfiles(prev => prev.map(p => ({ ...p, isActive: false })));
    }
  }, [isRecording]);

  // Sair da tela derruba o worker de voz (libera o modelo da memória).
  useEffect(() => () => disposeSpeakerId(), []);

  /**
   * NÃO PERDER A SESSÃO AO TROCAR DE TELA (bug relatado). Um clique no menu lateral durante a
   * captura trocava de tela na hora, descartando a gravação e a chance de salvá-la. Agora a
   * navegação é suspensa e o usuário decide: continuar, parar e salvar, ou sair descartando.
   */
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const temTrabalhoEmRisco = isRecording || speechSegments.length > 0;
  useEffect(() => {
    if (!temTrabalhoEmRisco) { setNavGuard(null); return; }
    setNavGuard((proceed) => {
      // `() => proceed` porque `setState` com função a EXECUTARIA em vez de guardá-la.
      setPendingNav(() => proceed);
      return true; // navegação suspensa: quem decide agora é o modal
    });
    // Fechar a aba/janela no meio da captura também avisa (mesma classe de perda).
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      setNavGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [temTrabalhoEmRisco]);

  /** Sair mesmo assim: encerra as capturas em curso e libera a navegação suspensa. */
  const descartarESair = async () => {
    const proceed = pendingNav;
    setPendingNav(null);
    setIsRecording(false);
    isRecordingRef.current = false;
    try { webSpeechRef.current?.stop(); } catch { /* já parado */ }
    webSpeechRef.current = null;
    if (meterRef.current) { meterRef.current.stop(); meterRef.current = null; }
    try { await systemCaptureRef.current?.stop(); } catch { /* já parado */ }
    try { await micCaptureRef.current?.stop(); } catch { /* já parado */ }
    systemCaptureRef.current = null;
    micCaptureRef.current = null;
    setSpeechSegments([]);
    setTimer(0);
    setNavGuard(null); // senão o próprio proceed() cairia na trava de novo
    proceed?.();
  };

  // Inicia a gravação com as fontes selecionadas — MICROFONE e/ou SISTEMA, simultaneamente (captura dupla).
  /**
   * `Escape` fecha o modal — e foco inicial no botão de fechar.
   *
   * O handler antigo era um `onKeyDown` numa `<div>` sem `tabIndex`: essa div NUNCA recebe o
   * evento, então o Escape simplesmente não fazia nada. Um listener em `window` é o que funciona,
   * e é o mesmo padrão do popover de aparência (shell/ControlCluster).
   */
  useEffect(() => {
    if (!showConfigPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { play('close'); setShowConfigPanel(false); }
    };
    window.addEventListener('keydown', onKey);
    configCloseRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [showConfigPanel]);

  /**
   * A gaveta de setup abre SOZINHA quando há um problema de verdade — e só então.
   *
   * Antes, o passo-a-passo do Stereo Mix e do VB-Audio Cable ficava permanentemente aberto na
   * rota de loopback: uma parede de texto de 10px que quem já está funcionando nunca precisou ler.
   * Agora aparece quando não há dispositivo detectado, ou depois de um teste que falhou.
   */
  useEffect(() => {
    if (systemSource !== 'loopback') { setShowSetupGuide(false); return; }
    const testeFalhou = probe != null && probe.verdict !== 'ok';
    if (!loopbackDetected || testeFalhou) setShowSetupGuide(true);
  }, [systemSource, loopbackDetected, probe]);

  const handleStartRecording = () => {
    if (!micEnabled && !systemEnabled) {
      setFeedbackMsg('Selecione ao menos uma fonte: Microfone e/ou Sistema.');
      setTimeout(() => setFeedbackMsg(''), 4000);
      return;
    }
    // RETOMANDO: já há transcript reidratado → NÃO zere timer/segmentos; o relógio da
    // sessão recua `timer` segundos para que os novos enunciados continuem a linha do tempo.
    const resuming = !!(resumeId && speechSegments.length > 0);
    // Retorno sensorial no momento exato em que a gravação começa — som + rajada saindo do botão
    // que a pessoa acabou de apertar. Antes, começar a gravar era completamente silencioso.
    play('recordStart');
    burstFromElement(document.activeElement, 'record');
    clog('▶ START — microfone:', micEnabled, '| sistema:', systemEnabled, resuming ? '| RETOMANDO' : '');
    setIsRecording(true);
    isRecordingRef.current = true;
    sessionStartMsRef.current = resuming ? Date.now() - timer * 1000 : Date.now();
    shouldAnchorClockRef.current = !resuming; // sessão nova → o relógio será re-ancorado ao recorder
    micStartedAtRef.current = 0;
    partialIdRef.current = null;
    seqToSegmentRef.current.clear();
    lastPartialTextRef.current.clear();
    ordemMtRef.current.limpar(); // os selos são por segmento; sessão nova começa do zero
    capMetrics.reset();
    // Identificação de voz: sessão nova = memória de vozes nova (retomada mantém os clusters
    // — as "Pessoas" já nomeadas continuam valendo). O modelo (6,7MB, cacheado) carrega em
    // background; o painel Falantes mostra o estado honesto.
    if (!resuming) {
      clustererRef.current.reset();
      dominantLangRef.current.reset();
      // Sessão nova não herda a conclusão da anterior: o conteúdo pode ser outro idioma.
      perfilIdiomaRef.current.reset();
      setIdiomaObservado('');
      altTargetNotifiedRef.current = false;
      lastVoiceIdRef.current = null;
      provisionalUttsRef.current.clear();
    }
    if (captureScenario === 'conversation' && speakerAutoId && systemEnabled) {
      setSpeakerIdStatus('loading');
      void preloadSpeakerId().then((ok) => {
        setSpeakerIdStatus(ok ? 'ready' : 'unavailable');
        clog(ok ? 'identificação de voz PRONTA ✓ (WeSpeaker q8, WASM)' : 'identificação de voz INDISPONÍVEL — segue com atribuição manual');
      });
    } else {
      setSpeakerIdStatus('off');
    }
    // Aquece o MT local (opus-mt) para as DUAS direções (mic: fonte→alvo; sistema: alvo→fonte),
    // em background — assim já está pronto quando as traduções começarem (sem aquecer no meio).
    const s = sourceLang.split('-')[0], t = targetLang.split('-')[0];
    gateway.mt.warmup([[s, t], [t, s]]);
    if (!resuming) setTimer(0);
    if (micEnabled) startMic();
    if (systemEnabled) void handleStartSystemCapture();
  };

  // Start "limpo" a partir dos botões: só descarta o transcript quando NÃO estamos
  // retomando uma sessão (retomar continua de onde parou).
  const handleStartOrResume = () => {
    if (!(resumeId && speechSegments.length > 0)) setSpeechSegments([]);
    handleStartRecording();
  };

  // Sai do modo "retomar": a partir daqui a próxima gravação é uma sessão NOVA.
  const handleExitResume = () => {
    setResumeId(null);
    setSpeechSegments([]);
    setTimer(0);
    setCustomSessionTitle('');
    setFeedbackMsg('Modo retomar encerrado — a próxima captura cria uma sessão nova.');
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  // Parar a gravação NÃO salva mais direto: encerra as fontes, guarda o áudio e abre o
  // modal de encerramento (título + capa + destino). A persistência real acontece em
  // handleFinalizeSave, com o título/capa escolhidos.
  const handleStopRecording = async () => {
    play('recordStop');
    setIsRecording(false);
    isRecordingRef.current = false;
    partialIdRef.current = null;
    setModelPrep(null);
    clog('■ STOP');
    if (webSpeechRef.current) {
      try { webSpeechRef.current.stop(); } catch {}
      webSpeechRef.current = null;
      webSpeechPartialIdRef.current = null;
    }
    if (meterRef.current) { meterRef.current.stop(); meterRef.current = null; }
    let sysBlob: Blob | null = null;
    let micBlob: Blob | null = null;
    if (systemCaptureRef.current) {
      try { sysBlob = await systemCaptureRef.current.stop(); } catch {}
      systemCaptureRef.current = null;
    }
    if (micCaptureRef.current) {
      try { micBlob = await micCaptureRef.current.stop(); } catch {}
      micCaptureRef.current = null;
    }
    // Player do Analysis: prefere o áudio do SISTEMA (o que você estuda); senão, o do mic.
    recordedAudioRef.current = sysBlob ?? micBlob;
    seqToSegmentRef.current.clear();
    lastPartialTextRef.current.clear();
    clog('métricas da sessão:', capMetrics.summary());

    if (speechSegments.length === 0) {
      setFeedbackMsg('Nenhuma fala capturada — nada para salvar.');
      setTimeout(() => setFeedbackMsg(''), 3000);
      return;
    }

    // Pré-preenche o modal: retomando → título/capa existentes; senão, título por data.
    if (resumeId) {
      const existing = (recordings ?? []).find(r => r.id === resumeId);
      setCustomSessionTitle(prev => prev.trim() || existing?.title || `Captura ao vivo — ${new Date().toLocaleString('pt-BR')}`);
      setCustomSessionImage(existing?.imageUrl ?? '');
      setImgQuery(existing?.title ?? '');
    } else {
      setCustomSessionTitle(`Captura ao vivo — ${new Date().toLocaleString('pt-BR')}`);
      setCustomSessionImage('');
      setImgQuery('');
    }
    setImgResults([]);
    setShowSaveModal(true);
  };

  // "Continuar Gravando": fecha o modal e volta a capturar SEM perder o transcript
  // já feito (o relógio segue de onde parou via `resuming` no handleStartRecording).
  const handleCancelStop = () => {
    setShowSaveModal(false);
    setIsRecording(true);
    isRecordingRef.current = true;
    sessionStartMsRef.current = Date.now() - timer * 1000; // continua a linha do tempo
    if (micEnabled) startMic();
    if (systemEnabled) void handleStartSystemCapture();
    setFeedbackMsg('Gravação retomada!');
    setTimeout(() => setFeedbackMsg(''), 1500);
  };

  // Persistência REAL das saídas do modal. Sessão NOVA → createSession; sessão RETOMADA
  // (resumeId) → substitui as falas + atualiza título/duração + capa, MANTENDO o mesmo id
  // (nunca duplica na Biblioteca). Depois sobe o áudio e gera os cards de vocabulário.
  const handleFinalizeSave = async (shouldRedirect: boolean) => {
    const segs = speechSegments;
    const title = customSessionTitle.trim() || `Captura ao vivo — ${new Date().toLocaleString('pt-BR')}`;
    const cover = customSessionImage.trim();
    setShowSaveModal(false);
    setFeedbackMsg('Salvando sessão…');
    try {
      const nameOf = (id: string) => speakerProfilesRef.current.find(p => p.id === id)?.name ?? id;
      // Idiomas POR FALA (não por sessão): as duas fontes são INVERSAS — o áudio do SISTEMA
      // vem no idioma-ALVO e é traduzido para o seu; o MIC é o contrário (ver `langs()` em
      // makeCaptureHandlers). Gravar `sourceLang` fixo aqui fazia a Análise/Leitura narrarem o
      // texto estrangeiro com a voz do idioma errado.
      const utterances: NewUtterancePayload[] = segs.map((s, i) => {
        const isSys = s.source === 'system'; // FONTE decide a direção (speakerId agora pode ser 'voice_N')
        return {
          idx: i,
          source: isSys ? 'system' : 'mic',
          speakerName: nameOf(s.speakerId),
          // Idioma REAL detectado (multi-idioma) vence; senão, o da config.
          sourceLang: s.lang ? (toBcp47(s.lang) || s.lang) : (isSys ? targetLang : sourceLang),
          engine: s.engine ?? (isSys ? 'whisper-local' : micEngine === 'browser' ? 'web-speech' : 'whisper-local'),
          sourceText: s.originalText,
          targetLang: isSys ? sourceLang : targetLang,   // idioma de `translatedText`
          translatedText: s.translatedText,
          tStartMs: s.tStartMs,
          tEndMs: s.tEndMs,
        };
      });

      let recording: Recording | null = null;
      if (resumeId) {
        // Retomada: substitui TODAS as falas (append duplicaria as antigas já reidratadas),
        // renomeia/ajusta duração e grava a capa — tudo no MESMO id.
        recording = await replaceSessionUtterances(resumeId, utterances);
        const upd = await updateSession(resumeId, { title, durationMs: timer * 1000 });
        if (upd) recording = upd;
        if (cover) { const r = await patchSessionMeta(resumeId, { imageUrl: cover }); if (r) recording = r; }
        if (!recording) {
          // Fallback honesto se o backend não devolveu a linha: reusa o que já existia.
          const existing = (recordings ?? []).find(r => r.id === resumeId);
          recording = {
            id: resumeId,
            title,
            date: existing?.date ?? 'Agora',
            durationStr: formatTime(timer),
            wordCount: existing?.wordCount ?? 0,
            type: existing?.type ?? 'audio',
            tags: existing?.tags ?? [],
            status: 'Processado',
            imageUrl: cover || existing?.imageUrl,
          };
        }
        if (recordedAudioRef.current) {
          const url = await uploadSessionAudio(resumeId, recordedAudioRef.current);
          if (url) recording.audioUrl = url;
        }
      } else {
        recording = await createSession({
          title,
          kind: 'live',
          sourceLang,
          targetLang,
          status: 'done',
          durationMs: timer * 1000,
          utterances,
        });
        if (cover) { const r = await patchSessionMeta(recording.id, { imageUrl: cover }); if (r) recording = r; }
        if (recordedAudioRef.current) {
          const url = await uploadSessionAudio(recording.id, recordedAudioRef.current);
          if (url) recording.audioUrl = url;
        }
      }

      // Vocabulário das palavras REAIS extraídas das falas (verso via MT, cloze da frase real).
      // O idioma da PALAVRA é o da fala de onde ela veio (sistema = alvo; mic = fonte) — é o que
      // Estudo/Métricas leem depois para falar/traduzir no idioma certo. Traduzir sempre de
      // `sourceLang`→`targetLang` invertia a direção nas palavras vindas do áudio do sistema.
      /* A SESSÃO JÁ ESTÁ SALVA AQUI. Libera a tela ANTES de enriquecer o vocabulário.
         Antes, `onSave()` só rodava depois de traduzir palavra por palavra, e a pessoa ficava
         presa em "Salvando sessão…" sem conseguir iniciar outra captura nem navegar. O que
         importa — a gravação e as falas — já está no servidor neste ponto; o verso dos cartões
         é enriquecimento, e enriquecimento não segura ninguém. */
      onSave(recording, shouldRedirect);
      recordedAudioRef.current = null;
      setResumeId(null);
      setSpeechSegments([]);
      setTimer(0);
      setCustomSessionImage('');
      setFeedbackMsg('Sessão salva · fichando vocabulário…');

      // Monta a lista de palavras únicas. O idioma da PALAVRA é o da fala de onde ela veio.
      const seen = new Set<string>();
      type Pendente = { word: string; back: string; sentence: string; srcLang: string; tgtLang: string };
      const pendentes: Pendente[] = [];
      for (const s of segs) {
        const isSys = s.source === 'system';
        const wordLang = isSys ? targetLang : sourceLang;  // idioma da palavra capturada
        const backLang = isSys ? sourceLang : targetLang;  // idioma do verso (tradução)
        for (const w of s.words as any[]) {
          const word = String(w?.word ?? '');
          const key = word.toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          pendentes.push({ word, back: String(w?.translation ?? ''), sentence: s.originalText, srcLang: wordLang, tgtLang: backLang });
        }
      }

      /* Os versos que faltam vão em LOTE, com desistência rápida e concorrência limitada
         (`lib/versosDoVocabulario`). O laço serial anterior fazia uma chamada de rede por
         palavra — e com o tradutor fora do ar, cada uma ainda pagava a tentativa antes de
         estourar. Quanto pior o tradutor, mais longa a espera. */
      const semVerso = pendentes.filter((p) => !p.back);
      const traducao = await traduzirVersos(
        semVerso.map((p) => ({ word: p.word, src: baseLang(p.srcLang), tgt: baseLang(p.tgtLang) })),
        (texto, de, para) => gateway.mt.translate(texto, de, para),
      );

      const cards = pendentes.map((p) => {
        const cloze = makeCloze(p.sentence, p.word);
        return {
          word: p.word,
          back: p.back || traducao.versos.get(p.word.toLowerCase()) || '',
          sentence: p.sentence,
          srcLang: p.srcLang,
          tgtLang: p.tgtLang,
          clozePrompt: cloze?.prompt,
          clozeAnswer: cloze?.answer,
          sessionId: recording.id,
        };
      });
      /* O NÚMERO QUE A TELA MOSTRA É O QUE O SERVIDOR GRAVOU, não o que tentamos gravar.
         `cards` é a lista TENTADA; desde que a régua de qualidade entrou, boa parte dela é
         recusada (repetida, sem tradução, ruído). A tela continuava anunciando o total tentado —
         dizia "30 cards" quando entraram 12. Inflar em silêncio foi como o baralho chegou a 1.506
         cartões com 194 repetições; anunciar o que não entrou é a mesma mentira com outro nome. */
      const entrada = cards.length ? await bulkAddCards(cards) : { cards: [], skipped: [] };

      const salvos = entrada.cards.length;
      const pulados = resumoDosPulados(entrada.skipped);
      // A parada da tradução entra na mensagem: "sem verso" por falta de tradutor é um fato
      // sobre o resultado, e omiti-lo faria a contagem parecer um limite do texto capturado.
      const parada = explicarParada(traducao);
      setFeedbackMsg(
        salvos || entrada.skipped.length
          ? `Sessão salva · ${salvos} palavra(s) fichada(s)`
            + (pulados ? ` · ${entrada.skipped.length} pulada(s): ${pulados}` : '')
            + (parada ? ` · ${parada}` : '')
          : 'Sessão salva.',
      );
      // Mais tempo quando há motivo para ler: a linha ficou maior que "salvo com N cards".
      setTimeout(() => setFeedbackMsg(''), pulados ? 7000 : 4000);
    } catch (e) {
      setShowSaveModal(true); // reabre para o usuário tentar de novo, sem perder o transcript
      setFeedbackMsg('Falha ao salvar a sessão: ' + (e as Error).message);
      setTimeout(() => setFeedbackMsg(''), 4000);
    }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- RETOMAR SESSÃO: reidrata o transcript REAL do backend (não usa mock) ---
  useEffect(() => {
    setResumeId(resumingRecordingId ?? null);
    if (!resumingRecordingId) return;
    let cancelled = false;
    (async () => {
      try {
        const { session, utterances } = await fetchSessionTranscript(resumingRecordingId);
        if (cancelled) return;
        const segs: SpeechSegment[] = utterances.map((u) => ({
          id: u.id,
          speakerId: u.source === 'system' ? 'system' : 'user',
          source: (u.source === 'system' ? 'system' : 'mic') as 'system' | 'mic',
          timestamp: formatTime(Math.round((u.tStartMs ?? 0) / 1000)),
          originalText: u.sourceText ?? '',
          translatedText: u.translatedText ?? '',
          words: wordsFromText(u.sourceText ?? ''),
          isPartial: false,
          tStartMs: u.tStartMs ?? undefined,
          tEndMs: u.tEndMs ?? undefined,
        }));
        setSpeechSegments(segs);
        // Semeia o relógio a partir da duração salva; o START continua a linha do tempo.
        const durMs = session.durationMs ?? 0;
        setTimer(Math.round(durMs / 1000));
        sessionStartMsRef.current = Date.now() - durMs;
        if (session.title) setCustomSessionTitle(session.title);
        if (session.sourceLang) setSourceLang(session.sourceLang);
        if (session.targetLang) setTargetLang(session.targetLang);
        setFeedbackMsg(`Retomando sessão: ${session.title ?? 'sem título'}`);
        setTimeout(() => setFeedbackMsg(''), 4000);
      } catch {
        if (!cancelled) {
          setFeedbackMsg('Não foi possível carregar a sessão para retomar.');
          setTimeout(() => setFeedbackMsg(''), 4000);
        }
      }
    })();
    return () => { cancelled = true; };
    /* Sem supressão aqui: as dependências deste efeito estão completas, e a diretiva
       `eslint-disable-next-line` que existia neste ponto era MORTA — o próprio lint a reportava
       como inútil. Supressão que não suprime nada é pior que nenhuma: quem lê presume que há uma
       regra sendo dobrada e vai procurar o motivo. */
  }, [resumingRecordingId]);

  // Modal aberto: trava o scroll do body e liga Esc = "continuar gravando".
  useEffect(() => {
    if (!showSaveModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancelStop(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSaveModal]);

  // Colar imagem (Ctrl+V) como capa enquanto o modal de encerramento está aberto.
  useEffect(() => {
    if (!showSaveModal) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => { setCustomSessionImage(reader.result as string); };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [showSaveModal]);

  // Busca capas keyless (Openverse) — mesmo padrão do modal de capa da Biblioteca.
  const searchCovers = async () => {
    const q = imgQuery.trim();
    if (!q) return;
    setImgLoading(true);
    try {
      setImgResults(await searchImages(q));
    } finally {
      setImgLoading(false);
    }
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => { setCustomSessionImage(reader.result as string); };
    reader.readAsDataURL(file);
  };

  // REMOVIDO — modo "Visão OCR" (Tesseract.js): estava INALCANÇÁVEL desde que o seletor
  // voz|visão saiu da tela (nenhum botão abria o painel). ~200 linhas de estado/handlers/JSX
  // dormentes deletadas em 2026-07-24 (decisão do usuário). A intenção do recurso segue
  // especificada em openspec/changes/vision-ocr-web para uma reimplementação madura;
  // o motor (src/gateway/ocr.ts) continua no repositório para esse futuro uso.

  /**
   * REMOVIDO — "INTERACTIVE ACTIVE TRANSLATION & DRILL STATE".
   *
   * Havia aqui um `handleTranslateSubmit` completo (estado, gateway, extração de vocabulário) que
   * NENHUM JSX chamava: nem o handler, nem o input de `userTranslateInput`, nem a leitura de
   * `translatedResult` existiam na tela. Era uma funcionalidade inteira sem UI.
   *
   * Não estava só morto — estava morto E fabricando: quando o motor de tradução falhava, ele gravava
   * `translated: textToTranslate`, isto é, **o texto original no campo da tradução**. Se alguém
   * religasse o formulário um dia, a app passaria a exibir a frase em inglês como se fosse sua própria
   * tradução em português, com toda a aparência de ter funcionado. Um campo de tradução dessa tela
   * deve nascer do zero, com falha honesta.
   */

  const handleAddManualSpeechSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSpeakerInput.trim()) return;

    setIsProcessingManualInput(true);
    const inputText = manualSpeakerInput.trim();
    setManualSpeakerInput('');

    try {
      // Find active speaker
      const activeSpeaker = speakerProfiles.find(p => p.isActive) || speakerProfiles.find(p => p.id === 'user') || speakerProfiles[0];
      const speakerId = activeSpeaker.id;
      const timestampStr = formatTime(timer);

      // Tradução pelo GATEWAY (não mais fetch direto ao MyMemory).
      const src = sourceLang.split('-')[0];
      const tgt = targetLang.split('-')[0];
      const { text: translated } = await gateway.mt.translate(inputText, src, tgt);
      const clean = translated || inputText;
      const cleanTranslated = clean.charAt(0).toUpperCase() + clean.slice(1);

      // Append segment to live transcript feed! Vocabulário da fala real.
      setSpeechSegments(prev => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          speakerId,
          source: 'mic' as const,
          timestamp: timestampStr,
          originalText: inputText,
          translatedText: cleanTranslated,
          words: wordsFromText(inputText),
          tStartMs: nowRel(),
          tEndMs: nowRel(),
        }
      ]);

      setFeedbackMsg(`Frase de ${activeSpeaker.name} traduzida e integrada à transcrição!`);
      setTimeout(() => setFeedbackMsg(''), 3000);
    } catch (err) {
      console.error('Falha ao traduzir a frase digitada:', err);
      toast.error('Não foi possível traduzir e integrar a frase à transcrição.', { detail: err });
    } finally {
      setIsProcessingManualInput(false);
    }
  };

  // --- TTS: escutar palavra/frase (ver src/lib/tts.ts) ---
  // `lang` default = idioma-ALVO (a língua que você está aprendendo/ouvindo) — a maioria das
  // palavras clicadas é do conteúdo estrangeiro. Quem sabe o idioma da linha passa explicitamente.
  const speakWord = (word: string, lang?: string) => {
    ttsSpeak(word, { lang: lang || targetLangRef.current, rate: ttsSpeed });
  };
  // Fala genérica (frase inteira) num idioma específico — usada pelo overlay.
  const speakText = (text: string, lang: string) => {
    ttsSpeak(text, { lang, rate: ttsSpeed });
  };

  // --- ACTIVE WORD EXAMINATION INTERACTION ---
  const [selectedExamWord, setSelectedExamWord] = useState<VocabWord | null>(null);

  /**
   * Idioma REAL da palavra que está no Analista de Vocabulário. `VocabWord` não carrega idioma, e a
   * linha de onde a palavra saiu é quem sabe qual é (mic = seu idioma; sistema/OCR = o estudado).
   * Sem isto, mandar a palavra praticar levaria o idioma errado ao exercício.
   */
  const selectedWordLangRef = useRef<string>('');

  /**
   * Seleciona uma palavra para análise.
   *
   * O idioma NÃO é mais chutado como "o idioma-alvo": ele é resolvido por `vocabWord.resolveWord` a
   * partir da FRASE de onde a palavra saiu (`context`), tendo o idioma declarado daquela linha
   * (`declaredLang`) como rótulo de partida. E a tradução vai na direção decidida pelo idioma DA
   * PALAVRA — traduzir sempre `mine → studying` mandava a palavra inglesa ao MT declarada como
   * portuguesa (era exatamente o bug de "verbete que não existe").
   */
  const examineWord = async (w: VocabWord, declaredLang?: string, context?: string) => {
    const origin: WordOrigin = {
      word: w.word,
      context: context ?? w.example,
      declaredLang: declaredLang || undefined,
      config: langConfigRef.current,
    };

    // 1) Idioma REAL primeiro (detecção local, sem rede): painel e pronúncia já saem certos.
    const resolved = await resolveWord(origin);
    selectedWordLangRef.current = resolved.lang;
    setSelectedExamWord({
      ...w,
      lang: resolved.lang || undefined,
      example: resolved.context ?? w.example,
    });
    speakWord(w.word, resolved.lang);

    if (w.translation) return;

    // 2) Verso pelo MT real, no par que `vocabWord` decidiu (sem motor para o par → sem tradução,
    //    honestamente, em vez de um "traduzindo…" eterno).
    const { vocab } = await buildVocabWord(origin, gateway.mt);
    if (vocab.translation) {
      setSelectedExamWord(prev => (prev && prev.word === w.word
        ? { ...prev, translation: vocab.translation, mtEngine: vocab.mtEngine }
        : prev));
    }
  };


  /**
   * Add word to study deck (SRS) — grava no BACKEND (mesmo deck do Study/FSRS).
   *
   * ANTES: gravava `srcLang: sourceLang` / `tgtLang: targetLang` SEMPRE, e traduzia sempre
   * `mine → studying`. Ou seja: clicar numa palavra de uma linha do SISTEMA (que está no idioma que
   * você ESTUDA) criava um cartão em inglês rotulado `pt-BR`, com o verso traduzido na direção
   * errada — contradizendo o `handleFinalizeSave` deste mesmo arquivo, que inverte por fala.
   *
   * AGORA: o idioma sai da LINHA de onde a palavra veio (`resolveWord`) e os rótulos do cartão saem
   * de `cardLangs` — o mesmo produtor que as outras telas usam.
   */
  const [addedWords, setAddedWords] = useState<string[]>([]);
  const handleAddWordToDeck = async (wordObj: any) => {
    const word: string = wordObj.word;
    setAddedWords(prev => prev.includes(word) ? prev : [...prev, word]);
    try {
      const sentence: string = wordObj.sentence || wordObj.example || '';
      const origin: WordOrigin = {
        word,
        // A frase de onde a palavra saiu — é DAQUI que sai o idioma real.
        context: sentence || undefined,
        // Rótulo declarado: o idioma que a palavra já carrega (posto por `examineWord`) ou, na falta
        // dele, o idioma da linha que está no Analista.
        declaredLang: wordObj.lang || selectedWordLangRef.current || undefined,
        config: langConfigRef.current,
      };
      const resolved = await resolveWord(origin);

      let back: string = wordObj.translation || '';
      if (!back && resolved.coverage !== 'same' && resolved.coverage !== 'unknown') {
        // Direção decidida pelo idioma DA PALAVRA, não pelo par da sessão.
        try { back = (await gateway.mt.translate(word, resolved.lang, resolved.targetLang)).text || ''; } catch { back = ''; }
      }
      const cloze = sentence ? makeCloze(sentence, word) : null;
      const r = await bulkAddCards([{
        word,
        back,
        sentence: sentence || undefined,
        ...cardLangs(resolved),
        clozePrompt: cloze?.prompt,
        clozeAnswer: cloze?.answer,
      }]);
      /* Confirmar antes de saber é o defeito mais fácil de cometer aqui: a régua pode recusar a
         palavra (repetida, sem tradução) e a tela dizia "adicionado" do mesmo jeito. A pessoa
         então procura no baralho o que nunca entrou e conclui que o app perde coisa. */
      setFeedbackMsg(
        r.cards.length
          ? `"${word}" adicionado ao seu deck (FSRS)!`
          : `"${word}" não entrou: ${motivoLegivel(r.skipped[0]?.motivo ?? '')}.`,
      );
    } catch {
      setFeedbackMsg(`Falha ao adicionar "${word}" ao deck.`);
    }
    setTimeout(() => setFeedbackMsg(''), 3000);
  };

  /**
   * "Praticar esta palavra" durante a captura — leva a palavra ao exercício, no Estudo.
   *
   *  • `review` → a revisão só existe para cartões DO DECK; então fichamos ANTES (reusando o
   *    `handleAddWordToDeck` desta tela) e só então abrimos a revisão. É o que substitui o velho
   *    "adicionar e torcer para reencontrar numa revisão futura".
   *  • demais → semente com a palavra + o idioma REAL da linha de onde ela saiu.
   *
   * Sem `sessionId`: a captura em curso ainda não é uma sessão salva — não inventamos um id.
   */
  const handlePracticeWord = async (w: VocabWord, exercise: ExerciseId) => {
    if (!onChangeView) return;
    if (exercise === 'review' && !addedWords.includes(w.word)) {
      await handleAddWordToDeck(w);
    }
    const lang = baseLang(selectedWordLangRef.current || targetLangRef.current);
    const seed: PracticeSeed = {
      ...seedFromSelection(w.word, lang, exercise),
      word: w.word,
    };
    onChangeView(telaDoExercicio(exercise), { seed });
  };

  // Speaker Renaming
  const handleStartRenameSpeaker = (id: string, currentName: string) => {
    setEditingSpeakerId(id);
    setEditingSpeakerName(currentName);
  };

  const handleSaveSpeakerName = (id: string) => {
    if (!editingSpeakerName.trim()) return;
    setSpeakerProfiles(prev => prev.map(p => p.id === id ? { ...p, name: editingSpeakerName } : p));
    setEditingSpeakerId(null);
    setFeedbackMsg('Nome do orador atualizado!');
    setTimeout(() => setFeedbackMsg(''), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-ink overflow-hidden relative font-body">
      <style>{`
        @keyframes scanLine {
          0% { top: 0%; opacity: 0.8; }
          50% { top: 100%; opacity: 0.8; }
          100% { top: 0%; opacity: 0.8; }
        }
        .animate-scan-laser {
          animation: scanLine 3s infinite ease-in-out;
        }
        /* .custom-scrollbar mudou para src/index.css (global, com os tokens do tema):
           aqui as cores eram fixas em rgba(0,0,0,…) — invisíveis no escuro — e a regra
           só existia enquanto ESTA tela estava montada. */
      `}</style>

      {/* FEEDBACK POPUP */}
      {feedbackMsg && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-accent text-white font-bold text-[13px] px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300">
          <Check className="w-4 h-4 stroke-[3]" /> {feedbackMsg}
        </div>
      )}

      {/* --- HEADER: identidade da tela à esquerda; utilidades à direita.
          O botão do Relay saiu daqui (canto morto) e foi para o hero, junto das ações
          de gravação — onde o usuário realmente trabalha. --- */}
      {/* Barra de ferramentas em UMA linha. A descrição da tela saiu daqui e desceu para o topo
          da coluna de trabalho (rolável): ela orienta na chegada e depois libera a altura, em vez
          de custar ~30px fixos em toda sessão de gravação. */}
      <header className="px-4 md:px-6 py-2.5 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 shrink-0 z-30">
        <h2 className="font-display font-black text-base md:text-lg text-ink leading-tight flex items-center gap-2 min-w-0">
          {ageProfile === 'kids' ? (
            <>
              <Gamepad2 className="w-5 h-5 text-accent shrink-0" aria-hidden />
              <span className="truncate">Gravador de jogos e legendas</span>
            </>
          ) : ageProfile === 'senior' ? (
            <>
              <Eye className="w-5 h-5 text-accent shrink-0" aria-hidden />
              <span className="truncate">Gravação com tradução direta</span>
            </>
          ) : (
            <span className="truncate">Captura ao vivo</span>
          )}
        </h2>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-3">
          {/* Collapse/Expand Inline configurations panel */}
          <button 
            onClick={() => { play(showConfigPanel ? 'close' : 'open'); setShowConfigPanel(!showConfigPanel); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${showConfigPanel ? 'bg-canvas border-accent text-ink' : 'border-border-subtle bg-surface text-ink-muted hover:text-ink hover:bg-surface-hover'}`}
          >
            <Sliders className="w-4 h-4 text-accent" /> {ageProfile === 'kids' ? 'Ajustes de Áudio' : ageProfile === 'senior' ? 'Configurações Simples' : 'Configurações de Dispositivos & IA'}
          </button>

          <button
            onClick={() => setShowGuide(true)}
            title="Guia rápido: como capturar, importar e estudar"
            aria-label="Abrir guia rápido"
            className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border border-border-subtle bg-canvas text-ink-muted hover:text-accent hover:border-accent transition-colors cursor-pointer font-bold text-[13px]"
          >
            ?
          </button>
          <span
            className="hidden md:inline-flex items-center gap-2 bg-canvas text-rare-ink border border-rare/20 text-[11px] px-3 py-1.5 rounded-lg font-bold"
            title={`Detalhe técnico — sistema: Whisper local · microfone: ${micEngine === 'browser' ? 'Web Speech (rede)' : 'Whisper local'} · perfil de IA: ${activeProfileName}`}
          >
            <Cpu className="w-3.5 h-3.5 animate-pulse text-accent" />
            {ageProfile === 'kids'
              ? 'Legenda inteligente ativa'
              : ageProfile === 'senior'
              ? 'Reconhecimento Automático Pronto'
              : sttRouteLabel
              ? `Transcrição: ${sttRouteLabel}`
              : micEngine === 'browser' ? 'Transcrição no dispositivo · mic via navegador' : 'Transcrição 100% no dispositivo'}
          </span>
        </div>
      </header>

      {/* --- AVISO DE MODO RETOMAR --- */}
      {resumeId && (
        <div className="px-6 py-2.5 bg-accent-soft border-b border-accent/20 flex items-center justify-between gap-3 shrink-0 z-20 animate-in slide-in-from-top duration-200">
          <span className="text-[12px] font-bold text-accent-ink flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Retomando: {customSessionTitle || (recordings ?? []).find(r => r.id === resumeId)?.title || 'sessão'}
            <span className="text-[10px] font-mono font-semibold text-ink-muted">
              continua o transcript e a duração — salvar não cria uma nova sessão
            </span>
          </span>
          <button
            onClick={handleExitResume}
            className="text-[11px] font-bold text-ink-muted hover:text-ink border border-border-subtle bg-surface hover:bg-surface-hover rounded-lg px-2.5 py-1 cursor-pointer flex items-center gap-1 shrink-0"
          >
            <X className="w-3 h-3" /> Sair do modo retomar
          </button>
        </div>
      )}

      {/* --- CONFIGURAÇÕES AVANÇADAS: MODAL SOBREPOSTO ---
          Antes abria inline e EMPURRAVA o Espaço de Gravação para baixo (a "emenda" que o
          usuário apontou). Como modal, a tela principal fica estável; backdrop e Esc fecham. */}
      {showConfigPanel && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 p-4 md:p-8 overflow-y-auto"
          onClick={() => setShowConfigPanel(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowConfigPanel(false); }}
        >
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Configurações de dispositivos e modelos de IA"
          className="bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 w-full max-w-3xl max-h-[88vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-subtle">
              <div className="min-w-0">
                <h3 className="font-display font-black text-base text-ink flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-accent shrink-0" aria-hidden />
                  {ageProfile === 'kids' ? 'Ajustes de áudio' : ageProfile === 'senior' ? 'Configurações do som' : 'Dispositivos e modelos de IA'}
                </h3>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  {ageProfile === 'senior'
                    ? 'De onde vem o som e como ele vira texto.'
                    : 'De onde vem o áudio, qual motor transcreve e como a legenda aparece.'}
                </p>
              </div>
              <button
                ref={configCloseRef}
                onClick={() => { play('close'); setShowConfigPanel(false); }}
                aria-label="Fechar configurações"
                className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>

            {/* ─────────── FONTES DE CAPTURA (avançado) ───────────
                Estes controles ficavam TODOS empilhados na tela de captura, antes do botão Iniciar —
                era o maior gargalo de onboarding. Agora moram aqui: quem quer só gravar não os vê;
                quem precisa ajustar (Discord/jogos, Stereo Mix, motor do mic) abre esta gaveta. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

              {/* ÁUDIO DO SISTEMA — como capturar (a decisão que realmente importa) */}
              <div className="space-y-2 bg-canvas border border-border-subtle rounded-xl p-3.5">
                <label className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">
                  <Monitor className="w-3 h-3 text-accent" /> Áudio do Sistema — como capturar
                </label>

                {/* A ROTA de captura é a decisão mais técnica desta tela. Em Kids/Sênior ela abre
                    recolhida: o padrão já é a melhor rota disponível, e mostrar três alternativas
                    com nomes de API não ajuda ninguém desses perfis. Continua a um clique. */}
                {coreOnly(ageProfile) && !showAdvancedRoutes && (
                  <button
                    type="button"
                    onClick={() => setShowAdvancedRoutes(true)}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    <ChevronDown className="w-3 h-3" aria-hidden /> Trocar a forma de captar o som
                  </button>
                )}

                <div className={`flex-wrap items-center gap-1 bg-surface border border-border-subtle rounded-lg p-0.5 text-[10px] w-fit ${
                  coreOnly(ageProfile) && !showAdvancedRoutes ? 'hidden' : 'flex'
                }`}>
                  {serverCaptureAvailable && (
                    <button
                      onClick={() => setSystemSource('server')}
                      title="O servidor local captura o mix do Windows (WASAPI loopback) e envia ao app. ZERO setup e ZERO permissão de navegador — capta o sistema INTEIRO (Discord/jogos/qualquer app)."
                      className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${systemSource === 'server' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                    >
                      Computador (servidor) ★
                    </button>
                  )}
                  <button
                    onClick={() => setSystemSource('display')}
                    title="Compartilhar uma ABA ou a TELA (getDisplayMedia). Zero setup. Áudio de ABA é confiável; áudio de tela inteira sofre a limitação do Windows."
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${systemSource === 'display' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Compartilhar aba/tela
                  </button>
                  <button
                    onClick={() => setSystemSource('loopback')}
                    title="Captura um dispositivo de loopback (Stereo Mix / VB-Cable) como microfone. À prova de falhas — capta o sistema INTEIRO (Discord/jogos). Requer setup único."
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${systemSource === 'loopback' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Dispositivo de loopback
                  </button>
                </div>

                {systemSource === 'loopback' && (
                  <select
                    className="w-full bg-surface border border-border-subtle rounded-lg p-2 text-xs font-semibold text-ink cursor-pointer focus:border-accent outline-none"
                    value={loopbackDeviceId}
                    onChange={(e) => setLoopbackDeviceId(e.target.value)}
                  >
                    <option value="">{loopbackDetected ? 'Selecione o dispositivo de loopback…' : 'Dispositivo padrão do sistema'}</option>
                    {loopbackDevices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || `Entrada ${i + 1}`}</option>
                    ))}
                  </select>
                )}

                {/* Guia de setup honesto, por rota */}
                <div className="text-[10px] text-ink-muted space-y-1.5 pt-1">
                  {systemSource === 'server' ? (
                    <>
                      <p>O <b className="text-ink">servidor local</b> captura tudo que o computador toca (WASAPI loopback) e envia ao app — <b className="text-ink">sem popup de compartilhamento e sem configurar dispositivo</b>. Capta o sistema inteiro: Discord, jogos, players, chamadas.</p>
                      <p className="text-ink-faint">Esta rota escuta a <b>saída padrão</b> do Windows. Para capturar uma saída específica, defina-a como padrão no Windows (Som → Saída) — ou use <b>Compartilhar aba</b> (só uma aba) / <b>Dispositivo de loopback</b> (escolhe o dispositivo abaixo).</p>
                      <p className="text-ink-faint">Disponível porque o app está rodando com o servidor local no Windows. O áudio não sai da sua máquina.</p>
                    </>
                  ) : systemSource === 'display' ? (
                    <>
                      <p><b className="text-ink">Aba</b> (YouTube, chamada web): escolha a <b className="text-ink">aba</b> e marque <b className="text-ink">"áudio da aba"</b> — caminho confiável.</p>
                      <p><b className="text-ink">Tela inteira</b> (Discord/jogo): marque <b className="text-ink">"Compartilhar o áudio do sistema"</b>. No Windows isso às vezes falha (NotReadableError) — nesse caso use <b className="text-ink">Dispositivo de loopback</b>.</p>
                      <p className="text-ink-faint">"Janela" não tem áudio no Chrome. O áudio do sistema vem INTEIRO (mixado) — não dá para isolar um app.</p>
                    </>
                  ) : (
                    <>
                      <p>Capta o <b className="text-ink">sistema inteiro</b> (Discord, jogos, qualquer app) como se fosse um microfone — sem o erro de compartilhamento de tela.</p>
                      {!loopbackDetected && (
                        <p className="text-warn-ink font-bold">Nenhum dispositivo de loopback detectado — siga um dos dois caminhos abaixo.</p>
                      )}

                      {/* GAVETA: o passo-a-passo só ocupa a tela de quem precisa dele. Abre sozinha
                          quando não há dispositivo ou quando o teste falha (ver o efeito acima). */}
                      <button
                        type="button"
                        onClick={() => setShowSetupGuide(v => !v)}
                        aria-expanded={showSetupGuide}
                        className="flex items-center gap-1.5 text-[10px] font-bold text-ink-muted hover:text-ink cursor-pointer transition-colors"
                      >
                        <ChevronDown className={`w-3 h-3 transition-transform ${showSetupGuide ? 'rotate-180' : ''}`} aria-hidden />
                        {showSetupGuide ? 'Esconder o passo a passo' : 'Como configurar (2 caminhos)'}
                      </button>

                      {showSetupGuide && (
                        <div className="space-y-1.5 pt-1 pl-4 border-l-2 border-border-subtle">
                          <p><b className="text-ink">A — Stereo Mix:</b> Som → aba <b className="text-ink">Gravação</b> → botão direito → <b className="text-ink">"Mostrar dispositivos desabilitados"</b> → ative <b className="text-ink">"Mixagem estéreo"</b> e selecione-a acima.</p>
                          <p><b className="text-ink">B — VB-Audio Cable:</b> instale de <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer" className="text-accent underline">vb-audio.com/Cable</a>, defina <b className="text-ink">"CABLE Input"</b> como saída do Windows (ative "Escutar este dispositivo" p/ continuar ouvindo) e selecione <b className="text-ink">"CABLE Output"</b> acima.</p>
                          {!loopbackDetected && (
                            <p className="text-warn-ink">Se já ativou, conceda a permissão de microfone e recarregue a página.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* TESTE de diagnóstico: prova, no PC real, se o áudio chega mesmo. */}
                <div className="pt-2 border-t border-border-subtle">
                  <button
                    onClick={handleProbeSystem}
                    disabled={probing}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-surface border border-border-subtle text-ink hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
                  >
                    {probing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                    {probing ? 'Testando… (deixe algo tocando por ~2s)' : 'Testar captura do áudio do sistema'}
                  </button>
                  {probe && (
                    <div className={`mt-2 rounded-md p-2 border text-[10px] ${probe.verdict === 'ok' ? 'border-good/40 bg-good-soft/30 text-good-ink' : 'border-warn/40 bg-warn-soft/30 text-warn-ink'}`}>
                      <p className="font-bold">
                        {probe.verdict === 'ok' && '✓ Áudio do sistema OK — sinal detectado!'}
                        {probe.verdict === 'silent' && '⚠ Faixa de áudio existe, mas está SILENCIOSA (nível ~0)'}
                        {probe.verdict === 'no-audio-track' && '✗ Nenhuma faixa de áudio foi compartilhada'}
                      </p>
                      <p className="mt-0.5 text-ink-muted">
                        {probe.surface === 'loopback' || probe.surface === 'server' ? 'Fonte' : 'Superfície'}: <b>{probe.surface === 'monitor' ? 'Tela inteira' : probe.surface === 'browser' ? 'Aba' : probe.surface === 'window' ? 'Janela' : probe.surface === 'loopback' ? 'Loopback' : probe.surface === 'server' ? 'Servidor local' : probe.surface}</b>
                        {' · '}faixas: <b>{probe.audioTrackCount}</b>
                        {' · '}pico: <b>{probe.peakLevel}</b>
                        {probe.audioLabel && <> · <span className="font-mono">{probe.audioLabel}</span></>}
                      </p>
                      {probe.verdict === 'no-audio-track' && (
                        <p className="mt-0.5">{systemSource === 'loopback'
                          ? 'O dispositivo escolhido não entregou áudio. Confirme que é o Stereo Mix/CABLE Output e que a saída do Windows aponta para ele.'
                          : 'Escolha uma aba + "áudio da aba", ou Tela inteira + "Compartilhar o áudio do sistema". Janela não tem áudio.'}</p>
                      )}
                      {probe.verdict === 'silent' && (
                        <p className="mt-0.5">{systemSource === 'loopback'
                          ? 'O dispositivo veio, mas sem sinal. Deixe algo tocando e confirme que a saída do Windows aponta para o Stereo Mix/CABLE Input.'
                          : 'A faixa veio, mas sem som. Deixe um vídeo/música tocando durante o teste.'}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>


              {/* MICROFONE — motor + dispositivo */}
              <div className="space-y-2 bg-canvas border border-border-subtle rounded-xl p-3.5">
                <label className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">
                  <Mic className="w-3 h-3 text-accent" /> Microfone — motor e dispositivo
                </label>

                <div className="flex items-center gap-1 bg-surface border border-border-subtle rounded-lg p-0.5 text-[10px] w-fit">
                  <button
                    onClick={() => setMicEngine('browser')}
                    disabled={!webSpeechSupported}
                    title="Web Speech API do navegador — leve, instantânea, ótima p/ português. Usa o mic padrão do Windows e requer internet."
                    className={`px-2.5 py-1 rounded-md font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${micEngine === 'browser' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Navegador (rápido)
                  </button>
                  <button
                    onClick={() => setMicEngine('whisper')}
                    title="Whisper local — offline e permite escolher o dispositivo de entrada, porém mais pesado."
                    className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${micEngine === 'whisper' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Whisper (offline)
                  </button>
                </div>
                <p className="text-[9px] text-ink-faint leading-tight">
                  {micEngine === 'browser'
                    ? 'Navegador: instantâneo e leve, mas usa o mic padrão do Windows e precisa de internet.'
                    : 'Whisper: offline e escolhe o dispositivo abaixo, porém mais pesado.'}
                  {' '}O áudio do sistema é <b>sempre</b> transcrito por Whisper.
                </p>

                {/* Dispositivo de entrada — enumeração REAL (enumerateDevices). Só o motor Whisper
                    honra a escolha; a Web Speech usa o mic padrão do SO. */}
                <select
                  className="w-full bg-surface border border-border-subtle rounded-lg p-2 text-xs font-semibold text-ink cursor-pointer focus:border-accent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={inputDeviceId}
                  disabled={micEngine === 'browser'}
                  onChange={(e) => setInputDeviceId(e.target.value)}
                >
                  <option value="">Microfone padrão do sistema</option>
                  {audioInputs.filter(d => d.deviceId).map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>
                  ))}
                </select>
                {!deviceLabelsReady && (
                  <div className="flex items-center gap-2">
                    <p className="text-[9px] text-ink-faint leading-tight flex-1">Os nomes dos dispositivos exigem permissão do microfone.</p>
                    <button
                      onClick={async () => {
                        // Pede a permissão AGORA (sem esperar uma gravação) só para destravar
                        // os nomes; a faixa é fechada na hora.
                        try {
                          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                          s.getTracks().forEach(t => t.stop());
                          const { inputs, outputs, hasLabels } = await listDevices();
                          setAudioInputs(inputs); setAudioOutputs(outputs); setDeviceLabelsReady(hasLabels);
                        } catch {
                          setFeedbackMsg('Permissão do microfone negada — os nomes dos dispositivos ficam ocultos.');
                          setTimeout(() => setFeedbackMsg(''), 4000);
                        }
                      }}
                      className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border border-border-subtle bg-surface hover:border-accent hover:text-accent cursor-pointer"
                    >
                      Listar dispositivos
                    </button>
                  </div>
                )}
                {micEngine === 'browser' && (
                  <p className="text-[9px] text-ink-faint leading-tight">Para ESCOLHER o dispositivo do microfone, troque o motor para Whisper (acima) — a Web Speech usa sempre o padrão do Windows.</p>
                )}
              </div>
            </div>

            {/* ─────────── SAÍDA + MOTOR DE IA ─────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Dispositivo de Saída — real via setSinkId (aplica ao player de gravações). */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">Dispositivo de Saída</label>
                <select
                  className="w-full bg-canvas border border-border-subtle rounded-lg p-2 text-xs font-semibold text-ink cursor-pointer focus:border-accent outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  value={outputDeviceId}
                  disabled={!supportsSinkId()}
                  onChange={(e) => setOutputDeviceId(e.target.value)}
                >
                  <option value="">Saída padrão do sistema</option>
                  {audioOutputs.filter(d => d.deviceId).map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Saída ${i + 1}`}</option>
                  ))}
                </select>
                <p className="text-[9px] text-ink-faint leading-tight">
                  {supportsSinkId()
                    ? 'Aplica ao player de gravações. A voz falada (TTS) usa a saída padrão do Windows.'
                    : 'Seu navegador não permite escolher a saída de áudio.'}
                </p>
              </div>

              {/* Motor de IA: leitura do PERFIL ATIVO, que é o que realmente alimenta o
                  gateway. Antes havia aqui três <select> (voz/visão/chat) cujo estado não
                  chegava a lugar nenhum — a escolha real de adapter vem do perfil. */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">Motor de IA ativo</label>
                <div className="bg-canvas border border-border-subtle rounded-md p-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-ink truncate">{activeProfileName}</div>
                    <div className="text-[9px] text-ink-muted">
                      {getProviderMode() === 'cloud' ? 'Nuvem (sua chave)' : 'Local, no dispositivo'}
                    </div>
                  </div>
                  <Cpu className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                </div>
                <p className="text-[9px] text-ink-faint">Troque em Configurações → Perfil de IA.</p>
              </div>


              {/* QUALIDADE DA TRANSCRIÇÃO — a política do roteador de modelo por idioma. */}
              <div className="lg:col-span-2 space-y-1.5 bg-canvas border border-border-subtle rounded-xl p-3.5">
                <label htmlFor="stt-quality" className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-accent" /> Qualidade da transcrição
                </label>
                <select
                  id="stt-quality"
                  name="sttQuality"
                  value={sttQuality}
                  onChange={(e) => {
                    const q = e.target.value as SttQuality;
                    setSttQuality(q);
                    setSttQualityMirror(q);
                    void patchUiSettings({ sttQuality: q });
                  }}
                  className="w-full bg-surface border border-border-subtle rounded-lg p-2 text-xs font-semibold text-ink cursor-pointer focus:border-accent outline-none"
                >
                  <option value="auto">Automática (recomendado) — escolhe o melhor motor pelo idioma</option>
                  <option value="fast">Rápida — modelo leve local (menos precisa fora do inglês)</option>
                  <option value="accurate">Precisa — melhor modelo local (download maior, mais pesada)</option>
                  <option value="cloud">Nuvem — máxima qualidade via servidor (requer chave; usa rede)</option>
                </select>
                <p className="text-[9px] text-ink-faint leading-tight">
                  Automática: inglês usa o modelo leve local; outros idiomas usam a nuvem quando configurada (melhor qualidade) ou o melhor modelo local do seu dispositivo. O selo no topo mostra o motor em uso. O perfil Privado/Local nunca usa nuvem.
                </p>
              </div>

              {/* MODO DESEMPENHO — para jogar/trabalhar pesado enquanto captura */}
              <label className="lg:col-span-2 flex items-start gap-2.5 bg-canvas border border-border-subtle rounded-xl p-3.5 cursor-pointer">
                <input
                  id="perf-mode"
                  name="perfMode"
                  type="checkbox"
                  checked={perfMode}
                  onChange={(e) => setPerfMode(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="text-[11px] leading-relaxed">
                  <b className="text-ink">Modo desempenho (jogos)</b>
                  <span className="text-ink-muted"> — a legenda aparece só no fim de cada frase, sem o refino em tempo real. Reduz muito o uso de GPU/CPU enquanto você joga ou roda apps pesados.</span>
                </span>
              </label>
            </div>

            {/* APARÊNCIA DA LEGENDA — o antigo botão "Visual" da barra.
                Mesmo componente, montado onde os outros ajustes já moram. A barra da Captura
                ficou com duas ações (legendas flutuantes, foco cheio) em vez de três. */}
            <div className="mt-5 pt-4 border-t border-border-subtle">
              <h4 className="label-mono mb-2 flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-accent" aria-hidden />
                {ageProfile === 'senior' ? 'Como a legenda aparece' : 'Aparência da legenda'}
              </h4>
              <p className="text-[11px] text-ink-muted mb-3">
                Fonte, tamanho e ordem das linhas na transcrição ao vivo.
              </p>
              <TranscriptVisualSettings idPrefix="cfg-visual" dense tsSettings={tsSettings} updateSetting={updateSetting} />
            </div>
          </div>
        </section>
        </div>
      )}

      {/* --- DASHBOARD WRAPPER --- */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        
        {/* ============================================== */}
        {/* LEFT COLUMN: PRIMARY WORKSPACE & STREAMS       */}
        {/* ============================================== */}
        <div className="flex-1 flex flex-col lg:overflow-y-auto custom-scrollbar border-b lg:border-b-0 lg:border-r border-border-subtle p-4 lg:p-6 space-y-6">
          {/* SEM `-mb-2`: a margem negativa puxava o painel 8px PARA CIMA DO TEXTO — medido,
              o parágrafo terminava em 151px e o painel começava em 143px. Daí a sobreposição. */}
          <p className="text-[13px] text-ink-muted max-w-[68ch]">
            {ageProfile === 'kids'
              ? 'Grave o som do Roblox, de vídeos ou do microfone e veja a legenda aparecer em tempo real.'
              : ageProfile === 'senior'
              ? 'Siga os passos abaixo para gravar o som do computador ou a sua voz e ver o texto em português.'
              : 'Transcreve e traduz o que você ouve e fala, em tempo real.'}
          </p>


          {/* ============================================== */}
          {/* WORKSPACE VIEWPORTS (SEPARATE AREAS)          */}
          {/* ============================================== */}
          <div className="w-full">
            
            {/* TRANSCRIÇÃO AO VIVO (modo único da tela) */}
            {(
              <EditablePanel
                viewKey="capture"
                panelKey="liveTranscript"
                title="Transcrição Ao Vivo"
                canResizeWidth={false}
                canResizeHeight={true}
                defaultHeight={520}
              >
                <div className="flex flex-col gap-5 animate-in fade-in duration-300 h-full min-h-0">

                {/* ══════════════ HERO RECORDER — o centro de comando da captura ══════════════
                    ANTES: os controles ficavam espalhados no RODAPÉ do card de transcrição (abaixo da
                    dobra) — toggles, sub-toggles, guia de setup, botão "Testar" e só então o CTA. Era o
                    maior gargalo de onboarding.
                    AGORA: fontes + CTA + timer + idiomas num card só, no TOPO. Tudo que é avançado
                    (fonte do sistema, device de loopback, motor do mic, teste de captura, guia do
                    Stereo Mix/VB-Cable) mora na gaveta "Configurações de Dispositivos & IA" do header.
                    Resultado: iniciar uma captura = 1 clique. */}
                <div className={`bg-surface border rounded-2xl p-5 shadow-xl space-y-4 shrink-0 transition-colors ${isRecording ? 'border-accent/40 ring-1 ring-accent/20' : 'border-border-subtle'}`}>

                  {/* Linha 1 — status da sessão + atalhos de visualização */}
                  <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-3 w-3 relative">
                        {isRecording && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isRecording ? 'bg-accent' : 'bg-ink-faint'}`}></span>
                      </span>
                      <span className="font-display font-black text-[15px] uppercase tracking-wide text-ink">
                        {isRecording ? 'Gravando…' : 'Espaço de Gravação'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Relay junto das ações de gravação (saiu do canto morto do header). */}
                      <button
                        onClick={() => setShowOverlay(!showOverlay)}
                        title={isDocumentPiPSupported()
                          ? 'Legendas ao vivo numa janela flutuante sempre-no-topo (por cima de jogo/vídeo/chamada)'
                          : 'Janela flutuante requer Chrome/Edge; aqui o overlay abre embutido na tela'}
                        className={`p-1.5 px-2 border rounded-xl transition-all flex items-center gap-1 font-bold text-[11px] cursor-pointer ${showOverlay ? 'bg-accent border-accent text-white shadow-btn' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink hover:border-accent'}`}
                      >
                        <Layout className="w-3.5 h-3.5" />
                        <span>Legendas flutuantes{showOverlay ? ' ativas' : ''}</span>
                      </button>

                      <button
                        onClick={() => setIsFocusMode(true)}
                        className="p-1.5 px-2 bg-canvas border border-border-subtle rounded-xl text-ink hover:text-accent hover:border-accent transition-all flex items-center gap-1 font-bold text-[11px] cursor-pointer"
                        title="Expandir para o modo focado em tela cheia"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Foco Cheio</span>
                      </button>

                      {/* BINGO — transforma assistir em jogo sem atrapalhar a captura. Fora da leve: Jogar já é uma tela. */}
                      {!EDICAO_LEVE && <button
                        onClick={() => setShowBingo(v => !v)}
                        aria-pressed={showBingo}
                        title="Cartela de palavras que acende quando você as ouve"
                        className={`p-1.5 px-2 border rounded-xl transition-all flex items-center gap-1 font-bold text-[11px] cursor-pointer ${
                          showBingo ? 'bg-accent border-accent text-white shadow-btn' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink hover:border-accent'
                        }`}
                      >
                        <Ticket className="w-3.5 h-3.5" />
                        <span>Bingo</span>
                      </button>}

                      {/* O botão "Visual" saiu daqui: eram três botões disputando a mesma linha, e
                          o ajuste de fontes/tamanhos da transcrição pertence ao mesmo lugar que os
                          outros ajustes. Virou uma seção do modal de configurações — mesmo
                          componente (`TranscriptVisualSettings`), nenhum recurso perdido. */}
                    </div>
                  </div>

                  {/* Linha 2 — CENÁRIO: o usuário escolhe O QUE quer capturar; fontes, rótulos de
                      idioma e painéis se configuram sozinhos (fim dos toggles técnicos mic/sistema). */}
                  {!isRecording && (
                    <div className="space-y-2.5">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-ink-faint">O que você quer capturar?</span>
                      <div className={`grid grid-cols-1 ${EDICAO_LEVE ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-2`}>
                        {([
                          {
                            id: 'media' as const,
                            icon: <MonitorPlay className="w-4 h-4" />,
                            titulo: ageProfile === 'kids' ? 'Som do Jogo / Vídeo' : ageProfile === 'senior' ? 'Som do Computador' : 'Assistir mídia',
                            sub: ageProfile === 'kids' ? 'Roblox, YouTube, Twitch — som do computador' : ageProfile === 'senior' ? 'Vídeos da internet, aulas ou músicas' : 'Vídeo, aula, podcast, jogo — o som do computador'
                          },
                          {
                            id: 'conversation' as const,
                            icon: <MessagesSquare className="w-4 h-4" />,
                            titulo: ageProfile === 'kids' ? 'Jogo + Amigos' : ageProfile === 'senior' ? 'Chamada de Vídeo' : 'Conversa / chamada',
                            sub: ageProfile === 'kids' ? 'Discord, Call ou partida multiplayer' : ageProfile === 'senior' ? 'Conversas no WhatsApp, Zoom ou família' : 'Reunião, call, Discord — você e os outros'
                          },
                          // Edição leve: "Minha voz" (só microfone) não faz sentido para quem veio ouvir vídeo/jogo.
                          ...(EDICAO_LEVE ? [] : [{
                            id: 'mic' as const,
                            icon: <Mic className="w-4 h-4" />,
                            titulo: ageProfile === 'kids' ? 'Minha Voz' : ageProfile === 'senior' ? 'Gravar Minha Voz' : 'Minha voz',
                            sub: ageProfile === 'kids' ? 'Falar no microfone e testar pronúncia' : ageProfile === 'senior' ? 'Falar para o microfone com tradução direta' : 'Praticar fala, ditar — só o microfone'
                          }]),
                        ]).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => applyScenario(c.id)}
                            aria-pressed={captureScenario === c.id}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              captureScenario === c.id
                                ? 'bg-accent-soft/50 border-accent ring-1 ring-accent/30 shadow-sm'
                                : 'bg-canvas border-border-subtle hover:border-accent/50 hover:-translate-y-0.5'
                            }`}
                          >
                            <span className={`shrink-0 mt-0.5 ${captureScenario === c.id ? 'text-accent' : 'text-ink-muted'}`}>{c.icon}</span>
                            <span className="min-w-0">
                              <span className={`block text-[12px] font-bold leading-tight ${captureScenario === c.id ? 'text-accent-ink' : 'text-ink'}`}>{c.titulo}</span>
                              <span className="block text-[10px] text-ink leading-snug mt-0.5">{c.sub}</span>
                            </span>
                          </button>
                        ))}
                      </div>

                      {/* Fonte do sistema (só nos cenários que a usam) + atalho para o avançado. */}
                      <div className="flex flex-wrap items-center gap-2">
                        {systemEnabled && (
                          <select
                            id="system-source-preset"
                            name="systemSourcePreset"
                            value={systemSource}
                            onChange={(e) => setSystemSource(e.target.value as 'display' | 'loopback' | 'server')}
                            title="De onde vem o som (vídeos, chamadas, jogos)"
                            className="bg-canvas border border-border-subtle rounded-lg px-2 py-1.5 text-[11px] font-bold text-ink cursor-pointer outline-none focus:border-accent"
                          >
                            {serverCaptureAvailable && <option value="server">Som do computador ★ (sem configurar nada)</option>}
                            <option value="display">Uma aba do navegador (YouTube, chamada)</option>
                            {/* Leve: sem Stereo Mix/VB-Cable a rota abre o microfone; sem servidor não há como orientar. Fora. */}
                            {!EDICAO_LEVE && <option value="loopback">Dispositivo de loopback (avançado)</option>}
                          </select>
                        )}
                        {systemEnabled && !serverCaptureAvailable && (
                          <span className="text-[10px] text-ink-faint" title="A captura do som inteiro do computador sem configurar nada usa o servidor local (Windows). Na versão hospedada, use uma aba/tela compartilhada ou um dispositivo de loopback.">
                            som inteiro do PC sem configurar: só na versão instalada
                          </span>
                        )}
                        <span className="text-[10px] text-ink-faint flex items-center gap-1.5">
                          {micEnabled && `microfone via ${micEngine === 'browser' ? 'navegador' : 'transcrição local'}`}
                          <button
                            onClick={() => setShowConfigPanel(true)}
                            /* C5 — 15px de altura; WCAG 2.2 AA 2.5.8 pede 24. */
                            className="underline hover:text-accent font-bold cursor-pointer min-h-6 min-w-6 py-1 inline-flex items-center"
                            title="Abrir configurações avançadas de captura"
                          >
                            ajustes avançados
                          </button>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Linha 3 — CTA + timer (esquerda) · idiomas (direita) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                    <div className="flex items-center gap-4 md:col-span-2">
                      {isRecording ? (
                        <button
                          onClick={handleStopRecording}
                          data-sfx="none"
                          className="flex items-center gap-2 py-3 px-6 bg-error text-white font-extrabold text-xs md:text-sm rounded-xl shadow-btn transition-all hover:scale-[1.02] cursor-pointer shrink-0 min-h-[48px]"
                        >
                          <StopCircle className="w-5 h-5" />
                          {ageProfile === 'senior' ? 'Parar e salvar a gravação' : ageProfile === 'kids' ? 'Parar gravação' : 'Parar & Salvar'}
                        </button>
                      ) : (
                        <button
                          onClick={handleStartOrResume}
                          disabled={!micEnabled && !systemEnabled}
                          className="flex items-center gap-2 py-3.5 px-7 bg-accent hover:bg-accent-ink disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-extrabold text-xs md:text-sm shadow-btn transition-all hover:scale-[1.02] cursor-pointer shrink-0 min-h-[50px]"
                        >
                          <Mic className="w-5 h-5" />
                          {ageProfile === 'senior'
                            ? (resumeId ? 'Continuar a gravação da aula' : 'Iniciar a gravação de áudio')
                            : ageProfile === 'kids'
                            ? (resumeId ? 'Continuar gravação' : 'Começar a gravar')
                            : (resumeId ? 'Continuar captura' : 'Iniciar captura')}
                        </button>
                      )}

                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-2xl font-black text-ink tracking-widest">
                          {isRecording ? formatTime(timer) : '00:00'}
                        </span>
                      </div>
                    </div>

                    {/* Idiomas CONTEXTUAIS por cenário — a mesma dupla sourceLang/targetLang de
                        sempre, com rótulos que fazem sentido para o que o usuário está fazendo.
                        A direção da tradução por fonte (sistema ↔ mic) continua automática. */}
                    <div className="flex flex-col md:items-end gap-1 md:col-span-1">
                      <div className="flex items-center gap-1.5 flex-wrap md:justify-end">
                        {captureScenario !== 'media' && (
                          <LangSelect
                            id="my-lang"
                            label={captureScenario === 'mic' ? 'Falo em' : 'Eu falo'}
                            icon={<Mic className="w-2.5 h-2.5" />}
                            value={sourceLang}
                            auto={autoDetectMyLang}
                            allowAuto
                            onPick={({ auto, code }) => { langTouchedRef.current = true; setAutoDetectMyLang(auto); if (code) setSourceLang(code); }}
                          />
                        )}
                        {captureScenario === 'conversation' && <ArrowRight className="w-3.5 h-3.5 text-ink-faint mt-3 shrink-0" />}
                        {captureScenario !== 'mic' && (
                          <LangSelect
                            id="their-lang"
                            label={captureScenario === 'media'
                              ? (ageProfile === 'kids' ? 'Língua do vídeo/jogo' : 'Idioma do conteúdo')
                              : 'Eles falam'}
                            icon={<Headphones className="w-2.5 h-2.5" />}
                            value={targetLang}
                            auto={autoDetectLang}
                            allowAuto
                            accent
                            onPick={({ auto, code }) => { langTouchedRef.current = true; setAutoDetectLang(auto); if (code) setTargetLang(code); }}
                          />
                        )}
                        {captureScenario !== 'conversation' && (
                          <>
                            <ArrowRight className="w-3.5 h-3.5 text-ink-faint mt-3 shrink-0" />
                            <LangSelect
                              id="translate-to"
                              label={ageProfile === 'kids' ? 'Ler em' : 'Traduzir para'}
                              value={captureScenario === 'media' ? sourceLang : targetLang}
                              onPick={({ code }) => {
                                if (!code) return;
                                langTouchedRef.current = true;
                                if (captureScenario === 'media') setSourceLang(code); else setTargetLang(code);
                              }}
                            />
                          </>
                        )}
                      </div>
                      {/* RESUMO HUMANO da direção — o fluxo fica óbvio sem jargão (público leigo). */}
                      <p className="text-[9px] text-ink-faint md:text-right leading-tight">
                        {/* C13 — o automático agora DIZ o que descobriu. Antes prometia "é
                            detectado sozinho" e nunca mostrava o resultado: numa sessão inteira
                            em português, a tela seguia anunciando o idioma configurado enquanto
                            o sistema já sabia a resposta há 40 falas. */}
                        {captureScenario === 'media' && (autoDetectLang
                          ? (idiomaObservado
                            ? <>Detectei <b>{langLabel(idiomaObservado)}</b> no conteúdo ({Math.round(perfilIdiomaRef.current.ler().confianca * 100)}% das falas) — legenda em <b>{langLabel(destinoDaTraducao(idiomaObservado, baseLang(sourceLang), baseLang(targetLang)).destino || sourceLang)}</b>.</>
                            : <>O idioma do conteúdo é detectado sozinho (pode até misturar) e tudo vira legenda em <b>{langLabel(sourceLang)}</b>.</>)
                          : <>Cada fala vira legenda bilíngue em <b>{langLabel(sourceLang)}</b>.</>)}
                        {captureScenario === 'conversation' && (
                          <>
                            {idiomaObservado && autoDetectLang && <>Eles estão falando <b>{langLabel(idiomaObservado)}</b> · </>}
                            Você lê os outros em <b>{langLabel(sourceLang)}</b> · sua fala aparece {autoDetectMyLang ? <>no idioma da conversa (detectado ao vivo)</> : <>em <b>{langLabel(targetLang)}</b></>}.
                          </>
                        )}
                        {captureScenario === 'mic' && (autoDetectMyLang
                          ? <>Sua fala é detectada em qualquer idioma e traduzida para <b>{langLabel(targetLang)}</b>.</>
                          : <>Sua fala vira texto em <b>{langLabel(sourceLang)}</b> com tradução em <b>{langLabel(targetLang)}</b>.</>)}
                      </p>
                      {/* Limite honesto: a Web Speech (motor padrão do mic) não detecta idioma. */}
                      {autoDetectMyLang && captureScenario !== 'media' && micEngine === 'browser' && (
                        <p className="text-[9px] text-warn-ink md:text-right leading-tight">
                          ⚠ No microfone, a detecção automática exige o motor Whisper (ajustes avançados) — no motor navegador vale o idioma escolhido.
                        </p>
                      )}
                      {/* Cobertura REAL do par (única tela do app que avisa sobre isso). 'online' =
                          funciona, mas depende de rede; 'unknown' = não há motor nenhum para o par —
                          um aviso bem diferente, porque nem com internet vai traduzir. */}
                      {!autoDetectLang && (() => {
                        const coverage = mtCoverage(sourceLang, targetLang);
                        if (coverage === 'online') {
                          return (
                            <p className="text-[9px] text-warn-ink md:text-right leading-tight">
                              ⚠ {langLabel(sourceLang)}↔{langLabel(targetLang)} exige internet (o tradutor local cobre só ↔ inglês).
                            </p>
                          );
                        }
                        if (coverage === 'unknown') {
                          return (
                            <p className="text-[9px] text-warn-ink md:text-right leading-tight">
                              ⚠ Não há tradutor para {langLabel(sourceLang)}↔{langLabel(targetLang)} — as falas serão transcritas, mas ficarão sem tradução.
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Microcopy contextual do cenário — orienta o próximo passo em uma linha. */}
                  {!isRecording && (
                    <p className="text-[10px] text-ink-faint leading-tight">
                      {captureScenario === 'media' && 'Dê o play no vídeo/áudio em qualquer app e clique em Iniciar — a legenda bilíngue aparece aqui e nas Legendas flutuantes.'}
                      {captureScenario === 'conversation' && 'Captura você (microfone) e os outros (som do computador) ao mesmo tempo. Cada voz é identificada e ganha cor própria; cada lado é traduzido na direção certa.'}
                      {captureScenario === 'mic' && 'Fale ao microfone — sua fala vira texto e tradução na hora. Bom para praticar antes de uma reunião.'}
                    </p>
                  )}

                  {/* Linha 4 — WAVEFORM REAL: as barras seguem o nível de áudio efetivamente capturado
                      (sonda RMS), não uma animação decorativa. */}
                  {isRecording && (
                    <div className="pointer-events-none h-10 flex items-end justify-center gap-[3px] bg-canvas/40 border border-border-subtle/40 rounded-xl p-2 select-none">
                      {levels.map((lvl, i) => {
                        const h = Math.max(5, Math.min(100, lvl * 120));
                        return (
                          <div
                            key={i}
                            className="w-[3.5px] bg-accent rounded-full"
                            style={{ height: `${h}%`, opacity: 0.3 + lvl * 0.7, transition: 'height 70ms linear' }}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* Linha 5 — preparo dos modelos locais (progresso transitório; não é configuração) */}
                  {modelPrep && <ModelPrepPanel state={modelPrep} onRetry={prepareModels} compact />}
                </div>

                {/* ══════════════ TRANSCRIÇÃO AO VIVO ══════════════ */}
                <div className="bg-surface border border-border-subtle rounded-2xl p-6 shadow-card flex flex-col flex-1 min-h-0">

                {/* Inline Visual Settings Panel */}
                {showVisualSettings && (
                  <TranscriptVisualSettings idPrefix="cap-visual" dense tsSettings={tsSettings} updateSetting={updateSetting} />
                )}

                {/* Fluxo da transcrição — acompanha o fim sozinho; botão volta à fala atual */}
                <div className="relative flex-1 min-h-[44vh] flex flex-col">
                {showJumpTranscript && (
                  <button
                    onClick={() => jumpToCurrent('transcript')}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-accent text-white text-[11px] font-bold px-3.5 py-1.5 rounded-full shadow-xl hover:scale-[1.03] transition-transform cursor-pointer animate-in fade-in slide-in-from-bottom-2"
                  >
                    <ArrowDown className="w-3.5 h-3.5" /> Ir para a fala atual
                  </button>
                )}
                <div ref={transcriptScrollRef} onScroll={handleTranscriptScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
                  {/* Primeiro contato: o download do modelo (dezenas de MB) acontecia atrás do painel de
                      ajustes — a tela dizia "Ouvindo…" por minutos sem explicar nada. Aqui, onde a pessoa olha. */}
                  {isRecording && modelPrep && !modelPrep.done && (
                    <div className="mb-3"><ModelPrepPanel state={modelPrep} onRetry={prepareModels} /></div>
                  )}
                  <ChatTranscript
                    segments={speechSegments}
                    speakers={speakerProfiles}
                    scenario={captureScenario}
                    tsSettings={tsSettings}
                    ageProfile={ageProfile}
                    sourceLang={sourceLang}
                    targetLang={targetLang}
                    observedLang={idiomaObservado}
                    isRecording={isRecording}
                    dense
                    selectedWord={selectedExamWord?.word ?? null}
                    addedWords={addedWords}
                    onExamineWord={(w, lang, frase) => void examineWord(w, lang, frase)}
                    onSpeakWord={speakWord}
                  />
                </div>
                </div>

                {/* Simulador de fala — FERRAMENTA DE DEV/TESTE, não de usuário final. Só aparece
                    com localStorage['babel.devTools']='1' (o harness __simSystem segue sempre
                    disponível no console p/ a bateria de regressão MCP). */}
                {devToolsEnabled && (
                  <form onSubmit={handleAddManualSpeechSegment} className="mt-2 flex gap-2 border-t border-border-subtle pt-2">
                    <input
                      type="text"
                      id="sim-speaker-text"
                      name="simSpeakerText"
                      placeholder="Simular fala do orador... (dev)"
                      className="flex-1 bg-canvas border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-ink focus:outline-none focus:border-accent placeholder-ink-faint font-medium"
                      value={manualSpeakerInput}
                      onChange={(e) => setManualSpeakerInput(e.target.value)}
                      disabled={isProcessingManualInput}
                    />
                    <button
                      type="submit"
                      disabled={isProcessingManualInput || !manualSpeakerInput.trim()}
                      className="py-2.5 px-4 bg-accent hover:bg-accent-ink disabled:opacity-50 text-white text-[11px] font-bold rounded-xl shadow-btn transition-transform hover:scale-[1.01] cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {isProcessingManualInput ? 'Traduzindo...' : 'Simular'}
                    </button>
                  </form>
                )}

              </div>

              </div>
              </EditablePanel>
            )}

          {/* BINGO DA ESCUTA — só quando ligado; recebe as falas já transcritas. */}
          {showBingo && (
            <div className="mb-4">
              <BingoPanel
                falas={speechSegments.filter(x => x.originalText.trim()).map(x => x.originalText)}
                ageProfile={ageProfile}
                onClose={() => setShowBingo(false)}
              />
            </div>
          )}

          {/* FALANTES — identificação AUTOMÁTICA de voz (WeSpeaker local, beta) + correção
              manual. Cada voz nova do som do computador vira "Pessoa N" com cor própria; o
              usuário renomeia com um clique. Só no cenário CONVERSA (nos outros há um falante
              por lado — era ruído). */}
          {captureScenario === 'conversation' && (
          <EditablePanel
            viewKey="capture"
            panelKey="diarization"
            title="Falantes"
            canResizeWidth={false}
            canResizeHeight={false}
            defaultHeight={0} // auto height
          >
            <section className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="shrink-0">
                  <span className="text-xs font-bold tracking-wider text-ink-muted uppercase flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent" /> Falantes
                    {/* Toggle da identificação automática — persiste; desligado = só manual. */}
                    <button
                      onClick={() => { setSpeakerAutoId(v => !v); if (speakerAutoId) setSpeakerIdStatus('off'); }}
                      aria-pressed={speakerAutoId}
                      title={speakerAutoId ? 'Desativar a identificação automática de voz' : 'Ativar a identificação automática de voz'}
                      className={`normal-case tracking-normal text-[9px] font-bold px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
                        speakerAutoId ? 'bg-accent-soft border-accent/40 text-accent-ink' : 'bg-canvas border-border-subtle text-ink-faint hover:text-ink'
                      }`}
                    >
                      {speakerAutoId ? 'Auto: ligado' : 'Auto: desligado'}
                    </button>
                  </span>
                  <p className="text-[10px] text-ink-faint leading-tight mt-0.5 max-w-[280px]">
                    {!speakerAutoId && 'Atribuição manual: clique num nome antes de falar para etiquetar as próximas falas.'}
                    {speakerAutoId && speakerIdStatus === 'loading' && 'Carregando o identificador de vozes (6,7MB, uma vez)… as falas são etiquetadas assim que ele ficar pronto.'}
                    {speakerAutoId && speakerIdStatus === 'ready' && 'Cada voz do som do computador vira uma pessoa com cor própria (beta). Clique no lápis para dar nome; vozes parecidas podem se fundir.'}
                    {speakerAutoId && speakerIdStatus === 'unavailable' && 'O identificador de vozes não carregou (sem internet no 1º uso?) — atribuição manual nesta sessão.'}
                    {speakerAutoId && speakerIdStatus === 'off' && 'Ao iniciar a captura, cada voz do som do computador vira uma pessoa com cor própria (beta). O % é o tempo de fala real.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {speakerProfiles.map((speaker) => (
                    <div 
                      key={speaker.id} 
                      onClick={() => {
                        if (editingSpeakerId !== speaker.id) {
                          handleSelectActiveSpeaker(speaker.id);
                        }
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-all ${
                        speaker.isActive 
                          ? 'bg-accent/10 border-accent text-accent shadow-sm scale-[1.02]' 
                          : 'bg-canvas border-border-subtle hover:bg-surface-hover text-ink-muted'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${speaker.isActive ? 'animate-pulse' : ''}`} style={{ backgroundColor: speaker.color }}></span>
                      
                      {editingSpeakerId === speaker.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="text" 
                            value={editingSpeakerName} 
                            onChange={(e) => setEditingSpeakerName(e.target.value)}
                            className="bg-surface text-ink text-xs font-bold px-2 py-0.5 rounded border border-accent outline-none w-24"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSpeakerName(speaker.id);
                              if (e.key === 'Escape') setEditingSpeakerId(null);
                            }}
                            autoFocus
                          />
                          <button 
                            onClick={() => handleSaveSpeakerName(speaker.id)}
                            className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded font-bold hover:bg-accent-ink"
                            title="Confirmar"
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span>{speaker.name}</span>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleStartRenameSpeaker(speaker.id, speaker.name); 
                            }}
                            className="p-0.5 hover:bg-black/10 rounded text-ink-muted hover:text-accent transition-colors"
                            title="Clique para definir o nome"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {talkTimePct?.[speaker.id] != null && (
                        <span className="text-[10px] font-mono opacity-80 bg-black/5 px-1.5 py-0.5 rounded-full">{talkTimePct[speaker.id]}%</span>
                      )}
                    </div>
                  ))}

                  {/* Dynamic Add Speaker trigger */}
                  <button 
                    onClick={handleAddSpeaker}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-border-subtle bg-canvas hover:bg-surface-hover text-ink-muted hover:text-accent text-xs font-bold transition-all cursor-pointer"
                    title="Adicionar novo falante detectado"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Falante</span>
                  </button>
                </div>
              </div>
            </section>
          </EditablePanel>
          )}


          </div>

        </div>

        {/* ============================================== */}
        {/* COLUNA DIREITA: ANALISTA DE VOCABULÁRIO        */}
        {/* ============================================== */}
        {/* Painel COMPARTILHADO (o mesmo de Análise/Leitura/Estudo/Métricas). Fica OCULTO até o
            usuário clicar numa palavra do transcript — sem palavra, o componente nem monta. */}
        <VocabularyPanel
          viewKey="capture"
          word={selectedExamWord}
          onClose={() => setSelectedExamWord(null)}
          onSpeak={speakWord}
          onAddToDeck={handleAddWordToDeck}
          isAdded={!!selectedExamWord && addedWords.includes(selectedExamWord.word)}
          ttsSpeed={ttsSpeed}
          setTtsSpeed={setTtsSpeed}
          // Sem navegação → sem botões de praticar (nada de botão morto).
          onPractice={onChangeView ? handlePracticeWord : undefined}
        />

      </div>

      {showGuide && <GuidePanel onClose={() => setShowGuide(false)} />}

      {/* FIXED FOCUS FULLSCREEN OVERLAY */}
      {isFocusMode && (
        <div className="fixed inset-0 bg-canvas z-50 flex flex-col p-6 md:p-10 animate-in fade-in duration-200 overflow-hidden">
          {/* Focus Mode Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-4 mb-6 shrink-0 gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-3.5 w-3.5 relative">
                {isRecording && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${isRecording ? 'bg-accent' : 'bg-ink-faint'}`}></span>
              </span>
              <div>
                <h1 className="font-display font-extrabold text-lg md:text-xl text-ink tracking-tight flex items-center gap-2">
                  <span>Modo Focado: Tradução & Transcrição</span>
                </h1>
                <p className="text-xs text-ink-muted mt-0.5">Foco total no diálogo em andamento e nas traduções simultâneas</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Quick Settings toggler inside Focus mode */}
              <button 
                onClick={() => setShowVisualSettings(!showVisualSettings)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  showVisualSettings ? 'bg-surface border-accent text-accent' : 'border-border-subtle bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" /> Ajustar Visual
              </button>

              <button 
                onClick={() => setIsFocusMode(false)}
                className="flex items-center gap-1.5 py-2 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-xs shadow-btn transition-all hover:scale-105 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" /> Sair do Modo Foco
              </button>
            </div>
          </div>

          {/* Quick Settings render inside Focus mode */}
          {showVisualSettings && (
            <TranscriptVisualSettings idPrefix="focus-visual" dense={false} tsSettings={tsSettings} updateSetting={updateSetting} />
          )}

          {/* Large Chat log panel focusing on transcription & translation */}
          <div className="flex-1 bg-surface border border-border-subtle rounded-2xl p-6 md:p-10 shadow-card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4 mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-bold text-ink tracking-widest bg-canvas border border-border-subtle px-3 py-1.5 rounded-xl">
                  {isRecording ? formatTime(timer) : '00:00'}
                </span>
                <span className="text-xs text-ink-muted font-bold uppercase tracking-wider">Tempo Decorrido</span>
              </div>

              {/* Focus mode languages indicator */}
              <div className="flex items-center gap-2">
                <span className="badge-tag ok">{langLabel(sourceLang)}</span>
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint" />
                <span className="badge-tag border border-accent/20 bg-accent-soft text-accent-ink font-bold">{langLabel(targetLang)}</span>
              </div>
            </div>

            {/* Chat List — acompanha o fim sozinho; botão volta à fala atual */}
            <div className="relative flex-1 min-h-0 flex flex-col">
            {showJumpFocus && (
              <button
                onClick={() => jumpToCurrent('focus')}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-accent text-white text-[12px] font-bold px-4 py-2 rounded-full shadow-xl hover:scale-[1.03] transition-transform cursor-pointer animate-in fade-in slide-in-from-bottom-2"
              >
                <ArrowDown className="w-4 h-4" /> Ir para a fala atual
              </button>
            )}
            <div ref={focusScrollRef} onScroll={handleFocusScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-4">
              {/* Primeiro contato: o download do modelo (dezenas de MB) acontecia atrás do painel de
                  ajustes — a tela dizia "Ouvindo…" por minutos sem explicar nada. Aqui, onde a pessoa olha. */}
              {isRecording && modelPrep && !modelPrep.done && (
                <div className="mb-3"><ModelPrepPanel state={modelPrep} onRetry={prepareModels} /></div>
              )}
              <ChatTranscript
                segments={speechSegments}
                speakers={speakerProfiles}
                scenario={captureScenario}
                tsSettings={tsSettings}
                ageProfile={ageProfile}
                sourceLang={sourceLang}
                targetLang={targetLang}
                    observedLang={idiomaObservado}
                isRecording={isRecording}
                dense={false}
                selectedWord={selectedExamWord?.word ?? null}
                addedWords={addedWords}
                onExamineWord={(w, lang, frase) => {
                  void examineWord(w, lang, frase);
                  setFeedbackMsg(`Examinando: "${w.word}"`);
                  setTimeout(() => setFeedbackMsg(''), 1500);
                }}
                onSpeakWord={speakWord}
              />
            </div>
            </div>

            {/* Simulated Voice Controller at the bottom of Focus screen */}
            <div className="border-t border-border-subtle pt-6 mt-6 flex justify-between items-center shrink-0">
              <div className="text-xs text-ink-muted font-bold uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping"></span>
                Status: {isRecording ? 'Gravação Ativa' : 'Pronto para Gravar'}
              </div>
              
              <div className="flex gap-4">
                {isRecording ? (
                  <button 
                    onClick={handleStopRecording}
                          data-sfx="none"
                    className="flex items-center gap-2 py-3 px-6 bg-error-soft text-error-ink border border-error/40 hover:brightness-105 rounded-xl font-bold text-xs shadow-btn transition-all hover:scale-[1.03] cursor-pointer"
                  >
                    <StopCircle className="w-4 h-4" /> Parar & Salvar Gravação
                  </button>
                ) : (
                  <button
                    onClick={handleStartOrResume}
                    className="flex items-center gap-2 py-3 px-6 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-xs shadow-btn transition-all hover:scale-[1.03] cursor-pointer"
                  >
                    <Mic className="w-4 h-4" /> {resumeId ? 'Continuar Gravando' : 'Iniciar Transcrição Ativa'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- SAIR NO MEIO DA CAPTURA: confirma antes de perder o que já foi transcrito --- */}
      {pendingNav && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[90] p-4 animate-in fade-in duration-150">
          <div className="bg-surface border border-border-subtle p-6 max-w-md w-full rounded-3xl shadow-card text-ink space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-warn-soft flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-warn-ink" />
              </span>
              <div>
                <h3 className="font-display font-extrabold text-[16px]">
                  {isRecording ? 'A gravação está em andamento' : 'Você tem falas não salvas'}
                </h3>
                <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed">
                  {isRecording
                    ? `Você está gravando há ${formatTime(timer)}${speechSegments.length ? ` e já temos ${speechSegments.length} fala(s)` : ''}. Se sair agora, isso se perde.`
                    : `Há ${speechSegments.length} fala(s) capturada(s) que ainda não foram salvas na Biblioteca.`}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => { setPendingNav(null); if (isRecording) void handleStopRecording(); else setShowSaveModal(true); }}
                className="w-full py-2.5 px-4 bg-accent hover:bg-accent-ink text-white rounded-xl font-bold text-[13px] shadow-btn transition-all cursor-pointer"
              >
                {isRecording ? 'Parar e salvar a sessão' : 'Salvar na Biblioteca'}
              </button>
              <button
                onClick={() => setPendingNav(null)}
                className="w-full py-2.5 px-4 bg-canvas border border-border-subtle hover:bg-surface-hover text-ink rounded-xl font-bold text-[13px] transition-all cursor-pointer"
              >
                {isRecording ? 'Continuar gravando' : 'Continuar aqui'}
              </button>
              <button
                onClick={() => void descartarESair()}
                className="w-full py-2 px-4 text-error-ink hover:bg-error-soft/40 rounded-xl font-bold text-[12px] transition-all cursor-pointer"
              >
                Sair e descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE ENCERRAMENTO DA SESSÃO --- */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border-subtle p-6 max-w-lg w-full flex flex-col space-y-5 animate-in zoom-in-95 duration-200 rounded-3xl shadow-card text-ink max-h-[92vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-extrabold text-[17px] text-ink">Opções de Encerramento da Sessão</h3>
                <p className="text-xs text-ink-muted mt-1">
                  {resumeId
                    ? 'Sessão retomada — ao salvar, ela é atualizada no mesmo item da biblioteca.'
                    : 'Sua gravação foi interrompida. Configure os metadados antes de salvar na biblioteca.'}
                </p>
              </div>
              <button onClick={handleCancelStop} className="text-ink-muted hover:text-ink p-1 rounded-lg hover:bg-surface-hover cursor-pointer" title="Continuar gravando (Esc)">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Título da sessão */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">Título da Sessão</label>
              <input
                type="text"
                value={customSessionTitle}
                onChange={e => setCustomSessionTitle(e.target.value)}
                placeholder="Insira um título para a sessão..."
                className="w-full px-3 py-2 bg-canvas text-xs border border-border-subtle rounded-xl outline-none text-ink font-medium focus:border-accent"
              />
            </div>

            {/* Capa da sessão — prévia */}
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-border-subtle bg-ink/5 flex items-center justify-center">
              {customSessionImage ? (
                <img src={customSessionImage} className="w-full h-full object-cover" alt="Prévia da capa" />
              ) : (
                <span className="text-[12px] text-ink-muted flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Sem capa (ícone padrão)</span>
              )}
            </div>

            {/* Buscar capa (Openverse, keyless) — mesmo bloco da Biblioteca, em `BuscaDeCapa`. */}
            <BuscaDeCapa
              query={imgQuery}
              onQueryChange={setImgQuery}
              onBuscar={searchCovers}
              carregando={imgLoading}
              resultados={imgResults}
              selecionada={customSessionImage}
              onSelecionar={setCustomSessionImage}
            />

            {/* URL manual + upload + colar */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">Ou cole a URL de uma imagem</label>
              <input
                type="text"
                value={customSessionImage}
                onChange={e => setCustomSessionImage(e.target.value)}
                placeholder="https://... ou data:image/..."
                className="w-full px-3 py-2 bg-canvas text-xs border border-border-subtle rounded-xl outline-none text-ink font-medium focus:border-accent"
              />
              <input type="file" ref={coverFileRef} onChange={handleCoverUpload} accept="image/*" className="hidden" />
              <div className="flex items-center justify-between text-[10px] text-ink-muted px-1">
                <button
                  type="button"
                  onClick={() => coverFileRef.current?.click()}
                  className="text-accent hover:underline font-semibold cursor-pointer border-none bg-transparent p-0"
                >
                  Selecionar imagem local...
                </button>
                <span>Ou cole uma imagem com Ctrl+V</span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <button
                onClick={handleCancelStop}
                className="py-2 px-4 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-border-subtle bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink rounded-xl cursor-pointer"
              >
                Continuar Gravando
              </button>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <button
                  onClick={() => handleFinalizeSave(false)}
                  className="py-2 px-4 text-xs font-bold transition-all border border-border-subtle bg-surface hover:bg-surface-hover text-ink rounded-xl cursor-pointer"
                >
                  Salvar & Continuar na Tela
                </button>
                <button
                  onClick={() => handleFinalizeSave(true)}
                  className="py-2.5 px-5 text-xs font-bold transition-all flex items-center justify-center bg-accent hover:bg-accent-ink text-white rounded-xl shadow-btn cursor-pointer"
                >
                  Salvar & Ir para Análise
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Relay de legendas ao vivo — alimentado pelas falas REAIS capturadas.
          "Eles" = última fala do áudio do sistema/aba; "Você" = última fala do microfone.
          Sem fala ainda → props null → o Overlay mostra o estado vazio honesto. */}
      {(() => {
        const overlayEl = (
          <Overlay
            isVisible={showOverlay}
            onClose={() => setShowOverlay(false)}
            bgColor={overlayBgColor}
            onBgColorChange={setOverlayBgColor}
            captions={overlayCaptions}
            myLang={sourceLang}
            theirLang={targetLang}
            onSpeak={speakText}
          />
        );

        // Janela flutuante sempre-no-topo (Chromium). Sem suporte → overlay embutido.
        return isDocumentPiPSupported() ? (
          <DocumentPiP
            isVisible={showOverlay}
            onClose={() => setShowOverlay(false)}
            backgroundColor={overlayBgColor}
            // Sem estes, valiam os 520×340 padrão — e o painel de personalização (288px) comia
            // mais da metade da largura, deixando a legenda espremida enquanto se ajustava.
            width={760}
            height={440}
          >
            {overlayEl}
          </DocumentPiP>
        ) : overlayEl;
      })()}
    </div>
  );
}
