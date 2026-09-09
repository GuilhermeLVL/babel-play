/**
 * A PALAVRA DA ANÁLISE — o vocabulário dentro da tela de sessão: examinar a palavra clicada,
 * fichá-la no deck (FSRS), mandá-la praticar num exercício, pronunciá-la e o cache do cartão
 * flutuante de hover (imagem + tradução + contexto).
 *
 * Saiu de `views/Analysis.tsx` sem mudar comportamento: a fábrica roda a cada render, como as
 * closures que substituiu, e o estado da tela entra por PARÂMETRO explícito.
 *
 * POR QUE NÃO COMPARTILHA COM `lib/captura/palavraDaFala.ts`
 * O outro lado (captura ao vivo) é o mesmo ASSUNTO, não o mesmo CÓDIGO. As quatro funções
 * homônimas divergem no comportamento, não só na forma:
 *
 *  • `handleAddWordToDeck` — aqui passa por `lib/adicionarAoDeck.ficharCartao`, com `sessionId` (a
 *    sessão já existe e o cartão fica ligado a ela) e devolve os cartões criados para o estado da
 *    tela; na captura chama `bulkAddCards` cru, SEM `sessionId` (a sessão em curso ainda não foi
 *    salva — não se inventa um id) e reporta o resultado por `setFeedbackMsg`.
 *  • `examineWord` — aqui recebe `(palavra, frase)` cruas do transcrito e publica o motivo de não
 *    haver tradução em `examMtNote`; lá recebe um `VocabWord` já montado, resolve o idioma antes
 *    de traduzir e PRONUNCIA a palavra ao abrir o painel.
 *  • `isWordAdded` — aqui consulta o DECK do backend (`vocabCards`, campo `inDeck`) além da lista
 *    da visita; lá só existe a lista da visita, porque o deck não é carregado na captura.
 *  • `handlePracticeWord` — aqui a semente leva `sessionId` e a navegação leva `{ seed, id }`; lá
 *    a semente não tem sessão e a navegação leva só `{ seed }`.
 *
 * O que de fato é comum já está compartilhado, e é o miolo: `lib/vocabWord.ts`
 * (`resolveWord`/`buildVocabWord`/`cardLangs`), `lib/sentences.ts` (`seedFromSelection`,
 * `telaDoExercicio`), `@core.makeCloze` e `lib/tts.ts`. Unificar as cascas por cima disso
 * significaria um parâmetro de modo em cada função para reproduzir as diferenças acima — que é
 * exatamente o acoplamento que a divisão por domínio existe para desfazer.
 */
import { makeCloze } from '@core';
import type { Dispatch, SetStateAction } from 'react';
import React from 'react';

import { searchImages } from '../../data/api';
import type { buildGateway } from '../../gateway';
import type { VocabWord } from '../../types';
import { ficharCartao } from '../adicionarAoDeck';
import { toBcp47 } from '../languages';
import type { ExerciseId,PracticeSeed } from '../sentences';
import { seedFromSelection, telaDoExercicio } from '../sentences';
import { speak as ttsSpeak } from '../tts';
import type { ResolvedWord,WordOrigin } from '../vocabWord';
import { buildVocabWord, mtNoteFor, resolveWord } from '../vocabWord';
import type { EntradaDeHover } from './tiposDaAnalise';

/** O AI Gateway como a análise o enxerga (mesma instância que a tela monta com `buildGateway`). */
export type GatewayDaAnalise = ReturnType<typeof buildGateway>;

/** O que a tela precisa para manter o cartão flutuante de hover. */
export interface DepsDoCacheDeHover {
  /** Palavra sob o cursor (vem de `usePopoverDePalavra`). */
  hoveredWord: string | null;
  /** Deck do backend — o ATALHO do cartão já fichado. */
  vocabCards: any[];
  originOfWord: (word: string, sentence?: string) => WordOrigin;
  gateway: GatewayDaAnalise;
}

