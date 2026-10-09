import '../../styles/questSessao.css';
import '../../styles/questLeitura.css';

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
  NotebookPen,
  Pause,
  Play,
  PlayCircle,
  Quote,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  SpellCheck,
  Square,
  StickyNote,
  Volume2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { fetchDeck, fetchSessionTranscript, searchImages } from '../../data/api';
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { ficharCartao } from '../../lib/adicionarAoDeck';
import { consentiuNuvem } from '../../lib/consentimentoDeNuvem';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { t, tp } from '../../lib/i18n';
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
import { criarMarcador } from '../../lib/polimento/sessao';
import { usePopoverDePalavra } from '../../lib/popoverDePalavra';
import type { ExerciseId, PracticeSeed } from '../../lib/sentences';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import {
  cancelSpeech,
  getVoicePrefs,
  hasVoiceFor,
  pickVoice,
  setVoicePref,
  speak as ttsSpeak,
  voicesFor,
} from '../../lib/tts';
import type { ResolvedWord, WordOrigin } from '../../lib/vocabWord';
import { buildVocabWord, mtNoteFor, resolveWord, tokenizarTexto } from '../../lib/vocabWord';
import { aparelhoTemVoz, haVozPara } from '../../lib/voz/haVoz';
import { Recording, VocabCard, VocabWord } from '../../types';
import LangPicker from '../LangPicker';
import { toast } from '../Toast';
import TokensClicaveis, { ehPalavraDeConteudo } from '../TokensClicaveis';
import { Dialogo, fecharDialogoDe } from '../ui';
import VocabularyPanel from '../VocabularyPanel';
import BarraDeDesenho from './leitura/BarraDeDesenho';
import { useDesenhoLivre } from './leitura/useDesenhoLivre';

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
  /* O Quest não tem voz de leitura própria: ali a narração vai pelo motor do app (`speak()` de
     `lib/tts`, que leva à voz do site), uma frase por vez. Com voz no aparelho, nada muda. */
  const narraPeloMotor = !aparelhoTemVoz();
  /* Os diálogos de "Estudos & notas" e de "Ajustar exibição". */
  const [verNotasNoQuest, setVerNotasNoQuest] = useState(false);
  const [ajustandoNoQuest, setAjustandoNoQuest] = useState(false);
  // Gateway (MT/LLM) construído uma vez a partir do perfil ativo.
  const gateway = React.useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: consentiuNuvem }), []);

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
  const [layoutWidth, setLayoutWidth] = useState<'centered' | 'full'>(() => {
    /* O texto ocupa o cartão, como no protótipo (`telas3.js:72`); "Coluna" segue em "Ajustar exibição"
       para quem preferir. */
    return (localStorage.getItem('reading_layout_width') as 'centered' | 'full') || 'full';
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

  /* O DESENHO LIVRE: o motor (traços, desfazer, preferências, guardar por sessão) mora em
     `leitura/useDesenhoLivre`; a barra, em `leitura/BarraDeDesenho`. */
  const [isDrawModeActive, setIsDrawModeActive] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenho = useDesenhoLivre({
    sessionId: recording?.id,
    canvasRef,
    ativo: isDrawModeActive,
    remedir: [fontSize, viewMode],
  });

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
    if (!narraPeloMotor && !('speechSynthesis' in window)) return;
    const runId = ++runIdRef.current;
    if (narraPeloMotor) cancelSpeech();
    else window.speechSynthesis.cancel();

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
      if (narraPeloMotor) {
        narrationPausedRef.current = false;
        setCurrentSpeakingLang(baseLang(step.lang));
        // Idioma sem voz no aparelho: o trecho é pulado, nunca lido com a voz de outro idioma.
        if (!haVozPara(step.lang)) {
          speakStep(stepIndex + 1);
          return;
        }
        ttsSpeak(step.text, {
          lang: toBcp47(step.lang),
          rate: narrationRate,
          pitch: narrationPitch,
          onEnd: () => {
            if (runId !== runIdRef.current || narrationPausedRef.current) return;
            speakStep(stepIndex + 1);
          },
          onError: () => {
            if (runId !== runIdRef.current) return;
            setIsNarrating(false);
            setIsNarrationPaused(false);
            setActiveNarratingSentenceIndex(null);
            setCurrentSpeakingLang(null);
          },
        });
        return;
      }
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
    if (narraPeloMotor) {
      /* O motor do app não pausa no meio de uma frase: pausar cala e guarda a frase; retomar a lê
         de novo desde o começo dela. O lugar na leitura não se perde. */
      if (!isNarrating || isNarrationPaused) {
        void speakFrom(activeNarratingSentenceIndex ?? 0);
        return;
      }
      narrationPausedRef.current = true;
      runIdRef.current++;
      cancelSpeech();
      setIsNarrationPaused(true);
      return;
    }
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
    () => narratedLangs.filter((l) => (narraPeloMotor ? !haVozPara(l) : !hasVoiceFor(l))),
    // `voices` entra de propósito: a lista do SO chega assíncrona (evento 'voiceschanged').
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [narratedLangs, voices, narraPeloMotor],
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

  /* O NARRADOR MARCA PALAVRA POR PALAVRA (`tocar()` e `pararPlayer()`, `telas3.js:16-62`,
     item D51). A frase vem da narração de verdade; a cadência das palavras é a do protótipo, no mesmo
     marcador da Transcrição (`lib/polimento/sessao.ts`), aqui sobre as `.ql-frase`. */
  const frasesDoQuest = useRef<HTMLDivElement>(null);
  const marcador = useMemo(() => criarMarcador(() => frasesDoQuest.current, '.ql-frase'), []);
  const fraseDeAntes = useRef(-1);
  const fraseNarrada = isNarrating && activeNarratingSentenceIndex !== null ? activeNarratingSentenceIndex : -1;
  useEffect(() => {
    if (fraseNarrada < 0) {
      marcador.parar();
      fraseDeAntes.current = -1;
      return;
    }
    /* Um salto (anterior, próxima, "narrar a partir desta") recomeça limpo, como `tocar(i)`; o avanço
       natural deixa marcadas as frases que já passaram. */
    if (fraseDeAntes.current !== -1 && fraseNarrada !== fraseDeAntes.current + 1) marcador.parar();
    marcador.linha(fraseNarrada);
    fraseDeAntes.current = fraseNarrada;
  }, [fraseNarrada, marcador]);
  useEffect(() => () => marcador.parar(), [marcador]);

  // Encerra a fala ao sair da tela (senão o narrador continua tocando em outra view).
  const narraPeloMotorRef = useRef(narraPeloMotor);
  narraPeloMotorRef.current = narraPeloMotor;
  useEffect(
    () => () => {
      if (narraPeloMotorRef.current) cancelSpeech();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    [],
  );

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

  /* As palavras de uma frase, com as marcas da pessoa por palavra (o grifo, o sublinhado da nota e o
     do áudio). A frase inteira é o alvo; `aoTocar` (só onde o ponteiro acerta uma palavra solta: o
     computador) faz de cada palavra de conteúdo um alvo dentro da frase; o clique nela não sobe para
     a frase. */
  const palavrasDaFrase = (texto: string, sIdx: number, aoTocar?: (palavra: string) => void) =>
    tokenizarTexto(texto).map((token) => {
      const annotation = annotations.find((a) => a.textIndex === sIdx && a.wordIndex === token.id);
      const highlightClass = annotation?.type === 'highlight' ? annotation.color || 'bg-warn-soft' : '';
      const hasNote = annotations.some((a) => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'note');
      const hasAudio = annotations.some((a) => a.textIndex === sIdx && a.wordIndex === token.id && a.type === 'audio');
      const marcas = `${highlightClass} ${hasNote ? 'underline decoration-dashed decoration-warn decoration-2' : ''} ${hasAudio ? 'underline decoration-double decoration-rare decoration-2' : ''}`;
      const clicavel = !!aoTocar && ehPalavraDeConteudo(token.clean);
      return (
        <React.Fragment key={token.id}>
          <span
            className={`w rounded ${marcas}${clicavel ? ' ql-palavra' : ''}`}
            data-marca={annotation?.type === 'highlight' ? 'grifo' : hasNote ? 'nota' : hasAudio ? 'audio' : undefined}
            onClick={
              clicavel
                ? (e) => {
                    e.stopPropagation();
                    aoTocar?.(token.clean);
                  }
                : undefined
            }
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

  /* ── META QUEST (as telas novas, `docs/design/quest-desenho.md`) ────────────────────────────────
     O mesmo leitor no desenho do headset. O texto é uma lista de frases, cada uma um alvo inteiro; o
     toque abre as opções da frase no centro (narrar a partir dela, anotar, as palavras como botões).
     A narração mora na faixa do pé, como o player da transcrição. O que dependia de hover (o botão
     de tocar ao lado da frase, o cartão da palavra) e as colunas laterais ("Estudos & notas", o
     Analista) viraram diálogos no centro. O desenho livre continua sobre o texto, com o raio. */
  const total = studyTexts.length;
  const fraseAberta = fraseEscolhida !== null ? studyTexts[fraseEscolhida] : undefined;
  const notaDaAberta = fraseEscolhida !== null ? notaDaFrase(annotations, fraseEscolhida) : undefined;
  /* Há voz para narrar ALGUM dos idiomas deste modo? No Quest, só a do site (com a nuvem ligada). */
  const haVozParaNarrar = narraPeloMotor ? narratedLangs.some((l) => haVozPara(l)) : 'speechSynthesis' in window;
  const narrando = isNarrating && !isNarrationPaused;
  const idiomaDaPalavraAberta = selectedExamWord?.lang || forcedLang || langPair.src;
  const previaDaAberta =
    wordPreview && selectedExamWord && wordPreview.word === selectedExamWord.word ? wordPreview : null;

  /** A palavra tocada nas opções da frase: pronuncia (se há voz), busca a imagem e abre a folha. */
  const abrirPalavra = (indiceDaFrase: number, palavra: string) => {
    if (haVozPara(langOfSentence(indiceDaFrase))) playWordTTS(palavra, indiceDaFrase);
    popover.setPalavra(palavra);
    void examineWord(palavra, indiceDaFrase);
  };
  const fecharPalavra = () => {
    setSelectedExamWord(null);
    setMtNote(null);
    popover.setPalavra(null);
  };
  const fecharGravacao = () => {
    stopVoiceRecording();
    setRecordingTarget(null);
  };
  /* DO APARELHO, não do desenho: com o mouse a palavra abre direto do texto, com um clique, como na
       tela de sempre. No headset o raio não acerta uma palavra solta: o caminho é o das opções da frase. */
  const palavraNoTexto = !noHeadset();

  /** Uma anotação como a lista "Estudos & notas" a mostra: o selo, o texto e o áudio, se houver. */
  const linhaDaNota = (ann: Annotation) => {
    if (ann.type === 'frase' && ann.tipo) {
      return {
        Icone: ICONE_DA_NOTA[ann.tipo],
        rotulo: TIPOS_DE_NOTA[ann.tipo].rotulo,
        texto: studyTexts[ann.textIndex]?.original ?? '',
        detalhe: '',
      };
    }
    return {
      Icone: ann.type === 'note' ? StickyNote : ann.type === 'audio' ? Mic : Highlighter,
      rotulo: ann.type === 'highlight' ? ann.content || 'Marcação' : ann.type === 'note' ? 'Nota' : 'Áudio',
      texto: `“${ann.wordText ?? ''}”`,
      detalhe: ann.type === 'note' ? (ann.content ?? '') : '',
    };
  };

  return (
    <div className="ql" data-testid="leitura-do-quest">
      <div className="q-acoes ql-barra">
        {/* `telas3.js:71`: os dois modos sem ícone, e os dois chips logo ao lado. */}
        <div className="q-abas q-seg" role="group" aria-label={t('Modo de leitura')}>
          <button
            type="button"
            className="q-aba"
            role="radio"
            aria-checked={!isDrawModeActive}
            onClick={() => setIsDrawModeActive(false)}
          >
            {t('Modo interativo')}
          </button>
          <button
            type="button"
            className="q-aba"
            role="radio"
            aria-checked={isDrawModeActive}
            onClick={() => {
              setIsDrawModeActive(true);
              setFraseEscolhida(null);
            }}
          >
            {t('Desenho livre')}
          </button>
        </div>
        <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setVerNotasNoQuest(true)}>
          {t('Estudos & notas')}
        </button>
        <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setAjustandoNoQuest(true)}>
          <SlidersHorizontal aria-hidden /> {t('Ajustar exibição')}
        </button>
      </div>

      {isDrawModeActive ? (
        <div className="q-acoes ql-desenho">
          <BarraDeDesenho desenho={desenho} />
        </div>
      ) : null}

      <section
        className={`q-cartao ql-texto ${layoutWidth === 'centered' ? 'coluna' : ''} ${isDrawModeActive ? 'desenhando' : ''} ${viewMode === 'bilingual-side-by-side' ? 'lado-a-lado' : ''}`}
        aria-label={t('Texto da sessão')}
      >
        {/* Desenho livre por cima do texto */}
        <canvas
          ref={canvasRef}
          className="desenho-tela"
          data-ativo={isDrawModeActive}
          {...desenho.handlers}
          aria-label={t('Área de desenho')}
        />
        {total === 0 ? (
          transcriptLoaded ? (
            <div className="q-vazio">
              <span className="q-ic">
                <BookOpen aria-hidden />
              </span>
              <h2>{t('Sem texto nesta sessão')}</h2>
              <p>{t('Nenhuma transcrição real para esta sessão ainda.')}</p>
            </div>
          ) : (
            <div className="q-lista" aria-busy="true" aria-label={t('Carregando o texto…')}>
              <div className="q-esqueleto qs-esqueleto" />
              <div className="q-esqueleto qs-esqueleto" />
              <div className="q-esqueleto qs-esqueleto" />
            </div>
          )
        ) : (
          <div className="ql-frases" ref={frasesDoQuest}>
            {studyTexts.map((frase, i) => {
              const nota = notaDaFrase(annotations, i);
              const IconeDaNota = nota?.tipo ? ICONE_DA_NOTA[nota.tipo] : null;
              const narrada = activeNarratingSentenceIndex === i;
              return (
                <button
                  key={i}
                  type="button"
                  id={`sentence-${i}`}
                  data-frase={i}
                  data-fala={i}
                  className={`ql-frase ${narrada ? 'narrando' : ''} ${nota?.tipo ? `nota-${nota.tipo}` : ''}`}
                  aria-haspopup="dialog"
                  aria-current={narrada ? 'true' : undefined}
                  onClick={() => {
                    if (!isDrawModeActive) setFraseEscolhida(i);
                  }}
                >
                  {nota?.tipo && IconeDaNota && (
                    <span className="q-tag">
                      <IconeDaNota aria-hidden /> {TIPOS_DE_NOTA[nota.tipo].rotulo}
                    </span>
                  )}
                  <span className="ql-o">
                    {palavrasDaFrase(
                      frase.original,
                      i,
                      palavraNoTexto && !isDrawModeActive ? (palavra) => abrirPalavra(i, palavra) : undefined,
                    )}
                  </span>
                  {viewMode !== 'original' && frase.translation && <span className="ql-t">{frase.translation}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* A NARRAÇÃO: a faixa do pé, com um único botão principal. */}
      {/* `telas3.js:73`: anterior, o principal, próxima, o espaço, "Frase n de total" e a voz. */}
      <div className="q-faixa ql-narrador px-player" role="toolbar" aria-label={t('Narração')}>
        <button
          type="button"
          className="q-ctl"
          onClick={() => skipSentence(-1)}
          disabled={!total || !haVozParaNarrar || activeNarratingSentenceIndex === 0}
          aria-label={t('Frase anterior')}
          data-px="antes"
        >
          <SkipBack aria-hidden />
        </button>
        <button
          type="button"
          className="q-ctl pri"
          data-px="tocar"
          onClick={toggleNarration}
          disabled={!total || !haVozParaNarrar}
        >
          {narrando ? <Pause aria-hidden /> : <Play aria-hidden />}{' '}
          {!isNarrating ? t('Narrar') : isNarrationPaused ? t('Retomar') : t('Pausar')}
        </button>
        <button
          type="button"
          className="q-ctl"
          onClick={() => skipSentence(1)}
          disabled={
            !total ||
            !haVozParaNarrar ||
            (activeNarratingSentenceIndex !== null && activeNarratingSentenceIndex >= total - 1)
          }
          aria-label={t('Próxima frase')}
          data-px="depois"
        >
          <SkipForward aria-hidden />
        </button>
        <span className="q-espaco" />
        <span className="q-tempo ql-onde px-onde" role="status">
          {!haVozParaNarrar && total > 0
            ? t('Sem voz para narrar: {idiomas}', { idiomas: narratedLangs.map((l) => langLabel(l)).join(', ') })
            : total > 0
              ? t('Frase {n} de {total}', { n: (activeNarratingSentenceIndex ?? 0) + 1, total })
              : tp(total, '{n} frase', '{n} frases')}
        </span>
        <button type="button" className="q-ctl" aria-haspopup="dialog" onClick={() => setShowNarratorSettings(true)}>
          {t('Voz, idioma e tom')}
        </button>
      </div>

      {/* AS OPÇÕES DA FRASE: narrar a partir dela, a anotação semântica e as palavras. */}
      {fraseAberta && fraseEscolhida !== null && (
        <Dialogo
          icone={Quote}
          titulo={t('Opções da frase')}
          sub={t('Frase {n} de {total}', { n: fraseEscolhida + 1, total })}
          aoFechar={() => setFraseEscolhida(null)}
        >
          <div className="dlg-corpo qs-miolo qs-folha" data-testid="opcoes-da-frase">
            <p className="qs-folha-texto">{palavrasDaFrase(fraseAberta.original, fraseEscolhida)}</p>
            {fraseAberta.translation && <p className="qs-folha-trad">{fraseAberta.translation}</p>}
            {haVozParaNarrar && (
              <div className="q-acoes">
                <button
                  type="button"
                  className="q-ctl pri"
                  onClick={(e) => {
                    const i = fraseEscolhida;
                    // `close()` nativo: o foco volta à frase de onde a folha abriu.
                    fecharDialogoDe(e.currentTarget);
                    setFraseEscolhida(null);
                    void speakFrom(i);
                  }}
                >
                  <Volume2 aria-hidden /> {t('Narrar a partir daqui')}
                </button>
              </div>
            )}
            <span className="q-rotulo">{t('Anotação semântica')}</span>
            <div className="q-acoes" role="group" aria-label={t('Anotar a frase')}>
              {ESCOLHAS_DE_NOTA.map(([k, r, Icone]) => (
                <button
                  key={k}
                  type="button"
                  className="q-chip"
                  data-anotar={k}
                  aria-pressed={k !== 'apagar' && notaDaAberta?.tipo === k}
                  disabled={k === 'apagar' && !notaDaAberta}
                  onClick={(e) => {
                    fecharDialogoDe(e.currentTarget);
                    anotar(k);
                  }}
                >
                  <Icone aria-hidden /> {r}
                </button>
              ))}
            </div>
            {tokenizarTexto(fraseAberta.original).some((tk) => ehPalavraDeConteudo(tk.clean)) && (
              <>
                <span className="q-rotulo">{t('Toque numa palavra')}</span>
                <TokensClicaveis
                  comoBotoes
                  tokens={tokenizarTexto(fraseAberta.original)}
                  className="qs-palavras-da-fala"
                  estaNoDeck={(clean) => vocabCards.some((c) => c.word.toLowerCase() === clean && c.inDeck)}
                  onMouseEnter={() => {}}
                  onMouseLeave={() => {}}
                  onExaminar={(clean) => abrirPalavra(fraseEscolhida, clean)}
                />
              </>
            )}
          </div>
        </Dialogo>
      )}

      {/* ESTUDOS & NOTAS: a coluna lateral da tela de sempre. */}
      {verNotasNoQuest && (
        <Dialogo
          icone={NotebookPen}
          titulo={t('Estudos & notas')}
          sub={tp(annotations.length, '{n} anotação', '{n} anotações')}
          aoFechar={() => setVerNotasNoQuest(false)}
        >
          {annotations.length ? (
            <div className="dlg-corpo qs-miolo ql-notas">
              {annotations.map((ann) => {
                const { Icone, rotulo, texto, detalhe } = linhaDaNota(ann);
                return (
                  <div key={ann.id} className="q-cartao ql-nota">
                    <div className="ql-nota-texto">
                      <span className="q-tag">
                        <Icone aria-hidden /> {rotulo}
                      </span>
                      <p>{texto}</p>
                      {detalhe && <p className="qs-apoio">{detalhe}</p>}
                    </div>
                    <div className="q-acoes">
                      {ann.audioUrl && (
                        <button type="button" className="q-ctl" onClick={() => void new Audio(ann.audioUrl!).play()}>
                          <Play aria-hidden /> {t('Ouvir minha gravação')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="q-ctl perigo"
                        onClick={() => setAnnotations(annotations.filter((a) => a.id !== ann.id))}
                        aria-label={t('Remover nota')}
                      >
                        <X aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="dlg-corpo qs-miolo">
              <div className="q-vazio">
                <span className="q-ic">
                  <Highlighter aria-hidden />
                </span>
                <h3>{t('Nenhum grifo ou nota')}</h3>
                <p>{t('No modo interativo, toque numa frase e escolha o tipo de anotação.')}</p>
              </div>
            </div>
          )}
        </Dialogo>
      )}

      {/* AJUSTAR EXIBIÇÃO: o modo de visualização e a largura da coluna. */}
      {ajustandoNoQuest && (
        <Dialogo
          icone={SlidersHorizontal}
          titulo={t('Ajustar exibição')}
          sub={t('Vale para o texto desta tela.')}
          aoFechar={() => setAjustandoNoQuest(false)}
        >
          <div className="dlg-corpo qs-miolo qs-ajustes">
            <div className="q-ajuste">
              <b>{t('Modo de visualização')}</b>
              <div className="q-abas q-seg" role="group" aria-label={t('Modo de visualização')}>
                {(
                  [
                    ['bilingual-intercalated', t('Intercalado')],
                    ['bilingual-side-by-side', t('Lado a lado')],
                    ['original', t('Só o original')],
                  ] as const
                ).map(([v, r]) => (
                  <button
                    key={v}
                    type="button"
                    className="q-aba"
                    aria-pressed={viewMode === v}
                    onClick={() => setViewMode(v)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="q-ajuste">
              <b>{t('Largura')}</b>
              <div className="q-abas q-seg" role="group" aria-label={t('Largura')}>
                <button
                  type="button"
                  className="q-aba"
                  aria-pressed={layoutWidth === 'centered'}
                  onClick={() => handleLayoutWidthChange('centered')}
                >
                  {t('Coluna')}
                </button>
                <button
                  type="button"
                  className="q-aba"
                  aria-pressed={layoutWidth === 'full'}
                  onClick={() => handleLayoutWidthChange('full')}
                >
                  {t('Largura total')}
                </button>
              </div>
            </div>
          </div>
        </Dialogo>
      )}

      {/* VOZ, IDIOMA E TOM: os mesmos ajustes do narrador, um por linha. */}
      {showNarratorSettings && (
        <Dialogo
          icone={AudioLines}
          titulo={t('Voz, idioma e tom')}
          sub={t('Mudanças valem já na frase atual; a narração continua de onde estava.')}
          aoFechar={() => setShowNarratorSettings(false)}
        >
          <div className="dlg-corpo qs-miolo qs-ajustes" data-testid="ajustes-do-narrador">
            <div className="q-ajuste">
              <b>{t('Velocidade')}</b>
              <div className="q-abas q-seg" role="group" aria-label={t('Velocidade da narração')}>
                {[0.75, 1, 1.25, 1.5].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="q-aba"
                    aria-pressed={narrationRate === r}
                    onClick={() => setNarrationRate(r)}
                  >
                    {String(r).replace('.', ',')}×
                  </button>
                ))}
              </div>
            </div>
            <div className="q-ajuste">
              <div>
                <b>{t('O que narrar')}</b>
                <small>
                  {NARRATION_MODES.find((m) => m.id === narrationMode)?.title}
                  {narrationMode === 'original' ? ` (${langLabel(langPair.src)})` : ''}
                  {narrationMode === 'translation' ? ` (${langLabel(langPair.tgt)})` : ''}
                </small>
              </div>
              <div className="q-abas q-seg" role="group" aria-label={t('O que narrar')}>
                {NARRATION_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="q-aba"
                    aria-pressed={narrationMode === m.id}
                    onClick={() => setNarrationMode(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="q-ajuste">
              <div>
                <b>{t('Idioma')}</b>
                <small>{t('Força um idioma para toda a narração, ou segue o modo.')}</small>
              </div>
              <LangPicker
                id="reading-forced-lang"
                ariaLabel={t('Forçar idioma da narração')}
                value={toBcp47(forcedLang)}
                auto={!forcedLang}
                allowAuto
                autoLabel={t('Detectar (segue o modo)')}
                onPick={({ auto, code }) => setForcedLang(auto ? '' : baseLang(code || ''))}
              />
            </div>
            <div className="q-ajuste">
              <div>
                <b>
                  {t('Voz')} · {langLabel(voiceEditLang)}
                  {currentSpeakingLang === voiceEditLang && isNarrating ? ` ${t('(narrando agora)')}` : ''}
                </b>
                {voiceOptions.length === 0 && (
                  <small>
                    {/* A frase do headset só vale NELE; no computador as vozes são as do sistema. */}
                    {narraPeloMotor && noHeadset()
                      ? t('No Quest a voz é a do site: não há outras vozes para escolher.')
                      : t('Nenhuma voz instalada para este idioma.')}
                  </small>
                )}
              </div>
              {narratedLangs.length > 1 && (
                <div className="q-abas q-seg" role="group" aria-label={t('Idioma cuja voz editar')}>
                  {narratedLangs.map((l) => (
                    <button
                      key={l}
                      type="button"
                      className="q-aba"
                      aria-pressed={voiceEditLang === l}
                      onClick={() => setVoiceEditLangOverride(l)}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
              <select
                className="q-campo ql-voz"
                aria-label={t('Voz')}
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
                <option value="">{t('Melhor voz disponível (automática)')}</option>
                {voiceOptions.length > 0 && (
                  <optgroup label={langLabel(voiceEditLang)}>
                    {voiceOptions.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace('Microsoft', '').replace('Google', '').trim()} ({v.lang})
                        {v.neural ? ' · Natural' : ''}
                        {v.local ? ' · Offline' : ' · Rede'}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div className="q-ajuste">
              <b>
                {t('Tom')} · {narrationPitch.toFixed(1)}
              </b>
              <input
                type="range"
                className="ql-tom"
                min="0.5"
                max="1.5"
                step="0.1"
                value={narrationPitch}
                onChange={(e) => setNarrationPitch(parseFloat(e.target.value))}
                aria-label={t('Tom da voz')}
              />
            </div>
            {/* AVISO HONESTO: sem voz para um idioma, aquelas frases NÃO são narradas com a voz de outro. */}
            {missingVoiceLangs.length > 0 && (
              <div className="q-aviso" role="note" data-testid="voz-ausente">
                <span>
                  <AlertTriangle aria-hidden />{' '}
                  {noHeadset()
                    ? t(
                        'Sem voz neste aparelho para {idiomas}: essas frases não são narradas. A voz do site lê inglês, espanhol, francês, chinês, japonês e coreano, com a IA de nuvem ligada em Ajustes.',
                        { idiomas: missingVoiceLangs.map((l) => langLabel(l)).join(', ') },
                      )
                    : t(
                        'Seu sistema não tem voz instalada para {idiomas}: essas frases não são narradas. Instale uma voz para o idioma nas configurações do sistema (no Windows: Hora e Idioma → Voz).',
                        { idiomas: missingVoiceLangs.map((l) => langLabel(l)).join(', ') },
                      )}
                </span>
              </div>
            )}
            {narrationMode === 'auto' && !forcedLang && (
              <p className="qs-apoio">
                {t('Detecção de idioma: {detector}; frases sem sinal usam o idioma declarado da sessão ({idioma}).', {
                  detector: nativeDetector ? t('detector on-device do navegador') : t('heurística local'),
                  idioma: langLabel(langPair.src),
                })}
              </p>
            )}
          </div>
        </Dialogo>
      )}

      {/* GRAVAR COMENTÁRIO EM ÁUDIO (o "Áudio" da anotação semântica). */}
      {recordingTarget && (
        <Dialogo
          icone={Mic}
          titulo={t('Gravar comentário em áudio')}
          sub={t('A sua pronúncia, ou um comentário falado, para esta frase.')}
          aoFechar={fecharGravacao}
        >
          <div className="dlg-corpo qs-miolo qs-folha" data-testid="gravar-comentario">
            <p className="qs-folha-trad">“{recordingTarget.wordText}”</p>
            <div className="ql-gravador" role="status">
              {isRecordingAudio ? (
                <>
                  <span className="ql-ondas" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <b>{t('Gravando: {n} s', { n: recordingSeconds })}</b>
                </>
              ) : playbackAudioUrl ? (
                <>
                  <b>
                    <Check aria-hidden /> {t('Áudio gravado')}
                  </b>
                  <button type="button" className="q-ctl" onClick={() => void new Audio(playbackAudioUrl).play()}>
                    <PlayCircle aria-hidden /> {t('Ouvir minha voz')}
                  </button>
                </>
              ) : recordingError ? (
                <span className="qs-erro">
                  <AlertTriangle aria-hidden /> {recordingError}
                </span>
              ) : (
                <span>{t('Toque em "Iniciar gravação" e fale.')}</span>
              )}
            </div>
          </div>
          <div className="dlg-pe">
            {!isRecordingAudio && !playbackAudioUrl && (
              <button type="button" className="q-ctl pri" onClick={() => void startVoiceRecording()}>
                <Mic aria-hidden /> {t('Iniciar gravação')}
              </button>
            )}
            {isRecordingAudio && (
              <button type="button" className="q-ctl pri" onClick={stopVoiceRecording}>
                <Square aria-hidden /> {t('Parar gravação')}
              </button>
            )}
            {playbackAudioUrl && !isRecordingAudio && (
              <>
                <button type="button" className="q-ctl pri" onClick={saveRecordedAudio}>
                  <Check aria-hidden /> {t('Salvar áudio')}
                </button>
                <button type="button" className="q-ctl" onClick={() => void startVoiceRecording()}>
                  {t('Gravar novamente')}
                </button>
              </>
            )}
            <button type="button" className="q-ctl" onClick={(e) => fecharDialogoDe(e.currentTarget)}>
              {t('Cancelar')}
            </button>
          </div>
        </Dialogo>
      )}

      {/* A FOLHA DA PALAVRA: o Analista e o que o cartão de hover mostrava (imagem, contexto, deck). */}
      {selectedExamWord && (
        <VocabularyPanel
          emFolha
          viewKey="reading"
          word={selectedExamWord}
          mtNote={mtNote}
          onClose={fecharPalavra}
          onSpeak={speakWord}
          onAddToDeck={handleAddVocabWordToDeck}
          isAdded={isWordAdded(selectedExamWord)}
          ttsSpeed={ttsSpeed}
          setTtsSpeed={setTtsSpeed}
          onPractice={onChangeView ? handlePracticeWord : undefined}
          imagem={{ url: previaDaAberta?.imageUrl ?? null, carregando: !previaDaAberta || previaDaAberta.loading }}
          podeOuvir={!!idiomaDaPalavraAberta && haVozPara(idiomaDaPalavraAberta)}
        />
      )}
    </div>
  );
}
