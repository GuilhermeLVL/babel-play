import { BarChart3, BookOpen, Gamepad2, MessagesSquare } from 'lucide-react';
import React, { Suspense, useEffect, useRef, useState } from 'react';

import type { AppMetrics, UtteranceRow } from '../../data/api';
import { fetchDeck, fetchSessionTranscript, fetchSettings } from '../../data/api';
import { applyOutputDevice } from '../../lib/audioDevices';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { copyDoPerfil } from '../../lib/profile';
import type { PracticeSeed, Sentence } from '../../lib/sentences';
import { toSentences } from '../../lib/sentences';
import { cancelSpeech, speak as ttsSpeak } from '../../lib/tts';
import type { WordOrigin } from '../../lib/vocabWord';
import { buildVocabWord } from '../../lib/vocabWord';
import type { VocabWord } from '../../types';
import { Recording } from '../../types';
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
 *
 * `lazyComRecarga` e não o `lazy` cru (Fase 4 da prontidão): é o MESMO chunk do `Play` que o `App`
 * carrega com recarga, e depois de um deploy o hash dele muda. Com o `lazy` cru, a aba "Jogos" de
 * uma sessão aberta antes do deploy rejeitava o `import()` (404) dentro do Suspense — a tela preta
 * que `lazyComRecarga` existe para evitar.
 */
const PlayLobby = lazyComRecarga(() => import('./Play'));
import { buildGateway } from '../../gateway';
import { getActiveProfile } from '../../gateway/activeProfile';
import { useMetricasDaSessao } from '../../lib/analise/metricasDaSessao';
import { criarPalavraDaAnalise } from '../../lib/analise/palavraDaAnalise';
import { formatSeconds, usePlayerDaSessao } from '../../lib/analise/playerDaSessao';
import { useAudioDaSessao } from '../../lib/audioDaSessao';
import { useFuncaoEstavel } from '../../lib/captura/conversaEstavel';
import { usePalavrasConhecidas } from '../../lib/captura/usePalavrasConhecidas';
import { consentiuNuvem } from '../../lib/consentimentoDeNuvem';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { getEntitlements } from '../../lib/entitlements';
import { numero, t } from '../../lib/i18n';
import { planoDeProva } from '../../lib/polimento/planos';
import type { DerivedProgress } from '../../lib/progress';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { TranscriptSettings } from '../../lib/transcriptUtils';
import { aparelhoTemVoz, haVozPara } from '../../lib/voz/haVoz';
import ExportarSessao from './analise/ExportarSessao';
import PlayerInterativo from './analise/PlayerInterativo';
import JogosDaSessao from './analise/quest/JogosDaSessao';
import SessaoDoQuest from './analise/quest/SessaoDoQuest';
import TranscricaoDoQuest, { type AjusteDeExibicao } from './analise/quest/TranscricaoDoQuest';
import VisaoGeralDoQuest from './analise/quest/VisaoGeralDoQuest';
import type { FalaTocada } from './captura/celular/FolhaDaFrase';
import FolhasDoPrototipo, { type PalavraNaFolha } from './captura/celular/FolhasDoPrototipo';

