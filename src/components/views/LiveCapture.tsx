import {
  Activity, 
  AlertCircle, 
  ArrowDown,
  ArrowRight, 
  Check, 
  ChevronDown,
  Cpu, 
  Edit2,
  Eye,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  Layout, 
  LayoutGrid,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Monitor, 
  Plus, 
  RefreshCw, 
  Settings2, 
  Sliders,
  Sparkles,
  StopCircle, 
  Users,
  X} from 'lucide-react';
import React, { useEffect, useMemo,useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  fetchSessionTranscript,
fetchSettings, type ImageResult,
patchUiSettings,   searchImages, } from '../../data/api';
import { buildGateway } from '../../gateway';
import { getActiveProfile, getProviderMode } from '../../gateway/activeProfile';
import type { SttSession } from '../../gateway/capabilities';
import { capMetrics } from '../../gateway/capture/captureMetrics';
import { type AudioCapture, probeLoopback, probeServerLoopback, probeSystemAudio, serverLoopbackSupported, type SystemAudioProbe } from '../../gateway/capture/systemAudio';
import { getSttQuality, setSttQualityMirror, type SttQuality } from '../../gateway/sttRouter';
import { type AudioDevice,filterLoopbackDevices, listDevices, onDeviceChange, supportsSinkId } from '../../lib/audioDevices';
// Fontes de áudio: som do sistema/aba, microfone (Whisper ou Web Speech) e o mudo/ativo do mic.
import { criarFontesDeAudio } from '../../lib/captura/fontesDeAudio';
// Vocabulário dentro da captura: examinar a palavra, fichar no deck, mandar praticar.
import { criarPalavraDaFala } from '../../lib/captura/palavraDaFala';
// Pipeline de fala: VAD → STT → diarização → emissão, e a preparação dos modelos locais.
import { criarPipelineDeFala, type EnunciadoPendente } from '../../lib/captura/pipelineDeFala';
// Ciclo da sessão: começar, retomar, parar e salvar (falas, áudio e vocabulário).
import { criarSalvarSessao, type EstadoDaIdentificacaoDeVoz } from '../../lib/captura/salvarSessao';
// Tipos e helpers de fala + o logger da captura (`lib/captura/tiposDaFala.ts`).
import {
type CaptureScenario,
  clog, formatTime, SPEAKER_COLORS, type SpeakerProfile,   type SpeechSegment, UNKNOWN_VOICE_COLOR,
USER_COLOR, wordsFromText, } from '../../lib/captura/tiposDaFala';
// Relógio da sessão + pipeline de MT (retradução de degradados incluída).
import { criarRelogioDaSessao, criarTraducaoDaFala } from '../../lib/captura/traducaoDaFala';
import { cenarioDasFontes } from '../../lib/cenarioDeCaptura';
import { DominantLangTracker } from '../../lib/convoLang';
// Configuração de idioma: fonte ÚNICA (`mine` = o que VOCÊ fala no mic; `studying` = o que você
// ESTUDA, o áudio estrangeiro). Antes os defaults nasciam aqui, em `useState`.
import { DEFAULT_LANG_CONFIG, fetchLangConfig, type LangConfig,onLangConfigChange, saveLangConfig } from '../../lib/langConfig';
import { langShortLabel } from '../../lib/langFlag';
import { baseLang, langLabel, mtCoverage, toBcp47 } from '../../lib/languages';
import { setNavGuard } from '../../lib/navGuard';
import { OrdemDasTraducoes } from '../../lib/ordemDaTraducao';
import { destinoDaTraducao,PerfilAdaptativoDeIdioma } from '../../lib/perfilDeIdioma';
import { usePosicaoFlutuante } from '../../lib/posicaoFlutuante';
import { coreOnly } from '../../lib/profile';
import { play } from '../../lib/soundFx';
// Identificação automática de voz (diarização leve): embedding WeSpeaker por enunciado
// (worker WASM, 6,7MB) + agrupamento online → "Pessoa 1/2/3" com cor própria.
import { SpeakerClusterer } from '../../lib/speakerCluster';
import { disposeSpeakerId } from '../../lib/speakerId';
import { DEFAULT_TRANSCRIPT_SETTINGS,TranscriptSettings } from '../../lib/transcriptUtils';
// Produtor ÚNICO de palavra/cartão: o idioma vem da FRASE de onde a palavra saiu e a direção da
// tradução é decidida pelo idioma DA PALAVRA (não pelo par da sessão).
import { speak as ttsSpeak } from '../../lib/tts';
// Cenário conversa sem fone: a caixa de som entra pelo mic — detecta e descarta.
import { type Intervalo } from '../../lib/vazamento';
import { Recording, type VocabWord } from '../../types';
import BuscaDeCapa from '../BuscaDeCapa';
// A conversa em balões (lados opostos, agrupamento por pessoa, estado vazio que ensina).
// Um componente só serve a tela embutida E o Modo Foco — antes eram dois blocos que divergiam.
import ChatTranscript from '../ChatTranscript';
import DocumentPiP, { isDocumentPiPSupported } from '../DocumentPiP';
import EditablePanel from '../EditablePanel';
import GuidePanel from '../GuidePanel';
// Bandeira SVG do idioma (nunca emoji: o Windows renderiza 🇧🇷 como "BR") + o rótulo curto.
import { LangFlag } from '../LangFlag';
import BingoPanel from '../minigames/BingoPanel';
import ModelPrepPanel, { type ModelPrepState } from '../ModelPrepPanel';
import Overlay, { OverlayCaption } from '../Overlay';
import { toast } from '../Toast';
import VocabularyPanel from '../VocabularyPanel';
import LangSelect from './captura/LangSelect';
import SetaDoPar from './captura/SetaDoPar';
// Subcomponentes locais da captura (um arquivo por componente, em `views/captura/`).
import TranscriptVisualSettings from './captura/TranscriptVisualSettings';

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
  /** Guia pós-erro do compartilhamento ('JANELA_SEM_AUDIO' | 'SEM_AUDIO_COMPARTILHADO'). */
  const [guiaDeAudio, setGuiaDeAudio] = useState<string | null>(null);
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
  const [speakerIdStatus, setSpeakerIdStatus] = useState<EstadoDaIdentificacaoDeVoz>('off');
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
  /**
   * PERFIL DO MICROFONE — o mic nunca alimentava o perfil acima (que é do SISTEMA), então o app
   * jamais aprendia que "eu falo" estava configurado errado. Este ouve só a sua voz; ao
   * convergir num idioma diferente do configurado, AVISA uma vez (não troca sozinho).
   */
  const perfilMicRef = useRef(new PerfilAdaptativoDeIdioma());
  const avisoIdiomaMicRef = useRef(false);
  /** Janelas de fala do SISTEMA (fechadas) e as em curso — base do detector de vazamento. */
  const sysFalasRef = useRef<Intervalo[]>([]);
  const sysAbertasRef = useRef<Map<number, number>>(new Map());
  /** Início (ms) de cada enunciado do MIC, por seq. */
  const micInicioRef = useRef<Map<number, number>>(new Map());
  const avisoVazamentoRef = useRef(false);

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
  // Espelho para os handlers assíncronos lerem as últimas falas (contexto da tradução comunicativa).
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  useEffect(() => { speechSegmentsRef.current = speechSegments; }, [speechSegments]);

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
  /** Ligou o mic no meio da sessão e o navegador ainda está perguntando pela permissão. */
  const [micAbrindo, setMicAbrindo] = useState(false);

  /* A GAVETA DE IDIOMAS. O par virou um chip; os seletores e a explicação da direção moram
     atrás dele — antes ocupavam três linhas permanentes de uma tela cujo único gesto é gravar.
     `fixed` com coordenadas medidas, e não `absolute`: a raiz do app é `overflow-hidden` e o
     painel seria recortado (mesmo motivo documentado em shell/MenuDeConforto). */
  const [idiomasAbertos, setIdiomasAbertos] = useState(false);
  const gatilhoIdiomas = useRef<HTMLButtonElement | null>(null);
  const painelIdiomas = useRef<HTMLDivElement | null>(null);
  /* A conta de ONDE abrir é do `usePosicaoFlutuante` — o mesmo hook do LangPicker e do menu da
     Biblioteca. Escrevi essa conta à mão primeiro e o painel saiu pela borda da tela: ele tenta
     alinhar pela direita, cai para a esquerda se não couber, e só então encosta na margem, além
     de recalcular em rolagem e redimensionamento. Duas telas já pagaram para descobrir isso. */
  const caixaIdiomas = usePosicaoFlutuante(idiomasAbertos, gatilhoIdiomas, {
    largura: 320,
    alturaEstimada: 220,
  });
  /* O Foco Cheio cobre a tela normal, mas a gaveta vive num PORTAL no `body` — ela sobreviveria
     por cima do Foco, ancorada num chip que ninguém mais vê. Fecha junto. */
  useEffect(() => { if (isFocusMode) setIdiomasAbertos(false); }, [isFocusMode]);
  useEffect(() => {
    if (!idiomasAbertos) return;
    /* `[data-lang-ui]` cobre a lista do LangPicker, que abre num portal no `body`: sem isso,
       escolher um idioma seria lido como clique fora e fecharia a gaveta no meio da escolha. */
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (painelIdiomas.current?.contains(alvo) || gatilhoIdiomas.current?.contains(alvo)) return;
      if (alvo instanceof Element && alvo.closest('[data-lang-ui]')) return;
      setIdiomasAbertos(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIdiomasAbertos(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [idiomasAbertos]);
  /**
   * O SOM DO COMPUTADOR ENTRA SEMPRE — deixou de ser estado porque deixou de ser escolha.
   *
   * Continua existindo como variável, e não como `true` espalhado pelo arquivo, porque os
   * caminhos de ERRO dependem dela: quando a captura do sistema falha (a pessoa fecha a caixa de
   * compartilhamento), é `systemEnabled` que decide se a sessão morre ou segue só com o microfone.
   * Anotado como `boolean` de propósito: sem isso o TypeScript estreita para o literal `true` e
   * passa a tratar esses ramos de erro como inalcançáveis.
   */
  const systemEnabled: boolean = true;
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
  // FONTES; os idiomas escolhidos permanecem. (O tipo vive em `lib/captura/tiposDaFala.ts`.)
  const [captureScenario, setCaptureScenario] = useState<CaptureScenario>('media');
  // Espelho p/ os handlers assíncronos (a identificação de voz só roda no cenário Conversa).
  const captureScenarioRef = useRef<CaptureScenario>('media');
  useEffect(() => { captureScenarioRef.current = captureScenario; }, [captureScenario]);
  /** Escolha de IDIOMA feita antes de a carga assíncrona chegar não pode ser desfeita por ela. */
  const langTouchedRef = useRef(false);
  /*
   * O CENÁRIO NÃO É MAIS RESTAURADO DA VISITA ANTERIOR — e `applyScenario` foi embora com ele.
   *
   * Enquanto o cenário decidia as fontes, guardá-lo fazia sentido. Agora o som do computador
   * entra SEMPRE e o microfone é um mudo/ativo alternável durante a sessão: o cenário virou
   * consequência de um interruptor, não uma preferência.
   *
   * E restaurá-lo seria pior que inútil. Um `'conversation'` salvo religaria o microfone na
   * abertura da tela, sem nenhum gesto da pessoa — a gravação começaria captando o barulho da
   * casa porque numa terça-feira alguém praticou pronúncia. Toda sessão começa MUDA; falar custa
   * um clique, e é um clique deliberado.
   */

  /**
   * A ÚNICA FONTE QUE A PESSOA ESCOLHE é o microfone: o som do computador entra sempre, então
   * `systemEnabled` não tem mais quem o desligue, e o cenário continua sendo a consequência
   * das fontes (`cenarioDeCaptura.ts`), não uma escolha à parte.
   *
   * Aqui só a PREFERÊNCIA muda. Abrir a captura, mutar a faixa e cuidar do motor navegador é
   * trabalho de `alternarMicrofone`, que chama isto e segue adiante quando há sessão no ar.
   */
  const marcarMicrofone = (ligado: boolean) => {
    setMicEnabled(ligado);
    setCaptureScenario(cenarioDasFontes(ligado, systemEnabled));
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
      setFeedbackMsg('Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) foi encontrado, mudei para "Som do computador", que não precisa de configuração.');
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
  const langConfigRef = useRef<Pick<LangConfig, 'mine' | 'studying'>>({ mine: sourceLang, studying: targetLang });

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
      // `ui.captureScenario` NÃO é restaurado: toda sessão começa com o microfone mudo.
      // O porquê está no bloco de comentário sobre o cenário, junto de `marcarMicrofone`.
      /* Esta linha estava DUPLICADA, caractere por caractere. Sem efeito visível — atribuir o mesmo
         valor duas vezes é idempotente, mas quem lesse depois ficaria procurando a diferença. */
      if (ui.sttQuality === 'auto' || ui.sttQuality === 'fast' || ui.sttQuality === 'accurate' || ui.sttQuality === 'cloud') { setSttQuality(ui.sttQuality); setSttQualityMirror(ui.sttQuality); }
      settingsLoadedRef.current = true;
    })();
    /* Deps VAZIAS de propósito: isto carrega os ajustes salvos UMA vez, na montagem. */
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

  // ── Ancoragem do relógio ao recorder (alinha LEGENDA × ÁUDIO na página da sessão) ──
  // O relógio zera no CLIQUE em START, mas o MediaRecorder do áudio salvo só começa depois (após a
  // caixa de compartilhamento do getDisplayMedia). Esse GAP variável fazia a legenda descolar. Aqui
  // re-ancoramos sessionStartMsRef ao t=0 REAL do recorder quando a captura fica ativa.
  const shouldAnchorClockRef = useRef<boolean>(false); // só em sessão NOVA (retomada mantém o recuo)
  const micStartedAtRef = useRef<number>(0);           // t=0 do recorder do mic (fallback se o sistema falhar)

  // Tradução DESACOPLADA, deduplicada e com cache — nunca bloqueia a exibição do texto.
  // Compartilhada pelas DUAS fontes (mic Web Speech + sistema Whisper). Espelha o LRU do desktop.
  // Aviso único por sessão quando a tradução degrada (nunca silencioso).
  const mtFailNotifiedRef = useRef(false);

  /** Avisa UMA vez por sessão que o destino da tradução foi redirecionado (ver traducaoDaFala). */
  const altTargetNotifiedRef = useRef(false);

  /**
   * Um balão recebe várias traduções (uma por parcial + a do final) e todas escrevem no MESMO
   * lugar. Sem ordenação, a resposta atrasada de um parcial sobrescrevia a tradução do final —
   * o texto pela metade ficava na tela porque nada mais escreve ali depois.
   */
  const ordemMtRef = useRef(new OrdemDasTraducoes());

  /** Aviso único de sessão: a nuvem que o plano promete caiu e a tradução voltou ao motor local. */
  const degradacaoAvisadaRef = useRef(false);

  /* O RELÓGIO e o PIPELINE DE MT vivem em `lib/captura/traducaoDaFala.ts`. As fábricas são
     chamadas a cada render, como as closures que substituíram — nada de useMemo aqui, senão
     elas congelariam `systemEnabled`/setters de um render antigo. */
  const { nowRel, anchorSessionClock } = criarRelogioDaSessao({
    sessionStartMsRef, shouldAnchorClockRef, systemEnabled,
  });
  const { translateSegment, retraduzirDegradados } = criarTraducaoDaFala({
    gateway, ordemMtRef, sourceLangRef, targetLangRef, idiomaObservadoRef, perfilIdiomaRef,
    speechSegmentsRef, translationCacheRef, mtFailNotifiedRef, altTargetNotifiedRef,
    degradacaoAvisadaRef, setSpeechSegments, setFeedbackMsg,
  });

  // Enunciados que chegaram ENQUANTO o modelo carregava — transcritos no flush (nada se perde).
  const pendingUtterancesRef = useRef<EnunciadoPendente[]>([]);
  // ANTI-ECO: seqs cuja fala começou enquanto o TTS do app tocava (é o nosso áudio voltando).
  const suppressedSeqsRef = useRef<Set<number>>(new Set());

  /* O PIPELINE DE FALA (VAD → STT → diarização → emissão) e a preparação dos modelos moram em
     `lib/captura/pipelineDeFala.ts`. A fábrica roda a cada render, como as closures que
     substituiu: os handlers precisam do `micEnabled`/`micEngine` do render corrente. */
  const { sysHandlers, micHandlers, prepareModels } = criarPipelineDeFala({
    gateway,
    sourceLang, sourceLangRef, targetLangRef, autoDetectLangRef, autoDetectMyLangRef,
    idiomaObservadoRef, captureScenarioRef, perfModeRef, micEnabled, micEngine,
    timerRef, nowRel,
    setSpeechSegments, seqToSegmentRef, lastPartialTextRef, pendingUtterancesRef,
    suppressedSeqsRef, modelReadyRef, prepareEmVooRef,
    speakerProfilesRef, setSpeakerProfiles, speakerAutoIdRef, clustererRef,
    lastVoiceIdRef, provisionalUttsRef, ensureVoiceProfile,
    dominantLangRef, perfilIdiomaRef, perfilMicRef, avisoIdiomaMicRef, setIdiomaObservado,
    sysFalasRef, sysAbertasRef, micInicioRef, avisoVazamentoRef,
    translateSegment, retraduzirDegradados,
    setFeedbackMsg, setModelPrep, setSttRouteLabel,
  });

  /* AS FONTES DE ÁUDIO (sistema/aba, microfone, medidor e o interruptor do mic) moram em
     `lib/captura/fontesDeAudio.ts`. Fábrica por render, como as closures que substituiu: elas
     leem `micEnabled`/`micEngine`/`systemEnabled` do render corrente nos caminhos de erro. */
  const { handleStartSystemCapture, startMic, alternarMicrofone } = criarFontesDeAudio({
    sysHandlers, micHandlers, prepareModels,
    systemSourceRef, loopbackDeviceIdRef, inputDeviceIdRef,
    systemCaptureRef, micCaptureRef, webSpeechRef, webSpeechPartialIdRef, meterRef,
    isRecordingRef, micStartedAtRef, timerRef,
    sourceLang, sourceLangRef, targetLangRef,
    micEnabled, systemEnabled, micEngine, webSpeechSupported,
    pushLevel, nowRel, anchorSessionClock, translateSegment,
    marcarMicrofone, setSpeechSegments, setFeedbackMsg, setIsFocusMode, setGuiaDeAudio,
    setModelPrep, setIsRecording, setMicAbrindo,
  });

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
      clog('__simSystem concluído, window.__capSummary():', capMetrics.summary());
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

  /* O CICLO DA SESSÃO — começar, retomar, parar e SALVAR — mora em `lib/captura/salvarSessao.ts`.
     Fábrica por render, como as closures que substituiu: `handleStartRecording` e
     `handleFinalizeSave` leem `timer`, `speechSegments` e o par de idiomas do render corrente. */
  const {
    handleStartOrResume, handleExitResume,
    handleStopRecording, handleCancelStop, handleFinalizeSave,
  } = criarSalvarSessao({
    gateway, onSave, recordings,
    speechSegments, timer, sourceLang, targetLang, micEnabled, systemEnabled, micEngine,
    captureScenario, speakerAutoId, resumeId, customSessionTitle, customSessionImage,
    startMic, handleStartSystemCapture,
    systemCaptureRef, micCaptureRef, webSpeechRef, webSpeechPartialIdRef, meterRef,
    recordedAudioRef,
    isRecordingRef, sessionStartMsRef, shouldAnchorClockRef, micStartedAtRef, partialIdRef,
    seqToSegmentRef, lastPartialTextRef, ordemMtRef,
    clustererRef, dominantLangRef, perfilIdiomaRef, altTargetNotifiedRef, lastVoiceIdRef,
    provisionalUttsRef, speakerProfilesRef,
    setIsRecording, setIsFocusMode, setTimer, setSpeechSegments, setIdiomaObservado,
    setSpeakerIdStatus, setModelPrep, setResumeId, setShowSaveModal, setCustomSessionTitle,
    setCustomSessionImage, setImgQuery, setImgResults, setFeedbackMsg,
  });

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
          words: wordsFromText(u.sourceText ?? '', u.sourceLang ?? (u.source === 'system' ? targetLang : sourceLang)),
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
    /* `sourceLang` e `targetLang` ficam FORA das dependências, e não por esquecimento.
    
       Este efeito RETOMA uma gravação: ele lê o par de idiomas para rotular as falas que vêm sem
       idioma próprio, e logo abaixo ESCREVE o par com o que veio da sessão. Incluí-los faria o
       efeito disparar de novo por causa da própria escrita — recarregando a transcrição inteira a
       cada troca de idioma, inclusive a que ele mesmo acabou de fazer. O gatilho certo é um só:
       qual gravação se está retomando. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  /* REMOVIDO — modo "Visão OCR" (Tesseract.js). O painel saiu em 2026-07-24, por decisão do
     usuário, quando ficou INALCANÇÁVEL: nenhum botão o abria. O comentário que ficou aqui dizia
     que o motor (`src/gateway/ocr.ts`) continuava no repositório "para esse futuro uso", e que a
     intenção estava especificada em `openspec/changes/vision-ocr-web`.
     
     Essa change NUNCA EXISTIU — nem aberta nem arquivada. Em 07/09 o motor saiu junto com a
     dependência `tesseract.js`: 128 linhas e 1,7 MB guardados por um futuro que ninguém escreveu.
     Quando o OCR voltar, ele volta com a mudança que o define, e com a biblioteca da época. */

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
          words: wordsFromText(inputText, sourceLang),
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

  /** Palavras já fichadas nesta visita (o botão do Analista fica "adicionado"). */
  const [addedWords, setAddedWords] = useState<string[]>([]);

  /* O VOCABULÁRIO DA CAPTURA (examinar, fichar no deck, mandar praticar) mora em
     `lib/captura/palavraDaFala.ts`. Fábrica por render, como as closures que substituiu. */
  const { examineWord, handleAddWordToDeck, handlePracticeWord } = criarPalavraDaFala({
    gateway, langConfigRef, targetLangRef, selectedWordLangRef, speakWord,
    setSelectedExamWord, addedWords, setAddedWords, setFeedbackMsg, onChangeView,
  });

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

  /* OS SELETORES DE IDIOMA, UMA VEZ SÓ. Antes viviam só na tela normal; o Foco Cheio
     mostrava o par como rótulo fixo e trocar o idioma exigia sair do foco (pedido do dono,
     2026-08-27). A mesma árvore serve às duas telas, então não há como divergirem. */
  /* `p` prefixa os ids: a tela normal continua montada sob o Foco, e dois `#their-lang` na
     mesma página fariam o `label` apontar para o errado. */
  /**
   * `empilhado` é a forma da GAVETA, e ela não é a mesma da barra.
   *
   * A linha (`flex-wrap md:justify-end`) foi desenhada para a barra larga, onde os dois campos e a
   * seta cabem lado a lado. Dentro da gaveta — que tem a largura do chip — ela quebrava, e o
   * resultado era medido: o primeiro campo com 240px e o segundo com 165px, bordas esquerdas em
   * 572 e 671 (escada), 186px de vazio à esquerda da segunda linha, e a SETA órfã no fim da
   * primeira, apontando para a margem em vez de para o campo seguinte.
   *
   * Empilhado, os campos ocupam a largura toda (`block`), começam na mesma borda e a seta gira
   * para baixo — continua dizendo "daqui para ali", que é a única coisa que ela precisa dizer.
   */
  const seletoresDeIdioma = (p = '', empilhado = false) => (
    <div className={empilhado ? 'flex flex-col items-stretch gap-1.5' : 'flex items-center gap-1.5 flex-wrap md:justify-end'}>
      {captureScenario !== 'media' && (
        <LangSelect
          id={p + 'my-lang'}
          label={captureScenario === 'mic' ? 'Falo em' : 'Eu falo'}
          icon={<Mic className="w-2.5 h-2.5" />}
          value={sourceLang}
          auto={autoDetectMyLang}
          allowAuto
          block={empilhado}
          onPick={({ auto, code }) => { langTouchedRef.current = true; setAutoDetectMyLang(auto); if (code) setSourceLang(code); }}
        />
      )}
      {captureScenario === 'conversation' && <SetaDoPar empilhado={empilhado} />}
      {captureScenario !== 'mic' && (
        <LangSelect
          id={p + 'their-lang'}
          label={captureScenario === 'media'
            ? (ageProfile === 'kids' ? 'Língua do vídeo/jogo' : 'Idioma do conteúdo')
            : 'Eles falam'}
          icon={<Headphones className="w-2.5 h-2.5" />}
          value={targetLang}
          auto={autoDetectLang}
          allowAuto
          accent
          block={empilhado}
          onPick={({ auto, code }) => { langTouchedRef.current = true; setAutoDetectLang(auto); if (code) setTargetLang(code); }}
        />
      )}
      {captureScenario !== 'conversation' && (
        <>
          <SetaDoPar empilhado={empilhado} />
          <LangSelect
            id={p + 'translate-to'}
            label={ageProfile === 'kids' ? 'Ler em' : 'Traduzir para'}
            value={captureScenario === 'media' ? sourceLang : targetLang}
            block={empilhado}
            onPick={({ code }) => {
              if (!code) return;
              langTouchedRef.current = true;
              if (captureScenario === 'media') setSourceLang(code); else setTargetLang(code);
            }}
          />
        </>
      )}
    </div>
  );

  /* O RESUMO HUMANO da direção da tradução — o fluxo sem jargão, para público leigo.
     Vive numa função porque agora tem DUAS casas: a gaveta de idiomas do Espaço de Gravação
     (onde a pessoa edita o par) e o Foco Cheio. Duplicá-lo faria as duas telas divergirem. */
  const resumoDaDirecao = () => (
    <>
      {/* C13 — o automático agora DIZ o que descobriu. Antes prometia "é detectado sozinho"
          e nunca mostrava o resultado: numa sessão inteira em português, a tela seguia
          anunciando o idioma configurado enquanto o sistema já sabia a resposta há 40 falas. */}
      {captureScenario === 'media' && (autoDetectLang
        ? (idiomaObservado
          ? <>Detectei <b>{langLabel(idiomaObservado)}</b> no conteúdo ({Math.round(perfilIdiomaRef.current.ler().confianca * 100)}% das falas), legenda em <b>{langLabel(destinoDaTraducao(idiomaObservado, baseLang(sourceLang), baseLang(targetLang)).destino || sourceLang)}</b>.</>
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
    </>
  );

  /**
   * O INTERRUPTOR DO MICROFONE — UMA implementação, duas telas.
   *
   * O Foco Cheio precisa dele tanto quanto a tela normal, e por um motivo concreto:
   * `handleStartRecording` manda a pessoa para o Foco no instante em que a gravação começa.
   * É lá que ela passa a sessão inteira. Um controle que só existisse na tela normal seria um
   * controle que some exatamente quando passa a ser útil — e "ligar o microfone durante a
   * sessão" é a razão de o botão existir.
   *
   * Mesma árvore nas duas casas, como em `seletoresDeIdioma`: é o que impede de divergirem.
   */
  const botaoDoMicrofone = (variante: 'tela' | 'foco' = 'tela') => {
    const iconeCls = variante === 'foco' ? 'w-4 h-4' : 'w-5 h-5';
    return (
      <button
        onClick={() => alternarMicrofone(!micEnabled)}
        role="switch"
        aria-checked={micEnabled}
        disabled={micAbrindo}
        title={micEnabled
          ? 'Sua fala está entrando na gravação. Clique para mutar.'
          : 'Sua fala está fora da gravação. Clique para entrar — vale a qualquer momento, inclusive gravando.'}
        className={`flex items-center gap-2 rounded-xl transition-all cursor-pointer shrink-0 disabled:cursor-wait ${
          variante === 'foco'
            ? 'py-3 px-6 text-xs font-bold border'
            : 'py-3 px-5 text-xs md:text-sm font-extrabold border-2 min-h-[48px]'
        } ${
          micEnabled
            ? 'bg-accent-soft border-accent text-accent-ink shadow-btn'
            : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink hover:border-ink-faint'
        }`}
      >
        {micAbrindo
          ? <Loader2 className={`${iconeCls} animate-spin`} />
          : micEnabled ? <Mic className={iconeCls} /> : <MicOff className={iconeCls} />}
        {/* O estado é dito por ESCRITO, não só pela cor: o app tem 7 temas e o ícone sozinho
            (mic vs mic cortado) já falhou em teste de leitura. */}
        {micAbrindo
          ? 'Pedindo permissão…'
          : ageProfile === 'kids'
            ? (micEnabled ? 'Minha voz entra' : 'Minha voz fora')
            : (micEnabled ? 'Microfone ativo' : 'Microfone mudo')}
      </button>
    );
  };

  /**
   * AS LEGENDAS FLUTUANTES, UMA VEZ SÓ — mesma razão de `botaoDoMicrofone` logo acima.
   *
   * Eram dois botões escritos à mão em telas diferentes, e já tinham divergido: rótulo de ativo
   * diferente, um explicando o limite do PiP no `title` e o outro não, e cores de estado que não
   * batiam. Uma árvore, duas variantes.
   *
   * O botão PULSA quando a gravação está rolando e as legendas estão desligadas: é o único
   * momento em que ele tem algo a dizer, e é o recurso que faz o app servir por cima de um jogo
   * ou de uma chamada.
   */
  const botaoDasLegendas = (variante: 'tela' | 'foco' = 'tela') => {
    const foco = variante === 'foco';
    return (
      <button
        onClick={() => setShowOverlay(!showOverlay)}
        aria-pressed={showOverlay}
        title={isDocumentPiPSupported()
          ? 'Legendas ao vivo numa janela flutuante sempre-no-topo (por cima de jogo/vídeo/chamada)'
          : 'Janela flutuante requer Chrome/Edge; aqui o overlay abre embutido na tela'}
        className={`flex items-center gap-2 rounded-xl transition-all cursor-pointer shrink-0 ${
          foco ? 'py-3 px-6 text-xs font-bold border' : 'py-3 px-5 text-xs md:text-sm font-extrabold border-2 min-h-[48px]'
        } ${
          showOverlay
            ? 'bg-good text-white border-good shadow-btn'
            : isRecording
              ? 'bg-warn text-white border-warn shadow-btn animate-pulse'
              : 'bg-warn-soft text-warn-ink border-warn hover:brightness-105'
        }`}
      >
        <Layout className={foco ? 'w-4 h-4' : 'w-5 h-5'} />
        {showOverlay ? (foco ? 'Flutuantes ativas' : 'Legendas flutuantes ativas') : 'Legendas flutuantes'}
      </button>
    );
  };

  /* O PAR DE IDIOMAS COMO O CHIP O RESUME — leitura, nunca edição.
     Espelha os mesmos rótulos de `seletoresDeIdioma`, que continua sendo o único lugar que
     ESCREVE o par (ele é o recheio da gaveta). Em 'media' o idioma do conteúdo é `targetLang`
     e a legenda sai em `sourceLang`; em conversa é "eu falo" → "eles falam". */
  const parResumido = captureScenario === 'media'
    ? { auto: autoDetectLang, de: targetLang, para: sourceLang }
    : { auto: autoDetectMyLang, de: sourceLang, para: targetLang };

  /* IDIOMAS IGUAIS = CARTÃO SEM VERSO (spec entrega-honesta). O chip precisa avisar mesmo
     fechado: é aqui que a palavra é fichada, e o caderno enchia de palavras sem tradução. */
  const mesmoIdioma = baseLang(sourceLang) === baseLang(targetLang);

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
           aqui as cores eram fixas em rgba(0,0,0,…), invisíveis no escuro, e a regra
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
          de gravação, onde o usuário realmente trabalha. --- */}
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
            title={`Detalhe técnico, sistema: Whisper local · microfone: ${micEngine === 'browser' ? 'Web Speech (rede)' : 'Whisper local'} · perfil de IA: ${activeProfileName}`}
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
              continua o transcript e a duração, salvar não cria uma nova sessão
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
                Estes controles ficavam TODOS empilhados na tela de captura, antes do botão Iniciar,
                era o maior gargalo de onboarding. Agora moram aqui: quem quer só gravar não os vê;
                quem precisa ajustar (Discord/jogos, Stereo Mix, motor do mic) abre esta gaveta. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

              {/* ÁUDIO DO SISTEMA — como capturar (a decisão que realmente importa) */}
              <div className="space-y-2 bg-canvas border border-border-subtle rounded-xl p-3.5">
                <label className="text-[10px] text-ink-muted font-bold uppercase tracking-wider flex items-center gap-1">
                  <Monitor className="w-3 h-3 text-accent" /> Áudio do Sistema, como capturar
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
                      title="O servidor local captura o mix do Windows (WASAPI loopback) e envia ao app. ZERO setup e ZERO permissão de navegador, capta o sistema INTEIRO (Discord/jogos/qualquer app)."
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
                    title="Captura um dispositivo de loopback (Stereo Mix / VB-Cable) como microfone. À prova de falhas, capta o sistema INTEIRO (Discord/jogos). Requer setup único."
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
                      <p>O <b className="text-ink">servidor local</b> captura tudo que o computador toca (WASAPI loopback) e envia ao app, <b className="text-ink">sem popup de compartilhamento e sem configurar dispositivo</b>. Capta o sistema inteiro: Discord, jogos, players, chamadas.</p>
                      <p className="text-ink-faint">Esta rota escuta a <b>saída padrão</b> do Windows. Para capturar uma saída específica, defina-a como padrão no Windows (Som → Saída), ou use <b>Compartilhar aba</b> (só uma aba) / <b>Dispositivo de loopback</b> (escolhe o dispositivo abaixo).</p>
                      <p className="text-ink-faint">Disponível porque o app está rodando com o servidor local no Windows. O áudio não sai da sua máquina.</p>
                    </>
                  ) : systemSource === 'display' ? (
                    <>
                      <p><b className="text-ink">Aba</b> (YouTube, chamada web): escolha a <b className="text-ink">aba</b> e marque <b className="text-ink">"áudio da aba"</b>, caminho confiável.</p>
                      <p><b className="text-ink">Tela inteira</b> (Discord/jogo): marque <b className="text-ink">"Compartilhar o áudio do sistema"</b>. No Windows isso às vezes falha (NotReadableError), nesse caso use <b className="text-ink">Dispositivo de loopback</b>.</p>
                      <p className="text-ink-faint">"Janela" não tem áudio no Chrome. O áudio do sistema vem INTEIRO (mixado), não dá para isolar um app.</p>
                    </>
                  ) : (
                    <>
                      <p>Capta o <b className="text-ink">sistema inteiro</b> (Discord, jogos, qualquer app) como se fosse um microfone, sem o erro de compartilhamento de tela.</p>
                      {!loopbackDetected && (
                        <p className="text-warn-ink font-bold">Nenhum dispositivo de loopback detectado, siga um dos dois caminhos abaixo.</p>
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
                        <div className="space-y-1.5 pt-1 ps-4 border-s-2 border-border-subtle">
                          <p><b className="text-ink">A, Stereo Mix:</b> Som → aba <b className="text-ink">Gravação</b> → botão direito → <b className="text-ink">"Mostrar dispositivos desabilitados"</b> → ative <b className="text-ink">"Mixagem estéreo"</b> e selecione-a acima.</p>
                          <p><b className="text-ink">B, VB-Audio Cable:</b> instale de <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer" className="text-accent underline">vb-audio.com/Cable</a>, defina <b className="text-ink">"CABLE Input"</b> como saída do Windows (ative "Escutar este dispositivo" p/ continuar ouvindo) e selecione <b className="text-ink">"CABLE Output"</b> acima.</p>
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
                        {probe.verdict === 'ok' && '✓ Áudio do sistema OK, sinal detectado!'}
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
                  <Mic className="w-3 h-3 text-accent" /> Microfone, motor e dispositivo
                </label>

                <div className="flex items-center gap-1 bg-surface border border-border-subtle rounded-lg p-0.5 text-[10px] w-fit">
                  <button
                    onClick={() => setMicEngine('browser')}
                    disabled={!webSpeechSupported}
                    title="Web Speech API do navegador, leve, instantânea, ótima p/ português. Usa o mic padrão do Windows e requer internet."
                    className={`px-2.5 py-1 rounded-md font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${micEngine === 'browser' ? 'bg-accent text-white shadow-btn' : 'text-ink-muted hover:text-ink'}`}
                  >
                    Navegador (rápido)
                  </button>
                  <button
                    onClick={() => setMicEngine('whisper')}
                    title="Whisper local, offline e permite escolher o dispositivo de entrada, porém mais pesado."
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
                          setFeedbackMsg('Permissão do microfone negada, os nomes dos dispositivos ficam ocultos.');
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
                  <p className="text-[9px] text-ink-faint leading-tight">Para ESCOLHER o dispositivo do microfone, troque o motor para Whisper (acima), a Web Speech usa sempre o padrão do Windows.</p>
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
                  chegava a lugar nenhum, a escolha real de adapter vem do perfil. */}
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
                  <option value="auto">Automática (recomendado), escolhe o melhor motor pelo idioma</option>
                  <option value="fast">Rápida, modelo leve local (menos precisa fora do inglês)</option>
                  <option value="accurate">Precisa, melhor modelo local (download maior, mais pesada)</option>
                  <option value="cloud">Nuvem, máxima qualidade via servidor (requer chave; usa rede)</option>
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
                  <span className="text-ink-muted">, a legenda aparece só no fim de cada frase, sem o refino em tempo real. Reduz muito o uso de GPU/CPU enquanto você joga ou roda apps pesados.</span>
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
        <div className="flex-1 flex flex-col lg:overflow-y-auto custom-scrollbar border-b lg:border-b-0 lg:border-e border-border-subtle p-4 lg:p-6 space-y-6">
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
                    dobra), toggles, sub-toggles, guia de setup, botão "Testar" e só então o CTA. Era o
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
                      {/* O Relay ("Legendas flutuantes") mudou de casa: é o botão de destaque ao
                          lado do Iniciar/Parar — funcionalidade essencial não mora em atalho pequeno. */}
                      <button
                        onClick={() => setIsFocusMode(true)}
                        className="p-1.5 px-2 bg-canvas border border-border-subtle rounded-xl text-ink hover:text-accent hover:border-accent transition-all flex items-center gap-1 font-bold text-[11px] cursor-pointer"
                        title="Expandir para o modo focado em tela cheia"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>Foco Cheio</span>
                      </button>

                      {/* BINGO — transforma assistir em jogo sem atrapalhar a captura. */}
                      <button
                        onClick={() => setShowBingo(v => !v)}
                        aria-pressed={showBingo}
                        title="Cartela de palavras que acende quando você as ouve"
                        className={`p-1.5 px-2 border rounded-xl transition-all flex items-center gap-1 font-bold text-[11px] cursor-pointer ${
                          showBingo ? 'bg-accent border-accent text-white shadow-btn' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink hover:border-accent'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Bingo</span>
                      </button>

                      {/* O botão "Visual" saiu daqui: eram três botões disputando a mesma linha, e
                          o ajuste de fontes/tamanhos da transcrição pertence ao mesmo lugar que os
                          outros ajustes. Virou uma seção do modal de configurações, mesmo
                          componente (`TranscriptVisualSettings`), nenhum recurso perdido. */}
                    </div>
                  </div>

                  {/* Linha 3 — CTA + timer (esquerda) · idiomas (direita) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
                    <div className="flex flex-wrap items-center gap-3 md:col-span-2">
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

                      {/* O MICROFONE — a única fonte que a pessoa escolhe, e o único controle que
                          vale ANTES e DURANTE a sessão. Vive ao lado do gesto principal justamente
                          porque é um gesto de mesma ordem: no meio de uma aula dá vontade de repetir
                          a frase em voz alta, e isso não pode exigir parar e recomeçar a gravação.
                          A mecânica (abrir tarde, mutar sem fechar) está em `alternarMicrofone`. */}
                      {botaoDoMicrofone()}

                      {/* LEGENDAS FLUTUANTES — a porta de destaque. É o que permite usar o app por
                          cima de jogo/chamada; por isso vive AQUI, ao lado do gesto principal, com
                          cor própria e pulso quando está gravando sem elas. */}
                      {botaoDasLegendas()}

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
                      {/* O PAR NUM CHIP. Os dois seletores e a explicação da direção ocupavam três
                          linhas fixas da tela — informação que se lê UMA vez e se muda quase nunca,
                          disputando espaço com o único gesto que importa aqui. Agora o chip mostra
                          o par (com bandeira, como no resto do app) e a gaveta guarda a edição.
                          Os AVISOS ficaram de fora dela de propósito: são a parte que a pessoa
                          precisa ver sem clicar em nada. */}
                      <button
                        ref={gatilhoIdiomas}
                        type="button"
                        onClick={() => setIdiomasAbertos(a => !a)}
                        aria-haspopup="dialog"
                        aria-expanded={idiomasAbertos}
                        title="Ver e trocar os idiomas da sessão"
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border bg-canvas cursor-pointer transition-colors min-h-10 ${
                          mesmoIdioma ? 'border-warn' : 'border-border-subtle hover:border-accent'
                        }`}
                      >
                        {/* O aviso não pode depender só da cor da borda (o app tem 7 temas). */}
                        {mesmoIdioma && <span className="w-1.5 h-1.5 rounded-full bg-warn shrink-0" aria-hidden />}
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                          {parResumido.auto
                            ? <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden />
                            : <LangFlag code={parResumido.de} className="w-4 h-3" />}
                          {parResumido.auto ? 'Detectar' : langShortLabel(parResumido.de)}
                        </span>
                        <ArrowRight className="w-3 h-3 text-ink-faint shrink-0" aria-hidden />
                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                          <LangFlag code={parResumido.para} className="w-4 h-3" />
                          {langLabel(parResumido.para)}
                        </span>
                        <ChevronDown className={`w-3.5 h-3.5 text-ink-faint shrink-0 transition-transform ${idiomasAbertos ? 'rotate-180' : ''}`} aria-hidden />
                      </button>

                      {/* Portal no `body`: o card da captura entra com `animate-in`, e um `fixed`
                          sob um ancestral com `transform` passa a ser medido a partir dele — o
                          mesmo conserto já documentado em LangPicker e PopoverFlutuante.
                          z-65 fica ABAIXO do z-70 da lista do LangPicker, senão a lista de idiomas
                          abriria atrás da própria gaveta que a contém. */}
                      {idiomasAbertos && caixaIdiomas && createPortal(
                        <div
                          ref={painelIdiomas}
                          data-lang-ui=""
                          role="dialog"
                          aria-label="Idiomas da sessão"
                          style={{ top: caixaIdiomas.top, left: caixaIdiomas.left, width: caixaIdiomas.largura }}
                          className="fixed z-[65] bg-surface border border-border-subtle rounded-xl shadow-2xl p-3.5 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-150"
                        >
                          <span className="block text-[9px] font-mono font-bold uppercase tracking-wider text-ink-faint">
                            Idiomas da sessão
                          </span>
                          {seletoresDeIdioma('pop-', true)}
                          {/* RESUMO HUMANO da direção — o fluxo fica óbvio sem jargão (público leigo). */}
                          <p className="text-[10px] text-ink-muted leading-snug">{resumoDaDirecao()}</p>
                        </div>,
                        document.body,
                      )}
                      {/* IDIOMAS IGUAIS = CARTÃO SEM VERSO (spec entrega-honesta). Ajustes já avisa
                          quem passa por lá; quem vai direto gravar não via nada, e o caderno enchia
                          de palavras sem tradução — 198 de 201 na conta do dono. O aviso mora aqui
                          porque é aqui que a palavra é fichada. */}
                      {baseLang(sourceLang) === baseLang(targetLang) && (
                        <p className="text-[9px] text-warn-ink md:text-end leading-tight">
                          ⚠ Os dois idiomas são o mesmo: não há o que traduzir, e as palavras fichadas
                          ficam <b>sem verso</b> (não servem para revisar).{' '}
                          <button onClick={() => setShowConfigPanel(true)} className="underline font-bold cursor-pointer">
                            trocar um dos dois
                          </button>
                        </p>
                      )}
                      {/* Limite honesto: a Web Speech (motor padrão do mic) não detecta idioma. */}
                      {autoDetectMyLang && captureScenario !== 'media' && micEngine === 'browser' && (
                        <p className="text-[9px] text-warn-ink md:text-end leading-tight">
                          ⚠ No microfone, a detecção automática exige o motor Whisper (ajustes avançados), no motor navegador vale o idioma escolhido.
                        </p>
                      )}
                      {/* Cobertura REAL do par (única tela do app que avisa sobre isso). 'online' =
                          funciona, mas depende de rede; 'unknown' = não há motor nenhum para o par,
                          um aviso bem diferente, porque nem com internet vai traduzir. */}
                      {!autoDetectLang && (() => {
                        const coverage = mtCoverage(sourceLang, targetLang);
                        if (coverage === 'online') {
                          return (
                            <p className="text-[9px] text-warn-ink md:text-end leading-tight">
                              ⚠ {langLabel(sourceLang)}↔{langLabel(targetLang)} exige internet (o tradutor local cobre só ↔ inglês).
                            </p>
                          );
                        }
                        if (coverage === 'unknown') {
                          return (
                            <p className="text-[9px] text-warn-ink md:text-end leading-tight">
                              ⚠ Não há tradutor para {langLabel(sourceLang)}↔{langLabel(targetLang)}, as falas serão transcritas, mas ficarão sem tradução.
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* UMA linha de orientação, e ela vale GRAVANDO TAMBÉM.
                      Antes só aparecia antes de iniciar — justamente quando o estado era mais fácil
                      de adivinhar. Agora que a fonte muda no meio da sessão, é durante a gravação
                      que a pessoa precisa ler, em palavras, se a própria voz está entrando. */}
                  <p className="text-[10px] text-ink-faint leading-tight">
                    {isRecording
                      ? (micEnabled
                        ? 'Gravando o som do computador e a sua voz. Cada voz é identificada e traduzida na direção certa.'
                        : 'Gravando o som do computador. Sua voz está fora — ligue o microfone quando quiser entrar.')
                      : (micEnabled
                        ? 'O som do computador e a sua voz entram juntos. Dê o play no vídeo, aula ou chamada e clique em Iniciar.'
                        : 'O som do computador entra sozinho. Dê o play no vídeo, aula ou chamada e clique em Iniciar — a legenda bilíngue aparece aqui e nas Legendas flutuantes.')}
                  </p>

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
                            /* scaleY no lugar de animar `height`: mesma leitura visual sem
                               re-layout a cada frame do medidor (ux-v2 §1.13). */
                            style={{ height: '100%', transformOrigin: 'bottom', transform: `scaleY(${h / 100})`, opacity: 0.3 + lvl * 0.7, transition: 'transform 70ms linear' }}
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
                <div ref={transcriptScrollRef} onScroll={handleTranscriptScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pe-2">
                  {/* Primeiro contato: o download do modelo (dezenas de MB) acontecia atrás do painel de
                      ajustes, a tela dizia "Ouvindo…" por minutos sem explicar nada. Aqui, onde a pessoa olha. */}
                  {isRecording && modelPrep && !(modelPrep.done && (modelPrep.mt == null || modelPrep.mt >= 1)) && (
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
              por lado, era ruído). */}
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
                    {speakerAutoId && speakerIdStatus === 'unavailable' && 'O identificador de vozes não carregou (sem internet no 1º uso?), atribuição manual nesta sessão.'}
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
            usuário clicar numa palavra do transcript, sem palavra, o componente nem monta. */}
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
      {/* GUIA DO COMPARTILHAMENTO SEM ÁUDIO — o caminho de volta, não só o aviso. */}
      {guiaDeAudio && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-label="Como compartilhar com áudio">
          <div className="card-panel bg-surface w-full max-w-md p-6">
            <h2 className="font-display font-extrabold text-lg text-ink mb-2">
              {guiaDeAudio === 'JANELA_SEM_AUDIO' ? 'Janela não tem áudio no navegador' : 'Faltou marcar o áudio'}
            </h2>
            <div className="text-[13.5px] text-ink-muted leading-relaxed space-y-2">
              {guiaDeAudio === 'JANELA_SEM_AUDIO' ? (
                <>
                  <p>O Chrome não entrega o áudio de uma JANELA (limitação da plataforma, não do Babel). Para jogos e apps fora do navegador:</p>
                  <ol className="list-decimal ms-5 space-y-1">
                    <li>Clique em <b className="text-ink">Escolher de novo</b>;</li>
                    <li>Na janela de seleção, escolha a aba <b className="text-ink">Tela inteira</b>;</li>
                    <li>Marque <b className="text-ink">"Também compartilhar o áudio do sistema"</b> (canto inferior).</li>
                  </ol>
                </>
              ) : (
                <>
                  <p>Você compartilhou, mas sem áudio. Repita a escolha e:</p>
                  <ol className="list-decimal ms-5 space-y-1">
                    <li>Numa <b className="text-ink">aba</b>: marque "Compartilhar áudio da guia";</li>
                    <li>Na <b className="text-ink">Tela inteira</b>: marque "Também compartilhar o áudio do sistema".</li>
                  </ol>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setGuiaDeAudio(null)} className="px-4 py-2 rounded-xl border border-border-subtle text-[13px] font-bold text-ink-muted hover:text-ink cursor-pointer">Cancelar</button>
              <button
                onClick={() => { setGuiaDeAudio(null); void handleStartSystemCapture(); }}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
              >
                Escolher de novo
              </button>
            </div>
          </div>
        </div>
      )}

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

            <div className="flex flex-wrap items-center gap-3">
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
                <Minimize2 className="w-4 h-4" /> Tela normal
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

              {/* Os MESMOS seletores da tela normal: trocar o idioma no Foco Cheio sem sair dele. */}
              <div className="flex items-center gap-2">
                {seletoresDeIdioma('foco-')}
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
            <div ref={focusScrollRef} onScroll={handleFocusScroll} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pe-4">
              {/* Primeiro contato: o download do modelo (dezenas de MB) acontecia atrás do painel de
                  ajustes, a tela dizia "Ouvindo…" por minutos sem explicar nada. Aqui, onde a pessoa olha. */}
              {isRecording && modelPrep && !(modelPrep.done && (modelPrep.mt == null || modelPrep.mt >= 1)) && (
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
              
              <div className="flex flex-wrap items-center gap-3">
                {/* OS DOIS INTERRUPTORES DE SESSÃO VEM ANTES DO PARAR/INICIAR: mutar a própria voz e
                    ligar as legendas por cima do jogo são gestos que se REPETEM durante a sessão;
                    parar acontece uma vez, no fim.

                    As legendas flutuantes moravam lá em cima, no cabeçalho do Foco, a uma tela de
                    distância dos outros dois controles da mesma sessão — e são elas que fazem o app
                    servir por cima de um jogo ou de uma chamada, que é o motivo de o Foco existir. */}
                {botaoDoMicrofone('foco')}
                {botaoDasLegendas('foco')}
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
                    ? 'Sessão retomada, ao salvar, ela é atualizada no mesmo item da biblioteca.'
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
