import { makeCloze } from '@core';
import {
  AlertTriangle,
  AudioLines,
  BookOpen,
  Check,
  CircleHelp,
  Eraser,
  Highlighter,
  Mic,
  MousePointerClick,
  NotebookPen,
  Pause,
  Pen,
  PenTool,
  Play,
  PlayCircle,
  Plus,
  Quote,
  Search,
  SkipBack,
  SkipForward,
  SpellCheck,
  Square,
  StickyNote,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { fetchDeck, fetchSessionTranscript, searchImages } from '../../data/api';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { ficharCartao } from '../../lib/adicionarAoDeck';
import { useLangConfig } from '../../lib/langConfig';
import { detectLanguage, hasNativeDetector, type LangDetection } from '../../lib/langDetect';
import { baseLang, langLabel, toBcp47 } from '../../lib/languages';
import {
  type Anotacao,
  anotarFrase,
  lerAnotacoes,
  notaDaFrase,
  type TipoDeNota,
  TIPOS_DE_NOTA,
} from '../../lib/leitura/anotacaoDaFrase';
import { micErrorMessage } from '../../lib/mediaErrors';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
import type { ExerciseId, PracticeSeed } from '../../lib/sentences';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import { getVoicePrefs, hasVoiceFor, pickVoice, setVoicePref, speak as ttsSpeak, voicesFor } from '../../lib/tts';
import type { ResolvedWord, WordOrigin } from '../../lib/vocabWord';
import { buildVocabWord, mtNoteFor, resolveWord, tokenizarTexto } from '../../lib/vocabWord';
import { Recording, VocabCard, VocabWord } from '../../types';
import EditablePanel from '../EditablePanel';
import LangPicker from '../LangPicker';
import PopoverFlutuante from '../PopoverFlutuante';
import { toast } from '../Toast';
import { IconeEmBloco, TituloDeSecao } from '../ui';
import VocabularyPanel from '../VocabularyPanel';

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

/** As anotações da Leitura (por frase; e as antigas, por palavra): `lib/leitura/anotacaoDaFrase`. */
type Annotation = Anotacao;

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
  const gateway = React.useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: () => true }), []);

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
    [sessionLangs, langConfig],
  );
  const TRANSCRIPT = studyTexts.map((t) => t.original);

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
          .filter((u) => (u.sourceText || '').trim().length > 0)
          .map((u) => ({
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
    fetchDeck()
      .then(setVocabCards)
      .catch(() => {});
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
      ? studyTexts.findIndex((t) => t.original === context)
      : studyTexts.findIndex((t) => t.original.toLowerCase().includes(wordStr.toLowerCase()));
    // A palavra pode ter vindo do LADO TRADUZIDO (o popover agora vale nos dois lados): se não
    // está em nenhum original, procura nas traduções e rotula com o idioma-destino.
    const idxTrad =
      idx < 0 ? studyTexts.findIndex((t) => (t.translation || '').toLowerCase().includes(wordStr.toLowerCase())) : -1;
    const ctx =
      context || (idx >= 0 ? studyTexts[idx].original : idxTrad >= 0 ? studyTexts[idxTrad].translation || '' : '');
    const declaredLang = idx >= 0 ? langOfSentence(idx) : idxTrad >= 0 ? langPair.tgt : forcedLang || langPair.src;
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
    const exists = vocabCards.find((c) => c.word.toLowerCase() === wordStr.toLowerCase());
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
    if (created.length) setVocabCards((prev) => [...prev, ...created]);
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
    const context =
      sentenceIndex !== undefined
        ? studyTexts[sentenceIndex]?.original || ''
        : TRANSCRIPT.find((s) => s.toLowerCase().includes(wordStr.toLowerCase())) || '';
    const origin = originOfWord(wordStr, context || undefined);

    const cached = previewCacheRef.current.get(wordStr);
    const known = vocabCards.find((c) => c.word.toLowerCase() === wordStr.toLowerCase());
    const alreadyTranslated = cached?.translation || known?.translation || '';

    setMtNote(null);
    setSelectedExamWord({ word: wordStr, translation: alreadyTranslated, example: origin.context });

    // Com tradução em mãos, só falta o idioma REAL (para o dicionário e o TTS do painel).
    if (alreadyTranslated) {
      const resolved = await resolveWord(origin);
      selectedWordLangRef.current = resolved.lang;
      setSelectedExamWord((prev) =>
        prev && prev.word === wordStr ? { ...prev, lang: resolved.lang || undefined } : prev,
      );
      return;
    }

    const { vocab, resolved } = await buildVocabWord(origin, gateway.mt);
    selectedWordLangRef.current = resolved.lang;
    setSelectedExamWord((prev) => (prev && prev.word === wordStr ? vocab : prev));
    setMtNote(mtNoteFor(resolved, vocab.translation));
  };

  // Adapta a assinatura do painel (VocabWord) para o handler de deck já existente.
  const handleAddVocabWordToDeck = async (w: VocabWord) => {
    setAddedWords((prev) => (prev.includes(w.word) ? prev : [...prev, w.word]));
    await handleAddWordToDeck(w.word, w.translation || null, w.example);
  };

  /** Já fichada? (deck do backend ou adicionada agora, nesta tela) */
  const isWordAdded = (w: VocabWord) =>
    addedWords.includes(w.word) || vocabCards.some((c) => c.word.toLowerCase() === w.word.toLowerCase());

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
  /* Constante, e não estado: o controle de tamanho saiu da tela e `setFontSize` nunca era
     chamado — um `useState` cujo setter ninguém chama é um número com passos a mais. */
  const fontSize = 18;
  /* Espelho síncrono da pausa: o `onend` da utterance dispara no PAUSE em vários Chromes e
     encadeava a próxima frase — era o "cliquei em pausar e ele recomeçou". */
  const narrationPausedRef = useRef(false);
  /** A frase clicada no modo interativo: abre a "Anotação semântica" (protótipo). */
  const [fraseEscolhida, setFraseEscolhida] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'original' | 'bilingual-intercalated' | 'bilingual-side-by-side'>(
    'bilingual-intercalated',
  );

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

  /* AS ANOTAÇÕES SÃO DA SESSÃO. A chave era uma só ('readingAnnotations'), indexada pela posição da
     frase: o grifo da frase 3 de uma sessão aparecia na frase 3 de qualquer outra. */
  const chaveDasNotas = `readingAnnotations:${recording?.id ?? 'sem-sessao'}`;
  const lerNotas = (chave: string): Annotation[] => {
    try {
      return lerAnotacoes(localStorage.getItem(chave));
    } catch {
      return [];
    }
  };
  const [annotations, setAnnotations] = useState<Annotation[]>(() => lerNotas(chaveDasNotas));
  const notasDe = useRef(chaveDasNotas);
  useEffect(() => {
    if (notasDe.current === chaveDasNotas) return;
    notasDe.current = chaveDasNotas;
    setAnnotations(lerNotas(chaveDasNotas));
    setFraseEscolhida(null);
  }, [chaveDasNotas]);

  useEffect(() => {
    try {
      localStorage.setItem(notasDe.current, JSON.stringify(annotations));
    } catch {
      /* sem armazenamento: as notas valem só nesta abertura */
    }
  }, [annotations]);

  // Freehand Canvas Drawing States
  const [isDrawModeActive, setIsDrawModeActive] = useState(false);
  const [drawTool, setDrawTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  /* Redimensionar o canvas APAGA o que estava nele: o desenho é guardado antes e redesenhado
     depois (o protótipo guarda em `E.desenho`). */
  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    const container = canvas?.parentElement;
    if (canvas && container) {
      const antes = canvas.width && canvas.height ? canvas.toDataURL() : null;
      canvas.width = container.scrollWidth;
      canvas.height = container.scrollHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (antes) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0);
          img.src = antes;
        }
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

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isDrawingRef.current = true;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);

    // Caneta no destaque (3 px), marca-texto no âmbar translúcido (16 px), borracha larga (22 px).
    const cor = getComputedStyle(document.documentElement)
      .getPropertyValue(drawTool === 'highlighter' ? '--warn' : '--accent')
      .trim();
    ctx.globalCompositeOperation = drawTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.globalAlpha = drawTool === 'highlighter' ? 0.35 : 1;
    ctx.strokeStyle = cor || '#E8542B';
    ctx.lineWidth = drawTool === 'highlighter' ? 16 : drawTool === 'eraser' ? 22 : 3;
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
  /** A frase que recebe o comentário em áudio ("Áudio" da Anotação semântica). */
  const [recordingTarget, setRecordingTarget] = useState<{ tIndex: number; wordText: string } | null>(null);
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

  // Speech Narration States
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isNarrating, setIsNarrating] = useState(false);
  // Pausado ≠ parado. Sem este estado o botão dizia "Pausar" mesmo já estando pausado.
  const [isNarrationPaused, setIsNarrationPaused] = useState(false);
  // Ajustes avançados do narrador (voz, tom) ficam atrás de um disclosure — a barra fica limpa.
  const [showNarratorSettings, setShowNarratorSettings] = useState(false);
  const [narrationMode, setNarrationMode] = useState<NarrationMode>(
    () => (localStorage.getItem(LS_MODE) as NarrationMode) || DEFAULT_MODE,
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
    () => parseFloat(localStorage.getItem(LS_RATE) || '') || DEFAULT_RATE,
  );
  const [narrationPitch, setNarrationPitch] = useState<number>(1.0);
  const [activeNarratingSentenceIndex, setActiveNarratingSentenceIndex] = useState<number | null>(null);
  /** Idioma que está sendo falado AGORA (no bilíngue muda no meio da frase). Guia o seletor de voz. */
  const [currentSpeakingLang, setCurrentSpeakingLang] = useState<string | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_MODE, narrationMode);
  }, [narrationMode]);
  useEffect(() => {
    localStorage.setItem(LS_FORCED_LANG, forcedLang);
  }, [forcedLang]);
  useEffect(() => {
    localStorage.setItem(LS_RATE, String(narrationRate));
  }, [narrationRate]);
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
    hasNativeDetector()
      .then((ok) => {
        if (alive) setNativeDetector(ok);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Timer for audio recording elapsed seconds
  useEffect(() => {
    if (isRecordingAudio) {
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
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
      console.error('Microfone indisponível:', err);
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
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      setIsRecordingAudio(false);
    }
  };

  const saveRecordedAudio = () => {
    if (!recordingTarget || (!playbackAudioUrl && !recordedBase64)) return;

    setAnnotations(
      anotarFrase(annotations, recordingTarget.tIndex, 'audio', {
        audioUrl: recordedBase64 || playbackAudioUrl || '',
      }),
    );
    toast.ok('Comentário em áudio gravado para esta frase');

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
    const texto = studyTexts[index]?.original || '';
    const bruta = await detectLanguage(texto);
    /* Frase curta engana o detector (a sessão de demonstração, em inglês, saía como polonês em
       "improve retention"). Com menos de 4 palavras ou confiança abaixo de 0,6 não há sinal: vale o
       idioma declarado da sessão, como já acontece quando o detector não responde. */
    const det = bruta && bruta.confidence >= 0.6 && texto.trim().split(/\s+/).length >= 4 ? bruta : null;
    detectionsRef.current[index] = det;
    setDetections((prev) => ({ ...prev, [index]: det }));
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
    return () => {
      cancelled = true;
    };
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
    const withOverride = forcedLang ? steps.map((st) => ({ ...st, lang: forcedLang })) : steps;
    return withOverride.filter((st) => st.text && st.text.trim().length > 0);
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
      narrationPausedRef.current = false;
      currentUtteranceRef.current = utterance;

      const voice = voiceFor(step.lang);
      utterance.lang = voice?.lang || toBcp47(step.lang);
      if (voice) utterance.voice = voice;
      utterance.rate = narrationRate;
      utterance.pitch = narrationPitch;

      setCurrentSpeakingLang(baseLang(step.lang));

      utterance.onend = () => {
        if (runId !== runIdRef.current) return; // fala cancelada/substituída, não encadeia
        // PAUSA NÃO ENCADEIA: em vários Chromes o pause() dispara onend; sem esta guarda a
        // narração "pausada" pulava para a próxima frase sozinha.
        if (narrationPausedRef.current) return;
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
      narrationPausedRef.current = false;
      window.speechSynthesis.resume();
      setIsNarrationPaused(false);
    } else {
      narrationPausedRef.current = true;
      window.speechSynthesis.pause();
      setIsNarrationPaused(true);
    }
  };

  const stopNarration = () => {
    if (!('speechSynthesis' in window)) return;
    runIdRef.current++; // invalida qualquer onend pendente
    narrationPausedRef.current = false;
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
    if (isNarrating && !isNarrationPaused && activeNarratingSentenceIndex !== null) {
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
      if (!values.length || values.some((d) => !d)) set.add(baseLang(langPair.src));
      return [...set];
    }
    return [baseLang(langPair.src)];
  }, [forcedLang, narrationMode, langPair, detections]);

  /** Idiomas narrados SEM nenhuma voz instalada no SO — avisamos em vez de falar com a voz errada. */
  const missingVoiceLangs = React.useMemo(
    () => narratedLangs.filter((l) => !hasVoiceFor(l)),
    // `voices` entra de propósito: a lista do SO chega assíncrona (evento 'voiceschanged').
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [narratedLangs, voices],
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
    [voiceEditLang, voices],
  );

  /**
   * Badge de idioma por frase (só no modo Auto). Distingue DETECTADO de ASSUMIDO: sem sinal, mostra o
   * idioma declarado da sessão em estilo apagado e diz no title que foi assumido — jamais vendemos um
   * chute como detecção.
   */

  // Rola a frase ativa para o centro da área de leitura — você nunca "perde" o narrador de vista.
  useEffect(() => {
    if (activeNarratingSentenceIndex === null) return;
    const el = document.getElementById(`sentence-${activeNarratingSentenceIndex}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeNarratingSentenceIndex]);

  // Encerra a fala ao sair da tela (senão o narrador continua tocando em outra view).
  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const handleWordClick = (tIndex: number, wordText: string) => {
    // Pronuncia a palavra E abre o Analista de Vocabulário (o hover continua sendo só a prévia).
    // A pronúncia usa o idioma da FRASE (tIndex) — não o da sessão —, logo acerta mesmo quando o
    // transcript mistura idiomas, e sai na voz que o usuário escolheu para aquele idioma.
    playWordTTS(wordText, tIndex);
    // `\p{L}` (Unicode) em vez de [a-zA-Z]: o filtro ASCII destruía palavras acentuadas e não
    // latinas — "ação" virava "ao", e qualquer palavra em japonês/russo/árabe virava string vazia.
    const clean = wordText.replace(/[^\p{L}'-]/gu, '').toLowerCase();
    if (clean) void examineWord(clean, tIndex);
  };

  /** "Anotação semântica" (protótipo): um tipo por frase; Áudio grava de verdade; Apagar tira. */
  const anotar = (tipo: TipoDeNota | 'apagar') => {
    const i = fraseEscolhida;
    if (i === null) return;
    setFraseEscolhida(null);
    if (tipo === 'audio') {
      setRecordingTarget({ tIndex: i, wordText: studyTexts[i]?.original ?? '' });
      return;
    }
    setAnnotations(anotarFrase(annotations, i, tipo));
  };

  // (`showTutor` foi removido junto com o botão legado "Estudos & Notas" — a sidebar de notas é
  //  controlada só pelo layoutStore/LayoutStudio agora.)
  /* O TUTOR DESTA TELA FOI REMOVIDO em 08/09, e ele nunca chegou a existir para quem usa.
   *
   * Havia aqui o estado de um chat (`chatInput`, `messages`, `tutorThinking`) e um
   * `handleSendMessage` completo — histórico, prompt de sistema, chamada ao gateway de LLM,
   * tratamento de erro. Nada renderizava esse chat e nada chamava o handler: nenhum botão, nenhum
   * formulário. Eram ~50 linhas, incluindo uma chamada de modelo, esperando uma tela que não veio.
   *
   * O tutor que existe é o iChat global (`components/IChat.tsx`), montado no App e disponível em
   * qualquer tela, esta inclusive. */

  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>, cleanWord: string) => {
    // O cancelamento vem ANTES do filtro, como sempre veio: passar o cursor por uma palavra curta
    // no caminho até o cartão não pode deixar o fechamento seguir agendado.
    popover.cancelarFechamento();
    // Qualquer palavra de conteúdo (>=3 letras, alfabética) é interativa.
    // Unicode como o clique (938): 'ação', 'über' e alfabetos não-latinos também abrem o cartão.
    if (cleanWord.length >= 3 && /^\p{L}+$/u.test(cleanWord)) {
      popover.abrirEm(e.target as HTMLElement, cleanWord);
    }
  };

  const handleMouseLeave = popover.agendarFechamento;

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
    const lang = sentenceIndex !== undefined ? langOfSentence(sentenceIndex) : forcedLang || langPair.src;
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
        onClick={() => {
          /* Se ESTA frase já está tocando, o botão é um PAUSE de verdade — antes ele mostrava o
             ícone de pausa mas chamava speakFrom() e reiniciava a frase do zero. */
          if (isActive && isNarrating) {
            toggleNarration();
            return;
          }
          void speakFrom(index);
        }}
        title={isActive && isNarrating && !isNarrationPaused ? 'Pausar' : 'Ouvir a partir desta frase'}
        className={`no-min-target absolute -left-9 top-2 hidden lg:flex w-7 h-7 items-center justify-center rounded-full border transition-all cursor-pointer
          ${
            isActive
              ? 'bg-accent border-accent text-white opacity-100'
              : 'bg-surface border-border-subtle text-ink-muted opacity-0 group-hover/sent:opacity-100 hover:text-accent hover:border-accent'
          }`}
      >
        {isActive && isNarrating && !isNarrationPaused ? (
          <Pause className="w-3 h-3" />
        ) : (
          <Play className="w-3 h-3 ms-0.5" />
        )}
      </button>
    );
  };

  /* A frase como o protótipo desenha (`.frase`, com a narrada em `.narrando`): as palavras seguem
     clicáveis (ouvir, anotar, abrir o Analista) e carregam as marcações e as notas da pessoa. */
  const palavrasDaFrase = (texto: string, sIdx: number) =>
    tokenizarTexto(texto).map((token) => {
      const annotation = annotations.find((a) => a.textIndex === sIdx && a.wordIndex === token.id);
      const highlightClass = annotation?.type === 'highlight' ? annotation.color || 'bg-warn-soft' : '';
      const hasNote = annotations.some((a) => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'note');
      const hasAudio = annotations.some((a) => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'audio');
      return (
        <React.Fragment key={token.id}>
          <span
            onMouseEnter={(e) => handleMouseEnter(e, token.clean)}
            onClick={() => handleWordClick(sIdx, token.original)}
            onMouseLeave={handleMouseLeave}
            className={`relative rounded cursor-pointer ${highlightClass} ${hasNote ? 'underline decoration-dashed decoration-warn decoration-2' : ''} ${hasAudio ? 'underline decoration-double decoration-rare decoration-2' : ''}`}
          >
            {token.original}
          </span>{' '}
        </React.Fragment>
      );
    });
  /** Os tipos da "Anotação semântica", na ordem e com os ícones do protótipo. */
  const ESCOLHAS_DE_NOTA = [
    ['vocab', 'Vocabulário', BookOpen],
    ['gram', 'Gramática', SpellCheck],
    ['expr', 'Expressão', Quote],
    ['duvida', 'Dúvida', CircleHelp],
    ['audio', 'Áudio', Mic],
    ['apagar', 'Apagar', Eraser],
  ] as const;
  const ICONE_DA_NOTA = { vocab: BookOpen, gram: SpellCheck, expr: Quote, duvida: CircleHelp, audio: Mic } as const;

  // Marcação do protótipo aprovado (`abaLeitura`): um cartão de controles e, embaixo, o texto com a
  // coluna "Estudos & notas" (ou o Analista, quando uma palavra está aberta).
  return (
    <div className="entra">
      <section className="cartao p5 barra-leitura" aria-label="Controles da leitura">
        <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Modo de visualização">
            {(
              [
                ['bilingual-intercalated', 'Intercalado'],
                ['bilingual-side-by-side', 'Lado a lado'],
                ['original', 'Só o original'],
              ] as const
            ).map(([v, r]) => (
              <button key={v} type="button" aria-pressed={viewMode === v} onClick={() => setViewMode(v)}>
                {r}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Largura">
            <button
              type="button"
              aria-pressed={layoutWidth === 'centered'}
              onClick={() => handleLayoutWidthChange('centered')}
            >
              Coluna
            </button>
            <button type="button" aria-pressed={layoutWidth === 'full'} onClick={() => handleLayoutWidthChange('full')}>
              Largura total
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <div className="linha narra" style={{ gap: 4 }}>
            <button
              type="button"
              className="btn btn-outline peq icone"
              onClick={() => skipSentence(-1)}
              disabled={!studyTexts.length || activeNarratingSentenceIndex === 0}
              aria-label="Frase anterior"
            >
              <SkipBack aria-hidden />
            </button>
            <button type="button" className="btn btn-solid peq" onClick={toggleNarration} disabled={!studyTexts.length}>
              {isNarrating && !isNarrationPaused ? <Pause aria-hidden /> : <Volume2 aria-hidden />}{' '}
              {!isNarrating ? 'Narrar' : isNarrationPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button
              type="button"
              className="btn btn-outline peq icone"
              onClick={() => skipSentence(1)}
              disabled={
                !studyTexts.length ||
                (activeNarratingSentenceIndex !== null && activeNarratingSentenceIndex >= studyTexts.length - 1)
              }
              aria-label="Próxima frase"
            >
              <SkipForward aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-outline peq icone"
              onClick={stopNarration}
              disabled={!isNarrating}
              aria-label="Parar e voltar ao início"
            >
              <Square aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="btn btn-outline peq"
            onClick={() => setShowNarratorSettings((v) => !v)}
            aria-expanded={showNarratorSettings}
          >
            <AudioLines aria-hidden /> Voz, idioma e tom
          </button>
        </div>

        {showNarratorSettings && (
          <div className="exib entra">
            <div>
              <span className="label-mono">Velocidade</span>
              <div className="seg" role="group" aria-label="Velocidade da narração">
                {[0.75, 1, 1.25, 1.5].map((r) => (
                  <button key={r} type="button" aria-pressed={narrationRate === r} onClick={() => setNarrationRate(r)}>
                    {String(r).replace('.', ',')}×
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label-mono">O que narrar</span>
              <div className="seg" role="group" aria-label="O que narrar">
                {NARRATION_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={narrationMode === m.id}
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
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label-mono">Idioma</span>
              {/* Guarda o ISO-639-1 ('pt'); o picker fala BCP-47 — daí a conversão nas pontas. */}
              <LangPicker
                id="reading-forced-lang"
                ariaLabel="Forçar idioma da narração"
                value={toBcp47(forcedLang)}
                auto={!forcedLang}
                allowAuto
                autoLabel="Detectar (segue o modo)"
                onPick={({ auto, code }) => setForcedLang(auto ? '' : baseLang(code || ''))}
              />
            </div>
            <div>
              <span className="label-mono">
                Voz · {langLabel(voiceEditLang)}
                {currentSpeakingLang === voiceEditLang && isNarrating ? ' (narrando agora)' : ''}
              </span>
              <div className="linha" style={{ gap: 6, flexWrap: 'wrap' }}>
                {narratedLangs.length > 1 && (
                  <div className="seg" role="group" aria-label="Idioma cuja voz editar">
                    {narratedLangs.map((l) => (
                      <button
                        key={l}
                        type="button"
                        aria-pressed={voiceEditLang === l}
                        onClick={() => setVoiceEditLangOverride(l)}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
                <select
                  className="campo"
                  aria-label="Voz"
                  style={{ width: 'auto', maxWidth: 280 }}
                  value={voicePrefs[voiceEditLang] || ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    setVoicePrefs((prev) => {
                      const next = { ...prev };
                      if (name) next[voiceEditLang] = name;
                      else delete next[voiceEditLang];
                      return next;
                    });
                  }}
                >
                  <option value="">Melhor voz disponível (automática)</option>
                  <optgroup label={langLabel(voiceEditLang)}>
                    {voiceOptions.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace('Microsoft', '').replace('Google', '').trim()} ({v.lang})
                        {v.neural ? ' · Natural' : ''}
                        {v.local ? ' · Offline' : ' · Rede'}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
            <div>
              <span className="label-mono">Tom · {narrationPitch.toFixed(1)}</span>
              <input
                type="range"
                className="trilho"
                min="0.5"
                max="1.5"
                step="0.1"
                value={narrationPitch}
                onChange={(e) => setNarrationPitch(parseFloat(e.target.value))}
                aria-label="Tom da voz"
                style={{ ['--p' as string]: `${((narrationPitch - 0.5) / 1) * 100}%`, width: 140 }}
              />
            </div>
            {/* AVISO HONESTO: sem voz instalada para um idioma NÃO narramos com a voz de outro. */}
            {missingVoiceLangs.length > 0 && (
              <div className="aviso-info" style={{ flexBasis: '100%' }}>
                <AlertTriangle aria-hidden />
                <span>
                  Seu sistema não tem voz instalada para{' '}
                  <b style={{ color: 'var(--ink)' }}>{missingVoiceLangs.map((l) => langLabel(l)).join(', ')}</b>: essas
                  frases não serão narradas com o sotaque correto. Instale em{' '}
                  <b style={{ color: 'var(--ink)' }}>Configurações do Windows → Hora e Idioma → Voz</b>.
                </span>
              </div>
            )}
            <p className="mut" style={{ fontSize: 12, flexBasis: '100%' }}>
              Mudanças de voz, tom, velocidade ou modo valem já na frase atual; a narração continua de onde estava.
              {narrationMode === 'auto' && !forcedLang && (
                <>
                  {' '}
                  Detecção de idioma: {nativeDetector ? 'detector on-device do navegador' : 'heurística local'}; frases
                  sem sinal usam o idioma declarado da sessão ({langLabel(langPair.src)}).
                </>
              )}
            </p>
          </div>
        )}

        <div className="linha" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label="Modo">
            <button type="button" aria-pressed={!isDrawModeActive} onClick={() => setIsDrawModeActive(false)}>
              <MousePointerClick aria-hidden style={{ width: 14, height: 14 }} /> Modo interativo
            </button>
            <button
              type="button"
              aria-pressed={isDrawModeActive}
              onClick={() => {
                setIsDrawModeActive(true);
                setFraseEscolhida(null);
              }}
            >
              <PenTool aria-hidden style={{ width: 14, height: 14 }} /> Desenho livre
            </button>
          </div>
          {isDrawModeActive ? (
            <>
              <div className="seg" role="group" aria-label="Ferramenta de desenho">
                {(
                  [
                    ['pen', 'Caneta', Pen],
                    ['highlighter', 'Marca-texto', Highlighter],
                    ['eraser', 'Borracha', Eraser],
                  ] as const
                ).map(([v, r, Icone]) => (
                  <button key={v} type="button" aria-pressed={drawTool === v} onClick={() => setDrawTool(v)}>
                    <Icone aria-hidden style={{ width: 14, height: 14 }} /> {r}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-outline peq"
                onClick={() => {
                  clearCanvas();
                  toast.info('Desenhos apagados');
                }}
              >
                <Trash2 aria-hidden /> Limpar tudo
              </button>
            </>
          ) : (
            <span className="mut" style={{ fontSize: 12.5 }}>
              Clique numa frase para anotar: vocabulário, gramática, expressão ou dúvida.
            </span>
          )}
        </div>
      </section>

      <div className="leitura-grade">
        <EditablePanel
          viewKey="reading"
          panelKey="interactiveArea"
          title="Área Interativa"
          canResizeWidth={false}
          canResizeHeight={false}
        >
          <section
            className={`cartao p6 leitura-texto ${layoutWidth === 'centered' ? 'coluna' : ''} ${isDrawModeActive ? 'desenhando' : ''}`}
            aria-label="Texto da sessão"
            style={{ position: 'relative' }}
          >
            {/* Desenho livre por cima do texto */}
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              aria-label="Área de desenho"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: isDrawModeActive ? 'auto' : 'none',
                cursor: isDrawModeActive ? 'crosshair' : 'default',
              }}
            />
            {fraseEscolhida !== null && !isDrawModeActive && (
              <div className="escolha-nota cartao entra" role="group" aria-label="Anotar a frase">
                <span className="label-mono">Anotação semântica</span>
                <div className="chips">
                  {ESCOLHAS_DE_NOTA.map(([k, r, Icone]) => (
                    <button key={k} type="button" className="pill" data-anotar={k} onClick={() => anotar(k)}>
                      <Icone aria-hidden />
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {studyTexts.length === 0 ? (
              <div className="vazio">
                <IconeEmBloco icone={BookOpen} />
                <h3>{transcriptLoaded ? 'Sem texto nesta sessão' : 'Carregando o texto…'}</h3>
                {transcriptLoaded && <p>Nenhuma transcrição real para esta sessão ainda.</p>}
              </div>
            ) : (
              <div className="leitura" style={{ fontSize: `${fontSize}px` }}>
                {studyTexts.map((sentenceObj, sIdx) => {
                  const nota = notaDaFrase(annotations, sIdx);
                  const cls = `frase ${activeNarratingSentenceIndex === sIdx ? 'narrando' : ''} ${nota?.tipo ? `nota-${nota.tipo}` : ''}`;
                  /* Clicar na frase abre a "Anotação semântica" dela (a palavra clicada também abre
                     o Analista). O Enter faz o mesmo pelo teclado. */
                  const escolher = () => {
                    if (isDrawModeActive) return;
                    setFraseEscolhida(sIdx);
                    requestAnimationFrame(() =>
                      (document.querySelector('.escolha-nota [data-anotar]') as HTMLElement | null)?.focus({
                        preventScroll: true,
                      }),
                    );
                  };
                  const original = (
                    <span
                      className={cls}
                      id={`sentence-${sIdx}`}
                      data-frase={sIdx}
                      tabIndex={0}
                      onClick={escolher}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target === e.currentTarget) escolher();
                      }}
                    >
                      <SentencePlayButton index={sIdx} />
                      {palavrasDaFrase(sentenceObj.original, sIdx)}
                    </span>
                  );
                  if (viewMode === 'bilingual-side-by-side')
                    return (
                      <div key={sIdx} className="lado">
                        <p>{original}</p>
                        <p className="trad-l">{sentenceObj.translation}</p>
                      </div>
                    );
                  return (
                    <p key={sIdx}>
                      {original}
                      {viewMode === 'bilingual-intercalated' && sentenceObj.translation && (
                        <>
                          <br />
                          <span className="trad-l">{sentenceObj.translation}</span>
                        </>
                      )}
                    </p>
                  );
                })}
              </div>
            )}
          </section>
        </EditablePanel>

        {selectedExamWord ? (
          <div>
            <VocabularyPanel
              viewKey="reading"
              word={selectedExamWord}
              mtNote={mtNote}
              onClose={() => {
                setSelectedExamWord(null);
                setMtNote(null);
              }}
              onSpeak={speakWord}
              onAddToDeck={handleAddVocabWordToDeck}
              isAdded={!!selectedExamWord && isWordAdded(selectedExamWord)}
              ttsSpeed={ttsSpeed}
              setTtsSpeed={setTtsSpeed}
              // Sem navegação (Leitura montada fora da Análise) → sem botões de praticar. Nada de botão morto.
              onPractice={onChangeView ? handlePracticeWord : undefined}
            />
          </div>
        ) : (
          <aside className="cartao p5 notas-l" aria-label="Estudos e notas">
            <TituloDeSecao icone={NotebookPen} titulo="Estudos & notas" nivel="h3" />
            {annotations.length ? (
              <div className="pilha">
                {annotations.map((ann) => {
                  if (ann.type === 'frase' && ann.tipo) {
                    const Icone = ICONE_DA_NOTA[ann.tipo];
                    return (
                      <div key={ann.id} className="nota-item">
                        <span className={`badge ${TIPOS_DE_NOTA[ann.tipo].tom}`}>
                          <Icone aria-hidden /> {TIPOS_DE_NOTA[ann.tipo].rotulo}
                        </span>
                        <p>
                          {studyTexts[ann.textIndex]?.original ?? ''}
                          {ann.audioUrl && (
                            <>
                              <br />
                              <button
                                type="button"
                                className="link"
                                onClick={() => void new Audio(ann.audioUrl!).play()}
                              >
                                <Play aria-hidden /> Ouvir minha gravação
                              </button>
                            </>
                          )}
                        </p>
                        <button
                          type="button"
                          className="btn btn-outline peq icone"
                          onClick={() => setAnnotations(annotations.filter((a) => a.id !== ann.id))}
                          aria-label="Remover nota"
                        >
                          <X aria-hidden />
                        </button>
                      </div>
                    );
                  }
                  const rotulo =
                    ann.type === 'highlight' ? ann.content || 'Marcação' : ann.type === 'note' ? 'Nota' : 'Áudio';
                  const tom = ann.type === 'note' ? 'warn' : ann.type === 'audio' ? 'rare' : 'acc';
                  return (
                    <div key={ann.id} className="nota-item">
                      <span className={`badge ${tom}`}>
                        {ann.type === 'note' ? (
                          <StickyNote aria-hidden />
                        ) : ann.type === 'audio' ? (
                          <Mic aria-hidden />
                        ) : (
                          <Highlighter aria-hidden />
                        )}{' '}
                        {rotulo}
                      </span>
                      <p>
                        “{ann.wordText}”
                        {ann.type === 'note' && ann.content && (
                          <>
                            <br />
                            <span className="mut">{ann.content}</span>
                          </>
                        )}
                        {ann.type === 'audio' && ann.audioUrl && (
                          <>
                            <br />
                            <button type="button" className="link" onClick={() => void new Audio(ann.audioUrl!).play()}>
                              <Play aria-hidden /> Ouvir minha gravação
                            </button>
                          </>
                        )}
                      </p>
                      <button
                        type="button"
                        className="btn btn-outline peq icone"
                        onClick={() => setAnnotations(annotations.filter((a) => a.id !== ann.id))}
                        aria-label="Remover nota"
                      >
                        <X aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="vazio" style={{ padding: '18px 6px' }}>
                <IconeEmBloco icone={Highlighter} />
                <h3>Nenhum grifo ou nota</h3>
                <p>No modo interativo, clique numa frase e escolha o tipo de anotação.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Audio recording memo popover modal */}
      {recordingTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-surface text-ink rounded-2xl border border-border-subtle shadow-2xl p-6 text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display font-bold text-sm text-rare-ink flex items-center gap-1.5 text-start">
                <Volume2 className="w-5 h-5" /> Gravar Comentário em Áudio
              </h3>
              <button onClick={() => setRecordingTarget(null)} className="p-1 hover:bg-surface-hover rounded">
                <X className="w-4 h-4 text-ink-muted" />
              </button>
            </div>

            <p className="text-xs text-ink-muted leading-relaxed">
              Grave sua própria pronúncia ou um comentário falado para a frase:{' '}
              <strong className="text-ink">"{recordingTarget.wordText}"</strong>
            </p>

            {/* Simulated/real visual wave container */}
            <div className="h-28 bg-canvas border border-border-subtle rounded-2xl flex flex-col justify-center items-center relative overflow-hidden p-4">
              {isRecordingAudio ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-1">
                    <span className="w-1 h-5 bg-rare rounded eq-bar" style={{ animationDelay: '0.1s' }} />
                    <span className="w-1 h-9 bg-rare rounded eq-bar" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-12 bg-rare rounded eq-bar" style={{ animationDelay: '0.3s' }} />
                    <span className="w-1 h-7 bg-rare rounded eq-bar" style={{ animationDelay: '0.4s' }} />
                    <span className="w-1 h-11 bg-rare rounded eq-bar" style={{ animationDelay: '0.5s' }} />
                    <span className="w-1 h-4 bg-rare rounded eq-bar" style={{ animationDelay: '0.6s' }} />
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
                <div className="text-xs text-error font-bold px-2 text-center">{recordingError}</div>
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
                      <p className="text-[12px] text-warn-ink">{wordPreview.note ?? 'Tradução indisponível'}</p>
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
                  <p className="text-[13.5px] leading-relaxed text-ink-muted border-s-2 border-border-subtle ps-3 italic">
                    {wordPreview.context}
                  </p>
                )}

                <div className="mt-1 pt-3 border-t border-border-subtle flex gap-2">
                  {vocabCards.some((c) => c.word.toLowerCase() === wordPreview.word.toLowerCase() && c.inDeck) ? (
                    <button className="flex-1 py-2 px-3 text-[13px] rounded-lg bg-good-soft text-good font-bold flex items-center justify-center gap-1.5 w-full cursor-not-allowed">
                      <Check className="w-4 h-4" /> Já está no Deck
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        handleAddWordToDeck(wordPreview.word, wordPreview.translation, wordPreview.context)
                      }
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