/** Selo de PROCEDÊNCIA da transcrição (honestidade): de onde vieram as falas desta sessão. */
function provenanceLabel(engine?: string | null): string | null {
  switch (engine) {
    case 'youtube-caption-manual':
      return 'Legenda YT (oficial)';
    case 'youtube-caption-auto':
      return 'Legenda YT (automática)';
    case 'whisper-local':
      // O id do adapter é histórico: em inglês quem transcreve é o Moonshine, fora dele o Whisper.
      // O selo diz o que é verdade nos dois casos.
      return 'Transcrição local';
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
  /**
   * Quantos jogos abrem com esta sessão — o número da aba "Jogos" (protótipo: `n` na aba). Quem
   * conta é o próprio lobby embutido (`aoContarProntos`), com a mesma regra da grade; guardado com o
   * id da sessão para não mostrar o número de outra depois de trocar.
   */
  const [prontosDaSessao, setProntosDaSessao] = useState<{ id: string; n: number } | null>(null);
  const contarProntos = React.useCallback((n: number) => setProntosDaSessao({ id: recording.id, n }), [recording.id]);

  // Real-time Simulated Media Player states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  /* A faixa do player não tem mais os botões de Smart Slow-Mo e de loop: os dois seguem desligados,
     e o motor (`usePlayerDaSessao`) continua recebendo o valor. */
  const [autoSlowEnabled] = useState<boolean>(false);
  const [loopMode] = useState<boolean>(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(-1);

  /* O player zera o shadowing ao trocar de mídia (`usePlayerDaSessao` pede o setter); nesta tela o
     shadowing mora na folha da frase, que tem o estado dela. */
  const [, setShadowingSentenceIndex] = useState<number | null>(null);

  const [overviewSubTab, setOverviewSubTab] = useState<'dashboard' | 'lexical' | 'fluency'>('dashboard');

  /* A FOLHA DA FRASE do desenho novo (`telas3.js:175-177`): a fala tocada e, por cima, a palavra. */
  const [falaNaFolha, setFalaNaFolha] = useState<FalaTocada | null>(null);
  const [palavraNaFolha, setPalavraNaFolha] = useState<PalavraNaFolha | null>(null);

  // Player REAL: áudio gravado (<audio>) quando existe; senão, narração TTS sincronizada.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [, setPeaks] = useState<number[]>([]); // o motor decodifica os picos; a faixa do player não os desenha
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
  /* Em que pé está o pedido da transcrição. Quem lê é a tela do Quest (espera, vazio e erro com
     "Tentar de novo", que repete o pedido por `tentativaDaTranscricao`); a de sempre não mudou. */
  const [estadoDaTranscricao, setEstadoDaTranscricao] = useState<'carregando' | 'pronta' | 'erro'>('carregando');
  const [tentativaDaTranscricao, setTentativaDaTranscricao] = useState(0);
  React.useEffect(() => {
    let alive = true;
    setEstadoDaTranscricao('carregando');
    fetchSessionTranscript(recording.id)
      .then((r) => {
        if (!alive) return;
        setRealUtterances(r.utterances || []);
        setSessionLangs({ src: r.session?.sourceLang ?? '', tgt: r.session?.targetLang ?? '' });
        setEstadoDaTranscricao('pronta');
      })
      .catch(() => {
        if (alive) {
          setRealUtterances([]);
          setSessionLangs(null);
          setEstadoDaTranscricao('erro');
        }
      });
    return () => {
      alive = false;
    };
  }, [recording.id, tentativaDaTranscricao]);

  /* A TRADUÇÃO POLIDA (D5 da Fase D): mora ao lado da original em cada fala (`traducaoPolida`); a
     original nunca é trocada. */
  const polidaDaFala = React.useMemo(
    () =>
      new Map<string, string>(
        (realUtterances as UtteranceRow[]).flatMap((u) => (u.traducaoPolida ? [[u.id, u.traducaoPolida]] : [])),
      ),
    [realUtterances],
  );
  const aplicarPolidas = (polidas: ReadonlyArray<{ id: string; traducaoPolida: string }>) => {
    const mapa = new Map(polidas.map((p) => [p.id, p.traducaoPolida]));
    setRealUtterances((prev) => prev.map((u) => (mapa.has(u.id) ? { ...u, traducaoPolida: mapa.get(u.id) } : u)));
  };

  // Configuração de idioma do usuário — LEITOR ÚNICO (`lib/langConfig.ts`). Antes esta tela lia a
  // chave `ui.captureSourceLang/captureTargetLang` como `{src, tgt}` e o Estudo/Métricas liam a MESMA
  // chave INVERTIDA: o mesmo cartão saía com o idioma trocado dependendo da tela. Aqui só existem
  // `mine` (o que você fala) e `studying` (o que você estuda) — não há como inverter.
  const langConfig = useLangConfig();
  /* As palavras que a pessoa já conhece no idioma estudado: na folha da frase, as outras saem marcadas
     como novas (`telas.js:211`). */
  const conhecidas = usePalavrasConhecidas(langConfig.studying, true);

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

  /**
   * A MÁQUINA DE REPRODUÇÃO — busca (`seekTo`/`playFrom`), sincronia da legenda, motor de áudio
   * gravado OU narração TTS, forma de onda decodificada, reset ao trocar de mídia e a
   * desaceleração automática em trechos complexos.
   *
   * Saiu inteira para `lib/analise/playerDaSessao.ts`, no mesmo bloco contíguo e na mesma ordem de
   * hooks em que estava aqui — o estado continua morando nesta tela e entra por parâmetro.
   */
  /* O Quest não tem voz de leitura própria: ali a narração de uma sessão SEM áudio gravado vai pelo
     motor do app (`speak()`, que leva à voz do site), e "ouvir a partir desta fala" segue narrando,
     como na tela de sempre. Com voz no aparelho (computador, celular), nada muda: quem decide é o
     RECURSO (`aparelhoTemVoz`), e por isso o desenho novo no computador segue narrando pela voz dele. */
  const narradorDoQuest = React.useMemo(
    () => (!aparelhoTemVoz() ? { falar: ttsSpeak, calar: cancelSpeech, podeFalar: haVozPara } : null),
    [],
  );
  const { seekTo, playFrom } = usePlayerDaSessao({
    narrador: narradorDoQuest,
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
    estilo: 'classica',
  });
  // Deck do BACKEND (mesmo deck do Study/FSRS), não mais localStorage.
  const [vocabCards, setVocabCards] = useState<any[]>([]);

  /* `criarPalavraDaAnalise` (lib) ainda pede os setters do Analista de Vocabulário, que esta tela não
     monta: a palavra abre na folha dela. Só os setters ficam, para o contrato da lib. */
  const [, setSelectedExamWord] = useState<VocabWord | null>(null);
  const [addedWords, setAddedWords] = useState<string[]>([]);
  const [ttsSpeed] = useState<number>(1.0);
  const [, setExamMtNote] = useState<string | null>(null);

  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => {});
  }, []);

  // Gateway (uma vez) para traduções reais no hover e no "Adicionar ao Deck".
  const gateway = React.useMemo(() => buildGateway({ profile: getActiveProfile(), cloudConsent: consentiuNuvem }), []);

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

  /* A tradução da palavra aberta na folha: o mesmo produtor do Analista (`buildVocabWord`). A função
     não muda de identidade, para a folha não consultar de novo a cada pintura. */
  const consultarNaFolha = useFuncaoEstavel(async (palavra: string, frase: string) => {
    const { vocab } = await buildVocabWord(originOfWord(palavra, frase), gateway.mt);
    return { traducao: vocab.translation };
  });

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
    realVicios,
    realSilencio,
    realMonologue,
    realSobreposicao,
    topKeywords,
    fullTranscriptText,
  } = useMetricasDaSessao({
    realUtterances,
    sentences,
    parsedSentences,
    ttsLang,
    selectedLexicalWord: null,
    vocabCards,
  });

  /* MICRODADOS LEXICAIS (Visão geral → Inteligência lexical): as palavras desta sessão que estão no
     caderno (sem nenhuma, as palavras-chave) e as falas em que a escolhida aparece. */
  const palavrasDoMicro = React.useMemo(() => {
    const doCaderno = [
      ...new Set(vocabCards.filter((c) => c.sourceSessionId === recording.id).map((c) => c.word.toLowerCase())),
    ];
    return (doCaderno.length ? doCaderno : topKeywords.map((k) => k.toLowerCase())).slice(0, 12);
  }, [vocabCards, recording.id, topKeywords]);

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

  /**
   * O VOCABULÁRIO DENTRO DA ANÁLISE — fichar a palavra no deck. Em `lib/analise/palavraDaAnalise.ts`;
   * o cabeçalho de lá registra, item a item, por que NÃO compartilha código com
   * `lib/captura/palavraDaFala.ts`, que é o equivalente do outro lado.
   */
  const { handleAddWordToDeck } = criarPalavraDaAnalise({
    gateway,
    originOfWord,
    vocabCards,
    setVocabCards,
    addedWords,
    setAddedWords,
    setSelectedExamWord,
    setExamMtNote,
    selectedExamWordLang: undefined,
    ttsSpeed,
    ttsLang,
    recordingId: recording.id,
    recordingTitle: recording.title,
    onChangeView,
  });

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
  /* Os cinco ajustes como DADOS: a tela os desenha um por linha num diálogo. As opções e o que cada
     uma grava existem uma vez só. */
  const ajustesDeExibicao: AjusteDeExibicao[] = [
    {
      rotulo: 'Ordem',
      opcoes: [
        ['original-first', 'Original primeiro'],
        ['translated-first', 'Tradução primeiro'],
      ],
      atual: tsSettings.displayOrder,
      aoEscolher: (v) => updateSetting('displayOrder', v as typeof tsSettings.displayOrder),
    },
    {
      rotulo: 'Original',
      opcoes: [
        ['mostrar', 'Mostrar'],
        ['ocultar', 'Ocultar'],
      ],
      atual: tsSettings.hideOriginal ? 'ocultar' : 'mostrar',
      aoEscolher: (v) => updateSetting('hideOriginal', v === 'ocultar'),
    },
    {
      rotulo: 'Tamanho',
      opcoes: TAMANHOS.map(([v, , r]) => [v, r] as const),
      atual: tamanhoAtual,
      aoEscolher: (v) => updateSetting('fontSize', v as typeof tsSettings.fontSize),
    },
    {
      rotulo: 'Fonte',
      opcoes: [
        ['sans', 'Sans'],
        ['serif', 'Serif'],
        ['mono', 'Mono'],
      ],
      atual: tsSettings.fontFamily,
      aoEscolher: (v) => updateSetting('fontFamily', v as typeof tsSettings.fontFamily),
    },
    {
      rotulo: 'Tema do texto',
      opcoes: TEMAS.map(([v, , r]) => [v, r] as const),
      atual: tsSettings.textColor,
      aoEscolher: (v) => updateSetting('textColor', v as typeof tsSettings.textColor),
    },
  ];
  /** As palavras que ESTA gravação pôs no caderno (o deck inteiro vem do backend). */
  const palavrasDaSessao = vocabCards.filter((c) => c.sourceSessionId === recording.id);

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
      contagem: prontosDaSessao?.id === recording.id ? prontosDaSessao.n : undefined,
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

  const propsDoPlayer = {
    recording,
    parsedSentences,
    hasRealAudio,
    audioSrc,
    audioRef,
    audioDuration,
    setAudioDuration,
    isPlaying,
    setIsPlaying,
    setCurrentTime,
    loopMode,
    activeSentenceIndex,
    seekTo,
  };
  const dialogoDeExportar = showExportModal && (
    <ExportarSessao
      recording={recording}
      vocabCards={palavrasDaSessao}
      stats={stats}
      ritmo={{
        ppm: realWpm,
        pausasLongas: realLongPauses,
        vicios: realVicios.palavras > 0 ? realVicios.total : null,
      }}
      dados={{
        sessao: {
          id: recording.id,
          titulo: recording.title,
          tipo: recording.type,
          data: recording.date,
          duracao: recording.durationStr,
          idiomaOrigem: sessionLangs?.src || ttsLang,
          idiomaDestino: sessionLangs?.tgt || langConfig.studying,
        },
        falas: parsedSentences.map((f) => ({ ...f, polida: f.id ? polidaDaFala.get(f.id) : undefined })),
        falasCruas: realUtterances as UtteranceRow[],
        textoCompleto: fullTranscriptText,
        idioma: ttsLang,
        estatisticas: stats,
        metricas: {
          ppm: realWpm,
          pausasLongas: realLongPauses,
          vicios: realVicios.palavras > 0 ? realVicios : null,
          silencio: realSilencio,
          monologoMs: realMonologue,
          sobreposicao: realSobreposicao,
          palavrasChave: topKeywords,
          ritmoPorFalante,
        },
        cartoes: vocabCards,
      }}
      aoFechar={() => setShowExportModal(false)}
    />
  );

  /* ── META QUEST (as telas novas, `docs/design/quest-desenho.md`) ────────────────────────────────
     O mesmo estado e as mesmas ações, no desenho do headset: cabeçalho e abas em `SessaoDoQuest`, a
     transcrição como lista de falas com "Ouvir" e "Opções" (`TranscricaoDoQuest`), os números em
     `VisaoGeralDoQuest`. Nada abre por hover nem por duplo clique: a palavra abre a folha dela no
     centro (o `VocabularyPanel` em folha, com a imagem e o contexto que o cartão de hover mostrava),
     e corrigir uma fala é o "Editar" das opções dela. */
  const documento = recording.type === 'document';
  /* OUVIR UMA FALA. Onde há player, "Ouvir" SEGUE dali, como o clique na fala da tela de sempre: o
       áudio gravado toca a partir dela ou, na sessão sem áudio, a narração continua dela em diante.
       Documento (sem player) e áudio gravado que não veio leem só aquela fala, pela voz do idioma
       dela; sem voz para o idioma, o "Ouvir" não aparece e as opções da fala dizem o motivo. */
  type Fala = (typeof parsedSentences)[number];
  const audioGravado = hasRealAudio && !audioDaSessao.erro;
  const ouvirSegue = audioGravado || (!documento && !hasRealAudio);
  const haVozParaAFala = (f: Fala) => haVozPara(f.lang || ttsLang);
  const podeOuvirFala = (f: Fala) => audioGravado || haVozParaAFala(f);
  const ouvirFala = (f: Fala) => {
    if (ouvirSegue) playFrom(f.startTime);
    else ttsSpeak(f.original, { lang: f.lang || ttsLang, rate: 0.9 });
  };
  /* A FOLHA DA FRASE (`abrirFrase()`, `telas3.js:175-177`, item D53): a mesma folha da captura, com a
       fala de verdade. A palavra tocada nela abre a folha da palavra por cima. */
  const falaParaAFolha = (f: Fala): FalaTocada => {
    const polida = f.id ? polidaDaFala.get(f.id) : undefined;
    return {
      id: f.id ?? String(f.index),
      texto: f.original,
      traducao: polida ?? f.translation,
      lang: f.lang || ttsLang,
      langDaTraducao: sentences.find((s) => s.index === f.index)?.translationLang || undefined,
    };
  };
  const abrirFala = (f: Fala) => {
    setPalavraNaFolha(null);
    setFalaNaFolha(falaParaAFolha(f));
  };
  /* Uma palavra fora de uma fala (a lista "Palavras desta sessão") abre direto a folha dela. */
  const abrirPalavra = (palavra: string, frase: string) => {
    setFalaNaFolha(null);
    setPalavraNaFolha({ palavra, frase, lang: originOfWord(palavra, frase).declaredLang || ttsLang });
  };
  const fecharFolhas = () => {
    setFalaNaFolha(null);
    setPalavraNaFolha(null);
  };
  const palavraNoCaderno = (palavra: string) => {
    const p = palavra.toLowerCase();
    return (
      addedWords.some((w) => w.toLowerCase() === p) || vocabCards.some((c) => c.word.toLowerCase() === p && c.inDeck)
    );
  };
  /* A voz da folha lê a fala; o player da sessão para, para os dois não falarem juntos. */
  const ouvirNaFolha = (texto: string, lang: string, lenta: boolean) => {
    setIsPlaying(false);
    ttsSpeak(texto, { lang: lang || ttsLang, rate: lenta ? ttsSpeed * 0.7 : ttsSpeed });
  };
  /* "Guardar": o mesmo fichamento do Analista. A folha só comemora o que ENTROU no caderno. */
  const salvarNaFolha = async (item: { palavra: string; frase?: string; lang?: string; traducao?: string }) => {
    if (palavraNoCaderno(item.palavra)) return t('Esta palavra já está no seu caderno.');
    await handleAddWordToDeck({
      word: item.palavra,
      translation: item.traducao ?? '',
      example: item.frase,
      lang: item.lang,
    });
    const deck = await fetchDeck().catch(() => null);
    if (!deck) return t('Não deu para salvar agora.');
    setVocabCards(deck);
    return deck.some((c: { word: string }) => c.word.toLowerCase() === item.palavra.toLowerCase())
      ? 'adicionado ao seu deck'
      : t('Não deu para salvar agora.');
  };
  const posDaFalaNaFolha = falaNaFolha
    ? parsedSentences.findIndex((f) => (f.id ?? String(f.index)) === falaNaFolha.id)
    : -1;

  /* VISÃO GERAL (`telas3.js:83-93`): os quatro números do Painel, a nuvem e os microdados. */
  const falantes = new Set(parsedSentences.map((f) => f.speaker).filter((n) => n && n !== '-')).size;
  const vezesNaSessao = (palavra: string) => {
    const alvo = palavra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^\\p{L}])${alvo}(?=$|[^\\p{L}])`, 'giu');
    return parsedSentences.reduce((n, f) => n + (f.original.match(re)?.length ?? 0), 0);
  };

  return (
    <SessaoDoQuest
      gravacao={recording}
      abas={abasDaSessao}
      abaAtiva={currentTab}
      aoTrocarAba={(id) => {
        /* `telas3.js:167`: trocar de aba para o player. */
        setIsPlaying(false);
        onSubTabChange(id);
      }}
      aoVoltar={() => onChangeView('library')}
      aoExportar={() => setShowExportModal(true)}
      repintar={['dashboard', 'lexical', 'fluency'].indexOf(overviewSubTab)}
    >
      {currentTab === 'transcript' && (
        <TranscricaoDoQuest
          falas={parsedSentences}
          estado={estadoDaTranscricao}
          aoTentarDeNovo={() => setTentativaDaTranscricao((n) => n + 1)}
          documento={documento}
          indiceAtivo={activeSentenceIndex}
          tocando={isPlaying}
          classes={classesDoTranscrito}
          traducaoPrimeiro={tsSettings.displayOrder === 'translated-first'}
          ocultarOriginal={tsSettings.hideOriginal}
          /* A fala que já foi polida mostra a tradução polida, com o selo (`telas3.js:66`). */
          traducaoDe={(f) => {
            const polida = f.id ? polidaDaFala.get(f.id) : undefined;
            return { texto: polida ?? f.translation, polida: !!polida };
          }}
          idiomaDaTraducao={sentences[0]?.translationLang || undefined}
          procedencia={procedencia}
          player={
            documento ? null : (
              <PlayerInterativo
                {...propsDoPlayer}
                carregandoAudio={audioDaSessao.carregando}
                erroDoAudio={audioDaSessao.erro}
                haVozParaNarrar={parsedSentences.length === 0 || parsedSentences.some(haVozParaAFala)}
              />
            )
          }
          palavras={palavrasDaSessao}
          podeOuvir={podeOuvirFala}
          aoOuvir={ouvirFala}
          aoAbrirFala={abrirFala}
          aoAbrirPalavra={abrirPalavra}
          ajustes={ajustesDeExibicao}
        />
      )}

      {currentTab === 'reading' && <Reading recording={recording} onChangeView={onChangeView} />}

      {currentTab === 'practice' && (
        /* Os quatro ladrilhos do protótipo (`telas3.js:74-82`), em `JogosDaSessao`. O `Play` continua
             sendo quem sabe o que abre com o material desta gravação e quem abre a rodada; ele só não
             desenha o lobby aqui (`ladrilhos`). Enquanto o pedaço dele chega, os mesmos ladrilhos, à espera. */
        <Suspense fallback={<JogosDaSessao tiles={null} aoJogar={() => {}} />}>
          <PlayLobby
            embutido
            onChangeView={onChangeView}
            ageProfile={ageProfile}
            progress={progress}
            metrics={metrics}
            recording={recording}
            seed={practiceSeed}
            ladrilhos={(tiles, aoJogar) => <JogosDaSessao tiles={tiles} aoJogar={aoJogar} aoContar={contarProntos} />}
          />
        </Suspense>
      )}

      {currentTab === 'overview' && (
        <VisaoGeralDoQuest
          documento={documento}
          secao={overviewSubTab}
          aoTrocarSecao={setOverviewSubTab}
          painel={[
            [t('Palavras'), stats.wordCount > 0 ? numero(stats.wordCount) : '—'],
            [
              t('Duração'),
              documento ? '—' : t('{n} min', { n: numero(Math.max(1, Math.round(totalDurationSeconds / 60))) }),
            ],
            [t('Palavras novas'), numero(palavrasDaSessao.length)],
            [t('Falantes'), falantes ? numero(falantes) : '—'],
          ]}
          palavrasChave={topKeywords}
          nuvem={[...new Set([...topKeywords.map((k) => k.toLowerCase()), ...palavrasDoMicro])]}
          micro={palavrasDoMicro.slice(0, 4).map((palavra) => ({
            palavra,
            glosa: vocabCards.find((c) => c.word.toLowerCase() === palavra)?.translation || '',
            vezes: vezesNaSessao(palavra),
          }))}
          fluencia={{
            silencio: realSilencio != null ? `${Math.round(realSilencio.ms / 1000)} s` : '—',
            vicios: realVicios.palavras > 0 ? numero(realVicios.total) : '—',
            pausas: realLongPauses != null ? numero(realLongPauses) : '—',
            ritmo: ritmoPorFalante,
          }}
        />
      )}

      {(falaNaFolha || palavraNaFolha) && (
        <FolhasDoPrototipo
          fala={falaNaFolha}
          palavra={palavraNaFolha}
          aoOuvir={ouvirNaFolha}
          semPratica={noHeadset()}
          ehNova={
            falaNaFolha && conhecidas && baseLang(falaNaFolha.lang) === baseLang(conhecidas.idioma)
              ? (palavra) => !conhecidas.conhece(palavra)
              : undefined
          }
          guardada={palavraNoCaderno}
          aoTocarPalavra={(palavra) =>
            falaNaFolha && setPalavraNaFolha({ palavra, frase: falaNaFolha.texto, lang: falaNaFolha.lang })
          }
          aoVoltar={falaNaFolha && palavraNaFolha ? () => setPalavraNaFolha(null) : undefined}
          aoConsultar={consultarNaFolha}
          aoSalvar={salvarNaFolha}
          aoFechar={fecharFolhas}
          nuance={
            falaNaFolha
              ? {
                  /* Na bancada o comparador vê a folha como o Grátis a vê (`planoDeProva`). */
                  disponivel: planoDeProva() === 'free' ? false : getEntitlements().traducaoNuance,
                  destino: falaNaFolha.langDaTraducao || sessionLangs?.tgt || langConfig.studying,
                  contexto: parsedSentences
                    .slice(Math.max(0, posDaFalaNaFolha - 3), Math.max(0, posDaFalaNaFolha))
                    .map((f) => f.original),
                  aoConhecer: perfilProtegido()
                    ? undefined
                    : () => {
                        fecharFolhas();
                        onChangeView('planos');
                      },
                  /* A forma escolhida vira a tradução polida desta fala, nesta visita. */
                  aoEscolher: (traducao) => {
                    aplicarPolidas([{ id: falaNaFolha.id, traducaoPolida: traducao }]);
                    setFalaNaFolha({ ...falaNaFolha, traducao });
                  },
                }
              : undefined
          }
        />
      )}
      {dialogoDeExportar}
    </SessaoDoQuest>
  );
}