/**
 * Dados reais do hover: imagem (Openverse), tradução (gateway) e frase de contexto.
 * `note` = motivo de NÃO haver tradução (nunca um texto fabricado no lugar dela).
 * Cache por palavra evita refetch ao re-passar o mouse.
 *
 * Os quatro hooks abaixo eram um bloco contíguo em `Analysis.tsx` e seguem na mesma ordem.
 */
export function useCacheDeHover(deps: DepsDoCacheDeHover) {
  const { hoveredWord, vocabCards, originOfWord, gateway } = deps;

  const hoverCacheRef = React.useRef<Map<string, EntradaDeHover>>(new Map());
  const vocabCardsRef = React.useRef(vocabCards);
  vocabCardsRef.current = vocabCards;
  const [hoverData, setHoverData] = React.useState<(EntradaDeHover & { word: string; loading: boolean }) | null>(null);

  React.useEffect(() => {
    const word = hoveredWord;
    if (!word) {
      setHoverData(null);
      return;
    }
    const cached = hoverCacheRef.current.get(word);
    if (cached) {
      setHoverData({ word, ...cached, loading: false });
      return;
    }
    const origin = originOfWord(word);
    /* O CADERNO É O ATALHO: palavra já fichada tem tradução guardada — aparece na hora, sem
       esperar motor nenhum. Foi o caso do relato: "Já está no Deck" e "Traduzindo…" na mesma tela. */
    const doCaderno =
      vocabCardsRef.current.find((c) => c.word.toLowerCase() === word.toLowerCase())?.translation || null;
    setHoverData({
      word,
      image: null,
      translation: doCaderno,
      note: null,
      context: origin.context ?? null,
      lang: null,
      loading: true,
    });
    let alive = true;
    /* Estado PARCIAL: cada pedaço entra assim que chega. Antes o cartão esperava imagem E
       tradução em série, e a tradução (motor local carregando modelo, sem teto de tempo) podia
       nunca voltar: "Buscando imagem…" ficava eterno mesmo com a imagem já baixada. */
    const parcial: EntradaDeHover = {
      image: null,
      translation: doCaderno,
      note: null,
      context: origin.context ?? null,
      lang: null,
    };
    const publicar = (final: boolean) => {
      if (!alive) return;
      if (final) hoverCacheRef.current.set(word, { ...parcial });
      setHoverData({ word, ...parcial, loading: !final });
    };
    const TETO_MS = 7000;
    const comTeto = <T,>(p: Promise<T>, fallback: T) =>
      Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), TETO_MS))]);
    const imagem = comTeto(
      searchImages(word)
        .then((imgs) => imgs[0] ?? null)
        .catch(() => null),
      null,
    ).then((img) => {
      parcial.image = img;
    });
    const traducao = doCaderno
      ? Promise.resolve()
      : comTeto(buildVocabWord(origin, gateway.mt), null)
          .then((r) => {
            if (r) {
              parcial.translation = r.vocab.translation || null;
              parcial.note = mtNoteFor(r.resolved, r.vocab.translation);
              parcial.lang = r.resolved.lang || null;
            } else {
              parcial.note = 'A tradução demorou demais; clique na palavra para tentar de novo.';
            }
          })
          .catch(() => {
            parcial.note = 'Sem tradução automática agora.';
          });
    void Promise.allSettled([imagem, traducao]).then(() => publicar(true));
    return () => {
      alive = false;
    };
  }, [hoveredWord, originOfWord, gateway]);

  return { hoverData };
}

