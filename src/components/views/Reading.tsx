import EditablePanel from '../EditablePanel';
import React, { useState, useRef, useEffect } from 'react';
import { PlayCircle, Plus, Search, BookOpen, Volume2, X, Highlighter, StickyNote, Eraser, Check, Pen, MousePointer, Trash2, Play, Pause, Square, SkipBack, SkipForward, Settings2, AlertTriangle } from 'lucide-react';
import { VocabCard, Recording, VocabWord } from '../../types';
import { fetchDeck, fetchSessionTranscript, searchImages } from '../../data/api';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { makeCloze } from '@core';
import { speak as ttsSpeak, pickVoice, voicesFor, hasVoiceFor, getVoicePrefs, setVoicePref } from '../../lib/tts';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
import { detectLanguage, hasNativeDetector, type LangDetection } from '../../lib/langDetect';
import { baseLang, langLabel, toBcp47 } from '../../lib/languages';
import LangPicker from '../LangPicker';
import { DEFAULT_LANG_CONFIG, useLangConfig } from '../../lib/langConfig';
import type { LangConfig } from '../../lib/langConfig';
import { buildVocabWord, mtNoteFor, resolveWord, tokenizarTexto } from '../../lib/vocabWord';
import { ficharCartao } from '../../lib/adicionarAoDeck';
import PopoverFlutuante from '../PopoverFlutuante';
import type { WordOrigin, ResolvedWord } from '../../lib/vocabWord';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import type { PracticeSeed, ExerciseId } from '../../lib/sentences';
import VocabularyPanel from '../VocabularyPanel';
import { micErrorMessage } from '../../lib/mediaErrors';
import { toast, askConfirm } from '../Toast';

/**
 * LEITURA INTELIGENTE — modos do narrador.
 *
 *  original    → narra o texto original (idioma-fonte declarado da sessão)
 *  translation → narra a tradução (idioma-alvo)
 *  bilingual   → por frase: original E DEPOIS tradução (shadowing). Só avança quando as DUAS terminam.
 *  auto        → detecta o idioma REAL de cada frase e usa a voz DAQUELE idioma. Existe porque um
 *                transcript de chamada bilíngue mistura idiomas dentro do MESMO campo `original`:
 *                narrar uma frase em português com voz inglesa soa péssimo.
 */
type NarrationMode = 'original' | 'translation' | 'bilingual' | 'auto';

const NARRATION_MODES: Array<{ id: NarrationMode; label: string; title: string }> = [
  { id: 'original', label: 'Original', title: 'Narra o texto original da sessão' },
  { id: 'translation', label: 'Tradução', title: 'Narra a tradução' },
  { id: 'bilingual', label: 'Bilíngue', title: 'Por frase: original e, em seguida, a tradução (shadowing)' },
  { id: 'auto', label: 'Auto', title: 'Detecta o idioma de cada frase e usa a voz daquele idioma' },
];

/** Um trecho a falar: texto + idioma (ISO-639-1) + a detecção que originou esse idioma (ou null = assumido). */
interface SpeechStep {
  text: string;
  lang: string;
  detection: LangDetection | null;
}

const LS_MODE = 'reading_narration_mode';
const LS_RATE = 'reading_narration_rate';
const LS_FORCED_LANG = 'reading_forced_lang';

// PADRÕES: 'auto' (detecta o idioma de cada frase e escolhe a voz certa — é o que faz sentido num
// transcript que pode misturar idiomas) e 1.25× (ritmo de estudo; 1.0× soa arrastado).
const DEFAULT_MODE: NarrationMode = 'auto';
const DEFAULT_RATE = 1.25;

// A voz preferida POR IDIOMA agora mora em `src/lib/tts.ts` (store compartilhado), não mais num
// localStorage local desta tela. Assim a voz que você escolhe no narrador é a MESMA usada ao clicar
// numa palavra na Captura, na Análise, no Estudo e nas Métricas — o `speak()` resolve sozinho.

// Uma frase de estudo REAL, derivada da transcrição da sessão (sem mocks).
interface StudyText {
  original: string;
  translation: string;
  speaker: string;
}

// Pré-visualização REAL de uma palavra ao passar o mouse (imagem + tradução + contexto).
interface WordPreview {
  word: string;
  loading: boolean;
  imageUrl: string | null; // null = sem imagem encontrada
  translation: string | null; // null = tradução indisponível
  note: string | null; // POR QUE não há tradução (par sem motor, falha do MT). null = há tradução.
  context: string; // frase de contexto em que a palavra aparece
}

interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'audio';
  textIndex: number;
  wordIndex: string;
  wordText: string;
  content?: string;
  color?: string;
  audioUrl?: string;
  createdAt: number;
}

type ReadingTool = 'none' | 'highlight-yellow' | 'highlight-green' | 'highlight-blue' | 'highlight-pink' | 'note' | 'audio' | 'eraser';

interface ReadingProps {
  recording?: Recording;
  /**
   * Navegação entre telas — repassada pela Análise (que monta esta tela). É o que permite mandar uma
   * palavra do Analista de Vocabulário direto para um exercício no Estudo.
   */
  onChangeView?: (view: string, data?: any) => void;
}

