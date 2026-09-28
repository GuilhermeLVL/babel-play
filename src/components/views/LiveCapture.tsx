import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleCheck,
  CircleHelp,
  Cpu,
  Download,
  Eye,
  Gamepad2,
  Headphones,
  Info,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MonitorSpeaker,
  Pencil,
  PictureInPicture2,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Square,
  TriangleAlert,
  Type,
  UserPlus,
  Users,
  VolumeX,
  WandSparkles,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchSessionTranscript, fetchSettings, patchUiSettings } from '../../data/api';
import { buildGateway } from '../../gateway';
import { getActiveProfile, getProviderMode } from '../../gateway/activeProfile';
import { temAdaptadorWebGpu, webGpuProvavel } from '../../gateway/adaptadorWebGpu';
import type { SttSession } from '../../gateway/capabilities';
import { capMetrics } from '../../gateway/capture/captureMetrics';
import {
  type AudioCapture,
  audioDaTelaFalhouNesteAparelho,
  probeLoopback,
  probeServerLoopback,
  probeSystemAudio,
  serverLoopbackSupported,
  type SystemAudioProbe,
} from '../../gateway/capture/systemAudio';
import { expectedModelIds } from '../../gateway/modelCache';
import { ContextoDoStt } from '../../gateway/promptDeStt';
import {
  getSttQuality,
  MODEL_DOWNLOAD_MEDIDO,
  nomeLegivelDoModelo,
  routeStt,
  setSttQualityMirror,
  type SttQuality,
  tamanhoDoDownloadMb,
} from '../../gateway/sttRouter';
import {
  type AudioDevice,
  filterLoopbackDevices,
  listDevices,
  onDeviceChange,
  supportsSinkId,
} from '../../lib/audioDevices';
// Fontes de áudio: som do sistema/aba, microfone (Whisper ou Web Speech) e o mudo/ativo do mic.
import {
  type AjudaDoMic,
  ajudaDoMic,
  classificarFalhaDoMic,
  plataformaDoNavegador,
} from '../../lib/captura/ajudaDoMicrofone';
import { abrirContextoDoClique } from '../../lib/captura/contextoDoClique';
import { criarFontesDeAudio } from '../../lib/captura/fontesDeAudio';
import { type PassoDoInicio, planejarInicio, tradutorDepoisDaPrimeiraLegenda } from '../../lib/captura/inicioDaCaptura';
import type { EscolhaDoMic } from '../../lib/captura/motorDoMicrofone';
import { preparoConcluido } from '../../lib/captura/pacotesNativos';
// Vocabulário dentro da captura: examinar a palavra, fichar no deck, mandar praticar.
import { criarPalavraDaFala } from '../../lib/captura/palavraDaFala';
// Pipeline de fala: VAD → STT → diarização → emissão, e a preparação dos modelos locais.
import { criarPipelineDeFala, type EnunciadoPendente } from '../../lib/captura/pipelineDeFala';
import { criarReguladorDaCaptura, type ReguladorDaCaptura } from '../../lib/captura/reguladorDaCaptura';
// Ciclo da sessão: começar, retomar, parar e salvar (falas, áudio e vocabulário).
import { criarSalvarSessao, type EstadoDaIdentificacaoDeVoz } from '../../lib/captura/salvarSessao';
// Tipos e helpers de fala + o logger da captura (`lib/captura/tiposDaFala.ts`).
import {
  type CaptureScenario,
  clog,
  formatTime,
  SPEAKER_COLORS,
  type SpeakerProfile,
  type SpeechSegment,
  UNKNOWN_VOICE_COLOR,
  USER_COLOR,
  wordsFromText,
} from '../../lib/captura/tiposDaFala';
// Relógio da sessão + pipeline de MT (retradução de degradados incluída).
import { criarRelogioDaSessao, criarTraducaoDaFala } from '../../lib/captura/traducaoDaFala';
import { modoDeTraducao, type PedidoSobDemanda } from '../../lib/captura/traducaoSobDemanda';
import { usePalavrasConhecidas } from '../../lib/captura/usePalavrasConhecidas';
import { usePreparoDoInicio } from '../../lib/captura/usePreparoDoInicio';
import { cenarioDasFontes } from '../../lib/cenarioDeCaptura';
import { consentiuNuvem, rapidoDoMicPermitido, useEscolhaDoMic } from '../../lib/consentimentoDeNuvem';
import { DominantLangTracker } from '../../lib/convoLang';
import { classificarDispositivo, dispositivoDaRota, lerSinaisDoDispositivo } from '../../lib/dispositivo/perfil';
import { t } from '../../lib/i18n';
// Configuração de idioma: fonte ÚNICA (`mine` = o que VOCÊ fala no mic; `studying` = o que você
// ESTUDA, o áudio estrangeiro). Antes os defaults nasciam aqui, em `useState`.
import {
  DEFAULT_LANG_CONFIG,
  fetchLangConfig,
  type LangConfig,
  onLangConfigChange,
  saveLangConfig,
} from '../../lib/langConfig';
import { baseLang, langLabel, langLabelNaUI, mtCoverage } from '../../lib/languages';
import { setNavGuard } from '../../lib/navGuard';
import { OrdemDasTraducoes } from '../../lib/ordemDaTraducao';
import { usePalavrasAprendidas } from '../../lib/palavrasAprendidas';
import { destinoDaTraducao, PerfilAdaptativoDeIdioma } from '../../lib/perfilDeIdioma';
import { coreOnly } from '../../lib/profile';
import { play } from '../../lib/soundFx';
// Identificação automática de voz (diarização leve): embedding WeSpeaker por enunciado
// (worker WASM, 6,7MB) + agrupamento online → "Pessoa 1/2/3" com cor própria.
import { SpeakerClusterer } from '../../lib/speakerCluster';
import { disposeSpeakerId } from '../../lib/speakerId';
import { DEFAULT_TRANSCRIPT_SETTINGS, permiteSuperficieEscura, TranscriptSettings } from '../../lib/transcriptUtils';
// Produtor ÚNICO de palavra/cartão: o idioma vem da FRASE de onde a palavra saiu e a direção da
// tradução é decidida pelo idioma DA PALAVRA (não pelo par da sessão).
import { speak as ttsSpeak } from '../../lib/tts';
// Cenário conversa sem fone: a caixa de som entra pelo mic — detecta e descarta.
import { type Intervalo } from '../../lib/vazamento';
import { Recording, type VocabWord } from '../../types';
import AvisoDeNuvemSemConsentimento from '../AvisoDeNuvemSemConsentimento';
// A conversa em balões (lados opostos, agrupamento por pessoa, estado vazio que ensina).
// Um componente só serve a tela embutida E o Modo Foco — antes eram dois blocos que divergiam.
import ChatTranscript from '../ChatTranscript';
import DocumentPiP, { isDocumentPiPSupported } from '../DocumentPiP';
import EditablePanel from '../EditablePanel';
import GuidePanel from '../GuidePanel';
// Bandeira SVG do idioma (nunca emoji: o Windows renderiza 🇧🇷 como "BR") + o rótulo curto.
import { LangFlag } from '../LangFlag';
import ModelPrepPanel, { type ModelPrepState } from '../ModelPrepPanel';
import { toast } from '../Toast';
import { CabecalhoDeTela, Dialogo, fecharDialogoDe } from '../ui';
import VocabularyPanel from '../VocabularyPanel';
import AjudaDoMicrofone from './captura/AjudaDoMicrofone';
// Subcomponentes locais da captura (um arquivo por componente, em `views/captura/`).
import EncerrarSessao from './captura/EncerrarSessao';
import EscolhaDoMicrofone from './captura/EscolhaDoMicrofone';
import IdiomasDaSessao, { type Lado } from './captura/IdiomasDaSessao';
import LegendasFlutuantes, { type LegendaAoVivo } from './captura/LegendasFlutuantes';
import ModeloNoDispositivo, { type ModeloDaCaptura } from './captura/ModeloNoDispositivo';
import TranscriptVisualSettings, { TEMA } from './captura/TranscriptVisualSettings';
import { CampoLinha, Interruptor, Segmentos } from './vocab/Dialogo';