/** Tudo que o vocabulário da análise precisa da tela — por parâmetro, sem contexto novo. */
export interface DepsDaPalavraDaAnalise {
  gateway: GatewayDaAnalise;
  originOfWord: (word: string, sentence?: string) => WordOrigin;
  /** Deck do BACKEND (mesmo deck do Study/FSRS) — valor do render e o setter. */
  vocabCards: any[];
  setVocabCards: Dispatch<SetStateAction<any[]>>;
  /** Palavras fichadas nesta visita (valor do render + o setter). */
  addedWords: string[];
  setAddedWords: Dispatch<SetStateAction<string[]>>;
  setSelectedExamWord: Dispatch<SetStateAction<VocabWord | null>>;
  /** Por que esta palavra ficou SEM tradução (par sem motor, falha do MT). null = há tradução. */
  setExamMtNote: Dispatch<SetStateAction<string | null>>;
  /** Idioma da palavra que está no Analista de Vocabulário (fallback da pronúncia). */
  selectedExamWordLang: string | undefined;
  ttsSpeed: number;
  /** Idioma de FALLBACK da narração da sessão. */
  ttsLang: string;
  recordingId: string;
  recordingTitle: string;
  onChangeView: (view: string, data?: any) => void;
}

export function criarPalavraDaAnalise(deps: DepsDaPalavraDaAnalise) {
  const {
    gateway,
    originOfWord,
    vocabCards,
    setVocabCards,
    addedWords,
    setAddedWords,
    setSelectedExamWord,
    setExamMtNote,
    selectedExamWordLang,
    ttsSpeed,
    ttsLang,
    recordingId,
    recordingTitle,
    onChangeView,
  } = deps;

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
    setSelectedExamWord((prev) => (prev && prev.word === wordStr ? vocab : prev));
    setExamMtNote(mtNoteFor(resolved, vocab.translation));
  };

  // Aceita a string (popover de hover) ou o VocabWord (Analista de Vocabulário).
  const handleAddWordToDeck = async (input: string | VocabWord) => {
    const wordStr = typeof input === 'string' ? input : input.word;
    const known = typeof input === 'string' ? '' : input.translation || '';
    const exists = vocabCards.find((c) => c.word.toLowerCase() === wordStr.toLowerCase());
    if (exists) return;
    setAddedWords((prev) => (prev.includes(wordStr) ? prev : [...prev, wordStr]));

    const origin = originOfWord(wordStr, typeof input === 'string' ? undefined : input.example);
    // Frase de contexto real (quando existe) alimenta o cloze; sem ela, o título da gravação.
    const sentence = origin.context || recordingTitle || '';

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
    const created = await ficharCartao({ word: wordStr, back, sentence, resolved, cloze, sessionId: recordingId });
    if (created.length) setVocabCards((prev) => [...prev, ...created]);
  };

  /** A palavra já está fichada (deck do backend ou adicionada nesta sessão de tela)? */
  const isWordAdded = (w: VocabWord) =>
    addedWords.includes(w.word) || vocabCards.some((c) => c.word.toLowerCase() === w.word.toLowerCase() && c.inDeck);

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
      ...seedFromSelection(w.word, resolved.lang, exercise, recordingId),
      word: w.word,
    };
    onChangeView(telaDoExercicio(exercise), { seed, id: recordingId });
  };

  /**
   * TTS compartilhado (src/lib/tts.ts). O idioma é o da PALAVRA (resolvido a partir da frase de
   * origem), não o da primeira fala da sessão — senão uma palavra portuguesa numa sessão bilíngue
   * sairia com voz inglesa. Sem idioma conhecido, cai na narração da sessão.
   */
  const speakWord = (wordStr: string, lang?: string) => {
    const l = lang || selectedExamWordLang || ttsLang;
    // '' no lugar de undefined: `lang` e obrigatorio em SpeakOptions e o motor trata os dois
    // do mesmo jeito (baseLang normaliza ambos para ''), entao a fala nao muda.
    ttsSpeak(wordStr, { lang: l ? toBcp47(l) : '', rate: ttsSpeed });
  };

  /** Pronúncia fora do painel (popover de hover): idioma da frase de onde a palavra saiu. */
  const playWordTTS = (wordStr: string) => speakWord(wordStr, originOfWord(wordStr).declaredLang);

  return { examineWord, handleAddWordToDeck, isWordAdded, handlePracticeWord, speakWord, playWordTTS };
}