export default function Reading({ recording, onChangeView }: ReadingProps = {}) {
  // Gateway (MT/LLM) construído uma vez a partir do perfil ativo.
  const gateway = React.useMemo(
    () => buildGateway({ profile: getActiveProfile(), cloudConsent: () => true }),
    []
  );

  // Transcrição REAL da sessão (sem mocks). Vazia até carregar / se não houver enunciados.
  const [studyTexts, setStudyTexts] = useState<StudyText[]>([]);
  const [transcriptLoaded, setTranscriptLoaded] = useState(false);

  /**
   * Configuração de idioma do usuário — LEITOR ÚNICO (`lib/langConfig.ts`). Substitui os literais
   * 'en'/'pt' que esta tela usava como fallback: quem estuda alemão não tem nada a ver com inglês.
   */
  const langConfig = useLangConfig();

  /** Idiomas REAIS gravados na sessão. `''` = a sessão não os gravou (sessões antigas). */
  const [sessionLangs, setSessionLangs] = useState<{ src: string; tgt: string } | null>(null);

  /**
   * Par de idiomas da sessão (base, ex.: 'en'→'pt'), usado pelo narrador. Cadeia REAL:
   * idioma da sessão → configuração do usuário. Nada de literais.
   */
  const langPair = React.useMemo(
    () => ({
      src: sessionLangs?.src || baseLang(langConfig.mine),
      tgt: sessionLangs?.tgt || baseLang(langConfig.studying),
    }),
    [sessionLangs, langConfig]
  );
  const TRANSCRIPT = studyTexts.map(t => t.original);

  useEffect(() => {
    if (!recording?.id) {
      setStudyTexts([]);
      setTranscriptLoaded(true);
      return;
    }
    let cancelled = false;
    setTranscriptLoaded(false);
    fetchSessionTranscript(recording.id)
      .then(({ session, utterances }) => {
        if (cancelled) return;
        const mapped: StudyText[] = (utterances || [])
          .filter(u => (u.sourceText || '').trim().length > 0)
          .map(u => ({
            original: u.sourceText || '',
            translation: u.translatedText || '',
            speaker: u.speakerName || '',
          }));
        setStudyTexts(mapped);
        const first = utterances && utterances[0];
        // Vazio quando a sessão não gravou o idioma — o fallback é a CONFIGURAÇÃO do usuário
        // (ver `langPair`), não 'en'/'pt'.
        setSessionLangs({
          src: baseLang(first?.sourceLang || session?.sourceLang || ''),
          tgt: baseLang(first?.targetLang || session?.targetLang || ''),
        });
        setTranscriptLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStudyTexts([]);
        setSessionLangs(null);
        setTranscriptLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [recording?.id]);

  // Deck vem do BACKEND (mesmo deck do Study/FSRS), não mais do localStorage/mock.
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);

  useEffect(() => {
    fetchDeck().then(setVocabCards).catch(() => {});
  }, []);

  /**
   * ORIGEM de uma palavra: a FRASE de onde ela saiu e o idioma DAQUELA frase.
   *
   * Esta tela é a única que SEMPRE teve detecção por frase (`langOfSentence`, alimentada pelo
   * `detectLanguage`) — e jogava o resultado fora na hora de gravar o cartão. Agora ele vira o
   * `declaredLang` do produtor único, que decide idioma e direção (`lib/vocabWord.ts`).
   */
  const originOfWord = (wordStr: string, context?: string): WordOrigin => {
    const idx = context
      ? studyTexts.findIndex(t => t.original === context)
      : studyTexts.findIndex(t => t.original.toLowerCase().includes(wordStr.toLowerCase()));
    const ctx = context || (idx >= 0 ? studyTexts[idx].original : '');
    // Fora de uma frase conhecida, o rótulo é o idioma declarado da sessão (o override manda).
    const declaredLang = idx >= 0 ? langOfSentence(idx) : (forcedLang || langPair.src);
    return {
      word: wordStr,
      context: ctx || undefined,
      declaredLang: declaredLang || undefined,
      config: langConfig,
    };
  };

  /**
   * Ficha a palavra no deck.
   *
   * O BUG QUE MORRE AQUI: este payload não tinha `srcLang` nem `tgtLang` — o banco gravava `null`, e
   * sem idioma o Analista de Vocabulário nem chega a consultar o dicionário (ele exige `word.lang`).
   * A detecção por frase que esta tela já fazia era descartada exatamente neste ponto. Agora o par
   * vem de `resolveWord` + `cardLangs`, a partir da FRASE de origem.
   */
  const handleAddWordToDeck = async (wordStr: string, translation?: string | null, context?: string) => {
    const exists = vocabCards.find(c => c.word.toLowerCase() === wordStr.toLowerCase());
    if (exists) return; // já no deck
    const origin = originOfWord(wordStr, context);
    const sentence = origin.context || '';
    const cloze = sentence ? makeCloze(sentence, wordStr) : null;

    // Já temos a tradução (veio do painel/popover)? Então só resolvemos os idiomas — sem novo MT.
    let back = translation || '';
    let resolved: ResolvedWord;
    if (back) {
      resolved = await resolveWord(origin);
    } else {
      const built = await buildVocabWord(origin, gateway.mt);
      resolved = built.resolved;
      back = built.vocab.translation; // tradução REAL (ou vazio, nunca inventada)
    }

    // Gravação e aviso de recusa em `lib/adicionarAoDeck` — o mesmo caminho da Análise, que
    // RENDERIZA esta tela dentro de si e mantinha uma cópia byte a byte deste bloco.
    // Idiomas REAIS da palavra viajam em `resolved`: o cartão nasce COM idioma (antes nascia `null`).
    const created = await ficharCartao({ word: wordStr, back, sentence, resolved, cloze, sessionId: recording?.id });
    if (created.length) setVocabCards(prev => [...prev, ...created]);
  };

  // --- ANALISTA DE VOCABULÁRIO (painel compartilhado) ---
  // O clique numa palavra (sem ferramenta de anotação ativa) abre o painel.
  const [selectedExamWord, setSelectedExamWord] = useState<VocabWord | null>(null);
  const [addedWords, setAddedWords] = useState<string[]>([]);
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  /** Por que a palavra ficou SEM tradução (par sem motor, falha do MT). null = há tradução. */
  const [mtNote, setMtNote] = useState<string | null>(null);

  /**
   * Idioma da palavra ATUALMENTE no Analista de Vocabulário. Guardado quando a palavra é escolhida
   * (`examineWord`), porque `VocabWord` não carrega idioma — e sem isto o botão de som do painel
   * pronunciaria sempre no idioma da sessão, errando nas frases de outro idioma.
   */
  const selectedWordLangRef = useRef<string>('');

  // TTS do painel — idioma da FRASE de onde a palavra saiu + a voz preferida do usuário para ele.
  const speakWord = (word: string) => {
    const lang = selectedWordLangRef.current || forcedLang || langPair.src;
    ttsSpeak(word, { lang: toBcp47(lang), rate: ttsSpeed, voiceName: voicePrefs[baseLang(lang)] });
  };

  /**
   * Seleciona a palavra e monta o cartão do painel pelo produtor único: idioma da FRASE de origem,
   * direção decidida por esse idioma, motor declarado. Nada é fabricado — cefr/phonetics/explanation
   * ficam `undefined` até haver fonte real, e a falta de tradução vem com o MOTIVO (`mtNote`).
   */
  const examineWord = async (wordStr: string, sentenceIndex?: number) => {
    const context = sentenceIndex !== undefined
      ? (studyTexts[sentenceIndex]?.original || '')
      : (TRANSCRIPT.find(s => s.toLowerCase().includes(wordStr.toLowerCase())) || '');
    const origin = originOfWord(wordStr, context || undefined);

    const cached = previewCacheRef.current.get(wordStr);
    const known = vocabCards.find(c => c.word.toLowerCase() === wordStr.toLowerCase());
    const alreadyTranslated = cached?.translation || known?.translation || '';

    setMtNote(null);
    setSelectedExamWord({ word: wordStr, translation: alreadyTranslated, example: origin.context });

    // Com tradução em mãos, só falta o idioma REAL (para o dicionário e o TTS do painel).
    if (alreadyTranslated) {
      const resolved = await resolveWord(origin);
      selectedWordLangRef.current = resolved.lang;
      setSelectedExamWord(prev =>
        prev && prev.word === wordStr ? { ...prev, lang: resolved.lang || undefined } : prev
      );
      return;
    }

    const { vocab, resolved } = await buildVocabWord(origin, gateway.mt);
    selectedWordLangRef.current = resolved.lang;
    setSelectedExamWord(prev => (prev && prev.word === wordStr ? vocab : prev));
    setMtNote(mtNoteFor(resolved, vocab.translation));
  };

  // Adapta a assinatura do painel (VocabWord) para o handler de deck já existente.
  const handleAddVocabWordToDeck = async (w: VocabWord) => {
    setAddedWords(prev => (prev.includes(w.word) ? prev : [...prev, w.word]));
    await handleAddWordToDeck(w.word, w.translation || null, w.example);
  };

  /** Já fichada? (deck do backend ou adicionada agora, nesta tela) */
  const isWordAdded = (w: VocabWord) =>
    addedWords.includes(w.word) ||
    vocabCards.some(c => c.word.toLowerCase() === w.word.toLowerCase());

  /**
   * "Praticar esta palavra" — manda a palavra do Analista de Vocabulário para o exercício no Estudo.
   *
   *  • `review` → só dá para revisar o que está no deck: fichamos ANTES (reusando o handler de deck
   *    desta tela) e só então abrimos a revisão. "Adicionar e torcer" vira "adicionar e revisar".
   *  • demais → semente com a palavra e o idioma REAL dela (o da frase de onde saiu — o mesmo que o
   *    botão de som do painel usa), e o Estudo abre o exercício já nela.
   */
  const handlePracticeWord = async (w: VocabWord, exercise: ExerciseId) => {
    if (!onChangeView) return;
    if (exercise === 'review' && !isWordAdded(w)) {
      await handleAddVocabWordToDeck(w);
    }
    const lang = selectedWordLangRef.current || forcedLang || langPair.src;
    const seed: PracticeSeed = {
      ...seedFromSelection(w.word, lang, exercise, recording?.id),
      word: w.word,
    };
    onChangeView(telaDoExercicio(exercise), { seed, id: recording?.id });
  };

  // Estado do cartão flutuante da palavra — em `lib/popoverDePalavra`, junto com a Análise, que
  // RENDERIZA esta tela dentro de si e declarava as mesmas quatro peças.
  const popover = usePopoverDePalavra();
  const hoveredWord = popover.palavra;
  const [fontSize, setFontSize] = useState<number>(18);
  const [readingTheme, setReadingTheme] = useState<'light' | 'sepia' | 'dark'>('light');
  const [selectedTool, setSelectedTool] = useState<ReadingTool>('none');
  const [viewMode, setViewMode] = useState<'original' | 'bilingual-intercalated' | 'bilingual-side-by-side'>('bilingual-intercalated');

  // Largura do leitor: coluna centralizada (foco na leitura) ou espaçada (tela cheia). Persistida.
  // PADRÃO: 'centered' — coluna de leitura confortável, centralizada, com respiro dos dois lados.
  // (Antes era 'full', que somado aos 65% fixos do painel jogava o texto para a esquerda e deixava
  // um vazio à direita.) 'full' continua disponível para quem quiser ocupar a largura inteira.
  const [layoutWidth, setLayoutWidth] = useState<'centered' | 'full'>(() => {
    return (localStorage.getItem('reading_layout_width') as 'centered' | 'full') || 'centered';
  });

  const handleLayoutWidthChange = (width: 'centered' | 'full') => {
    setLayoutWidth(width);
    localStorage.setItem('reading_layout_width', width);
  };

  const [annotations, setAnnotations] = useState<Annotation[]>(() => {
    const saved = localStorage.getItem('readingAnnotations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    // Começa VAZIO — anotações reais são criadas pelo usuário (sem mocks).
    return [];
  });

  useEffect(() => {
    localStorage.setItem('readingAnnotations', JSON.stringify(annotations));
  }, [annotations]);

  // Freehand Canvas Drawing States
  const [isDrawModeActive, setIsDrawModeActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [brushColor, setBrushColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  // Helper to convert HEX to RGBA
  const hexToRGBA = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (canvas && container) {
      canvas.width = container.scrollWidth;
      canvas.height = container.scrollHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  };

  // Sync size on mode activation or screen resize
  useEffect(() => {
    if (isDrawModeActive) {
      const t = setTimeout(() => {
        syncCanvasSize();
      }, 150);
      window.addEventListener('resize', syncCanvasSize);
      return () => {
        clearTimeout(t);
        window.removeEventListener('resize', syncCanvasSize);
      };
    }
  }, [isDrawModeActive, fontSize, viewMode]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    
    if (drawTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize * 2.5;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = brushSize;
      if (drawTool === 'highlighter') {
        ctx.strokeStyle = hexToRGBA(brushColor, 0.4);
      } else {
        ctx.strokeStyle = brushColor;
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  // Audio Recording States
  const [recordingTarget, setRecordingTarget] = useState<{ tIndex: number, wIndex: string, wordText: string } | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playbackAudioUrl, setPlaybackAudioUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  // Guarda a mensagem REAL da falha do microfone (traduzida de `err.name`), não um booleano que
  // obrigava a UI a chutar "verifique a permissão" mesmo quando a causa era outra.
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Note dialog state
  const [noteTarget, setNoteTarget] = useState<{ tIndex: number, wIndex: string, wordText: string } | null>(null);
  const [noteTextInput, setNoteTextInput] = useState('');

  // Speech Narration States
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isNarrating, setIsNarrating] = useState(false);
  // Pausado ≠ parado. Sem este estado o botão dizia "Pausar" mesmo já estando pausado.
  const [isNarrationPaused, setIsNarrationPaused] = useState(false);
  // Ajustes avançados do narrador (voz, tom) ficam atrás de um disclosure — a barra fica limpa.
  const [showNarratorSettings, setShowNarratorSettings] = useState(false);
  const [narrationMode, setNarrationMode] = useState<NarrationMode>(
    () => (localStorage.getItem(LS_MODE) as NarrationMode) || DEFAULT_MODE
  );
  /**
   * Override global: '' = desligado (o modo decide o idioma). Qualquer outro valor FORÇA um idioma
   * para toda a narração — inclusive desligando a detecção do modo Auto.
   */
  const [forcedLang, setForcedLang] = useState<string>(() => localStorage.getItem(LS_FORCED_LANG) || '');
  /**
   * Voz POR IDIOMA (chave = ISO-639-1). Um único `selectedVoiceName` global não serve: os modos
   * bilíngue e auto alternam de idioma DENTRO da mesma sessão de narração e precisam de uma voz para
   * cada um. Vazio = deixa o `pickVoice()` escolher a melhor voz instalada.
   */
  const [voicePrefs, setVoicePrefs] = useState<Record<string, string>>(getVoicePrefs);
  const [narrationRate, setNarrationRate] = useState<number>(
    () => parseFloat(localStorage.getItem(LS_RATE) || '') || DEFAULT_RATE
  );
  const [narrationPitch, setNarrationPitch] = useState<number>(1.0);
  const [activeNarratingSentenceIndex, setActiveNarratingSentenceIndex] = useState<number | null>(null);
  /** Idioma que está sendo falado AGORA (no bilíngue muda no meio da frase). Guia o seletor de voz. */
  const [currentSpeakingLang, setCurrentSpeakingLang] = useState<string | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { localStorage.setItem(LS_MODE, narrationMode); }, [narrationMode]);
  useEffect(() => { localStorage.setItem(LS_FORCED_LANG, forcedLang); }, [forcedLang]);
  useEffect(() => { localStorage.setItem(LS_RATE, String(narrationRate)); }, [narrationRate]);
  // Mantém o store COMPARTILHADO (tts.ts) em dia — é dele que as outras telas leem a voz.
  useEffect(() => {
    for (const lang of Object.keys(voicePrefs)) setVoicePref(lang, voicePrefs[lang] ?? '');
  }, [voicePrefs]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    // `getVoices()` costuma vir vazio no 1º acesso e popular via 'voiceschanged'. Guardamos a lista no
    // state só para RE-RENDERIZAR os seletores/avisos — a resolução de voz em si é do `tts.ts`.
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  /** O navegador tem detector de idioma on-device? Só informativo (tooltip do modo Auto). */
  const [nativeDetector, setNativeDetector] = useState(false);
  useEffect(() => {
    let alive = true;
    hasNativeDetector().then(ok => { if (alive) setNativeDetector(ok); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Timer for audio recording elapsed seconds
  useEffect(() => {
    if (isRecordingAudio) {
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecordingAudio]);

  const startVoiceRecording = async () => {
    try {
      setRecordingError(null);
      setPlaybackAudioUrl(null);
      setRecordedBase64(null);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setPlaybackAudioUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      // Sem simulação: falha honesta. Não inicia gravação nem fabrica áudio.
      console.error("Microfone indisponível:", err);
      const msg = micErrorMessage(err);
      setRecordingError(msg);
      setIsRecordingAudio(false);
      toast.error(msg, { detail: err });
    }
  };

  const stopVoiceRecording = () => {
    if (isRecordingAudio) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecordingAudio(false);
    }
  };

  const saveRecordedAudio = () => {
    if (!recordingTarget || (!playbackAudioUrl && !recordedBase64)) return;

    setAnnotations([
      ...annotations,
      {
        id: `ann-${Date.now()}`,
        type: 'audio',
        textIndex: recordingTarget.tIndex,
        wordIndex: recordingTarget.wIndex,
        wordText: recordingTarget.wordText,
        audioUrl: recordedBase64 || playbackAudioUrl || '',
        createdAt: Date.now()
      }
    ]);

    setRecordingTarget(null);
    setPlaybackAudioUrl(null);
    setRecordedBase64(null);
  };

  /**
   * DETECÇÃO DE IDIOMA POR FRASE (modo Auto).
   *
   * Preguiçosa e cacheada (o `langDetect` já cacheia por texto; aqui cacheamos por índice para a UI).
   * `null` = SEM SINAL — e isso é preservado: a badge mostra o idioma DECLARADO da sessão com estilo
   * mais discreto e um title dizendo que foi assumido. Nunca apresentamos um chute como detecção.
   */
  const [detections, setDetections] = useState<Record<number, LangDetection | null>>({});
  const detectionsRef = useRef<Record<number, LangDetection | null>>({});

  useEffect(() => {
    detectionsRef.current = {};
    setDetections({});
  }, [studyTexts]);

  const ensureDetection = async (index: number): Promise<LangDetection | null> => {
    if (index in detectionsRef.current) return detectionsRef.current[index];
    const det = await detectLanguage(studyTexts[index]?.original || '');
    detectionsRef.current[index] = det;
    setDetections(prev => ({ ...prev, [index]: det }));
    return det;
  };

  // No modo Auto, detecta o transcript inteiro em segundo plano para as badges aparecerem.
  useEffect(() => {
    if (narrationMode !== 'auto' || !studyTexts.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < studyTexts.length; i++) {
        if (cancelled) return;
        await ensureDetection(i);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationMode, studyTexts]);

  /** Voz resolvida para um idioma: preferência do usuário → melhor voz instalada → nenhuma. */
  const voiceFor = (lang: string) => pickVoice(toBcp47(lang), voicePrefs[baseLang(lang)]);

  /**
   * Os trechos a falar de UMA frase, conforme o modo. O bilíngue devolve DOIS (original + tradução):
   * ambos precisam terminar antes de avançar. O auto detecta o idioma real; sem sinal, cai no idioma
   * declarado da sessão (explicitamente, com `detection: null`).
   */
  /**
   * Idioma EFETIVO de uma frase — a mesma regra que o narrador usa (override global > idioma
   * detectado > idioma declarado da sessão). É a fonte única para pronunciar QUALQUER coisa daquela
   * frase: a frase inteira, ou uma palavra clicada dentro dela.
   *
   * Sem isto, clicar numa palavra pronunciava sempre no idioma-fonte da sessão — ou seja, numa
   * chamada bilíngue, uma palavra em português era lida com voz inglesa.
   */
  const langOfSentence = (index: number): string => {
    if (forcedLang) return forcedLang;
    return detectionsRef.current[index]?.lang || langPair.src;
  };

  const buildSteps = async (index: number): Promise<SpeechStep[]> => {
    const s = studyTexts[index];
    if (!s) return [];
    const steps: SpeechStep[] = [];

    if (narrationMode === 'translation') {
      steps.push({ text: s.translation, lang: langPair.tgt, detection: null });
    } else if (narrationMode === 'bilingual') {
      steps.push({ text: s.original, lang: langPair.src, detection: null });
      steps.push({ text: s.translation, lang: langPair.tgt, detection: null });
    } else if (narrationMode === 'auto') {
      const det = await ensureDetection(index);
      steps.push({ text: s.original, lang: det?.lang || langPair.src, detection: det });
    } else {
      steps.push({ text: s.original, lang: langPair.src, detection: null });
    }

    // Override global: força um único idioma (e portanto uma única voz) para tudo.
    const withOverride = forcedLang ? steps.map(st => ({ ...st, lang: forcedLang })) : steps;
    return withOverride.filter(st => st.text && st.text.trim().length > 0);
  };

  /**
   * NARRADOR — motor.
   *
   * `speakFrom(i)` narra a frase `i` (um ou DOIS trechos, no bilíngue) e encadeia a seguinte. É a
   * única porta de entrada: tocar do início, tocar a partir de uma frase clicada, pular e reiniciar
   * após trocar voz/velocidade/modo passam todos por aqui.
   *
   * O `runIdRef` invalida callbacks de utterances antigas — e ficou MAIS crítico com o bilíngue:
   * agora há encadeamento DENTRO da frase (original→tradução) além do encadeamento entre frases. Sem
   * a guarda, o `onend` de uma fala cancelada dispararia o próximo trecho da sequência velha e duas
   * narrações correriam em paralelo. A resolução dos trechos é assíncrona (detecção de idioma), então
   * o runId também é conferido DEPOIS do await.
   */
  const runIdRef = useRef(0);

  const speakFrom = async (startIndex: number) => {
    if (!('speechSynthesis' in window)) return;
    const runId = ++runIdRef.current;
    window.speechSynthesis.cancel();

    if (startIndex < 0 || startIndex >= studyTexts.length) {
      setIsNarrating(false);
      setIsNarrationPaused(false);
      setActiveNarratingSentenceIndex(null);
      setCurrentSpeakingLang(null);
      return;
    }

    setIsNarrating(true);
    setIsNarrationPaused(false);
    setActiveNarratingSentenceIndex(startIndex);

    const steps = await buildSteps(startIndex);
    if (runId !== runIdRef.current) return; // trocaram de frase/modo enquanto detectávamos
    if (!steps.length) {
      // Frase sem texto no idioma pedido (ex.: tradução vazia) — segue para a próxima, sem inventar.
      void speakFrom(startIndex + 1);
      return;
    }

    const speakStep = (stepIndex: number) => {
      if (runId !== runIdRef.current) return;
      if (stepIndex >= steps.length) {
        void speakFrom(startIndex + 1); // todos os trechos da frase terminaram
        return;
      }
      const step = steps[stepIndex];
      const utterance = new SpeechSynthesisUtterance(step.text);
      currentUtteranceRef.current = utterance;

      const voice = voiceFor(step.lang);
      utterance.lang = voice?.lang || toBcp47(step.lang);
      if (voice) utterance.voice = voice;
      utterance.rate = narrationRate;
      utterance.pitch = narrationPitch;

      setCurrentSpeakingLang(baseLang(step.lang));

      utterance.onend = () => {
        if (runId !== runIdRef.current) return; // fala cancelada/substituída, não encadeia
        speakStep(stepIndex + 1);
      };
      utterance.onerror = () => {
        if (runId !== runIdRef.current) return; // `cancel()` também dispara onerror, ignore
        setIsNarrating(false);
        setIsNarrationPaused(false);
        setActiveNarratingSentenceIndex(null);
        setCurrentSpeakingLang(null);
      };

      window.speechSynthesis.speak(utterance);
    };

    speakStep(0);
  };

  /**
   * Play/Pause de verdade. ANTES o botão chamava um toggle que pausava OU retomava, mas o rótulo
   * dizia "Pausar" nos dois estados — o usuário não sabia em que pé estava. Agora há `isNarrationPaused`
   * e o botão mostra o ícone/rótulo correto.
   */
  const toggleNarration = () => {
    if (!('speechSynthesis' in window)) return;
    if (!isNarrating) {
      void speakFrom(activeNarratingSentenceIndex ?? 0); // retoma de onde parou, não do começo
      return;
    }
    if (isNarrationPaused) {
      window.speechSynthesis.resume();
      setIsNarrationPaused(false);
    } else {
      window.speechSynthesis.pause();
      setIsNarrationPaused(true);
    }
  };

  const stopNarration = () => {
    if (!('speechSynthesis' in window)) return;
    runIdRef.current++; // invalida qualquer onend pendente
    window.speechSynthesis.cancel();
    setIsNarrating(false);
    setIsNarrationPaused(false);
    setActiveNarratingSentenceIndex(null);
    setCurrentSpeakingLang(null);
  };

  /** Pula frases (−1 / +1) mantendo a narração viva. */
  const skipSentence = (delta: number) => {
    const from = activeNarratingSentenceIndex ?? 0;
    const next = Math.min(Math.max(from + delta, 0), studyTexts.length - 1);
    void speakFrom(next);
  };

  /**
   * Trocar velocidade / voz / idioma NO MEIO da narração agora REINICIA a frase atual com o novo
   * ajuste — antes isso chamava `stopNarration()` e você PERDIA o lugar. A Web Speech não permite
   * alterar `rate`/`voice` de uma utterance já em curso, então refalar a frase corrente é a forma
   * correta de aplicar a mudança sem perder o contexto.
   *
   * Feito num efeito (e não no onClick) de propósito: aqui o novo state já está comprometido, então
   * `speakFrom` lê os valores NOVOS. Chamar de dentro do handler leria o closure velho.
   */
  const narrationSig = `${narrationRate}|${narrationPitch}|${narrationMode}|${forcedLang}|${JSON.stringify(voicePrefs)}`;
  const lastNarrationSigRef = useRef(narrationSig);
  useEffect(() => {
    if (lastNarrationSigRef.current === narrationSig) return;
    lastNarrationSigRef.current = narrationSig;
    if (isNarrating && activeNarratingSentenceIndex !== null) {
      void speakFrom(activeNarratingSentenceIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrationSig]);

  /**
   * Quais idiomas ESTE modo vai narrar de fato? Base para (a) avisar sobre voz faltando e (b) povoar
   * o seletor de voz por idioma. No auto isso depende das detecções — e inclui o idioma declarado da
   * sessão sempre que alguma frase ficou SEM detecção (fallback honesto).
   */
  const narratedLangs = React.useMemo(() => {
    if (forcedLang) return [baseLang(forcedLang)];
    if (narrationMode === 'translation') return [baseLang(langPair.tgt)];
    if (narrationMode === 'bilingual') return [...new Set([baseLang(langPair.src), baseLang(langPair.tgt)])];
    if (narrationMode === 'auto') {
      const set = new Set<string>();
      const values: Array<LangDetection | null> = Object.values(detections);
      for (const d of values) if (d) set.add(baseLang(d.lang));
      // Alguma frase sem sinal (ou nada detectado ainda) → o fallback é o idioma declarado.
      if (!values.length || values.some(d => !d)) set.add(baseLang(langPair.src));
      return [...set];
    }
    return [baseLang(langPair.src)];
  }, [forcedLang, narrationMode, langPair, detections]);

  /** Idiomas narrados SEM nenhuma voz instalada no SO — avisamos em vez de falar com a voz errada. */
  const missingVoiceLangs = React.useMemo(
    () => narratedLangs.filter(l => !hasVoiceFor(l)),
    // `voices` entra de propósito: a lista do SO chega assíncrona (evento 'voiceschanged').
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [narratedLangs, voices]
  );

  /**
   * Idioma cuja voz o seletor está editando: por padrão o que está sendo narrado AGORA (essencial nos
   * modos bilíngue/auto, em que o idioma muda no meio do caminho); o usuário pode fixar outro.
   */
  const [voiceEditLangOverride, setVoiceEditLangOverride] = useState<string | null>(null);
  const voiceEditLang =
    (voiceEditLangOverride && narratedLangs.includes(voiceEditLangOverride) ? voiceEditLangOverride : null) ??
    (currentSpeakingLang && narratedLangs.includes(currentSpeakingLang) ? currentSpeakingLang : null) ??
    narratedLangs[0] ??
    baseLang(langPair.src);

  const voiceOptions = React.useMemo(
    () => voicesFor(voiceEditLang),
    // idem: depende da lista assíncrona de vozes do SO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [voiceEditLang, voices]
  );

  /**
   * Badge de idioma por frase (só no modo Auto). Distingue DETECTADO de ASSUMIDO: sem sinal, mostra o
   * idioma declarado da sessão em estilo apagado e diz no title que foi assumido — jamais vendemos um
   * chute como detecção.
   */
  const SentenceLangBadge = ({ index }: { index: number }) => {
    if (narrationMode !== 'auto') return null;
    if (!(index in detections)) return null;
    const det = detections[index];
    if (forcedLang) return null; // override ligado: a detecção não influencia a narração
    if (det) {
      return (
        <span
          className="ml-2 align-middle inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-soft text-accent-ink"
          title={`Idioma detectado (${det.method === 'native' ? 'detector do navegador' : 'heurística local'}) · confiança ${(det.confidence * 100).toFixed(0)}%`}
        >
          {langLabel(det.lang)}
        </span>
      );
    }
    return (
      <span
        className="ml-2 align-middle inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-dashed border-border-subtle text-ink-faint"
        title={`Idioma NÃO detectado (sem sinal suficiente), assumindo o idioma declarado da sessão: ${langLabel(langPair.src)}`}
      >
        {langLabel(langPair.src)}?
      </span>
    );
  };

  // Rola a frase ativa para o centro da área de leitura — você nunca "perde" o narrador de vista.
  useEffect(() => {
    if (activeNarratingSentenceIndex === null) return;
    const el = document.getElementById(`sentence-${activeNarratingSentenceIndex}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeNarratingSentenceIndex]);

  // Encerra a fala ao sair da tela (senão o narrador continua tocando em outra view).
  useEffect(() => () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }, []);

  const handleWordClick = (tIndex: number, wIndex: string, wordText: string) => {
    if (selectedTool === 'none') {
      // Sem ferramenta de anotação: pronuncia a palavra E abre o Analista de Vocabulário
      // (o hover continua sendo só a prévia leve; o clique abre a análise completa).
      // A pronúncia usa o idioma da FRASE (tIndex) — não o da sessão —, logo acerta mesmo quando o
      // transcript mistura idiomas, e sai na voz que o usuário escolheu para aquele idioma.
      playWordTTS(wordText, tIndex);
      // `\p{L}` (Unicode) em vez de [a-zA-Z]: o filtro ASCII destruía palavras acentuadas e não
      // latinas — "ação" virava "ao", e qualquer palavra em japonês/russo/árabe virava string vazia.
      const clean = wordText.replace(/[^\p{L}'-]/gu, '').toLowerCase();
      if (clean) void examineWord(clean, tIndex);
      return;
    }

    if (selectedTool.startsWith('highlight-')) {
      const colorMap: Record<string, string> = {
        'highlight-yellow': 'bg-warn-soft text-warn-ink border-b-2 border-warn',
        'highlight-green': 'bg-good-soft text-good-ink border-b-2 border-good',
        'highlight-blue': 'bg-rare-soft text-rare-ink border-b-2 border-rare',
        'highlight-pink': 'bg-error-soft text-error-ink border-b-2 border-error'
      };

      const labelMap: Record<string, string> = {
        'highlight-yellow': 'Vocabulário',
        'highlight-green': 'Gramática',
        'highlight-blue': 'Expressão',
        'highlight-pink': 'Dúvida'
      };

      const exists = annotations.find(a => a.textIndex === tIndex && a.wordIndex === wIndex && a.type === 'highlight');
      if (exists && exists.color === colorMap[selectedTool]) {
        setAnnotations(annotations.filter(a => a.id !== exists.id));
      } else if (exists) {
        setAnnotations(annotations.map(a => a.id === exists.id ? { ...a, color: colorMap[selectedTool], content: labelMap[selectedTool] } : a));
      } else {
        setAnnotations([
          ...annotations,
          {
            id: `ann-${Date.now()}`,
            type: 'highlight',
            textIndex: tIndex,
            wordIndex: wIndex,
            wordText,
            color: colorMap[selectedTool],
            content: labelMap[selectedTool],
            createdAt: Date.now()
          }
        ]);
      }
    } else if (selectedTool === 'note') {
      setNoteTarget({ tIndex, wIndex, wordText });
      setNoteTextInput('');
    } else if (selectedTool === 'audio') {
      setRecordingTarget({ tIndex, wIndex, wordText });
    } else if (selectedTool === 'eraser') {
      setAnnotations(annotations.filter(a => !(a.textIndex === tIndex && a.wordIndex === wIndex)));
    }
  };

    // (`showTutor` foi removido junto com o botão legado "Estudos & Notas" — a sidebar de notas é
  //  controlada só pelo layoutStore/LayoutStudio agora.)
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user' | 'tutor', text: string}[]>([
    { role: 'tutor', text: 'Olá! Faça uma pergunta sobre o texto, gramática, vocabulário ou uma frase específica.' }
  ]);
  const [tutorThinking, setTutorThinking] = useState(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, cleanWord: string) => {
    // O cancelamento vem ANTES do filtro, como sempre veio: passar o cursor por uma palavra curta
    // no caminho até o cartão não pode deixar o fechamento seguir agendado.
    popover.cancelarFechamento();
    // Qualquer palavra de conteúdo (>=3 letras, alfabética) é interativa.
    if (cleanWord.length >= 3 && /^[a-z]+$/.test(cleanWord)) {
      popover.abrirEm(e.target as HTMLElement, cleanWord);
    }
  };

  const handleMouseLeave = popover.agendarFechamento;
  
  const handleSendMessage = async () => {
    const question = chatInput.trim();
    if (!question || tutorThinking) return;
    const history = [...messages, { role: 'user' as const, text: question }];
    setMessages(history);
    setChatInput('');
    setTutorThinking(true);

    const systemPrompt = 'Você é um tutor de idiomas conciso. Responda em português, de forma direta e objetiva.';
    // Envia o histórico da conversa como contexto (tutor = assistant).
    const chatMessages = history.map(m => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.text,
    }));

    try {
      const res = await gateway.llm.chat(systemPrompt, chatMessages);
      const reply = (res?.text || '').trim();
      if (reply) {
        setMessages(prev => [...prev, { role: 'tutor', text: reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'tutor', text: 'Tutor de IA indisponível, configure um modelo local (Ollama) ou uma chave em Configurações.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'tutor', text: 'Tutor de IA indisponível, configure um modelo local (Ollama) ou uma chave em Configurações.' }]);
    } finally {
      setTutorThinking(false);
    }
  };

  /**
   * Pronúncia de UMA palavra (clique/hover).
   *
   * Evolução: fixava 'en-US' → passou a usar o idioma da SESSÃO → agora usa o idioma da FRASE de onde
   * a palavra saiu (`langOfSentence`), que é o único correto quando o transcript mistura idiomas.
   * A voz vem da preferência do usuário para AQUELE idioma — a mesma que ele ouve no narrador.
   *
   * `sentenceIndex` ausente = fora de uma frase (ex.: popover de preview) → cai no idioma da sessão.
   */
  const playWordTTS = (wordStr: string, sentenceIndex?: number) => {
    const lang = sentenceIndex !== undefined ? langOfSentence(sentenceIndex) : (forcedLang || langPair.src);
    ttsSpeak(wordStr, {
      lang: toBcp47(lang),
      rate: 0.8,
      voiceName: voicePrefs[baseLang(lang)],
    });
    // No modo Auto, garante que a detecção daquela frase exista para o PRÓXIMO clique acertar o
    // idioma mesmo que a varredura em segundo plano ainda não tenha chegado nela.
    if (narrationMode === 'auto' && sentenceIndex !== undefined) void ensureDetection(sentenceIndex);
  };

  // Cache por-palavra da pré-visualização REAL (imagem/tradução/contexto) — evita refazer buscas.
  const previewCacheRef = useRef<Map<string, WordPreview>>(new Map());
  const [wordPreview, setWordPreview] = useState<WordPreview | null>(null);

  useEffect(() => {
    if (!hoveredWord) {
      setWordPreview(null);
      return;
    }
    const word = hoveredWord;

    const cached = previewCacheRef.current.get(word);
    if (cached) {
      setWordPreview(cached);
      return;
    }

    const origin = originOfWord(word);
    const context = origin.context || '';
    // Estado de carregamento HONESTO enquanto busca imagem + tradução reais.
    setWordPreview({ word, loading: true, imageUrl: null, translation: null, note: null, context });

    let cancelled = false;
    (async () => {
      // A direção da tradução sai do produtor único (idioma da FRASE de origem) — não mais o
      // `langPair.src → langPair.tgt` fixo da sessão, que mandava palavra inglesa como portuguesa.
      const [images, built] = await Promise.all([
        searchImages(word).catch(() => []),
        buildVocabWord(origin, gateway.mt),
      ]);
      // Corrida: só aplica se ainda estivermos sobre a mesma palavra.
      if (cancelled) return;
      const imageUrl = images[0]?.url || images[0]?.thumbnail || null;
      const translation = built.vocab.translation || null;
      const preview: WordPreview = {
        word,
        loading: false,
        imageUrl,
        translation,
        note: mtNoteFor(built.resolved, built.vocab.translation),
        context,
      };
      previewCacheRef.current.set(word, preview);
      setWordPreview(preview);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredWord]);

  const getThemeClass = () => {
    if (readingTheme === 'sepia') return 'bg-[#fcf8f2] text-[#4a3c31] border-[#e6d9bf]';
    if (readingTheme === 'dark') return 'bg-[#161f2d] text-[#e2e8f0] border-[#1e293b]';
    return 'bg-surface text-ink border-border-subtle';
  };

  const getCanvasBgClass = () => {
    if (readingTheme === 'sepia') return 'bg-[#f5ebd7]';
    if (readingTheme === 'dark') return 'bg-[#0f141c]';
    return 'bg-canvas';
  };

  /**
   * "Tocar a partir daqui" — aparece ao passar o mouse sobre a frase. É o gesto mais intuitivo de um
   * narrador (e faltava por completo: antes só existia "Ouvir Tudo", sempre do começo). Fica numa
   * gutter à esquerda, fora do fluxo do texto, para não competir com o clique nas palavras (que abre
   * o Analista de Vocabulário / faz TTS da palavra).
   */
  const SentencePlayButton = ({ index }: { index: number }) => {
    const isActive = activeNarratingSentenceIndex === index;
    return (
      <button
        onClick={() => void speakFrom(index)}
        title="Ouvir a partir desta frase"
        className={`absolute -left-9 top-2 hidden lg:flex w-7 h-7 items-center justify-center rounded-full border transition-all cursor-pointer
          ${isActive
            ? 'bg-accent border-accent text-white opacity-100'
            : 'bg-surface border-border-subtle text-ink-muted opacity-0 group-hover/sent:opacity-100 hover:text-accent hover:border-accent'}`}
      >
        {isActive && isNarrating && !isNarrationPaused
          ? <Pause className="w-3 h-3" />
          : <Play className="w-3 h-3 ml-0.5" />}
      </button>
    );
  };

  return (
    <div className={`flex-1 w-full relative flex flex-col md:flex-row ${getCanvasBgClass()} overflow-hidden`}>
      
      {/* Área de leitura. FLUIDA (não mais 65% fixos): antes o painel era travado em 65% da largura
          e os 35% restantes eram reservados para a `notesSidebar`, que tem `show:false` no
          layoutStore e portanto NUNCA renderizava. Resultado: um bloco morto de espaço em branco à
          direita. Agora a área ocupa tudo o que sobra (flex-1) e o texto é CENTRALIZADO numa coluna
          de leitura confortável, com respiro simétrico dos dois lados. Quando o Analista de
          Vocabulário abre (clique numa palavra), esta área simplesmente encolhe para caber. */}
      <EditablePanel
        viewKey="reading"
        panelKey="interactiveArea"
        title="Área Interativa"
        className="flex flex-col flex-1 min-w-0"
        canResizeWidth={false}
        canResizeHeight={false}
      >
      <div className="flex-1 transition-all duration-300 h-full overflow-y-auto custom-scrollbar w-full">
        <div className={`p-4 md:p-6 lg:p-10 mx-auto w-full transition-all duration-300 ${layoutWidth === 'centered' ? 'max-w-5xl' : 'max-w-none px-6 md:px-12'}`}>
        
        {/* Top Header */}
        <header className="mb-6 border-b border-border-subtle pb-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-accent-ink font-bold text-xs tracking-wider uppercase mb-1">
                <BookOpen className="w-4 h-4 text-accent-ink" />
                <span>Modo Leitura & Imersão Interativa</span>
              </div>
              <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight">
                {recording ? `Transcrição: ${recording.title}` : 'Transcrição: Reunião de Engenharia'}
              </h1>
            </div>

            {/* Quick custom layout settings */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Font Size */}
              <div className="flex bg-surface border border-border-subtle rounded-lg p-0.5">
                <button 
                  onClick={() => setFontSize(Math.max(12, fontSize - 2))} 
                  className="px-2 py-1 text-xs font-bold hover:bg-surface-hover text-ink rounded"
                  title="Diminuir Fonte"
                >
                  A-
                </button>
                <button 
                  onClick={() => setFontSize(Math.min(30, fontSize + 2))} 
                  className="px-2 py-1 text-xs font-bold hover:bg-surface-hover text-ink rounded"
                  title="Aumentar Fonte"
                >
                  A+
                </button>
              </div>

              {/* Theme Selection */}
              <div className="flex bg-surface border border-border-subtle rounded-lg p-0.5">
                <button 
                  onClick={() => setReadingTheme('light')} 
                  className={`px-2.5 py-1 text-xs font-bold rounded ${readingTheme === 'light' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted'}`}
                >
                  Claro
                </button>
                <button 
                  onClick={() => setReadingTheme('sepia')} 
                  className={`px-2.5 py-1 text-xs font-bold rounded ${readingTheme === 'sepia' ? 'bg-[#f7f0e5] text-[#4a3c31] shadow-sm' : 'text-ink-muted'}`}
                >
                  Sépia
                </button>
                <button 
                  onClick={() => setReadingTheme('dark')} 
                  className={`px-2.5 py-1 text-xs font-bold rounded ${readingTheme === 'dark' ? 'bg-[#1e293b] text-white shadow-sm' : 'text-ink-muted'}`}
                >
                  Escuro
                </button>
              </div>

              {/* Largura da coluna de leitura. "Espaçado" era um rótulo enganoso (significava largura
                  TOTAL); agora os nomes dizem o que fazem. */}
              <div className="flex bg-surface border border-border-subtle rounded-lg p-0.5">
                <button
                  onClick={() => handleLayoutWidthChange('centered')}
                  className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-all ${layoutWidth === 'centered' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted'}`}
                  title="Coluna de leitura centralizada, com respiro dos dois lados"
                >
                  Centralizado
                </button>
                <button
                  onClick={() => handleLayoutWidthChange('full')}
                  className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-all ${layoutWidth === 'full' ? 'bg-accent text-white shadow-sm' : 'text-ink-muted'}`}
                  title="Estende o conteúdo por toda a largura da tela"
                >
                  Largura total
                </button>
              </div>

              {/* REMOVIDO: o botão "Estudos & Notas" (toggle de `showTutor`). Era herança de uma
                  versão antiga e, pior, já era um NO-OP: o painel `notesSidebar` tem `show:false`
                  no layoutStore, então o EditablePanel retornava null mesmo com o toggle ligado. O
                  painel de notas segue no código, controlado apenas pelo LayoutStudio. */}
            </div>
          </div>
        </header>

        {/* ══════════════ NARRADOR — player compacto ══════════════
            ANTES: um HUD alto com uma parede de controles (toggle de idioma + select de voz + slider
            de velocidade + 3 botões), sempre aberto, empurrando o texto pra baixo. O botão dizia
            "Pausar" mesmo já pausado, não dava pra pular frase, não havia progresso, e mexer na
            voz/velocidade PARAVA a narração (perdia o lugar).
            AGORA: uma barra tipo audiobook, ⏮ ▶/⏸ ⏭, progresso "Frase X de N", presets de
            velocidade, e voz/tom escondidos atrás de um "⚙". A frase ativa rola sozinha pra vista, e
            clicar em qualquer frase toca a partir dela. */}
        <div className={`rounded-xl border shadow-sm mb-6 transition-colors ${getThemeClass()}`}>
          <div className="p-3 flex flex-wrap items-center gap-3">

            {/* Transporte: anterior · play/pause · próxima · parar */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => skipSentence(-1)}
                disabled={!studyTexts.length || activeNarratingSentenceIndex === 0}
                title="Frase anterior"
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                onClick={toggleNarration}
                disabled={!studyTexts.length}
                title={!isNarrating ? 'Ouvir' : isNarrationPaused ? 'Retomar' : 'Pausar'}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accent-ink text-white flex items-center justify-center shadow-btn transition-all hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isNarrating && !isNarrationPaused
                  ? <Pause className="w-5 h-5" />
                  : <Play className="w-5 h-5 ml-0.5" />}
              </button>

              <button
                onClick={() => skipSentence(1)}
                disabled={!studyTexts.length || (activeNarratingSentenceIndex !== null && activeNarratingSentenceIndex >= studyTexts.length - 1)}
                title="Próxima frase"
                className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {isNarrating && (
                <button
                  onClick={stopNarration}
                  title="Parar e voltar ao início"
                  className="p-1.5 ml-1 rounded-lg text-ink-muted hover:text-error hover:bg-surface-hover cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Progresso: barra + "Frase X de N" (antes não havia NENHUMA noção de onde você estava) */}
            <div className="flex-1 min-w-[140px]">
              <div className="h-1 bg-border-subtle rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${studyTexts.length ? ((( activeNarratingSentenceIndex ?? -1) + 1) / studyTexts.length) * 100 : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-ink-muted mt-1 font-mono">
                {activeNarratingSentenceIndex !== null
                  ? `Frase ${activeNarratingSentenceIndex + 1} de ${studyTexts.length}${isNarrationPaused ? ' · pausado' : ''}`
                  : studyTexts.length
                    ? `${studyTexts.length} frases · toque no ▶ ou clique numa frase`
                    : 'Sem texto para narrar'}
              </p>
            </div>

            {/* Velocidade: presets em vez de um slider minúsculo de passos estranhos (0.65, 0.8…) */}
            <div className="flex items-center gap-1 bg-canvas border border-border-subtle rounded-lg p-0.5 text-[10px]">
              {[0.75, 1, 1.25, 1.5].map(r => (
                <button
                  key={r}
                  onClick={() => setNarrationRate(r)}
                  className={`px-2 py-1 min-h-6 inline-flex items-center justify-center rounded font-bold transition-all cursor-pointer ${narrationRate === r ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                >
                  {r}×
                </button>
              ))}
            </div>

            {/* MODO DE LEITURA — substitui o antigo toggle "original / tradução".
                Bilíngue = shadowing (fala as duas). Auto = detecta o idioma frase a frase. */}
            <div className="flex items-center gap-1 bg-canvas border border-border-subtle rounded-lg p-0.5 text-[10px]">
              {NARRATION_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setNarrationMode(m.id)}
                  title={
                    m.id === 'auto'
                      ? `${m.title} · ${nativeDetector ? 'usando o detector on-device do navegador' : 'usando a heurística local (o navegador não tem detector nativo)'}`
                      : m.id === 'original'
                        ? `${m.title} (${langLabel(langPair.src)})`
                        : m.id === 'translation'
                          ? `${m.title} (${langLabel(langPair.tgt)})`
                          : m.title
                  }
                  className={`px-2 py-1 min-h-6 inline-flex items-center justify-center rounded font-bold transition-all cursor-pointer ${narrationMode === m.id ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Avançado (voz, idioma forçado e tom) atrás de um disclosure */}
            <button
              onClick={() => setShowNarratorSettings(v => !v)}
              title="Voz, idioma e tom"
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${showNarratorSettings ? 'bg-accent-soft border-accent text-accent' : 'bg-canvas border-border-subtle text-ink-muted hover:text-ink'}`}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {showNarratorSettings && (
            <div className="px-3 pb-3 pt-2 border-t border-border-subtle/60 flex flex-col gap-3 animate-in slide-in-from-top-1 duration-200">
              <div className="flex flex-wrap items-end gap-4">
                {/* OVERRIDE GLOBAL — desliga a detecção/modo e força UM idioma para toda a narração. */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-ink-muted uppercase font-bold">Forçar idioma</span>
                  {/* Guarda o ISO-639-1 ('pt'); o picker fala BCP-47 — daí a conversão nas pontas. */}
                  <LangPicker
                    id="reading-forced-lang"
                    ariaLabel="Forçar idioma da narração"
                    value={toBcp47(forcedLang)}
                    auto={!forcedLang}
                    allowAuto
                    autoLabel="Automático (segue o modo)"
                    onPick={({ auto, code }) => setForcedLang(auto ? '' : baseLang(code || ''))}
                  />
                </div>

                {/* VOZ POR IDIOMA. Nos modos bilíngue/auto há mais de um idioma em jogo — o seletor
                    edita a voz do idioma escolhido (por padrão, o que está sendo narrado agora). */}
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <span className="text-[9px] font-mono text-ink-muted uppercase font-bold">
                    Voz · {langLabel(voiceEditLang)}
                    {currentSpeakingLang === voiceEditLang && isNarrating && <span className="text-accent"> (narrando agora)</span>}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {narratedLangs.length > 1 && (
                      <div className="flex items-center gap-0.5 bg-canvas border border-border-subtle rounded-lg p-0.5">
                        {narratedLangs.map(l => (
                          <button
                            key={l}
                            onClick={() => setVoiceEditLangOverride(l)}
                            className={`px-1.5 py-1 rounded text-[10px] font-bold uppercase cursor-pointer transition-all ${voiceEditLang === l ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}
                            title={`Editar a voz de ${langLabel(l)}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    )}
                    <select
                      value={voicePrefs[voiceEditLang] || ''}
                      onChange={(e) => {
                        const name = e.target.value;
                        setVoicePrefs(prev => {
                          const next = { ...prev };
                          if (name) next[voiceEditLang] = name;
                          else delete next[voiceEditLang];
                          return next;
                        });
                      }}
                      className="bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-xs text-ink outline-none max-w-[260px] cursor-pointer flex-1"
                    >
                      <option value="">Melhor voz disponível (automática)</option>
                      <optgroup label={langLabel(voiceEditLang)}>
                        {voiceOptions.map(v => (
                          <option key={v.name} value={v.name}>
                            {v.name.replace('Microsoft', '').replace('Google', '').trim()} ({v.lang})
                            {v.neural ? ' · Natural' : ''}{v.local ? ' · Offline' : ' · Rede'}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-mono text-ink-muted uppercase font-bold">Tom: {narrationPitch.toFixed(1)}</span>
                  <input
                    type="range"
                    min="0.5" max="1.5" step="0.1"
                    value={narrationPitch}
                    onChange={(e) => setNarrationPitch(parseFloat(e.target.value))}
                    className="w-28 h-1 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                </div>
              </div>

              {/* AVISO HONESTO: sem voz instalada para um idioma NÃO narramos com a voz de outro. */}
              {missingVoiceLangs.length > 0 && (
                <div className="flex items-start gap-2 text-[11px] rounded-lg border border-warn/40 bg-warn-soft/40 px-2.5 py-2 text-ink-muted">
                  <AlertTriangle className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                  <span>
                    Seu sistema não tem voz instalada para{' '}
                    <b className="text-ink">{missingVoiceLangs.map(l => langLabel(l)).join(', ')}</b>, essas
                    frases não serão narradas com o sotaque correto. Instale em{' '}
                    <b className="text-ink">Configurações do Windows → Hora e Idioma → Voz</b>.
                  </span>
                </div>
              )}

              <p className="text-[10px] text-ink-faint">
                Mudanças de voz, tom, velocidade ou modo são aplicadas na <b className="text-ink-muted">frase atual</b>, a narração continua de onde estava.
                {narrationMode === 'auto' && !forcedLang && (
                  <> Detecção de idioma: <b className="text-ink-muted">{nativeDetector ? 'detector on-device do navegador' : 'heurística local'}</b>; frases sem sinal usam o idioma declarado da sessão ({langLabel(langPair.src)}).</>
                )}
                {forcedLang && (
                  <> <b className="text-ink-muted">Idioma forçado</b>, o modo e a detecção estão desligados.</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Study brushes & view toggle bar */}
        <div className={`p-3 rounded-xl border shadow-sm mb-6 flex flex-col gap-4 ${getThemeClass()}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border-subtle/50">
            <div className="flex items-center gap-2 bg-canvas border border-border-subtle p-0.5 rounded-lg text-xs font-bold">
              <button
                onClick={() => {
                  setIsDrawModeActive(false);
                  setSelectedTool('none');
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-all ${!isDrawModeActive ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted'}`}
              >
                <MousePointer className="w-3.5 h-3.5 text-accent" />
                <span>Modo Interativo</span>
              </button>
              <button
                onClick={() => {
                  setIsDrawModeActive(true);
                  setSelectedTool('none');
                }}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md transition-all ${isDrawModeActive ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted'}`}
              >
                <Pen className="w-3.5 h-3.5 text-accent" />
                <span>Desenho Livre</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-ink-muted">Visualização:</span>
              {/* C2 — o "Visualização:" ao lado é um `span`, não um `<label for>`. */}
              <select
                aria-label="Modo de visualização do texto"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as any)}
                className="bg-canvas border border-border-subtle rounded-lg px-2.5 py-1 text-xs font-bold text-ink outline-none"
              >
                <option value="original">Original ({langLabel(langPair.src)})</option>
                <option value="bilingual-intercalated">Intercalado</option>
                <option value="bilingual-side-by-side">Lado a Lado</option>
              </select>
            </div>
          </div>

          {isDrawModeActive ? (
            <div className="flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-ink-muted">Ferramentas de Desenho:</span>
                
                <button
                  onClick={() => setDrawTool('pen')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                    drawTool === 'pen' ? 'bg-accent text-white shadow' : 'bg-canvas hover:bg-surface-hover text-ink-muted'
                  }`}
                >
                  <Pen className="w-3.5 h-3.5" />
                  <span>Caneta</span>
                </button>

                <button
                  onClick={() => setDrawTool('highlighter')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                    drawTool === 'highlighter' ? 'bg-accent text-white shadow' : 'bg-canvas hover:bg-surface-hover text-ink-muted'
                  }`}
                >
                  <Highlighter className="w-3.5 h-3.5" />
                  <span>Marca-Texto</span>
                </button>

                <button
                  onClick={() => setDrawTool('eraser')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                    drawTool === 'eraser' ? 'bg-accent text-white shadow' : 'bg-canvas hover:bg-surface-hover text-ink-muted'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Borracha</span>
                </button>

                <button
                  onClick={clearCanvas}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 bg-error-soft hover:bg-error hover:text-white text-error-ink transition-all"
                  title="Limpar todos os desenhos"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Tudo</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {/* Color Selection */}
                {drawTool !== 'eraser' && (
                  <div className="flex items-center gap-1.5 border-l border-border-subtle/50 pl-4">
                    <span className="text-[11px] font-mono text-ink-muted mr-1">Cor:</span>
                    {[
                      { hex: '#ef4444', name: 'Vermelho' },
                      { hex: '#f59e0b', name: 'Amarelo' },
                      { hex: '#10b981', name: 'Verde' },
                      { hex: '#3b82f6', name: 'Azul' },
                      { hex: '#8b5cf6', name: 'Roxo' },
                      { hex: '#374151', name: 'Grafite' }
                    ].map(c => (
                      <button
                        key={c.hex}
                        onClick={() => setBrushColor(c.hex)}
                        style={{ backgroundColor: c.hex }}
                        className={`w-5 h-5 rounded-full transition-all ${
                          brushColor === c.hex ? 'ring-2 ring-offset-2 ring-accent scale-110' : 'opacity-80 hover:opacity-100'
                        }`}
                        title={c.name}
                      />
                    ))}
                  </div>
                )}

                {/* Size Selection */}
                <div className="flex items-center gap-2 border-l border-border-subtle/50 pl-4">
                  <span className="text-[11px] font-mono text-ink-muted">Espessura: {brushSize}px</span>
                  <input
                    type="range"
                    min="2"
                    max="25"
                    step="1"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-20 h-1 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  {/* Small circle preview of thickness */}
                  <div className="w-6 h-6 flex items-center justify-center bg-canvas border border-border-subtle rounded-md">
                    <div
                      style={{
                        width: `${brushSize}px`,
                        height: `${brushSize}px`,
                        backgroundColor: drawTool === 'eraser' ? 'var(--ink-faint)' : brushColor,
                        borderRadius: '50%'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in slide-in-from-top-1">
              <span className="text-[11px] font-mono font-bold text-ink-muted mr-1">Anotações Semânticas:</span>
              
              <button
                onClick={() => setSelectedTool(selectedTool === 'highlight-yellow' ? 'none' : 'highlight-yellow')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  selectedTool === 'highlight-yellow'
                    ? 'bg-warn-soft text-warn-ink ring-2 ring-warn'
                    : 'bg-canvas hover:bg-warn-soft text-ink-muted'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-warn fill-warn" />
                <span>Vocabulário</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'highlight-green' ? 'none' : 'highlight-green')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  selectedTool === 'highlight-green'
                    ? 'bg-good-soft text-good-ink ring-2 ring-good'
                    : 'bg-canvas hover:bg-good-soft text-ink-muted'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-good fill-good" />
                <span>Gramática</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'highlight-blue' ? 'none' : 'highlight-blue')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  selectedTool === 'highlight-blue'
                    ? 'bg-rare-soft text-rare-ink ring-2 ring-rare'
                    : 'bg-canvas hover:bg-rare-soft text-ink-muted'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-rare fill-rare" />
                <span>Expressão</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'highlight-pink' ? 'none' : 'highlight-pink')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  selectedTool === 'highlight-pink'
                    ? 'bg-error-soft text-error-ink ring-2 ring-error'
                    : 'bg-canvas hover:bg-error-soft text-ink-muted'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 text-error fill-error" />
                <span>Dúvida</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'note' ? 'none' : 'note')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  selectedTool === 'note'
                    ? 'bg-warn-soft text-warn-ink ring-2 ring-warn'
                    : 'bg-canvas hover:bg-warn-soft text-ink-muted'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 text-warn" />
                <span>Nota</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'audio' ? 'none' : 'audio')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                  selectedTool === 'audio'
                    ? 'bg-rare-soft text-rare-ink ring-2 ring-rare'
                    : 'bg-canvas hover:bg-rare-soft text-ink-muted'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5 text-rare" />
                <span>Áudio</span>
              </button>

              <button
                onClick={() => setSelectedTool(selectedTool === 'eraser' ? 'none' : 'eraser')}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                  selectedTool === 'eraser'
                    ? 'bg-error-soft text-error-ink ring-2 ring-error'
                    : 'bg-canvas hover:bg-error-soft text-ink-muted'
                }`}
              >
                <Eraser className="w-3.5 h-3.5 text-error" />
                <span>Apagar</span>
              </button>
            </div>
          )}
        </div>

        {/* The Core Interactive Transcript Canvas */}
        <div className={`card-panel p-6 md:p-10 min-h-[50vh] leading-loose transition-all ${getThemeClass()} relative`} style={{ fontSize: `${fontSize}px` }}>
          
          {/* Freehand Canvas Drawing Overlay */}
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className={`absolute inset-0 z-10 ${isDrawModeActive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
          />

          <p className="mb-6 italic text-[13px] border-l-4 border-accent pl-3 text-ink-muted">
            Dica: Clique com o mouse em qualquer palavra para ouvir sua pronúncia. Ative os pincéis de grifo acima para categorizar termos, adicionar notas e até comentários gravados em áudio!
          </p>

          {studyTexts.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-14 h-14 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4 text-ink-muted">
                <BookOpen className="w-7 h-7" />
              </div>
              <p className="text-sm text-ink-muted">
                {transcriptLoaded ? 'Nenhuma transcrição real para esta sessão ainda.' : 'Carregando transcrição…'}
              </p>
            </div>
          ) : viewMode === 'bilingual-side-by-side' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-border-subtle">
              {/* Left Column (Original Text) */}
              <div className="space-y-6">
                <span className="text-[10px] font-mono font-bold tracking-wider text-accent uppercase block pb-1 border-b">Texto Original ({langLabel(langPair.src)})</span>
                {studyTexts.map((sentenceObj, sIdx) => {
                  const isNarratingActive = activeNarratingSentenceIndex === sIdx;
                  return (
                    <div
                      key={sIdx}
                      id={`sentence-${sIdx}`}
                      className={`group/sent relative p-3 rounded-lg transition-all ${isNarratingActive ? 'bg-accent/10 border-l-4 border-accent' : 'border-l-4 border-transparent'}`}
                    >
                      <SentencePlayButton index={sIdx} />
                      {(sentenceObj.speaker || narrationMode === 'auto') && (
                        <div className="flex items-center flex-wrap mb-1">
                          {sentenceObj.speaker && (
                            <span className="text-[10px] uppercase font-mono font-bold text-accent/80">{sentenceObj.speaker}</span>
                          )}
                          <SentenceLangBadge index={sIdx} />
                        </div>
                      )}
                      <div>
                        {tokenizarTexto(sentenceObj.original).map((token) => {
                          const isContentWord = token.clean.length >= 3;
                          const annotation = annotations.find(a => a.textIndex === sIdx && a.wordIndex === token.id);
                          
                          let highlightClass = '';
                          if (annotation?.type === 'highlight') {
                            highlightClass = annotation.color || 'bg-warn-soft';
                          }
                          const hasNote = annotations.some(a => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'note');
                          const hasAudio = annotations.some(a => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'audio');

                          return (
                            <span key={token.id} className="inline-block mr-1.5 relative group">
                              <span
                                onMouseEnter={(e) => handleMouseEnter(e, token.clean)}
                                onClick={() => handleWordClick(sIdx, token.id, token.original)}
                                onMouseLeave={handleMouseLeave}
                                className={`
                                  inline px-0.5 rounded cursor-pointer transition-colors duration-150
                                  ${isContentWord ? 'border-b border-dashed border-accent/30' : ''}
                                  ${highlightClass}
                                  ${hasNote ? 'underline decoration-dashed decoration-warn decoration-2 font-medium' : ''}
                                  ${hasAudio ? 'underline decoration-double decoration-rare decoration-2 font-medium' : ''}
                                  ${selectedTool !== 'none' ? 'hover:bg-accent/20' : 'hover:bg-surface-hover hover:text-ink'}
                                `}
                              >
                                {token.original}
                              </span>
                              {(hasNote || hasAudio) && (
                                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10 pointer-events-none scale-75 opacity-90">
                                  {hasNote && <span className="w-2 h-2 rounded-full bg-warn shadow-sm" />}
                                  {hasAudio && <span className="w-2 h-2 rounded-full bg-rare shadow-sm" />}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column (Translation) */}
              <div className="space-y-6 md:pl-8">
                <span className="text-[10px] font-mono font-bold tracking-wider text-accent uppercase block pb-1 border-b">Tradução ({langLabel(langPair.tgt)})</span>
                {studyTexts.map((sentenceObj, sIdx) => {
                  const isNarratingActive = activeNarratingSentenceIndex === sIdx;
                  return (
                    <div 
                      key={sIdx} 
                      className={`p-3 rounded-lg transition-all ${isNarratingActive ? 'bg-accent/5' : ''}`}
                    >
                      {sentenceObj.speaker && (
                        <span className="text-[10px] uppercase font-mono font-bold text-ink-muted block mb-1">{sentenceObj.speaker}</span>
                      )}
                      <p className="text-[13.5px] text-ink-muted italic leading-relaxed">
                        {sentenceObj.translation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Single Column Intercalated */
            <div className="space-y-6">
              {studyTexts.map((sentenceObj, sIdx) => {
                const isNarratingActive = activeNarratingSentenceIndex === sIdx;
                return (
                  <div
                    key={sIdx}
                    id={`sentence-${sIdx}`}
                    className={`group/sent relative p-4 rounded-xl border transition-all ${
                      isNarratingActive
                        ? 'bg-accent/10 border-accent/40 shadow-sm pl-4'
                        : 'border-transparent'
                    }`}
                  >
                    <SentencePlayButton index={sIdx} />
                    {(sentenceObj.speaker || narrationMode === 'auto') && (
                      <div className="flex items-center flex-wrap mb-1">
                        {sentenceObj.speaker && (
                          <span className="text-[11px] uppercase tracking-wider font-mono font-black text-accent">
                            {sentenceObj.speaker}
                          </span>
                        )}
                        <SentenceLangBadge index={sIdx} />
                      </div>
                    )}

                    {/* Original sentence with tokens */}
                    <div className="leading-relaxed text-ink">
                      {tokenizarTexto(sentenceObj.original).map((token) => {
                        const isContentWord = token.clean.length >= 3;
                        const annotation = annotations.find(a => a.textIndex === sIdx && a.wordIndex === token.id);
                        
                        let highlightClass = '';
                        if (annotation?.type === 'highlight') {
                          highlightClass = annotation.color || 'bg-warn-soft';
                        }
                        const hasNote = annotations.some(a => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'note');
                        const hasAudio = annotations.some(a => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'audio');

                        return (
                          <span key={token.id} className="inline-block mr-1.5 relative group">
                            <span
                              onMouseEnter={(e) => handleMouseEnter(e, token.clean)}
                              onClick={() => handleWordClick(sIdx, token.id, token.original)}
                              onMouseLeave={handleMouseLeave}
                              className={`
                                inline px-0.5 rounded cursor-pointer transition-colors duration-150
                                ${isContentWord ? 'border-b border-dashed border-accent/30' : ''}
                                ${highlightClass}
                                ${hasNote ? 'underline decoration-dashed decoration-warn decoration-2 font-medium' : ''}
                                ${hasAudio ? 'underline decoration-double decoration-rare decoration-2 font-medium' : ''}
                                ${selectedTool !== 'none' ? 'hover:bg-accent/20' : 'hover:bg-surface-hover hover:text-ink'}
                              `}
                            >
                              {token.original}
                            </span>
                            {(hasNote || hasAudio) && (
                              <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10 pointer-events-none scale-75 opacity-90">
                                {hasNote && <span className="w-2 h-2 rounded-full bg-warn shadow-sm" />}
                                {hasAudio && <span className="w-2 h-2 rounded-full bg-rare shadow-sm" />}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>

                    {/* Intercalated translation if set */}
                    {viewMode === 'bilingual-intercalated' && (
                      <div className="text-[13.5px] text-ink-muted italic pl-2 border-l-2 border-border-subtle mt-1.5">
                        {sentenceObj.translation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
      </EditablePanel>
      
      {/* Sidebar de notas. Sem o botão legado, sua visibilidade vem SÓ do layoutStore
          (`reading.notesSidebar.show`, hoje `false`), quem quiser a revisão de marcações liga o
          painel pelo LayoutStudio. O EditablePanel já retorna null quando `show` é false. */}
        <EditablePanel
          viewKey="reading"
          panelKey="notesSidebar"
          title="Estudos & Notas"
          className="flex flex-col flex-1 md:flex-none md:shrink-0 lg:border-l border-border-subtle"
          canResizeWidth={true}
          canResizeHeight={false}
          resizeHandlePosition="left"
          defaultWidth={35}
        >
        <div className="flex-1 w-full bg-surface flex flex-col h-full animate-in slide-in-from-right-4 duration-300 z-30 overflow-hidden">
          
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-border-subtle bg-canvas flex justify-between items-center shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider font-display text-ink flex items-center gap-1.5">
              Minhas Notas ({annotations.length})
            </span>
          </div>

          {/* ANNOTATIONS & VOICE NOTES REVIEW PANEL */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border-subtle">
              <span className="text-[11px] font-mono font-bold text-ink-muted">REVISÃO DE MARCAÇÕES</span>
              {annotations.length > 0 && (
                <button
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: 'Apagar todas as anotações?',
                      detail: `${annotations.length} anotação(ões) serão removidas. Não há como desfazer.`,
                      confirmLabel: 'Apagar tudo',
                      danger: true,
                    });
                    if (ok) setAnnotations([]);
                  }}
                  className="text-[10px] font-bold text-error-ink hover:underline"
                >
                  Apagar Tudo
                </button>
              )}
            </div>

              {annotations.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-3">
                  <div className="w-12 h-12 bg-surface-hover rounded-full flex items-center justify-center mx-auto text-ink-muted">
                    <StickyNote className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-ink">Nenhum grifo ou nota</h4>
                    <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                      Ative uma das ferramentas de grifo ou áudio no painel principal e clique nas palavras para começar a estudar.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {annotations.map((ann) => (
                    <div key={ann.id} className="p-3 rounded-xl border border-border-subtle bg-canvas space-y-2 relative group/item shadow-sm">
                      <button 
                        onClick={() => setAnnotations(annotations.filter(a => a.id !== ann.id))}
                        className="absolute top-2.5 right-2.5 p-1 text-ink-muted hover:text-error-ink rounded hover:bg-surface-hover transition-colors"
                        title="Remover Nota"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-2">
                        {ann.type === 'highlight' && (
                          <span className={`w-2.5 h-2.5 rounded-full ${ann.color ? ann.color.split(' ')[0] : 'bg-warn-soft'}`} />
                        )}
                        {ann.type === 'note' && (
                          <StickyNote className="w-3.5 h-3.5 text-warn" />
                        )}
                        {ann.type === 'audio' && (
                          <Volume2 className="w-3.5 h-3.5 text-rare" />
                        )}
                        <span className="text-[10px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                          {ann.type === 'highlight' ? `Marcação (${ann.content})` : ann.type === 'note' ? 'Nota Escrita' : 'Áudio Comentário'}
                        </span>
                      </div>

                      <div className="text-[13px] font-extrabold text-ink leading-snug">
                        "{ann.wordText}"
                      </div>

                      {ann.type === 'note' && ann.content && (
                        <p className="text-xs text-ink-muted bg-surface p-2.5 rounded border border-border-subtle whitespace-pre-wrap leading-relaxed italic">
                          {ann.content}
                        </p>
                      )}

                      {ann.type === 'audio' && (
                        <div className="flex items-center gap-2 bg-surface p-2 rounded border border-border-subtle">
                          <button 
                            onClick={() => {
                              if (ann.audioUrl) {
                                const audio = new Audio(ann.audioUrl);
                                audio.play();
                              }
                            }}
                            className="p-2 rounded-full bg-rare-soft text-rare-ink hover:brightness-95 transition-colors cursor-pointer shrink-0"
                            title="Ouvir minha gravação de voz"
                          >
                            <PlayCircle className="w-5 h-5 fill-rare/10" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-mono text-ink-muted block">Comentário em Áudio</span>
                            <span className="text-[11px] text-ink truncate block">Ouvir minha gravação</span>
                          </div>
                        </div>
                      )}

                      <span className="text-[9px] font-mono text-ink-faint block text-right pt-1">
                        {ann.createdAt ? new Date(ann.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Agora'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </EditablePanel>

      {/* Analista de Vocabulário — coluna à direita; só monta quando há palavra selecionada. */}
      <VocabularyPanel
        viewKey="reading"
        word={selectedExamWord}
        mtNote={mtNote}
        onClose={() => { setSelectedExamWord(null); setMtNote(null); }}
        onSpeak={speakWord}
        onAddToDeck={handleAddVocabWordToDeck}
        isAdded={!!selectedExamWord && isWordAdded(selectedExamWord)}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        // Sem navegação (Leitura montada fora da Análise) → sem botões de praticar. Nada de botão morto.
        onPractice={onChangeView ? handlePracticeWord : undefined}
      />

      {/* Sticky note creation popover modal */}
      {noteTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface text-ink rounded-2xl border border-border-subtle shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-base flex items-center gap-1.5 text-warn-ink">
                <StickyNote className="w-5 h-5" /> Adicionar Nota de Estudo
              </h3>
              <button onClick={() => setNoteTarget(null)} className="p-1 hover:bg-surface-hover rounded">
                <X className="w-4 h-4 text-ink-muted" />
              </button>
            </div>
            
            <p className="text-xs text-ink-muted mb-3 font-mono leading-relaxed">
              Palavra anotada: <strong className="text-ink font-sans text-sm">"{noteTarget.wordText}"</strong>
            </p>

            <textarea
              className="w-full h-28 p-3 bg-canvas border border-border-subtle rounded-xl text-sm text-ink outline-none focus:ring-1 focus:ring-accent mb-4 resize-none"
              placeholder="Escreva suas anotações, regras gramaticais ou insights de uso corporativo aqui..."
              value={noteTextInput}
              onChange={(e) => setNoteTextInput(e.target.value)}
              autoFocus
            />

            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => setNoteTarget(null)} 
                className="px-3.5 py-2 rounded-lg bg-surface-hover text-ink-muted text-xs font-bold hover:text-ink"
              >
                Cancelar
              </button>
              <button 
                onClick={() => {
                  if (noteTextInput.trim()) {
                    setAnnotations([
                      ...annotations,
                      {
                        id: `ann-${Date.now()}`,
                        type: 'note',
                        textIndex: noteTarget.tIndex,
                        wordIndex: noteTarget.wIndex,
                        wordText: noteTarget.wordText,
                        content: noteTextInput,
                        createdAt: Date.now()
                      }
                    ]);
                  }
                  setNoteTarget(null);
                }}
                className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-ink"
              >
                Salvar Nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audio recording memo popover modal */}
      {recordingTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface text-ink rounded-2xl border border-border-subtle shadow-2xl p-6 text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-bold text-sm text-rare-ink flex items-center gap-1.5 text-left">
                <Volume2 className="w-5 h-5" /> Gravar Comentário em Áudio
              </h3>
              <button onClick={() => setRecordingTarget(null)} className="p-1 hover:bg-surface-hover rounded">
                <X className="w-4 h-4 text-ink-muted" />
              </button>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Grave sua própria pronúncia ou um comentário falado para: <strong className="text-ink">"{recordingTarget.wordText}"</strong>
            </p>

            {/* Simulated/real visual wave container */}
            <div className="h-28 bg-canvas border border-border-subtle rounded-2xl flex flex-col justify-center items-center relative overflow-hidden p-4">
              {isRecordingAudio ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-1 h-5 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.1s' }} />
                    <span className="w-1 h-9 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-12 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.3s' }} />
                    <span className="w-1 h-7 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.4s' }} />
                    <span className="w-1 h-11 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.5s' }} />
                    <span className="w-1 h-4 bg-rare rounded animate-bounce duration-300" style={{ animationDelay: '0.6s' }} />
                  </div>
                  <span className="text-xs font-mono text-error-ink font-bold block animate-pulse">
                    Gravando: {recordingSeconds}s
                  </span>
                </div>
              ) : playbackAudioUrl ? (
                <div className="space-y-2">
                  <div className="text-good-ink font-bold text-xs">✓ Áudio Gravado com Sucesso!</div>
                  <button
                    onClick={() => {
                      if (playbackAudioUrl) {
                        const audio = new Audio(playbackAudioUrl);
                        audio.play();
                      }
                    }}
                    className="px-3 py-1 bg-rare-soft text-rare-ink hover:brightness-95 text-[11px] rounded-lg font-bold inline-flex items-center gap-1 mx-auto"
                  >
                    <PlayCircle className="w-4 h-4" /> Ouvir Minha Voz
                  </button>
                </div>
              ) : recordingError ? (
                <div className="text-xs text-error font-bold px-2 text-center">
                  {recordingError}
                </div>
              ) : (
                <div className="text-xs text-ink-muted">Aguardando início...</div>
              )}
            </div>

            <div className="flex justify-center gap-2">
              {!isRecordingAudio && !playbackAudioUrl && (
                <button
                  onClick={startVoiceRecording}
                  className="px-4 py-2 rounded-xl bg-rare-soft text-rare-ink border border-rare/40 font-bold text-xs flex items-center gap-1 hover:brightness-105 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-rare animate-ping" />
                  Iniciar Gravação
                </button>
              )}

              {isRecordingAudio && (
                <button 
                  onClick={stopVoiceRecording}
                  className="px-4 py-2 rounded-xl bg-error-soft text-error-ink border border-error/40 font-bold text-xs flex items-center gap-1 hover:brightness-105 cursor-pointer"
                >
                  Parar Gravação
                </button>
              )}

              {playbackAudioUrl && (
                <>
                  <button 
                    onClick={startVoiceRecording}
                    className="px-3 py-2 rounded-xl bg-surface-hover text-ink-muted font-bold text-xs cursor-pointer hover:text-ink"
                  >
                    Gravar Novamente
                  </button>
                  <button 
                    onClick={saveRecordedAudio}
                    className="px-4 py-2 rounded-xl bg-rare-soft text-rare-ink border border-rare/40 font-bold text-xs cursor-pointer hover:brightness-105 shadow-sm"
                  >
                    Salvar Áudio
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prévia de imagem da palavra sob o cursor. A MOLDURA é a mesma da Análise
          (`PopoverFlutuante`); o conteúdo é só desta tela, aqui é a imagem, e nada mais. */}
      {hoveredWord && (
        <PopoverFlutuante {...popover.props}>
          {wordPreview && (
            <div className="flex flex-col">
              {/* Imagem REAL (Openverse) — placeholder honesto quando não há imagem */}
              <div className="relative h-40 bg-ink flex items-center justify-center">
                {wordPreview.loading ? (
                  <span className="text-[12px] text-ink-contrast/70 animate-pulse">Buscando imagem…</span>
                ) : wordPreview.imageUrl ? (
                  <>
                    <img
                      src={wordPreview.imageUrl}
                      alt={wordPreview.word}
                      className="w-full h-full object-cover opacity-90"
                    />
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 uppercase tracking-wider">
                      <Search className="w-3 h-3" /> Imagem Associada
                    </div>
                  </>
                ) : (
                  <span className="text-[12px] text-ink-contrast/60">sem imagem</span>
                )}
              </div>

              <div className="p-4 bg-surface flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-lg text-ink capitalize truncate">{wordPreview.word}</h3>
                    {/* Tradução real, ou o MOTIVO de não haver — nunca um texto inventado. */}
                    {wordPreview.loading ? (
                      <p className="text-[13px] text-ink-muted">Traduzindo…</p>
                    ) : wordPreview.translation ? (
                      <p className="text-[13px] text-ink-muted">{wordPreview.translation}</p>
                    ) : (
                      <p className="text-[12px] text-warn-ink">
                        {wordPreview.note ?? 'Tradução indisponível'}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => playWordTTS(wordPreview.word)}
                    className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-ink-muted hover:text-accent hover:bg-accent-soft transition-colors cursor-pointer shrink-0"
                    title="Ouvir Pronúncia"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {wordPreview.context && (
                  <p className="text-[13.5px] leading-relaxed text-ink-muted border-l-2 border-border-subtle pl-3 italic">
                    {wordPreview.context}
                  </p>
                )}

                <div className="mt-1 pt-3 border-t border-border-subtle flex gap-2">
                  {vocabCards.some(c => c.word.toLowerCase() === wordPreview.word.toLowerCase() && c.inDeck) ? (
                    <button className="flex-1 py-2 px-3 text-[13px] rounded-lg bg-good-soft text-good font-bold flex items-center justify-center gap-1.5 w-full cursor-not-allowed">
                      <Check className="w-4 h-4" /> Já está no Deck
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAddWordToDeck(wordPreview.word, wordPreview.translation, wordPreview.context)}
                      className="flex-1 btn-solid bg-accent text-white border-none py-2 px-3 text-[13px] hover:scale-[1.02] flex items-center justify-center gap-1.5 w-full cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> Adicionar ao Deck
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </PopoverFlutuante>
      )}
    </div>
  );
}