export default function LiveCapture({
  onSave,
  onTranscriptChange,
  resumingRecordingId,
  recordings,
  onChangeView,
  ageProfile = 'pro',
}: {
  onSave: (recording: Recording, shouldRedirect?: boolean) => void;
  onTranscriptChange?: (text: string) => void;
  resumingRecordingId?: string | null;
  recordings?: Recording[];
  /** Navegação entre telas (ex.: "praticar esta frase" a partir da captura ao vivo). */
  onChangeView?: (view: string, data?: any) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
}) {
  const [showOverlay, setShowOverlay] = useState(false);
  /* AVISOS DA TELA pelo toast global do app (o `.toast` do protótipo). A captura tinha um balão
     próprio no topo; as chamadas de "apagar" (`setFeedbackMsg('')`) viram nada. */
  const setFeedbackMsg = useCallback((msg: string) => {
    if (msg) toast.info(msg);
  }, []);
  // Diagnóstico de captura do áudio do sistema (botão "Testar").
  const [probe, setProbe] = useState<SystemAudioProbe | null>(null);
  const [probing, setProbing] = useState(false);
  const handleProbeSystem = async () => {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(
        systemSource === 'server'
          ? await probeServerLoopback()
          : systemSource === 'loopback'
            ? await probeLoopback(loopbackDeviceId || undefined)
            : await probeSystemAudio(),
      );
    } catch (e) {
      // O Windows recusou o áudio da janela/tela: o mesmo guia da captura, com as saídas que funcionam.
      if ((e as Error & { code?: string }).code === 'AUDIO_DA_TELA_INDISPONIVEL')
        setGuiaDeAudio('AUDIO_DA_TELA_INDISPONIVEL');
      else {
        setFeedbackMsg('Teste cancelado/bloqueado: ' + (e as Error).message);
        setTimeout(() => setFeedbackMsg(''), 5000);
      }
    } finally {
      setProbing(false);
      setAudioDaTelaFalhou(audioDaTelaFalhouNesteAparelho());
    }
  };

  // --- MODAL DE ENCERRAMENTO DA SESSÃO ---
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [customSessionTitle, setCustomSessionTitle] = useState('');
  const [customSessionImage, setCustomSessionImage] = useState(''); // capa escolhida (URL ou data URL)
  const [imgQuery, setImgQuery] = useState('');
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
        // Os padrões por baixo: ajuste salvo antes de um campo existir (o `estilo`, na onda 4) não
        // chega vazio à tela.
        return { ...DEFAULT_TRANSCRIPT_SETTINGS, ...JSON.parse(saved) };
      } catch {
        /* leitura opcional: sem ajustes salvos, segue o padrão */
      }
    }
    return DEFAULT_TRANSCRIPT_SETTINGS;
  });
  /**
   * Painel de leitura escuro (o do design). Cede a vez para os presets de leitura escolhidos à
   * mão (Sépia/Oceano/Neon/Alto Contraste), que pintam o próprio fundo claro.
   */
  const transcricaoEscura = permiteSuperficieEscura(tsSettings);

  const updateSetting = <K extends keyof TranscriptSettings>(key: K, value: TranscriptSettings[K]) => {
    setTsSettings((prev) => {
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
          setTsSettings({ ...DEFAULT_TRANSCRIPT_SETTINGS, ...JSON.parse(saved) });
        } catch {
          /* idem: ausência de ajuste não é erro */
        }
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
  /** Guia pós-erro do compartilhamento ('JANELA_SEM_AUDIO' | 'SEM_AUDIO_COMPARTILHADO' |
   *  'AUDIO_DA_TELA_INDISPONIVEL'). */
  const [guiaDeAudio, setGuiaDeAudio] = useState<string | null>(null);
  /** O Windows já recusou o áudio da janela/tela NESTE navegador (lembrado pela captura): a dica da
   *  rota "Compartilhar" passa a recomendar a aba ou o loopback antes do próximo clique. */
  const [audioDaTelaFalhou, setAudioDaTelaFalhou] = useState(audioDaTelaFalhouNesteAparelho);
  useEffect(() => {
    if (guiaDeAudio) setAudioDaTelaFalhou(audioDaTelaFalhouNesteAparelho());
  }, [guiaDeAudio]);
  /** O diálogo "Modelo no dispositivo" (C9), aberto pelo selo do cabeçalho. */
  const [modeloAberto, setModeloAberto] = useState(false);

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
  const webSpeechSupported =
    typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  /* "RÁPIDO" OU "PRIVADO" (`lib/captura/motorDoMicrofone.ts`): sem o reconhecimento no aparelho, a
     primeira abertura do mic pergunta; `startMic` espera a resposta por esta promessa. A resposta
     fica nas preferências (consentimento próprio, com data) e muda no painel de ajustes. */
  const [pedidoDaEscolhaDoMic, setPedidoDaEscolhaDoMic] = useState<((e: EscolhaDoMic | null) => void) | null>(null);
  /** O "Privado" desta pergunta é o reconhecimento do próprio navegador (pacote a instalar)? */
  const [privadoPeloNavegador, setPrivadoPeloNavegador] = useState(false);
  const { escolha: escolhaDoMic, escolher: escolherNoMic } = useEscolhaDoMic();
  const perguntarEscolhaDoMic = ({ pacoteDoNavegador }: { pacoteDoNavegador: boolean }) =>
    new Promise<EscolhaDoMic | null>((responder) => {
      setPrivadoPeloNavegador(pacoteDoNavegador);
      setPedidoDaEscolhaDoMic(() => responder);
    });
  /** Guarda ANTES de responder: o `startMic` que espera já lê a escolha gravada. */
  const trocarEscolhaDoMic = (e: EscolhaDoMic) =>
    void escolherNoMic(e).then((ok) => {
      if (!ok) toast.warn(t('Não consegui registrar a escolha. Verifique a conexão e tente de novo.'));
    });
  const responderEscolhaDoMic = (e: EscolhaDoMic | null) => {
    if (e) trocarEscolhaDoMic(e);
    pedidoDaEscolhaDoMic?.(e);
    setPedidoDaEscolhaDoMic(null);
  };
  // Velocidade do TTS (escutar tradução/palavra). Persistida em settings.ui.
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  // Waveform REAL: histórico de níveis (0..1) que segue o áudio capturado, não animação falsa.
  const [levels, setLevels] = useState<number[]>(() => new Array(48).fill(0));
  const currentLevelRef = useRef(0); // peak-hold do nível instantâneo (as fontes escrevem aqui)
  const meterRef = useRef<{ stop: () => void } | null>(null); // medidor de mic p/ o motor navegador
  const pushLevel = (v: number) => {
    if (v > currentLevelRef.current) currentLevelRef.current = v;
  };
  // Nome do perfil que de fato roda no gateway (Configurações → Perfil de IA).
  const activeProfileName = getActiveProfile().name;
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  /** Gaveta do passo-a-passo de setup (Stereo Mix / VB-Cable). Ver o efeito logo abaixo. */
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  /** Em Kids/Sênior, a escolha de ROTA técnica começa recolhida (`coreOnly`). */
  const [showAdvancedRoutes, setShowAdvancedRoutes] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Rota STT ativa (selo honesto do header) + preferência de qualidade (roteador).
  /* A rota do STT (ex.: "Whisper small · local") — o selo do protótipo mostra o tamanho do modelo, e
     a rota aparece no diálogo "Modelo no dispositivo". */
  const [sttRouteLabel, setSttRouteLabel] = useState('');
  /** O áudio da aba está no reconhecedor do navegador, no aparelho (`webSpeechDoSistema.ts`). */
  const [sistemaNoNavegador, setSistemaNoNavegador] = useState(false);
  const [sttQuality, setSttQuality] = useState<SttQuality>(() => getSttQuality());
  /* Há um ADAPTADOR WebGPU? (não só `navigator.gpu`). Começa com o palpite síncrono e vira a medida
     assim que o navegador responde — o selo e o tamanho do download mudam junto. */
  const [temGpu, setTemGpu] = useState<boolean>(() => webGpuProvavel());
  useEffect(() => {
    let vivo = true;
    void temAdaptadorWebGpu().then((v) => vivo && setTemGpu(v));
    return () => {
      vivo = false;
    };
  }, []);
  /* O PERFIL DO APARELHO (`lib/dispositivo/perfil.ts`): Quest/celular não têm áudio do sistema,
     baixam modelos menores (q8) e liberam a memória ao sair da tela. */
  const perfilDoAparelho = useMemo(() => classificarDispositivo(lerSinaisDoDispositivo(temGpu)), [temGpu]);
  const perfilDoAparelhoRef = useRef(perfilDoAparelho);
  perfilDoAparelhoRef.current = perfilDoAparelho;

  // --- SPEAKER DIARIZATION STATE ---
  // Só os dois falantes REAIS por origem de áudio (você = mic, sistema = aba/loopback). Nada de
  // perfis pré-populados com estatísticas inventadas — % de fala é derivado dos segmentos reais
  // (talkTimePct abaixo) e outros falantes entram via "Adicionar Falante".
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([
    { id: 'user', name: 'Você', color: USER_COLOR, isActive: true },
    { id: 'system', name: 'Outros', color: UNKNOWN_VOICE_COLOR, isActive: false },
  ]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  /** A sessão que acabou de ser salva ficando na tela: o "Abrir a sessão salva" do protótipo. */
  const [sessaoSalva, setSessaoSalva] = useState<{ id: string; palavras: number | null } | null>(null);
  /* O foco do teclado acompanha o Foco cheio (protótipo): entra em "Tela normal", volta a "Foco cheio". */
  const entrarNoFocoRef = useRef<HTMLButtonElement>(null);
  const sairDoFocoRef = useRef<HTMLButtonElement>(null);
  const [editingSpeakerName, setEditingSpeakerName] = useState('');

  const handleAddSpeaker = () => {
    const newId = `speaker_${Date.now()}`;
    const outros = speakerProfiles.filter((p) => p.id !== 'user').length;
    const newSpeaker: SpeakerProfile = {
      id: newId,
      name: `Falante ${outros + 1}`,
      color: SPEAKER_COLORS[speakerProfiles.length % SPEAKER_COLORS.length],
      isActive: false,
    };
    setSpeakerProfiles((prev) => [...prev, newSpeaker]);
  };

  // ── IDENTIFICAÇÃO AUTOMÁTICA DE VOZ (cenário Conversa) ─────────────────────────────
  // Cada enunciado do SISTEMA ganha um embedding de voz (worker WASM) e cai num cluster:
  // cluster N ↔ perfil 'voice_N' ("Pessoa N", cor própria, renomeável no painel Falantes).
  // Best-effort de ponta a ponta: sem modelo (offline/1º uso) a captura segue com "Outros".
  const [speakerAutoId, setSpeakerAutoId] = useState(true);
  const speakerAutoIdRef = useRef(true);
  useEffect(() => {
    speakerAutoIdRef.current = speakerAutoId;
  }, [speakerAutoId]);
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
  useEffect(() => {
    idiomaObservadoRef.current = idiomaObservado;
  }, [idiomaObservado]);
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
    setSpeakerProfiles((prev) =>
      prev.some((p) => p.id === vid)
        ? prev
        : [
            ...prev,
            {
              id: vid,
              name: `Pessoa ${clusterId}`,
              color: SPEAKER_COLORS[(clusterId - 1) % SPEAKER_COLORS.length],
              isActive: false,
            },
          ],
    );
    return vid;
  };

  // --- REAL-TIME VOICE TRANSCRIPTION STREAM ---
  const [isRecording, setIsRecording] = useState(false);
  /** Gravação PAUSADA pelo Parar enquanto o Encerrar está aberto (fontes vivas, relógio parado). */
  const [pausado, setPausado] = useState(false);
  const pausaInicioRef = useRef(0);
  const [timer, setTimer] = useState(0);
  // `sourceLang` ≡ config.mine (o idioma que VOCÊ fala) e `targetLang` ≡ config.studying (o que você
  // ESTUDA). Os valores iniciais vêm de `langConfig.ts` — este arquivo não é mais o dono do padrão de
  // idioma da app; a config real é carregada logo abaixo (fetchLangConfig) e gravada com saveLangConfig.
  const [sourceLang, setSourceLang] = useState(DEFAULT_LANG_CONFIG.mine);
  const [targetLang, setTargetLang] = useState(DEFAULT_LANG_CONFIG.studying);
  const [manualSpeakerInput, setManualSpeakerInput] = useState('');
  // Ferramentas de dev (simulador de fala na UI): opt-in por localStorage, fora da UI normal.
  const devToolsEnabled = useMemo(() => {
    try {
      return localStorage.getItem('babel.devTools') === '1';
    } catch {
      return false;
    }
  }, []);
  const [isProcessingManualInput, setIsProcessingManualInput] = useState(false);

  // Segmentos de fala capturados AO VIVO (começa vazio; sem simulação).
  const [speechSegments, setSpeechSegments] = useState<SpeechSegment[]>([]);
  // Espelho para os handlers assíncronos lerem as últimas falas (contexto da tradução comunicativa).
  const speechSegmentsRef = useRef<SpeechSegment[]>([]);
  useEffect(() => {
    speechSegmentsRef.current = speechSegments;
  }, [speechSegments]);

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

  // As falas das LEGENDAS FLUTUANTES, derivadas das falas REAIS (sem parciais vazios). 'system' =
  // eles (áudio da aba/sistema), o resto = você (microfone).
  const legendasAoVivo: LegendaAoVivo[] = useMemo(() => {
    const nomeDe = (id: string) => speakerProfiles.find((p) => p.id === id)?.name ?? id;
    return speechSegments
      .filter((s) => s.originalText && s.originalText.trim())
      .slice(-2)
      .map((s) => ({
        id: s.id,
        quem: nomeDe(s.speakerId),
        original: s.originalText,
        // O "…" é o marcador de tradução a caminho: na legenda, some até a tradução chegar.
        traducao: s.translatedText === '…' ? '' : s.translatedText,
        lado: s.source === 'system' ? ('eles' as const) : ('voce' as const),
      }));
  }, [speechSegments, speakerProfiles]);

  // Dispositivos de loopback candidatos (Stereo Mix / VB-Cable) entre os inputs enumerados.
  // `detected` = casou por heurística; se false, é o fallback com todos os inputs.
  const { devices: loopbackDevices, detected: loopbackDetected } = useMemo(
    () => filterLoopbackDevices(audioInputs),
    [audioInputs],
  );

  // Captura DUPLA e simultânea (como o desktop): microfone (sua voz) + sistema/aba (outros falantes).
  // AMBAS ligadas por PADRÃO: o caso de uso real é conversa/aula/chamada — você fala E ouve o outro
  // lado. Vir só com o mic marcado obrigava o usuário a descobrir e ligar o sistema toda vez (atrito
  // desnecessário). Quem quiser só uma das fontes desmarca a outra com um clique no hero card.
  // Padrão casa com o cenário inicial 'media' (assistir mídia): só o sistema ligado.
  /* SEM getDisplayMedia (Quest, Android, iOS) o microfone é a ÚNICA fonte possível: ele já nasce
     ligado, senão o "Iniciar" nasceria desabilitado sem motivo aparente. Clicar em Iniciar continua
     sendo o gesto deliberado que abre o microfone. */
  const [micEnabled, setMicEnabled] = useState(() => !lerSinaisDoDispositivo(false).capturaDeTela);
  /** Ligou o mic no meio da sessão e o navegador ainda está perguntando pela permissão. */
  const [micAbrindo, setMicAbrindo] = useState(false);
  /**
   * Tocou em Iniciar e nenhuma fonte abriu ainda (a permissão, o `onaudiostart` da Web Speech, o
   * seletor da aba). O relógio e o "Ouvindo…" esperam (`aoAbrirFonte`); o botão diz "Abrindo…".
   */
  const [abrindoCaptura, setAbrindoCaptura] = useState(false);
  /** A folha do início (`inicioDaCaptura.ts`): a pergunta do motor e/ou o download, antes da sessão. */
  const [folhaDoInicio, setFolhaDoInicio] = useState<Extract<PassoDoInicio, { tipo: 'folha' }> | null>(null);
  /** O microfone não abriu: a ajuda daquele aparelho (`ajudaDoMicrofone.ts`). */
  const [falhaDoMic, setFalhaDoMic] = useState<AjudaDoMic | null>(null);

  /* OS IDIOMAS DA SESSÃO. O par virou um chip; os campos, a busca e a explicação da direção moram
     no diálogo que ele abre (`IdiomasDaSessao`, o C7 do protótipo) — antes ocupavam três linhas
     permanentes de uma tela cujo único gesto é gravar. `<dialog>` nativo: Esc e foco de graça. */
  const [idiomasAbertos, setIdiomasAbertos] = useState(false);
  // O Foco Cheio sai com Esc — a não ser que haja um diálogo aberto por cima (ele é quem fecha).
  useEffect(() => {
    if (!isFocusMode) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      setIsFocusMode(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [isFocusMode]);
  // O teclado vai junto: entrar põe o foco em "Tela normal"; sair o devolve a "Foco cheio".
  const focoJaAbriu = useRef(false);
  useEffect(() => {
    if (isFocusMode) {
      focoJaAbriu.current = true;
      requestAnimationFrame(() => sairDoFocoRef.current?.focus());
    } else if (focoJaAbriu.current) requestAnimationFrame(() => entrarNoFocoRef.current?.focus());
  }, [isFocusMode]);
  /**
   * O SOM DO COMPUTADOR ENTRA SEMPRE — deixou de ser estado porque deixou de ser escolha.
   *
   * Continua existindo como variável, e não como `true` espalhado pelo arquivo, porque os
   * caminhos de ERRO dependem dela: quando a captura do sistema falha (a pessoa fecha a caixa de
   * compartilhamento), é `systemEnabled` que decide se a sessão morre ou segue só com o microfone.
   * Anotado como `boolean` de propósito: sem isso o TypeScript estreita para o literal `true` e
   * passa a tratar esses ramos de erro como inalcançáveis.
   */
  const systemEnabled: boolean = perfilDoAparelho.capturaDoSistema;
  // COMO capturar o áudio do sistema: 'display' = compartilhar aba/tela (getDisplayMedia; zero
  // setup, mas o áudio de TELA sofre a limitação NotReadableError no Windows) ou 'loopback' =
  // dispositivo de entrada de loopback (Stereo Mix / VB-Cable via getUserMedia; à prova de falhas,
  // capta o sistema INTEIRO incl. Discord/jogos, com setup único). Persistido em settings.ui.
  const [systemSource, setSystemSource] = useState<'display' | 'loopback' | 'server'>('display');
  // MODO DESEMPENHO (jogos): pula os decodes PARCIAIS (a legenda só aparece no fim de cada frase).
  // Corta a maior fatia de GPU/CPU da captura contínua — o decode final continua intacto.
  const [perfMode, setPerfMode] = useState(false);
  const perfModeRef = useRef(false);
  useEffect(() => {
    perfModeRef.current = perfMode;
  }, [perfMode]);
  // MULTI-IDIOMA: em vez de fixar "Eles falam = X", o Whisper detecta o idioma de CADA fala do
  // sistema (lobby com gente de vários países, chamadas mistas) e o Tradutor IA do servidor
  // (que dispensa origem declarada) traduz tudo para o SEU idioma.
  // LIGADO por padrão (decisão de atrito): o usuário novo não precisa saber de antemão o
  // idioma do que vai ouvir — cada fala é detectada e traduzida para o idioma dele. Quem
  // escolher um idioma fixo no seletor desliga isto na hora (a escolha fica persistida).
  const [autoDetectLang, setAutoDetectLang] = useState(true);
  const autoDetectLangRef = useRef(true);
  useEffect(() => {
    autoDetectLangRef.current = autoDetectLang;
  }, [autoDetectLang]);
  // O MESMO para "Eu falo": conteúdo no idioma nativo, fala misturada, ou o usuário alternando
  // idiomas — o Whisper detecta cada fala do MIC e traduz para o idioma de estudo. (A Web Speech
  // não autodetecta; nesse motor a escolha vale só para o Whisper do mic.)
  const [autoDetectMyLang, setAutoDetectMyLang] = useState(false);
  const autoDetectMyLangRef = useRef(false);
  useEffect(() => {
    autoDetectMyLangRef.current = autoDetectMyLang;
  }, [autoDetectMyLang]);

  // CENÁRIO DE CAPTURA — a intenção do usuário decide fontes, rótulos e painéis.
  // 'media' = assistir vídeo/aula/podcast (só sistema) · 'conversation' = chamada/reunião
  // (mic+sistema) · 'mic' = praticar a própria voz (só mic). Trocar de cenário só ajusta as
  // FONTES; os idiomas escolhidos permanecem. (O tipo vive em `lib/captura/tiposDaFala.ts`.)
  const [captureScenario, setCaptureScenario] = useState<CaptureScenario>(() =>
    cenarioDasFontes(micEnabled, systemEnabled),
  );
  // Espelho p/ os handlers assíncronos (a identificação de voz só roda no cenário Conversa).
  const captureScenarioRef = useRef<CaptureScenario>(captureScenario);
  useEffect(() => {
    captureScenarioRef.current = captureScenario;
  }, [captureScenario]);
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
  useEffect(() => {
    void serverLoopbackSupported().then(setServerCaptureAvailable);
  }, []);
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
      if (!hasLabels) return; // sem rótulos não dá para concluir nada
      if (filterLoopbackDevices(inputs).detected) return; // existe dispositivo: a escolha vale
      setSystemSource('server');
      setFeedbackMsg(
        'Nenhum dispositivo de loopback (Stereo Mix / VB-Cable) foi encontrado, mudei para "Som do computador", que não precisa de configuração.',
      );
      setTimeout(() => setFeedbackMsg(''), 8000);
    })();
  }, [serverCaptureAvailable, systemSource, setFeedbackMsg]);
  // Preparação do modelo local (Whisper + opus-mt) — cache-aware, com barras e erro/retry.
  // null = ocioso; caso contrário, o painel ModelPrepPanel é exibido.
  const [modelPrep, setModelPrep] = useState<ModelPrepState | null>(null);

  // AI Gateway do perfil ativo — tradução ao vivo provider-agnóstica.
  const gateway = useMemo(
    () =>
      buildGateway({
        profile: getActiveProfile(),
        cloudConsent: consentiuNuvem,
      }),
    [],
  );

  // Expõe o gateway no console para diagnóstico/testes (ex.: window.__babelGateway.stt.transcribePcm).
  useEffect(() => {
    (window as any).__babelGateway = gateway;
  }, [gateway]);

  /* SAIR DA CAPTURA EM APARELHO COM POUCA MEMÓRIA (Quest/celular): encerra os workers do Whisper e do
     tradutor. O heap do WASM só volta ao sistema com o `terminate()`; sem isso o modelo (80–300 MB de
     pesos, mais o heap da inferência) fica preso na aba enquanto a pessoa joga ou lê — e no iOS a aba
     morre perto de 0,5–1,5 GB. A próxima captura recarrega do cache (sem baixar de novo). */
  useEffect(
    () => () => {
      if (!perfilDoAparelhoRef.current.poucaMemoria) return;
      gateway.stt.liberarModelo();
      gateway.mt.liberarModelos();
    },
    [gateway],
  );

  useEffect(() => {
    if (onTranscriptChange) {
      onTranscriptChange(speechSegments.map((s) => s.originalText).join(' '));
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
    if (which === 'transcript') {
      transcriptPinnedRef.current = true;
      setShowJumpTranscript(false);
    } else {
      focusPinnedRef.current = true;
      setShowJumpFocus(false);
    }
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
    setSpeakerProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: true } : { ...p, isActive: false })));
    const selected = speakerProfiles.find((p) => p.id === id);
    if (selected) {
      setFeedbackMsg(`Orador ativo alterado para ${selected.name}!`);
      setTimeout(() => setFeedbackMsg(''), 2500);
    }
  };

  // Timer run loop
  useEffect(() => {
    let interval: any;
    if (isRecording && !pausado) {
      interval = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording, pausado]);

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

  useEffect(() => {
    systemSourceRef.current = systemSource;
  }, [systemSource]);
  useEffect(() => {
    loopbackDeviceIdRef.current = loopbackDeviceId;
  }, [loopbackDeviceId]);

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
    const off = onDeviceChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      off();
    };
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
      try {
        ui = s?.ui ? JSON.parse(s.ui) : {};
      } catch {
        ui = {};
      }
      if (ui.audioInputId) setInputDeviceId(ui.audioInputId);
      if (ui.audioOutputId) setOutputDeviceId(ui.audioOutputId);
      if (ui.systemSource === 'display' || ui.systemSource === 'loopback' || ui.systemSource === 'server')
        setSystemSource(ui.systemSource);
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
      if (
        ui.sttQuality === 'auto' ||
        ui.sttQuality === 'fast' ||
        ui.sttQuality === 'accurate' ||
        ui.sttQuality === 'cloud'
      ) {
        setSttQuality(ui.sttQuality);
        setSttQualityMirror(ui.sttQuality);
      }
      settingsLoadedRef.current = true;
    })();
    /* Deps VAZIAS de propósito: isto carrega os ajustes salvos UMA vez, na montagem. */
  }, []);

  // Outra tela mudou o idioma (Configurações, por exemplo)? Reflete aqui — a config é uma só.
  useEffect(() => {
    return onLangConfigChange(() => {
      void (async () => {
        const cfg = await fetchLangConfig();
        setSourceLang((prev) => (prev === cfg.mine ? prev : cfg.mine));
        setTargetLang((prev) => (prev === cfg.studying ? prev : cfg.studying));
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
  }, [
    inputDeviceId,
    outputDeviceId,
    ttsSpeed,
    micEngine,
    systemSource,
    loopbackDeviceId,
    perfMode,
    autoDetectLang,
    autoDetectMyLang,
    captureScenario,
    speakerAutoId,
  ]);

  // Amostrador do waveform: enquanto grava, desloca o histórico a ~20fps lendo o peak-hold das
  // fontes (com decaimento suave). Fora de gravação, zera. Barato: um setInterval + array de 48.
  useEffect(() => {
    if (!isRecording || pausado) {
      setLevels(new Array(48).fill(0));
      currentLevelRef.current = 0;
      return;
    }
    const iv = setInterval(() => {
      const v = currentLevelRef.current;
      currentLevelRef.current = v * 0.55; // decai para o pico "cair" entre amostras
      setLevels((prev) => [...prev.slice(1), v]);
    }, 50);
    return () => clearInterval(iv);
  }, [isRecording, pausado]);

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
  // Última final de cada fonte: o `prompt` de contexto do Whisper de nuvem (ver `promptDeStt.ts`).
  const contextoDoSttRef = useRef(new ContextoDoStt());
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
  const micStartedAtRef = useRef<number>(0); // t=0 do recorder do mic (fallback se o sistema falhar)

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
    sessionStartMsRef,
    shouldAnchorClockRef,
    systemEnabled,
  });
  /* TRADUÇÃO SOB DEMANDA (harness §1.2, M0): a preferência "Tradução" dos ajustes da legenda. Em
     `sempre` (padrão) nada muda; as refs deixam a troca valer já na fala seguinte. O predicado de
     palavras conhecidas só é montado no modo `novas`, no idioma estudado (o observado, se houver). */
  const modoTraducao = modoDeTraducao(tsSettings.traducao);
  const modoDeTraducaoRef = useRef(modoTraducao);
  modoDeTraducaoRef.current = modoTraducao;
  const conhecidas = usePalavrasConhecidas(idiomaObservado || targetLang, modoTraducao === 'novas');
  const conhecidasRef = useRef(conhecidas);
  conhecidasRef.current = conhecidas;
  const pedidosSobDemandaRef = useRef(new Map<string, PedidoSobDemanda>());
  const { translateSegment, retraduzirDegradados, revelarTraducao } = criarTraducaoDaFala({
    gateway,
    ordemMtRef,
    sourceLangRef,
    targetLangRef,
    idiomaObservadoRef,
    perfilIdiomaRef,
    speechSegmentsRef,
    translationCacheRef,
    mtFailNotifiedRef,
    altTargetNotifiedRef,
    degradacaoAvisadaRef,
    setSpeechSegments,
    setFeedbackMsg,
    modoDeTraducaoRef,
    conhecidasRef,
    pedidosSobDemandaRef,
  });

  // Enunciados que chegaram ENQUANTO o modelo carregava — transcritos no flush (nada se perde).
  const pendingUtterancesRef = useRef<EnunciadoPendente[]>([]);
  // ANTI-ECO: seqs cuja fala começou enquanto o TTS do app tocava (é o nosso áudio voltando).
  const suppressedSeqsRef = useRef<Set<number>>(new Set());
  /* REGULADOR DE DESEMPENHO (harness §4): o estado vive aqui, uma vez por tela; o pipeline o
     alimenta a cada final local e lê dele se os parciais estão cortados. */
  const [regulador] = useState<ReguladorDaCaptura>(() => criarReguladorDaCaptura());
  const reguladorRef = useRef(regulador);

  /* O PIPELINE DE FALA (VAD → STT → diarização → emissão) e a preparação dos modelos moram em
     `lib/captura/pipelineDeFala.ts`. A fábrica roda a cada render, como as closures que
     substituiu: os handlers precisam do `micEnabled`/`micEngine` do render corrente. */
  const { sysHandlers, micHandlers, prepareModels, preaquecerModelos, decidirMotorDoSistema } = criarPipelineDeFala({
    gateway,
    sourceLang,
    sourceLangRef,
    targetLangRef,
    autoDetectLangRef,
    autoDetectMyLangRef,
    idiomaObservadoRef,
    captureScenarioRef,
    perfModeRef,
    micEnabled,
    micEngine,
    timerRef,
    nowRel,
    setSpeechSegments,
    seqToSegmentRef,
    lastPartialTextRef,
    contextoDoSttRef,
    pendingUtterancesRef,
    suppressedSeqsRef,
    modelReadyRef,
    prepareEmVooRef,
    speakerProfilesRef,
    setSpeakerProfiles,
    speakerAutoIdRef,
    clustererRef,
    lastVoiceIdRef,
    provisionalUttsRef,
    ensureVoiceProfile,
    dominantLangRef,
    perfilIdiomaRef,
    perfilMicRef,
    avisoIdiomaMicRef,
    setIdiomaObservado,
    sysFalasRef,
    sysAbertasRef,
    micInicioRef,
    avisoVazamentoRef,
    translateSegment,
    retraduzirDegradados,
    setFeedbackMsg,
    setModelPrep,
    setSttRouteLabel,
    reguladorRef,
    sistemaAtivo: () => !!systemCaptureRef.current,
  });

  /* PRÉ-AQUECE o STT/MT locais que JÁ estão em cache quando a tela abre e quando o par ou a qualidade
     mudam (nunca baixa nada: ver `preaquecerModelos`). Com um respiro, para não disputar a
     renderização da tela; a gravação em curso não é tocada. */
  const preaquecerRef = useRef(preaquecerModelos);
  preaquecerRef.current = preaquecerModelos;
  useEffect(() => {
    if (isRecordingRef.current) return;
    const relogio = setTimeout(() => void preaquecerRef.current(), 400);
    return () => clearTimeout(relogio);
  }, [sourceLang, targetLang, autoDetectLang, autoDetectMyLang, micEnabled, micEngine, sttQuality]);

  /* AS FONTES DE ÁUDIO (sistema/aba, microfone, medidor e o interruptor do mic) moram em
     `lib/captura/fontesDeAudio.ts`. Fábrica por render, como as closures que substituiu: elas
     leem `micEnabled`/`micEngine`/`systemEnabled` do render corrente nos caminhos de erro. */
  const { handleStartSystemCapture, startMic, alternarMicrofone } = criarFontesDeAudio({
    sysHandlers,
    micHandlers,
    prepareModels,
    systemSourceRef,
    loopbackDeviceIdRef,
    inputDeviceIdRef,
    systemCaptureRef,
    micCaptureRef,
    webSpeechRef,
    webSpeechPartialIdRef,
    meterRef,
    isRecordingRef,
    micStartedAtRef,
    timerRef,
    sourceLang,
    sourceLangRef,
    targetLangRef,
    micEnabled,
    systemEnabled,
    micEngine,
    webSpeechSupported,
    pushLevel,
    nowRel,
    anchorSessionClock,
    translateSegment,
    marcarMicrofone,
    setSpeechSegments,
    setFeedbackMsg,
    setIsFocusMode,
    setGuiaDeAudio,
    setModelPrep,
    // Uma fonte que falha e encerra a gravação também encerra o "Abrindo…".
    setIsRecording: (v) => {
      if (v === false) setAbrindoCaptura(false);
      setIsRecording(v);
    },
    setMicAbrindo,
    /* O INÍCIO DE VERDADE: o relógio e o "Ouvindo…" ligam quando a primeira fonte abre, não no toque. */
    aoAbrirFonte: () => {
      if (!isRecordingRef.current) return;
      setAbrindoCaptura(false);
      setIsRecording(true);
    },
    aoFalharMicrofone: (erro, { motorRapido }) =>
      setFalhaDoMic(
        ajudaDoMic(
          classificarFalhaDoMic(erro),
          plataformaDoNavegador(navigator.userAgent, navigator.maxTouchPoints ?? 0),
          { motorRapido },
        ),
      ),
    // Sem áudio do sistema (celular, Quest): nada de segundo getUserMedia ao lado da Web Speech.
    semMedidorParalelo: !perfilDoAparelho.capturaDoSistema || perfilDoAparelho.tipo.startsWith('celular'),
    finalNaNuvem: () => gateway.stt.finalNaNuvem(),
    perguntarEscolhaDoMic,
    decidirMotorDoSistema,
    aoMudarMotorDoSistema: (motor) => setSistemaNoNavegador(motor === 'web-speech-local'),
  });

  // Harness OFFLINE de teste (dev): injeta um PCM conhecido pelo MESMO caminho do sistema
  // (speechStart → parciais crescentes → utterance final), sem precisar de um compartilhamento
  // real. Permite testar ordem/parciais/latência via chrome-devtools MCP `evaluate_script`.
  // Uso no console: await window.__simSystem()            → 1 enunciado (JFK)
  //                 await window.__simSystem('jfk', 3)      → 3 sobrepostos (testa ordem por seq)
  useEffect(() => {
    let simSeq = 10000; // faixa própria p/ não colidir com o seq real do VAD
    const JFK_URL = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      for (let i = 0; i < count; i++) {
        runs.push(runOne(pcm));
        await sleep(120);
      }
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
      const dec: number[] = [],
        mt: number[] = [];
      const pctl = (xs: number[], p: number) => {
        if (!xs.length) return 0;
        const s = [...xs].sort((a, b) => a - b);
        return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
      };
      const st = (xs: number[]) => ({
        p50: pctl(xs, 50),
        p95: pctl(xs, 95),
        avg: Math.round(xs.reduce((a, b) => a + b, 0) / (xs.length || 1)),
      });
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
        chunkSec,
        n,
        audioMs,
        decodeMs: st(dec),
        rtf: +(st(dec).p50 / audioMs).toFixed(3), // < 1 = acompanha tempo real
        keepsUp: st(dec).p50 < audioMs,
        mtMs: st(mt),
        mtEngine: engine,
        endToEndMs: st(dec).p50 + st(mt).p50, // decode + tradução (latência sentida)
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
      setSpeakerProfiles((prev) => prev.map((p) => ({ ...p, isActive: false })));
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
    if (!temTrabalhoEmRisco) {
      setNavGuard(null);
      return;
    }
    setNavGuard((proceed) => {
      // `() => proceed` porque `setState` com função a EXECUTARIA em vez de guardá-la.
      setPendingNav(() => proceed);
      return true; // navegação suspensa: quem decide agora é o modal
    });
    // Fechar a aba/janela no meio da captura também avisa (mesma classe de perda).
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
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
    try {
      webSpeechRef.current?.stop();
    } catch {
      /* já parado */
    }
    webSpeechRef.current = null;
    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }
    try {
      await systemCaptureRef.current?.stop();
    } catch {
      /* já parado */
    }
    try {
      await micCaptureRef.current?.stop();
    } catch {
      /* já parado */
    }
    systemCaptureRef.current = null;
    micCaptureRef.current = null;
    setSpeechSegments([]);
    setTimer(0);
    setNavGuard(null); // senão o próprio proceed() cairia na trava de novo
    proceed?.();
  };

  /** "Voltar ao padrão" dos ajustes da captura: a rota, o microfone, a saída, a qualidade, o
   *  desempenho e a aparência da legenda voltam ao que um app recém-instalado usa. */
  const voltarAoPadrao = () => {
    setSystemSource(serverCaptureAvailable ? 'server' : 'display');
    setLoopbackDeviceId('');
    setMicEngine(webSpeechSupported ? 'browser' : 'whisper');
    setInputDeviceId('');
    setOutputDeviceId('');
    setSttQuality('auto');
    setSttQualityMirror('auto');
    void patchUiSettings({ sttQuality: 'auto' });
    setPerfMode(false);
    (Object.keys(DEFAULT_TRANSCRIPT_SETTINGS) as Array<keyof TranscriptSettings>).forEach((k) =>
      updateSetting(k, DEFAULT_TRANSCRIPT_SETTINGS[k]),
    );
  };

  /**
   * A gaveta de setup abre SOZINHA quando há um problema de verdade — e só então.
   *
   * Antes, o passo-a-passo do Stereo Mix e do VB-Audio Cable ficava permanentemente aberto na
   * rota de loopback: uma parede de texto de 10px que quem já está funcionando nunca precisou ler.
   * Agora aparece quando não há dispositivo detectado, ou depois de um teste que falhou.
   */
  useEffect(() => {
    if (systemSource !== 'loopback') {
      setShowSetupGuide(false);
      return;
    }
    const testeFalhou = probe != null && probe.verdict !== 'ok';
    if (!loopbackDetected || testeFalhou) setShowSetupGuide(true);
  }, [systemSource, loopbackDetected, probe]);

  /* O CICLO DA SESSÃO — começar, retomar, parar e SALVAR — mora em `lib/captura/salvarSessao.ts`.
     Fábrica por render, como as closures que substituiu: `handleStartRecording` e
     `handleFinalizeSave` leem `timer`, `speechSegments` e o par de idiomas do render corrente. */
  const {
    handleStartOrResume,
    handleExitResume,
    handleStopRecording,
    handleCancelStop,
    handleFinalizeSave,
    encerrarFontes,
  } = criarSalvarSessao({
    gateway,
    onSave,
    recordings,
    speechSegments,
    timer,
    sourceLang,
    targetLang,
    micEnabled,
    systemEnabled,
    micEngine,
    captureScenario,
    speakerAutoId,
    resumeId,
    customSessionTitle,
    customSessionImage,
    startMic,
    handleStartSystemCapture,
    systemCaptureRef,
    micCaptureRef,
    webSpeechRef,
    webSpeechPartialIdRef,
    meterRef,
    recordedAudioRef,
    isRecordingRef,
    sessionStartMsRef,
    shouldAnchorClockRef,
    micStartedAtRef,
    partialIdRef,
    seqToSegmentRef,
    lastPartialTextRef,
    ordemMtRef,
    contextoDoSttRef,
    clustererRef,
    dominantLangRef,
    perfilIdiomaRef,
    altTargetNotifiedRef,
    lastVoiceIdRef,
    provisionalUttsRef,
    speakerProfilesRef,
    setIsRecording,
    setTimer,
    setSpeechSegments,
    setIdiomaObservado,
    setSpeakerIdStatus,
    setModelPrep,
    setResumeId,
    setShowSaveModal,
    setCustomSessionTitle,
    setCustomSessionImage,
    setImgQuery,
    setFeedbackMsg,
    setSessaoSalva,
    setPausado,
    pausaInicioRef,
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
          // O idioma gravado da fala volta com ela: sem isto, salvar a retomada reetiquetava tudo
          // com o idioma do seletor (a mesma causa da sessão em português virar prática em inglês).
          lang: u.sourceLang ?? undefined,
        }));
        setSpeechSegments(segs);
        // Semeia o relógio a partir da duração salva; o START continua a linha do tempo.
        const durMs = session.durationMs ?? 0;
        setTimer(Math.round(durMs / 1000));
        sessionStartMsRef.current = Date.now() - durMs;
        if (session.title) setCustomSessionTitle(session.title);
        /* O par da SESSÃO não é mais restaurado no seletor: desde 2026-09-26 `sessions.source_lang` é o
           idioma do CONTEÚDO (o dominante das falas), não o "eu falo" de quem gravou. Copiá-lo para o
           seletor trocaria o par da pessoa ao retomar um vídeo em inglês. Cada fala já traz o seu idioma. */
        setFeedbackMsg(`Retomando sessão: ${session.title ?? 'sem título'}`);
        setTimeout(() => setFeedbackMsg(''), 4000);
      } catch {
        if (!cancelled) {
          setFeedbackMsg('Não foi possível carregar a sessão para retomar.');
          setTimeout(() => setFeedbackMsg(''), 4000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    /* `sourceLang` e `targetLang` ficam FORA das dependências, e não por esquecimento.
    
       Este efeito RETOMA uma gravação: ele lê o par de idiomas para rotular as falas que vêm sem
       idioma próprio, e logo abaixo ESCREVE o par com o que veio da sessão. Incluí-los faria o
       efeito disparar de novo por causa da própria escrita — recarregando a transcrição inteira a
       cada troca de idioma, inclusive a que ele mesmo acabou de fazer. O gatilho certo é um só:
       qual gravação se está retomando. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumingRecordingId]);

  /** "Descartar" do encerramento (com confirmação no diálogo): a captura parada some sem salvar. */
  const descartarCaptura = async () => {
    setShowSaveModal(false);
    // Descartar de dentro da pausa: as fontes fecham de verdade antes de a tela zerar.
    if (isRecordingRef.current) await encerrarFontes();
    recordedAudioRef.current = null;
    setSpeechSegments([]);
    setTimer(0);
    setCustomSessionTitle('');
    setCustomSessionImage('');
    setResumeId(null);
    setFeedbackMsg('Captura descartada.');
    setTimeout(() => setFeedbackMsg(''), 2000);
  };

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
            reader.onloadend = () => {
              setCustomSessionImage(reader.result as string);
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [showSaveModal]);

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCustomSessionImage(reader.result as string);
    };
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
      const activeSpeaker =
        speakerProfiles.find((p) => p.isActive) || speakerProfiles.find((p) => p.id === 'user') || speakerProfiles[0];
      const speakerId = activeSpeaker.id;
      const timestampStr = formatTime(timer);

      // Tradução pelo GATEWAY (não mais fetch direto ao MyMemory).
      const src = sourceLang.split('-')[0];
      const tgt = targetLang.split('-')[0];
      const { text: translated } = await gateway.mt.translate(inputText, src, tgt);
      const clean = translated || inputText;
      const cleanTranslated = clean.charAt(0).toUpperCase() + clean.slice(1);

      // Append segment to live transcript feed! Vocabulário da fala real.
      setSpeechSegments((prev) => [
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
        },
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
  /* As palavras do caderno que já saíram de "nova" no FSRS: o estilo de legenda as destaca. */
  const aprendidas = usePalavrasAprendidas();

  /* O VOCABULÁRIO DA CAPTURA (examinar, fichar no deck, mandar praticar) mora em
     `lib/captura/palavraDaFala.ts`. Fábrica por render, como as closures que substituiu. */
  const { examineWord, handleAddWordToDeck, handlePracticeWord } = criarPalavraDaFala({
    gateway,
    langConfigRef,
    targetLangRef,
    selectedWordLangRef,
    speakWord,
    setSelectedExamWord,
    addedWords,
    setAddedWords,
    setFeedbackMsg,
    onChangeView,
  });

  // Speaker Renaming
  const handleStartRenameSpeaker = (id: string, currentName: string) => {
    setEditingSpeakerId(id);
    setEditingSpeakerName(currentName);
  };

  const handleSaveSpeakerName = (id: string) => {
    if (!editingSpeakerName.trim()) return;
    setSpeakerProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name: editingSpeakerName } : p)));
    setEditingSpeakerId(null);
    setFeedbackMsg('Nome do orador atualizado!');
    setTimeout(() => setFeedbackMsg(''), 2000);
  };

  /* OS DOIS LADOS DO PAR, como o diálogo de idiomas os mostra. Em 'media' o idioma do conteúdo é
     `targetLang` e a legenda sai em `sourceLang`; em conversa é "eu falo" / "eles falam"; só com o
     microfone é "falo em" → "traduzir para". Única escrita do par na tela. */
  const escolherIdioma =
    (quem: 'fonte' | 'alvo', auto?: (v: boolean) => void) =>
    ({ auto: a, code }: { auto: boolean; code?: string }) => {
      langTouchedRef.current = true;
      auto?.(a);
      if (!code) return;
      if (quem === 'fonte') setSourceLang(code);
      else setTargetLang(code);
    };
  const ladosDoPar: [Lado, Lado] =
    captureScenario === 'media'
      ? [
          {
            rotulo: ageProfile === 'kids' ? 'Língua do vídeo/jogo' : 'Idioma do conteúdo',
            codigo: targetLang,
            auto: autoDetectLang,
            aceitaAuto: true,
            aoEscolher: escolherIdioma('alvo', setAutoDetectLang),
          },
          {
            rotulo: ageProfile === 'kids' ? 'Ler em' : 'Traduzir para',
            codigo: sourceLang,
            auto: false,
            aceitaAuto: false,
            aoEscolher: escolherIdioma('fonte'),
          },
        ]
      : captureScenario === 'conversation'
        ? [
            {
              rotulo: 'Eu falo',
              codigo: sourceLang,
              auto: autoDetectMyLang,
              aceitaAuto: true,
              aoEscolher: escolherIdioma('fonte', setAutoDetectMyLang),
            },
            {
              rotulo: 'Eles falam',
              codigo: targetLang,
              auto: autoDetectLang,
              aceitaAuto: true,
              aoEscolher: escolherIdioma('alvo', setAutoDetectLang),
            },
          ]
        : [
            {
              rotulo: 'Falo em',
              codigo: sourceLang,
              auto: autoDetectMyLang,
              aceitaAuto: true,
              aoEscolher: escolherIdioma('fonte', setAutoDetectMyLang),
            },
            {
              rotulo: ageProfile === 'kids' ? 'Ler em' : 'Traduzir para',
              codigo: targetLang,
              auto: false,
              aceitaAuto: false,
              aoEscolher: escolherIdioma('alvo'),
            },
          ];

  /* O RESUMO HUMANO da direção da tradução — o fluxo sem jargão, para público leigo.
     Vive numa função porque agora tem DUAS casas: a gaveta de idiomas do Espaço de Gravação
     (onde a pessoa edita o par) e o Foco Cheio. Duplicá-lo faria as duas telas divergirem. */
  const resumoDaDirecao = () => (
    <>
      {/* C13 — o automático agora DIZ o que descobriu. Antes prometia "é detectado sozinho"
          e nunca mostrava o resultado: numa sessão inteira em português, a tela seguia
          anunciando o idioma configurado enquanto o sistema já sabia a resposta há 40 falas. */}
      {captureScenario === 'media' &&
        (autoDetectLang ? (
          idiomaObservado ? (
            <>
              Detectei <b>{langLabel(idiomaObservado)}</b> no conteúdo (
              {Math.round(perfilIdiomaRef.current.ler().confianca * 100)}% das falas)
              {destinoDaTraducao(idiomaObservado, baseLang(sourceLang)).destino ? (
                <>
                  , legenda em <b>{langLabel(sourceLang)}</b>.
                </>
              ) : (
                <>, o mesmo idioma da legenda: só o original, sem tradução.</>
              )}
            </>
          ) : (
            <>
              O idioma do conteúdo é detectado sozinho (pode até misturar) e tudo vira legenda em{' '}
              <b>{langLabel(sourceLang)}</b>.
            </>
          )
        ) : (
          <>
            Cada fala vira legenda bilíngue em <b>{langLabel(sourceLang)}</b>.
          </>
        ))}
      {captureScenario === 'conversation' && (
        <>
          {idiomaObservado && autoDetectLang && (
            <>
              Eles estão falando <b>{langLabel(idiomaObservado)}</b> ·{' '}
            </>
          )}
          Você lê os outros em <b>{langLabel(sourceLang)}</b> · sua fala aparece{' '}
          {autoDetectMyLang ? (
            <>no idioma da conversa (detectado ao vivo)</>
          ) : (
            <>
              em <b>{langLabel(targetLang)}</b>
            </>
          )}
          .
        </>
      )}
      {captureScenario === 'mic' &&
        (autoDetectMyLang ? (
          <>
            Sua fala é detectada em qualquer idioma e traduzida para <b>{langLabel(targetLang)}</b>.
          </>
        ) : (
          <>
            Sua fala vira texto em <b>{langLabel(sourceLang)}</b> com tradução em <b>{langLabel(targetLang)}</b>.
          </>
        ))}
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
  const botaoDoMicrofone = () => {
    const iconeCls = 'w-5 h-5';
    return (
      <button
        onClick={() => alternarMicrofone(!micEnabled)}
        role="switch"
        aria-checked={micEnabled}
        disabled={micAbrindo}
        className={`btn btn-outline ${micEnabled ? 'mic-on' : ''}`}
      >
        {micAbrindo ? (
          <Loader2 className={`${iconeCls} animate-spin`} />
        ) : micEnabled ? (
          <Mic className={iconeCls} />
        ) : (
          <MicOff className={iconeCls} />
        )}
        {/* O estado é dito por ESCRITO, não só pela cor: o app tem 7 temas e o ícone sozinho
            (mic vs mic cortado) já falhou em teste de leitura. */}
        {micAbrindo
          ? 'Pedindo permissão…'
          : ageProfile === 'kids'
            ? micEnabled
              ? 'Minha voz entra'
              : 'Minha voz fora'
            : micEnabled
              ? 'Microfone ativo'
              : 'Microfone mudo'}
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
  const botaoDasLegendas = () => (
    <button
      onClick={() => {
        const abrir = !showOverlay;
        setShowOverlay(abrir);
        toast.info(
          abrir
            ? isDocumentPiPSupported()
              ? 'Legendas flutuantes abertas: a janelinha fica por cima de tudo'
              : 'Legendas flutuantes abertas nesta tela (a janela por cima de tudo precisa do Chrome ou do Edge)'
            : 'Legendas flutuantes fechadas',
        );
      }}
      role="switch"
      aria-checked={showOverlay}
      className={`btn btn-outline ${showOverlay ? 'mic-on' : ''} ${isRecording && !showOverlay ? 'pulsa' : ''}`}
    >
      <PictureInPicture2 aria-hidden />
      {showOverlay ? 'Legendas flutuantes ativas' : 'Legendas flutuantes'}
    </button>
  );

  /* O PAR DE IDIOMAS COMO O CHIP O RESUME — leitura, nunca edição.
     Espelha os mesmos rótulos de `seletoresDeIdioma`, que continua sendo o único lugar que
     ESCREVE o par (ele é o recheio da gaveta). Em 'media' o idioma do conteúdo é `targetLang`
     e a legenda sai em `sourceLang`; em conversa é "eu falo" → "eles falam". */
  const parResumido =
    captureScenario === 'media'
      ? { auto: autoDetectLang, de: targetLang, para: sourceLang }
      : { auto: autoDetectMyLang, de: sourceLang, para: targetLang };

  /* IDIOMAS IGUAIS = CARTÃO SEM VERSO (spec entrega-honesta). O chip precisa avisar mesmo
     fechado: é aqui que a palavra é fichada, e o caderno enchia de palavras sem tradução. */
  const mesmoIdioma = baseLang(sourceLang) === baseLang(targetLang);

  /** O conteúdo do chip do par — o mesmo na tela normal e no Foco Cheio. */
  const doisLados = captureScenario !== 'media';
  const rotuloDoPar = (
    <>
      {parResumido.auto ? <WandSparkles aria-hidden /> : <LangFlag code={parResumido.de} className="w-4 h-3" />}
      {parResumido.auto ? 'Detectar' : langLabel(parResumido.de)}
      {doisLados ? <ArrowLeftRight aria-hidden /> : <ArrowRight aria-hidden />}
      <LangFlag code={parResumido.para} className="w-4 h-3" />
      {langLabel(parResumido.para)}
    </>
  );

  /* OS AVISOS DO PAR — os que a pessoa precisa ver sem clicar em nada (ficam também no Espaço de
     gravação) e, no diálogo de idiomas, no formato `.aviso-info` do protótipo. */
  const coberturaDoPar = autoDetectLang ? null : mtCoverage(sourceLang, targetLang);
  const avisosDoPar = (
    <>
      {mesmoIdioma && (
        <div className="aviso-info warn" role="alert">
          <TriangleAlert aria-hidden />
          <span>
            Os dois lados estão em {langLabel(sourceLang)}: não há o que traduzir, e as palavras fichadas ficam sem
            verso. Troque um dos dois.
          </span>
        </div>
      )}
      {autoDetectMyLang && captureScenario !== 'media' && micEngine === 'browser' && (
        <div className="aviso-info">
          <Info aria-hidden />
          <span>Detectar sozinho precisa do Whisper. Troque em Ajustes da captura → Microfone.</span>
        </div>
      )}
      {coberturaDoPar === 'online' && !mesmoIdioma && (
        <div className="aviso-info warn">
          <TriangleAlert aria-hidden />
          <span>Ainda não há tradutor no aparelho para este par: a tradução usa a internet.</span>
        </div>
      )}
      {coberturaDoPar === 'unknown' && !mesmoIdioma && (
        <div className="aviso-info warn">
          <TriangleAlert aria-hidden />
          <span>Não há tradutor para este par: as falas são transcritas, mas ficam sem tradução.</span>
        </div>
      )}
    </>
  );

  /* OS MODELOS QUE ESTA CAPTURA VAI USAR, com o par e a qualidade atuais — a mesma conta de
     `prepareModels` (roteador STT + `expectedModelIds`), sem a sondagem da nuvem. */
  const modelosDaCaptura: ModeloDaCaptura[] = useMemo(() => {
    const ouvir = baseLang(targetLang);
    const meu = baseLang(sourceLang);
    const rota = routeStt({
      contentLang: ouvir,
      micLang: micEnabled && micEngine === 'whisper' ? meu : '',
      autoDetect: autoDetectLang || autoDetectMyLang,
      quality: sttQuality,
      hasWebGpu: temGpu,
      cloudAvailable: false,
      profileId: getActiveProfile().id,
      dispositivo: dispositivoDaRota(perfilDoAparelho),
    });
    // Só microfone: o tradutor é o da SUA fala (o mesmo sentido que `prepareModels` carrega).
    const [mtDe, mtPara] = captureScenario === 'mic' ? [meu, ouvir] : [ouvir, meu];
    return expectedModelIds(mtDe, mtPara, rota.localModel).map((id) =>
      id === rota.localModel
        ? {
            id,
            // "Transcrição (Whisper small)", como no protótipo: o nome do modelo, legível — e
            // "Transcrição (Moonshine base)" no inglês, sem o sufixo de formato do id do Hub.
            titulo: `Transcrição (${nomeLegivelDoModelo(id)}${rota.dtype === 'q8' && !/moonshine/i.test(id) ? ' q8' : ''})`,
            // O tamanho do DTYPE que a rota pede (q8 no celular/Quest: 80 MB em vez de 209 no base).
            mbEstimado: tamanhoDoDownloadMb(id, rota.dtype) ?? undefined,
            medido: !!MODEL_DOWNLOAD_MEDIDO[id],
          }
        : {
            id,
            // O tradutor também baixa (~113 MB por par em q8): o aviso de download conta os dois.
            mbEstimado: tamanhoDoDownloadMb(id) ?? undefined,
            /* "Tradutor inglês → português (opus-mt)": o protótipo escreve ↔, mas cada opus-mt traduz
               num sentido só (en-ROMANCE ou ROMANCE-en) — a seta diz o que o modelo faz. */
            titulo: /en-ROMANCE/i.test(id)
              ? `Tradutor ${langLabelNaUI('en')} → ${langLabelNaUI(baseLang(meu) === 'en' ? ouvir : meu)} (opus-mt)`
              : /ROMANCE-en/i.test(id)
                ? `Tradutor ${langLabelNaUI(baseLang(ouvir) === 'en' ? meu : ouvir)} → ${langLabelNaUI('en')} (opus-mt)`
                : `Tradutor (${id.split('/').pop()})`,
          },
    );
  }, [
    targetLang,
    sourceLang,
    micEnabled,
    micEngine,
    autoDetectLang,
    autoDetectMyLang,
    sttQuality,
    temGpu,
    perfilDoAparelho,
    captureScenario,
  ]);
  /* AVISO ANTES DE BAIXAR (perfil do aparelho): com economia de dados, rede abaixo de 4g, ou mais de
     100 MB no celular/Quest, a captura pergunta ANTES do primeiro byte, com o tamanho real do que
     falta (só o que não está no navegador). Confirmado uma vez, não pergunta de novo nesta tela. */
  /* Agora é a folha do início (`inicioDaCaptura.ts`, logo abaixo): o tamanho é o que a escolha do
     motor baixa de verdade, e o cache é conferido quando a tela abre (`usePreparoDoInicio`). */
  const downloadConfirmadoRef = useRef(false);

  /** O tamanho do modelo que a captura baixa (o selo "modelo local · N MB" do protótipo). */
  /* Só o STT (o primeiro da lista, ver `expectedModelIds`): o selo fala do modelo de transcrição. O
     tradutor aparece com o tamanho dele no diálogo "Modelo no dispositivo" e entra no aviso de download. */
  const mbDoModelo = modelosDaCaptura[0]?.mbEstimado ?? 0;

  /* O download do "Privado" na pergunta do microfone: o modelo que a rota do STT carrega quando a SUA
     voz vai ao Whisper (`micLang` = o seu idioma), no dtype deste aparelho. */
  const mbDoMicPrivado = useMemo(() => {
    const rota = routeStt({
      contentLang: baseLang(targetLang),
      micLang: baseLang(sourceLang),
      autoDetect: autoDetectLang || autoDetectMyLang,
      quality: sttQuality,
      hasWebGpu: temGpu,
      cloudAvailable: false,
      profileId: getActiveProfile().id,
      dispositivo: dispositivoDaRota(perfilDoAparelho),
    });
    return tamanhoDoDownloadMb(rota.localModel, rota.dtype);
  }, [targetLang, sourceLang, autoDetectLang, autoDetectMyLang, sttQuality, temGpu, perfilDoAparelho]);

  /* A FOLHA DO INÍCIO (`inicioDaCaptura.ts`) — o que o toque em Iniciar precisa saber, pronto desde
     que a tela abriu (`usePreparoDoInicio`): o clique não espera cache nem sonda nenhuma. As peças
     são as da rota com a SUA voz no Whisper (o caso que baixa); o modelo é um só para as duas fontes. */
  const pecasDoInicio = useMemo(() => {
    const ouvir = baseLang(targetLang);
    const meu = baseLang(sourceLang);
    const rota = routeStt({
      contentLang: ouvir,
      micLang: micEnabled ? meu : '',
      autoDetect: autoDetectLang || autoDetectMyLang,
      quality: sttQuality,
      hasWebGpu: temGpu,
      cloudAvailable: false,
      profileId: getActiveProfile().id,
      dispositivo: dispositivoDaRota(perfilDoAparelho),
    });
    const [mtDe, mtPara] = captureScenario === 'mic' ? [meu, ouvir] : [ouvir, meu];
    const tradutores = expectedModelIds(mtDe, mtPara, rota.localModel).filter((id) => id !== rota.localModel);
    return {
      stt: rota.localModel,
      mbStt: tamanhoDoDownloadMb(rota.localModel, rota.dtype) ?? 0,
      tradutores: tradutores.map((id) => ({ id, mb: tamanhoDoDownloadMb(id) ?? 0 })),
    };
  }, [
    targetLang,
    sourceLang,
    micEnabled,
    autoDetectLang,
    autoDetectMyLang,
    sttQuality,
    temGpu,
    perfilDoAparelho,
    captureScenario,
  ]);
  const preparoDoInicio = usePreparoDoInicio({
    modelos: [pecasDoInicio.stt, ...pecasDoInicio.tradutores.map((m) => m.id)],
    langDoMic: sourceLang,
    sondarMic: webSpeechSupported && micEngine === 'browser',
    gravando: isRecording,
  });
  /** No celular só com o microfone, o tradutor espera a primeira legenda (não entra no download inicial). */
  const tradutorDepois = tradutorDepoisDaPrimeiraLegenda({ tipo: perfilDoAparelho.tipo, sistemaLigado: systemEnabled });
  const planoDoInicio = (escolha: EscolhaDoMic | null): PassoDoInicio => {
    const completos = preparoDoInicio.completos;
    const falta = (id: string, mb: number) => (completos?.has(id) ? 0 : mb);
    return planejarInicio({
      micEnabled,
      systemEnabled,
      motor: {
        preferido: micEngine,
        webSpeechSuportado: webSpeechSupported,
        noAparelho: preparoDoInicio.noAparelho,
        consentiuNavegador: escolha === 'rapido',
        rapidoPermitido: rapidoDoMicPermitido(),
        perfilId: getActiveProfile().id,
        escolha,
        podeInstalarPacote: preparoDoInicio.podeInstalarPacote,
      },
      mbStt: falta(pecasDoInicio.stt, pecasDoInicio.mbStt),
      mbTradutor: tradutorDepois ? 0 : pecasDoInicio.tradutores.reduce((s, m) => s + falta(m.id, m.mb), 0),
      limiteDeDownloadMb: perfilDoAparelho.confirmarDownloadAcimaDeMb,
      downloadJaConfirmado: downloadConfirmadoRef.current,
      modoNuvem: getProviderMode() === 'cloud',
    });
  };
  /** Começa AGORA — sempre de dentro de um toque (Iniciar, a folha, a ajuda do microfone). */
  const comecarCaptura = () => {
    if (!micEnabled && !systemEnabled) return handleStartOrResume(); // o aviso "Selecione ao menos uma fonte"
    setFalhaDoMic(null);
    // Dentro do gesto, antes de qualquer `await`: no iPhone, o áudio criado depois pode ficar mudo.
    if (micEnabled) abrirContextoDoClique();
    setAbrindoCaptura(true);
    handleStartOrResume();
  };
  /** O toque em Iniciar: começa já, ou abre a folha quando há o que decidir (nunca duas janelas). */
  const iniciarCaptura = (escolha?: EscolhaDoMic) => {
    if (abrindoCaptura) return;
    const passo = planoDoInicio(escolha ?? escolhaDoMic);
    if (passo.tipo === 'folha') {
      setFolhaDoInicio(passo);
      return;
    }
    comecarCaptura();
  };
  /** A ajuda do microfone: tentar de novo e, quando o Rápido falhou, trocar para o Privado num toque. */
  const tentarMicrofoneDeNovo = (privado: boolean) => {
    setFalhaDoMic(null);
    if (privado) trocarEscolhaDoMic('privado');
    if (isRecordingRef.current) {
      // Outra fonte segue aberta (a aba): só o microfone recomeça.
      abrirContextoDoClique();
      setMicAbrindo(true);
      void startMic().finally(() => setMicAbrindo(false));
      return;
    }
    iniciarCaptura(privado ? 'privado' : undefined);
  };
  /** "Permita o microfone" logo antes do pedido do navegador (e enquanto ele está na tela). */
  const pedindoPermissao =
    micEnabled && (abrindoCaptura || micAbrindo) && preparoDoInicio.permissao !== 'granted' && !falhaDoMic;
  const avisoDePermissao = pedindoPermissao && (
    <p className="aviso-info" role="status" data-testid="aviso-permita-o-microfone">
      <Mic aria-hidden />
      <span>
        <strong>{t('Permita o microfone.')}</strong>{' '}
        {t('Quando o navegador perguntar, toque em Permitir. A legenda começa assim que o microfone abrir.')}
      </span>
    </p>
  );

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

      {/* --- AVISO DE MODO RETOMAR --- */}
      {resumeId && (
        <div className="px-6 py-2.5 bg-accent-soft border-b border-accent/20 flex items-center justify-between gap-3 shrink-0 z-20 animate-in slide-in-from-top duration-200">
          <span className="text-[12px] font-bold text-accent-ink flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Retomando: {customSessionTitle || (recordings ?? []).find((r) => r.id === resumeId)?.title || 'sessão'}
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

      {/* --- AJUSTES DA CAPTURA: o `dialogoAjustesCaptura()` do protótipo (C1) ---
          Um `<dialog>` nativo: Esc e o foco preso vêm de graça, e a tela principal fica estável
          por baixo. Todos os controles são os de antes; mudou o desenho. */}
      {showConfigPanel && (
        <Dialogo
          icone={SlidersHorizontal}
          titulo={
            ageProfile === 'kids'
              ? 'Ajustes de áudio'
              : ageProfile === 'senior'
                ? 'Configurações do som'
                : 'Dispositivos e modelos de IA'
          }
          sub={
            ageProfile === 'senior'
              ? 'De onde vem o som e como ele vira texto.'
              : 'De onde vem o som, quem transcreve e como a legenda aparece.'
          }
          largura="largo"
          aoFechar={() => {
            play('close');
            setShowConfigPanel(false);
          }}
        >
          <div className="dlg-corpo pilha-g rola-dlg">
            {/* ÁUDIO DO SISTEMA — como o som do computador chega (a decisão que realmente importa). */}
            <section>
              <h3 className="h-op">
                <MonitorSpeaker aria-hidden /> Áudio do sistema
              </h3>
              <p className="mut aj">Como o som do computador chega até o app.</p>
              {!systemEnabled ? (
                /* Sem getDisplayMedia não há rota nenhuma para escolher: nem aba/tela, nem loopback
                   (Stereo Mix/VB-Cable são do Windows), nem o servidor local. Explica em vez de oferecer
                   três opções que falhariam. */
                <p className="aviso-info">
                  <TriangleAlert aria-hidden />
                  <span>
                    {t(
                      'Este navegador não oferece captura do som do sistema (a função getDisplayMedia não existe no Android, no iPhone nem no Meta Quest). A captura usa só o microfone.',
                    )}
                  </span>
                </p>
              ) : (
                <>
                  {/* A ROTA é a decisão mais técnica desta tela. Em Kids/Sênior ela abre recolhida: o
                  padrão já é a melhor rota disponível. Continua a um clique. */}
                  {coreOnly(ageProfile) && !showAdvancedRoutes ? (
                    <button type="button" className="link" onClick={() => setShowAdvancedRoutes(true)}>
                      Trocar a forma de captar o som
                    </button>
                  ) : (
                    <Segmentos<'server' | 'display' | 'loopback'>
                      rotulo="Como capturar o áudio do sistema"
                      atual={systemSource}
                      aoTrocar={setSystemSource}
                      opcoes={
                        [
                          ...(serverCaptureAvailable ? [['server', 'Computador ★']] : []),
                          ['display', 'Compartilhar aba ou tela'],
                          ['loopback', 'Dispositivo de loopback'],
                        ] as Array<['server' | 'display' | 'loopback', string]>
                      }
                    />
                  )}
                  {systemSource === 'loopback' ? (
                    <div className="pilha entra" style={{ marginTop: 10 }}>
                      <select
                        className="campo"
                        aria-label="Dispositivo de loopback"
                        value={loopbackDeviceId}
                        onChange={(e) => setLoopbackDeviceId(e.target.value)}
                      >
                        <option value="">
                          {loopbackDetected ? 'Selecione o dispositivo de loopback…' : 'Dispositivo padrão do sistema'}
                        </option>
                        {loopbackDevices.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Entrada ${i + 1}`}
                          </option>
                        ))}
                      </select>
                      {!loopbackDetected && (
                        <p className="aviso-info warn">
                          <TriangleAlert aria-hidden />
                          <span>Nenhum dispositivo de loopback detectado: siga um dos dois caminhos abaixo.</span>
                        </p>
                      )}
                      {/* O passo a passo abre sozinho quando não há dispositivo ou o teste falha. */}
                      <details
                        className="det"
                        open={showSetupGuide}
                        onToggle={(e) => setShowSetupGuide((e.currentTarget as HTMLDetailsElement).open)}
                      >
                        <summary>Como configurar (2 caminhos)</summary>
                        <ol className="mut" style={{ fontSize: 13, marginTop: 8, paddingLeft: 18 }}>
                          <li>
                            <b>Mixagem estéreo:</b> Painel de som → Gravação → clique direito → Mostrar dispositivos
                            desativados → ative &quot;Mixagem estéreo&quot; e escolha-a acima.
                          </li>
                          <li>
                            <b>VB-Cable:</b> instale o{' '}
                            <a href="https://vb-audio.com/Cable/" target="_blank" rel="noreferrer" className="link">
                              VB-Cable
                            </a>
                            , defina &quot;CABLE Input&quot; como saída do Windows (ative &quot;Escutar este
                            dispositivo&quot; para continuar ouvindo) e escolha &quot;CABLE Output&quot; aqui.
                          </li>
                        </ol>
                        {!loopbackDetected && (
                          <p className="mut aj">
                            Se já ativou, conceda a permissão do microfone e recarregue a página.
                          </p>
                        )}
                      </details>
                    </div>
                  ) : systemSource === 'display' ? (
                    <p className="aviso-info entra" style={{ marginTop: 10 }}>
                      <Info aria-hidden />
                      <span>
                        Ao iniciar, o navegador pergunta qual aba, janela ou tela compartilhar.{' '}
                        <b style={{ color: 'var(--ink)' }}>Marque &quot;Compartilhar áudio&quot;</b>, ou a legenda fica
                        muda. Janela e tela levam o som do computador, menos o do próprio Chrome: vídeo numa aba,
                        compartilhe a aba.
                        {audioDaTelaFalhou && (
                          <>
                            {' '}
                            <b style={{ color: 'var(--ink)' }}>
                              Neste computador o Windows já recusou o áudio da janela/tela: prefira a aba ou o
                              dispositivo de loopback.
                            </b>
                          </>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className="mut aj" style={{ marginTop: 8 }}>
                      <CircleCheck
                        aria-hidden
                        style={{
                          width: 14,
                          height: 14,
                          display: 'inline',
                          verticalAlign: -2,
                          color: 'var(--good-ink)',
                        }}
                      />{' '}
                      O servidor local pega o som de tudo o que toca no computador, sem pedir permissão a cada vez. Ele
                      escuta a saída padrão do Windows.
                    </p>
                  )}
                  {/* TESTE de diagnóstico: prova, no PC real, se o áudio chega mesmo. */}
                  <div className="linha" style={{ gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-outline peq"
                      onClick={handleProbeSystem}
                      disabled={probing}
                    >
                      {probing ? <Loader2 aria-hidden className="animate-spin" /> : <Activity aria-hidden />}
                      {probing ? 'Ouvindo… deixe algo tocando' : 'Testar a captura'}
                    </button>
                    {probe?.verdict === 'ok' && (
                      <span className="badge ok" role="status">
                        <Check aria-hidden /> OK · pico {probe.peakLevel} · {probe.audioTrackCount}{' '}
                        {probe.audioTrackCount === 1 ? 'faixa' : 'faixas'}
                      </span>
                    )}
                    {probe?.verdict === 'silent' && (
                      <span className="badge warn" role="status">
                        <VolumeX aria-hidden /> Silenciosa: dê play em algo e teste de novo
                      </span>
                    )}
                    {probe?.verdict === 'no-audio-track' && (
                      <span className="badge warn" role="status">
                        <VolumeX aria-hidden /> Nenhuma faixa de áudio chegou
                      </span>
                    )}
                  </div>
                  {probe && probe.verdict !== 'ok' && (
                    <p className="mut aj" style={{ marginTop: 6 }}>
                      {systemSource === 'loopback'
                        ? 'Confirme que o dispositivo escolhido é a Mixagem estéreo ou o CABLE Output, e que a saída do Windows aponta para ele.'
                        : probe.verdict === 'silent'
                          ? 'A faixa veio, mas sem som. Deixe um vídeo ou música tocando durante o teste.'
                          : 'Escolha uma aba e marque o áudio da aba, ou a tela inteira com "Compartilhar o áudio do sistema".'}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* MICROFONE — motor + dispositivo */}
            <section>
              <h3 className="h-op">
                <Mic aria-hidden /> Microfone
              </h3>
              <CampoLinha
                rotulo="Quem transcreve a sua voz"
                desc={
                  micEngine === 'browser'
                    ? t(
                        'Reconhecimento do navegador: no aparelho quando ele conhece o idioma; senão, como está logo abaixo.',
                      )
                    : 'Roda no seu computador (Moonshine em inglês, Whisper nos outros idiomas); funciona sem internet.'
                }
              >
                <div className="seg" role="radiogroup" aria-label="Motor do microfone">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={micEngine === 'browser'}
                    disabled={!webSpeechSupported}
                    onClick={() => setMicEngine('browser')}
                  >
                    Navegador (rápido)
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={micEngine === 'whisper'}
                    onClick={() => setMicEngine('whisper')}
                  >
                    Local (offline)
                  </button>
                </div>
              </CampoLinha>
              {/* "RÁPIDO" OU "PRIVADO" — a mesma escolha da pergunta da primeira vez, trocável aqui.
                  Perfil Privado e perfil protegido não têm o "Rápido" (`motorDoMicrofone.ts`). */}
              {micEngine === 'browser' && webSpeechSupported && (
                <CampoLinha
                  rotulo={t('Sem reconhecimento no aparelho')}
                  desc={
                    getActiveProfile().id === 'local-private'
                      ? t('Perfil Privado: a sua voz é transcrita neste aparelho.')
                      : !rapidoDoMicPermitido()
                        ? t('Neste perfil, a sua voz é transcrita neste aparelho.')
                        : escolhaDoMic === 'rapido'
                          ? t('Rápido: o áudio da sua voz vai ao Google, à Microsoft ou à Apple, conforme o navegador.')
                          : t('Privado: a transcrição roda neste aparelho, com um modelo baixado uma vez.')
                  }
                >
                  {getActiveProfile().id !== 'local-private' && rapidoDoMicPermitido() && (
                    <div className="seg" role="radiogroup" aria-label={t('Rápido ou Privado')}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={escolhaDoMic === 'rapido'}
                        onClick={() => trocarEscolhaDoMic('rapido')}
                      >
                        {t('Rápido')}
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={escolhaDoMic !== 'rapido'}
                        onClick={() => trocarEscolhaDoMic('privado')}
                      >
                        {t('Privado')}
                      </button>
                    </div>
                  )}
                </CampoLinha>
              )}
              <CampoLinha
                rotulo="Dispositivo"
                desc={
                  micEngine === 'browser'
                    ? 'Com o motor do navegador, quem escolhe o microfone é o navegador.'
                    : !deviceLabelsReady
                      ? 'Os nomes dos dispositivos exigem permissão do microfone.'
                      : undefined
                }
              >
                {/* Enumeração REAL (enumerateDevices). Só o Whisper honra a escolha. */}
                <select
                  className="campo"
                  aria-label="Microfone"
                  value={inputDeviceId}
                  disabled={micEngine === 'browser'}
                  onChange={(e) => setInputDeviceId(e.target.value)}
                >
                  <option value="">Microfone padrão do sistema</option>
                  {audioInputs
                    .filter((d) => d.deviceId)
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microfone ${i + 1}`}
                      </option>
                    ))}
                </select>
              </CampoLinha>
              {!deviceLabelsReady && micEngine === 'whisper' && (
                <button
                  type="button"
                  className="link"
                  style={{ marginTop: 8 }}
                  onClick={async () => {
                    // Pede a permissão AGORA só para destravar os nomes; a faixa é fechada na hora.
                    try {
                      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                      s.getTracks().forEach((t) => t.stop());
                      const { inputs, outputs, hasLabels } = await listDevices();
                      setAudioInputs(inputs);
                      setAudioOutputs(outputs);
                      setDeviceLabelsReady(hasLabels);
                    } catch {
                      setFeedbackMsg('Permissão do microfone negada, os nomes dos dispositivos ficam ocultos.');
                      setTimeout(() => setFeedbackMsg(''), 4000);
                    }
                  }}
                >
                  Listar os dispositivos
                </button>
              )}
            </section>

            {/* SAÍDA — real via setSinkId (aplica ao player de gravações). */}
            <section>
              <h3 className="h-op">
                <Headphones aria-hidden /> Saída
              </h3>
              <CampoLinha
                rotulo="Onde as gravações tocam"
                desc={
                  supportsSinkId()
                    ? 'A voz falada (leitura em voz alta) usa a saída padrão do sistema.'
                    : 'Este navegador não deixa escolher a saída de áudio.'
                }
              >
                <select
                  className="campo"
                  aria-label="Saída de áudio"
                  value={outputDeviceId}
                  disabled={!supportsSinkId()}
                  onChange={(e) => setOutputDeviceId(e.target.value)}
                >
                  <option value="">Saída padrão do sistema</option>
                  {audioOutputs
                    .filter((d) => d.deviceId)
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Saída ${i + 1}`}
                      </option>
                    ))}
                </select>
              </CampoLinha>
            </section>

            {/* TRANSCRIÇÃO — o motor que o perfil ativo usa, a qualidade (roteador) e o desempenho. */}
            <section>
              <h3 className="h-op">
                <Cpu aria-hidden /> Transcrição
              </h3>
              <CampoLinha rotulo="Motor de IA ativo" desc={`Perfil ${activeProfileName}. Troque em Ajustes.`}>
                <span className="badge neu">
                  <Cpu aria-hidden />{' '}
                  {sistemaNoNavegador
                    ? t('Reconhecimento do navegador, no aparelho')
                    : getProviderMode() === 'cloud'
                      ? 'Nuvem (sua chave)'
                      : 'Local, no dispositivo'}
                </span>
              </CampoLinha>
              <CampoLinha
                rotulo="Qualidade"
                desc={
                  {
                    auto: 'Escolhe o motor pelo idioma: inglês no modelo leve; os outros na nuvem, se houver chave, ou no melhor modelo local.',
                    fast: 'Modelo leve local: legenda quase sem atraso, erra mais fora do inglês.',
                    accurate: 'Melhor modelo local: mais certo, download maior e mais pesado.',
                    cloud: 'Manda o áudio para a nuvem com a sua chave. Mais preciso, sai do aparelho.',
                  }[sttQuality]
                }
              >
                <select
                  className="campo"
                  id="stt-quality"
                  name="sttQuality"
                  aria-label="Qualidade da transcrição"
                  value={sttQuality}
                  onChange={(e) => {
                    const q = e.target.value as SttQuality;
                    setSttQuality(q);
                    setSttQualityMirror(q);
                    void patchUiSettings({ sttQuality: q });
                  }}
                >
                  <option value="auto">Automática (recomendado)</option>
                  <option value="fast">Rápida</option>
                  <option value="accurate">Precisa</option>
                  <option value="cloud">Nuvem</option>
                </select>
              </CampoLinha>
              <CampoLinha
                rotulo="Modo desempenho (jogos)"
                desc="Legenda só no fim de cada frase, sem o refino ao vivo: usa bem menos processador enquanto você joga."
              >
                <Interruptor ligado={perfMode} aoTrocar={() => setPerfMode((v) => !v)} rotulo="Modo desempenho" />
              </CampoLinha>
              {/* TRADUÇÃO SOB DEMANDA (M0): o padrão é traduzir tudo, como sempre. */}
              <CampoLinha
                rotulo={t('Tradução')}
                desc={
                  {
                    sempre: t('Toda frase ganha tradução assim que termina.'),
                    pedir: t('Nenhuma frase é traduzida sozinha: toque em "Mostrar tradução" na frase que quiser.'),
                    novas: t(
                      'Frases em que você já sabe todas as palavras ficam sem tradução, e dá para mostrar com um toque.',
                    ),
                  }[modoTraducao]
                }
              >
                <select
                  className="campo"
                  id="modo-traducao"
                  name="modoTraducao"
                  aria-label={t('Tradução')}
                  value={modoTraducao}
                  onChange={(e) => updateSetting('traducao', modoDeTraducao(e.target.value))}
                >
                  <option value="sempre">{t('Sempre')}</option>
                  <option value="pedir">{t('Só quando eu pedir')}</option>
                  <option value="novas">{t('Só frases com palavra nova')}</option>
                </select>
              </CampoLinha>
            </section>

            {/* APARÊNCIA DA LEGENDA — os mesmos ajustes que a transcrição ao vivo lê. */}
            <section>
              <h3 className="h-op">
                <Type aria-hidden /> {ageProfile === 'senior' ? 'Como a legenda aparece' : 'Aparência da legenda'}
              </h3>
              <TranscriptVisualSettings idPrefix="cfg-visual" tsSettings={tsSettings} updateSetting={updateSetting} />
            </section>
          </div>
          <div className="dlg-pe">
            <button type="button" className="link" style={{ marginRight: 'auto' }} onClick={voltarAoPadrao}>
              Voltar ao padrão
            </button>
            <button type="button" className="btn btn-solid" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
              <Check aria-hidden /> Pronto
            </button>
          </div>
        </Dialogo>
      )}

      {/* --- DASHBOARD WRAPPER --- */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        {/* ============================================== */}
        {/* LEFT COLUMN: PRIMARY WORKSPACE & STREAMS       */}
        {/* ============================================== */}
        <div className="rolagem flex-1">
          {/* ============================================== */}
          {/* WORKSPACE VIEWPORTS (SEPARATE AREAS)          */}
          {/* ============================================== */}
          <div className="tela larga entra">
            <AvisoDeNuvemSemConsentimento />
            {/* Cabeçalho no molde do protótipo aprovado (`T.capturar`): rótulo, título, apoio e, à
                direita, o modelo local, os ajustes da captura e o guia. */}
            <CabecalhoDeTela
              icone={ageProfile === 'kids' ? Gamepad2 : ageProfile === 'senior' ? Eye : Cpu}
              sobrancelha="Transcrição no dispositivo"
              titulo={
                ageProfile === 'kids'
                  ? 'Gravador de jogos e legendas'
                  : ageProfile === 'senior'
                    ? 'Gravação com tradução direta'
                    : 'Capturar'
              }
              sub={
                ageProfile === 'kids'
                  ? 'Grave o som do Roblox, de vídeos ou do microfone e veja a legenda aparecer em tempo real.'
                  : ageProfile === 'senior'
                    ? 'Siga os passos abaixo para gravar o som do computador ou a sua voz e ver o texto em português.'
                    : 'Transcreve e traduz o que você ouve e fala, em tempo real.'
              }
              acoes={
                <>
                  <button
                    type="button"
                    className="badge neu badge-botao"
                    onClick={() => setModeloAberto(true)}
                    aria-label={
                      mbDoModelo
                        ? `Modelo no dispositivo, ${mbDoModelo} MB: ver detalhes`
                        : 'Modelo no dispositivo: ver detalhes'
                    }
                  >
                    <Cpu aria-hidden /> modelo local{mbDoModelo ? ` · ${mbDoModelo} MB` : ''}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline peq"
                    onClick={() => setShowConfigPanel(!showConfigPanel)}
                    aria-label="Ajustes da captura"
                  >
                    <SlidersHorizontal aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline peq"
                    onClick={() => setShowGuide(true)}
                    aria-label="Ajuda"
                  >
                    <CircleHelp aria-hidden />
                  </button>
                </>
              }
            />
            {/* TRANSCRIÇÃO AO VIVO (modo único da tela) */}
            {
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
                    Resultado: iniciar uma captura = 1 clique.
                    FUNDO ESCURO (extensão do padrão do Hub/redesign): esta é a ação PRIMÁRIA da
                    tela inteira — o mesmo peso visual que o card "Escutar e traduzir" tem no Hub. */}
                  <section className="cartao escuro estudio" aria-label="Espaço de gravação">
                    <div className="estudio-topo">
                      <h2>
                        <span className={`ponto ${isRecording ? 'vivo' : ''}`} />
                        Espaço de gravação
                      </h2>
                      <div className="linha" style={{ gap: 8 }}>
                        <button
                          ref={entrarNoFocoRef}
                          type="button"
                          className="btn btn-outline peq"
                          onClick={() => setIsFocusMode(true)}
                        >
                          <Maximize2 aria-hidden /> Foco cheio
                        </button>
                      </div>
                    </div>
                    <div className="estudio-acoes">
                      {isRecording ? (
                        <button type="button" className="btn btn-outline" onClick={handleStopRecording} data-sfx="none">
                          <Square aria-hidden />
                          {ageProfile === 'senior'
                            ? 'Parar e salvar a gravação'
                            : ageProfile === 'kids'
                              ? 'Parar gravação'
                              : 'Parar captura'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-solid"
                          onClick={() => iniciarCaptura()}
                          disabled={(!micEnabled && !systemEnabled) || abrindoCaptura}
                        >
                          {abrindoCaptura ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}
                          {abrindoCaptura
                            ? micEnabled
                              ? t('Abrindo o microfone…')
                              : t('Abrindo a captura…')
                            : ageProfile === 'senior'
                            ? resumeId
                              ? 'Continuar a gravação da aula'
                              : 'Iniciar a gravação de áudio'
                            : ageProfile === 'kids'
                              ? resumeId
                                ? 'Continuar gravação'
                                : 'Começar a gravar'
                              : resumeId
                                ? 'Continuar captura'
                                : 'Iniciar captura'}
                        </button>
                      )}
                      {botaoDoMicrofone()}
                      {botaoDasLegendas()}
                      <span style={{ flex: 1 }} />
                      {/* O PAR NUM CHIP. Os dois seletores e a explicação da direção ocupavam três
                          linhas fixas da tela — informação que se lê UMA vez e se muda quase nunca,
                          disputando espaço com o único gesto que importa aqui. Agora o chip mostra
                          o par (com bandeira, como no resto do app) e a gaveta guarda a edição.
                          Os AVISOS ficaram de fora dela de propósito: são a parte que a pessoa
                          precisa ver sem clicar em nada. */}
                      <button
                        type="button"
                        onClick={() => setIdiomasAbertos(true)}
                        aria-haspopup="dialog"
                        className="btn btn-outline peq"
                      >
                        {rotuloDoPar} <ChevronDown aria-hidden />
                      </button>
                    </div>
                    <div className="linha">
                      <span className="relogio">{isRecording ? formatTime(timer) : '00:00'}</span>
                      {/* As ondas seguem o nível REAL do áudio capturado (sonda RMS), não uma animação. */}
                      {isRecording && (
                        <span className="ondas" aria-hidden>
                          {[0, 1, 2, 3, 4].map((k) => {
                            const lvl = levels[Math.floor((k * levels.length) / 5)] ?? 0;
                            return (
                              <i
                                key={k}
                                style={{ height: `${Math.max(18, Math.min(100, lvl * 120))}%`, animation: 'none' }}
                              />
                            );
                          })}
                        </span>
                      )}
                    </div>
                    {avisoDePermissao}

                    {/* UMA linha de orientação, e ela vale GRAVANDO TAMBÉM.
                      Antes só aparecia antes de iniciar — justamente quando o estado era mais fácil
                      de adivinhar. Agora que a fonte muda no meio da sessão, é durante a gravação
                      que a pessoa precisa ler, em palavras, se a própria voz está entrando. */}
                    {systemEnabled ? (
                      <p className="mut orientacao-da-captura" style={{ fontSize: 12.5, marginTop: 6 }}>
                        O som do computador entra sozinho. Dê play no vídeo, aula ou chamada e clique em Iniciar. A
                        legenda bilíngue aparece aqui e nas Legendas flutuantes.
                      </p>
                    ) : (
                      /* SEM getDisplayMedia (Quest, Android, iOS): nenhum botão de "áudio do sistema"
                         que não funcionaria — o microfone é a fonte, e a tela diz como usá-lo. */
                      <p className="aviso-info orientacao-da-captura" data-testid="aviso-sem-audio-do-sistema">
                        <Mic aria-hidden />
                        <span>
                          {perfilDoAparelho.tipo === 'quest'
                            ? t(
                                'O navegador do Meta Quest não capta o som do sistema: a legenda vem do microfone do headset. Deixe o vídeo tocar no alto-falante do próprio headset (o microfone capta) ou use a captura para conversar.',
                              )
                            : perfilDoAparelho.tipo.startsWith('celular')
                              ? /* O que FAZER, e não só o que falta (relato do dono, 2026-09-28): o
                                   celular não deixa um site ouvir outros apps, e isso não muda com
                                   ajuste nenhum. Os dois caminhos que funcionam, ditos. */
                                t(
                                  'No celular, o navegador não deixa captar o som de outros apps: a legenda vem do microfone. Para legendar um vídeo, deixe-o tocar no alto-falante, perto do microfone, ou use um computador (Chrome ou Edge, compartilhando a aba com o áudio).',
                                )
                              : t(
                                  'O navegador deste aparelho não capta o som do sistema: a legenda vem do microfone. Deixe o vídeo tocar no alto-falante, perto do microfone, ou use a captura para conversar.',
                                )}
                        </span>
                      </p>
                    )}

                    {/* Linha 5 — preparo dos modelos locais (progresso transitório; não é configuração).
                      Gravando, o progresso aparece na conversa (abaixo), onde a pessoa olha: mostrar
                      aqui também repetia o mesmo painel duas vezes na tela. */}
                    {modelPrep && !isRecording && <ModelPrepPanel state={modelPrep} onRetry={prepareModels} compact />}
                  </section>

                  {/* ══════════════ FALANTES (C5 do protótipo) ══════════════
                    Antes da conversa, no cenário Conversa: as vozes que o identificador local
                    separou (WeSpeaker, beta), com o % de fala real, renomear e adicionar. Sem a
                    separação automática, clicar num falante diz quem fala a seguir. */}
                  {captureScenario === 'conversation' && (
                    <section className="cartao escuro p6 falantes entra" aria-label="Falantes">
                      <div className="entre">
                        <h2 className="h-escuro">
                          <Users aria-hidden /> Quem está falando
                        </h2>
                        <div className="op-linha escuro-op">
                          <span>Separar vozes sozinho</span>
                          <Interruptor
                            ligado={speakerAutoId}
                            rotulo="Separar vozes automaticamente"
                            aoTrocar={() => {
                              const liga = !speakerAutoId;
                              setSpeakerAutoId(liga);
                              if (!liga) setSpeakerIdStatus('off');
                              toast.info(liga ? 'O app separa as vozes sozinho' : 'Você marca quem fala');
                            }}
                          />
                        </div>
                      </div>
                      <div className="linha" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        {speakerProfiles
                          .filter((f) => f.id !== 'user')
                          .map((f) =>
                            editingSpeakerId === f.id ? (
                              <form
                                key={f.id}
                                className="chip-falante"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSaveSpeakerName(f.id);
                                }}
                              >
                                <label className="sr" htmlFor={`ren-${f.id}`}>
                                  Nome do falante
                                </label>
                                <input
                                  id={`ren-${f.id}`}
                                  className="campo"
                                  style={{ minHeight: 30, width: 110 }}
                                  value={editingSpeakerName}
                                  onChange={(e) => setEditingSpeakerName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setEditingSpeakerId(null);
                                  }}
                                  autoFocus
                                />
                                <button className="btn btn-solid peq">OK</button>
                              </form>
                            ) : (
                              <span
                                key={f.id}
                                className="chip-falante"
                                aria-current={!speakerAutoId && f.isActive ? 'true' : undefined}
                                onClick={() => !speakerAutoId && handleSelectActiveSpeaker(f.id)}
                              >
                                <b>{f.name}</b>
                                {talkTimePct?.[f.id] != null && <span className="tn">{talkTimePct[f.id]}%</span>}
                                <button
                                  type="button"
                                  className="icone-min"
                                  aria-label={`Renomear ${f.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartRenameSpeaker(f.id, f.name);
                                  }}
                                >
                                  <Pencil aria-hidden />
                                </button>
                              </span>
                            ),
                          )}
                        <span
                          className="chip-falante voce"
                          aria-current={
                            !speakerAutoId && speakerProfiles.find((f) => f.id === 'user')?.isActive
                              ? 'true'
                              : undefined
                          }
                          onClick={() => !speakerAutoId && handleSelectActiveSpeaker('user')}
                        >
                          <b>Você</b>
                          <span className="tn">microfone</span>
                        </span>
                        <button type="button" className="btn btn-outline peq" onClick={handleAddSpeaker}>
                          <UserPlus aria-hidden /> Adicionar falante
                        </button>
                      </div>
                      {speakerAutoId && speakerIdStatus === 'loading' && (
                        <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
                          Carregando o separador de vozes (6,7 MB, uma vez)…
                        </p>
                      )}
                      {speakerAutoId && speakerIdStatus === 'unavailable' && (
                        <p className="mut" style={{ fontSize: 12, marginTop: 10 }}>
                          O separador de vozes não carregou: clique num nome para dizer quem fala.
                        </p>
                      )}
                    </section>
                  )}

                  {/* ══════════════ TRANSCRIÇÃO AO VIVO ══════════════ */}
                  <section
                    className={`cartao ${transcricaoEscura ? 'escuro' : ''} conversa flex flex-col flex-1 min-h-0`}
                    aria-label="Conversa"
                    aria-live="polite"
                  >
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
                      <div
                        ref={transcriptScrollRef}
                        onScroll={handleTranscriptScroll}
                        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pe-2"
                      >
                        {/* Primeiro contato: o download do modelo (dezenas de MB) acontecia atrás do painel de
                      ajustes, a tela dizia "Ouvindo…" por minutos sem explicar nada. Aqui, onde a pessoa olha. */}
                        {isRecording && modelPrep && !preparoConcluido(modelPrep) && (
                          <div className="mb-3">
                            <ModelPrepPanel state={modelPrep} onRetry={prepareModels} />
                          </div>
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
                          escuro={transcricaoEscura}
                          selectedWord={selectedExamWord?.word ?? null}
                          addedWords={addedWords}
                          aprendidas={aprendidas}
                          onExamineWord={(w, lang, frase) => void examineWord(w, lang, frase)}
                          onSpeakWord={speakWord}
                          onRevelarTraducao={revelarTraducao}
                          conhecidas={conhecidas}
                        />
                      </div>
                    </div>

                    {!isRecording && sessaoSalva && speechSegments.length > 0 && (
                      <div className="linha" style={{ marginTop: 18, gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-solid"
                          onClick={() => onChangeView?.('analysis', { id: sessaoSalva.id })}
                        >
                          <Save aria-hidden /> Abrir a sessão salva
                        </button>
                        <span className="mut" style={{ fontSize: 12.5 }}>
                          {sessaoSalva.palavras === null
                            ? 'Fichando o vocabulário…'
                            : sessaoSalva.palavras === 1
                              ? '1 palavra foi para o seu vocabulário.'
                              : `${sessaoSalva.palavras} palavras foram para o seu vocabulário.`}
                        </span>
                      </div>
                    )}

                    {/* Simulador de fala — FERRAMENTA DE DEV/TESTE, não de usuário final. Só aparece
                    com localStorage['babel.devTools']='1' (o harness __simSystem segue sempre
                    disponível no console p/ a bateria de regressão MCP). */}
                    {devToolsEnabled && (
                      <form
                        onSubmit={handleAddManualSpeechSegment}
                        className={`mt-2 flex gap-2 border-t pt-2 ${transcricaoEscura ? 'border-white/15' : 'border-border-subtle'}`}
                      >
                        <input
                          type="text"
                          id="sim-speaker-text"
                          name="simSpeakerText"
                          placeholder="Simular fala do orador... (dev)"
                          className={`flex-1 border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-accent font-medium ${transcricaoEscura ? 'bg-white/10 border-white/15 text-ink-contrast placeholder-white/40' : 'bg-canvas border-border-subtle text-ink placeholder-ink-faint'}`}
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
                  </section>
                </div>
              </EditablePanel>
            }
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

      {showGuide && (
        <GuidePanel
          mbDoModelo={mbDoModelo || undefined}
          onClose={() => setShowGuide(false)}
          aoMaisAjuda={onChangeView ? () => onChangeView('ajuda') : undefined}
        />
      )}
      {idiomasAbertos && (
        <IdiomasDaSessao
          sub={
            captureScenario === 'conversation'
              ? 'Com o microfone ligado, a conversa tem dois lados.'
              : captureScenario === 'mic'
                ? 'Só o microfone: a sua fala entra, a tradução sai.'
                : 'Só o som do computador: um idioma entra, outro sai.'
          }
          lados={ladosDoPar}
          resumo={resumoDaDirecao()}
          avisos={avisosDoPar}
          aoFechar={() => setIdiomasAbertos(false)}
        />
      )}
      {modeloAberto && (
        <ModeloNoDispositivo
          rota={sttRouteLabel}
          modelos={modelosDaCaptura}
          nuvem={getProviderMode() === 'cloud'}
          aoFechar={() => setModeloAberto(false)}
        />
      )}

      {/* FIXED FOCUS FULLSCREEN OVERLAY */}
      {/* GUIA DO COMPARTILHAMENTO SEM ÁUDIO — o caminho de volta, não só o aviso. */}
      {guiaDeAudio && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-label="Como compartilhar com áudio"
        >
          <div className="card-panel bg-surface w-full max-w-md p-6">
            <h2 className="font-display font-extrabold text-lg text-ink mb-2">
              {guiaDeAudio === 'AUDIO_DA_TELA_INDISPONIVEL'
                ? 'O Windows não liberou o áudio'
                : guiaDeAudio === 'JANELA_SEM_AUDIO'
                  ? 'A janela veio sem áudio'
                  : 'Faltou marcar o áudio'}
            </h2>
            <div className="text-[13.5px] text-ink-muted leading-relaxed space-y-2">
              {guiaDeAudio === 'AUDIO_DA_TELA_INDISPONIVEL' ? (
                <>
                  <p>
                    O Windows recusou o áudio desta janela/tela (acontece com a saída de som em 5.1/7.1). Dois caminhos
                    funcionam:
                  </p>
                  <ol className="list-decimal ms-5 space-y-1">
                    <li>
                      <b className="text-ink">Aba do Chrome</b>: escolha a aba e deixe &quot;Compartilhar áudio da
                      guia&quot; ligado;
                    </li>
                    <li>
                      <b className="text-ink">Dispositivo de loopback</b> (Stereo Mix / VB-Cable): pega Discord, jogos e
                      o computador inteiro.
                    </li>
                  </ol>
                </>
              ) : guiaDeAudio === 'JANELA_SEM_AUDIO' ? (
                <>
                  <p>A janela foi compartilhada sem o áudio. Para jogos e apps fora do navegador:</p>
                  <ol className="list-decimal ms-5 space-y-1">
                    <li>
                      Clique em <b className="text-ink">Escolher de novo</b>;
                    </li>
                    <li>
                      Escolha a janela (ou a <b className="text-ink">Tela inteira</b>);
                    </li>
                    <li>
                      Ative <b className="text-ink">&quot;Compartilhar áudio do sistema&quot;</b> (canto inferior).
                    </li>
                  </ol>
                </>
              ) : (
                <>
                  <p>Você compartilhou, mas sem áudio. Repita a escolha e:</p>
                  <ol className="list-decimal ms-5 space-y-1">
                    <li>
                      Numa <b className="text-ink">aba</b>: marque "Compartilhar áudio da guia";
                    </li>
                    <li>
                      Na <b className="text-ink">Tela inteira</b>: marque "Também compartilhar o áudio do sistema".
                    </li>
                  </ol>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                onClick={() => setGuiaDeAudio(null)}
                className="px-4 py-2 rounded-xl border border-border-subtle text-[13px] font-bold text-ink-muted hover:text-ink cursor-pointer"
              >
                Cancelar
              </button>
              {guiaDeAudio === 'AUDIO_DA_TELA_INDISPONIVEL' && (serverCaptureAvailable || loopbackDetected) && (
                <button
                  onClick={() => {
                    // Troca a rota (persistida em settings.ui) e já abre por ela: a ref é lida ao abrir.
                    const rota = serverCaptureAvailable ? 'server' : 'loopback';
                    setGuiaDeAudio(null);
                    setSystemSource(rota);
                    systemSourceRef.current = rota;
                    // Sem dispositivo escolhido a rota abriria o microfone padrão: pega o 1º loopback detectado.
                    if (rota === 'loopback' && !loopbackDeviceIdRef.current && loopbackDevices[0]) {
                      setLoopbackDeviceId(loopbackDevices[0].deviceId);
                      loopbackDeviceIdRef.current = loopbackDevices[0].deviceId;
                    }
                    void handleStartSystemCapture();
                  }}
                  className="px-4 py-2 rounded-xl border border-border-subtle text-[13px] font-bold text-ink hover:border-accent cursor-pointer"
                >
                  Usar o loopback
                </button>
              )}
              <button
                onClick={() => {
                  setGuiaDeAudio(null);
                  void handleStartSystemCapture();
                }}
                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-ink text-white text-[13px] font-bold shadow-btn cursor-pointer"
              >
                {guiaDeAudio === 'AUDIO_DA_TELA_INDISPONIVEL' ? 'Escolher a aba' : 'Escolher de novo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOCO CHEIO — o `telaFoco()` do protótipo (C3): a conversa grande sobre o fundo escuro,
          o relógio e os atalhos em cima (visual, idiomas, sair) e os controles da sessão embaixo. */}
      {isFocusMode && (
        <div className="foco-cheio" role="dialog" aria-modal="true" aria-label="Foco cheio: tradução e transcrição">
          <div className="foco-topo">
            <span className="label-mono" style={{ color: 'inherit', opacity: 0.75 }}>
              Modo focado · tradução e transcrição
            </span>
            <span className="relogio tn">{isRecording ? formatTime(timer) : '00:00'}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn-outline peq" onClick={() => setShowConfigPanel(true)}>
              <Type aria-hidden /> Ajustar visual
            </button>
            {/* O par de idiomas, o mesmo chip da tela normal: trocar o idioma sem sair do foco. */}
            <button type="button" className="btn btn-outline peq" onClick={() => setIdiomasAbertos(true)}>
              {rotuloDoPar}
            </button>
            <button
              ref={sairDoFocoRef}
              type="button"
              className="btn btn-outline peq"
              onClick={() => setIsFocusMode(false)}
            >
              <Minimize2 aria-hidden /> Tela normal <kbd>Esc</kbd>
            </button>
          </div>

          <div className="relative flex-1 min-h-0 flex flex-col">
            {showJumpFocus && (
              <button
                type="button"
                onClick={() => jumpToCurrent('focus')}
                className="btn btn-solid peq absolute bottom-3 left-1/2 -translate-x-1/2 z-10"
              >
                <ArrowDown aria-hidden /> Ir para a fala atual
              </button>
            )}
            <div
              ref={focusScrollRef}
              onScroll={handleFocusScroll}
              className={`foco-conversa tema-${TEMA[tsSettings.textColor] ?? 'padrao'}`}
              style={{ minHeight: 0 }}
              aria-live="polite"
            >
              {/* Primeiro contato: o download do modelo acontece aqui, onde a pessoa olha. */}
              {isRecording && modelPrep && !preparoConcluido(modelPrep) && (
                <div className="mb-3">
                  <ModelPrepPanel state={modelPrep} onRetry={prepareModels} />
                </div>
              )}
              {speechSegments.length || isRecording ? (
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
                  escuro={transcricaoEscura}
                  selectedWord={selectedExamWord?.word ?? null}
                  addedWords={addedWords}
                  aprendidas={aprendidas}
                  onExamineWord={(w, lang, frase) => {
                    void examineWord(w, lang, frase);
                    setFeedbackMsg(`Examinando: "${w.word}"`);
                    setTimeout(() => setFeedbackMsg(''), 1500);
                  }}
                  onSpeakWord={speakWord}
                  onRevelarTraducao={revelarTraducao}
                  conhecidas={conhecidas}
                />
              ) : (
                <p className="foco-vazio">
                  <AudioLines aria-hidden /> Clique em Iniciar para começar.
                </p>
              )}
            </div>
          </div>

          {/* Os controles da sessão: gravar/parar, e os dois interruptores que se repetem durante
              ela (a própria voz e as legendas por cima do jogo). */}
          <div className="foco-pe">
            {isRecording ? (
              <button type="button" className="btn btn-outline" onClick={handleStopRecording} data-sfx="none">
                <Square aria-hidden /> Parar
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-solid"
                onClick={() => iniciarCaptura()}
                disabled={abrindoCaptura}
              >
                {abrindoCaptura ? <Loader2 aria-hidden className="animate-spin" /> : <Mic aria-hidden />}{' '}
                {abrindoCaptura
                  ? micEnabled
                    ? t('Abrindo o microfone…')
                    : t('Abrindo a captura…')
                  : resumeId
                    ? 'Continuar gravando'
                    : 'Iniciar transcrição'}
              </button>
            )}
            {botaoDoMicrofone()}
            {botaoDasLegendas()}
          </div>
          {avisoDePermissao}
        </div>
      )}

      {/* --- AVISO DE DOWNLOAD (perfil do aparelho): o tamanho real, antes do primeiro byte ---
          A folha do início sem a pergunta do motor (`inicioDaCaptura.ts`): o total é o que o motor já
          decidido baixa. "Agora não" cancela o início. */}
      {folhaDoInicio && !folhaDoInicio.perguntarMotor && (
        <Dialogo
          icone={Download}
          titulo={t('Baixar os modelos desta captura?')}
          sub={t('Uma vez só: depois eles ficam guardados neste aparelho.')}
          aoFechar={() => setFolhaDoInicio(null)}
        >
          <div className="dlg-corpo pilha" data-testid="aviso-de-download">
            <p>
              {t('A transcrição e a tradução no aparelho precisam de cerca de {mb} MB.', { mb: folhaDoInicio.mb })}
            </p>
            {perfilDoAparelho.sinais.economiaDeDados && (
              <p className="aviso-info warn">
                <TriangleAlert aria-hidden />
                <span>{t('A economia de dados está ligada neste navegador.')}</span>
              </p>
            )}
            {perfilDoAparelho.sinais.tipoDeRede && perfilDoAparelho.sinais.tipoDeRede !== '4g' && (
              <p className="aviso-info warn">
                <TriangleAlert aria-hidden />
                <span>
                  {t('A conexão parece lenta ({rede}): o download pode demorar.', {
                    rede: perfilDoAparelho.sinais.tipoDeRede,
                  })}
                </span>
              </p>
            )}
          </div>
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
              {t('Agora não')}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              onClick={(e) => {
                downloadConfirmadoRef.current = true;
                fecharDialogoDe(e.currentTarget);
                comecarCaptura();
              }}
            >
              <Download aria-hidden /> {t('Baixar e iniciar')}
            </button>
          </div>
        </Dialogo>
      )}

      {/* --- A FOLHA DO INÍCIO COM A PERGUNTA: "Rápido ou Privado?" + o que a escolha baixa, ANTES de a
          sessão existir. Escolher É o consentimento (guardado) e o "sim" ao download; "Agora não"
          cancela o início (nunca escolhe o Privado calado). --- */}
      {folhaDoInicio?.perguntarMotor && (
        <EscolhaDoMicrofone
          mb={mbDoMicPrivado}
          pacoteDoNavegador={folhaDoInicio.pacoteDoNavegador}
          inicio={{
            mbSePrivado: folhaDoInicio.mbSePrivado,
            mbSeRapido: folhaDoInicio.mbSeRapido,
            aparelhoLento: !perfilDoAparelho.tipo.startsWith('desktop'),
          }}
          aoEscolher={(e) => {
            trocarEscolhaDoMic(e);
            downloadConfirmadoRef.current = true;
            setFolhaDoInicio(null);
            comecarCaptura();
          }}
          aoFechar={() => setFolhaDoInicio(null)}
        />
      )}

      {/* --- O MICROFONE NÃO ABRIU: a ajuda daquele aparelho, com o caminho de volta --- */}
      {falhaDoMic && (
        <AjudaDoMicrofone
          ajuda={falhaDoMic}
          aoTentarDeNovo={() => tentarMicrofoneDeNovo(false)}
          aoTrocarParaPrivado={() => tentarMicrofoneDeNovo(true)}
          aoFechar={() => setFalhaDoMic(null)}
        />
      )}

      {/* --- "RÁPIDO" OU "PRIVADO" no meio da sessão (o mic ligado depois do Iniciar, pela 1ª vez) --- */}
      {pedidoDaEscolhaDoMic && (
        <EscolhaDoMicrofone
          mb={mbDoMicPrivado}
          pacoteDoNavegador={privadoPeloNavegador}
          aoEscolher={(e) => responderEscolhaDoMic(e)}
          aoFechar={() => responderEscolhaDoMic(null)}
        />
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
                onClick={() => {
                  setPendingNav(null);
                  if (isRecording) void handleStopRecording();
                  else setShowSaveModal(true);
                }}
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

      {/* --- ENCERRAR A SESSÃO: o `dialogoEncerrar()` do protótipo (C8) --- */}
      <input type="file" ref={coverFileRef} onChange={handleCoverUpload} accept="image/*" className="hidden" />
      {showSaveModal && (
        <EncerrarSessao
          nFalas={speechSegments.length}
          resumo={`${speechSegments.length} ${speechSegments.length === 1 ? 'fala' : 'falas'} · ${formatTime(timer)}`}
          retomada={!!resumeId}
          titulo={customSessionTitle}
          aoTrocarTitulo={setCustomSessionTitle}
          capa={customSessionImage}
          aoTrocarCapa={setCustomSessionImage}
          buscaInicial={imgQuery}
          aoEscolherArquivo={() => coverFileRef.current?.click()}
          aoContinuar={handleCancelStop}
          aoSalvar={(ir) => void handleFinalizeSave(ir)}
          aoDescartar={() => void descartarCaptura()}
        />
      )}

      {/* LEGENDAS FLUTUANTES (C6), alimentadas pelas falas REAIS. No Chrome/Edge numa janela
          sempre-no-topo (Document PiP); sem a API, flutuando no canto do app como no protótipo. */}
      {isDocumentPiPSupported() ? (
        <DocumentPiP
          isVisible={showOverlay}
          onClose={() => setShowOverlay(false)}
          backgroundColor="#141210"
          width={440}
          height={300}
        >
          <LegendasFlutuantes
            falas={legendasAoVivo}
            emJanela
            aprendidas={aprendidas}
            aoFechar={() => setShowOverlay(false)}
          />
        </DocumentPiP>
      ) : (
        showOverlay && (
          <LegendasFlutuantes
            falas={legendasAoVivo}
            emJanela={false}
            aprendidas={aprendidas}
            aoFechar={() => setShowOverlay(false)}
          />
        )
      )}
    </div>
  );
}
