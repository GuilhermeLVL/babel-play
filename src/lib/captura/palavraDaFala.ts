/**
 * A PALAVRA DA FALA — o vocabulário dentro da captura ao vivo: examinar a palavra clicada,
 * fichá-la no deck (FSRS) e mandá-la praticar num exercício.
 *
 * Saiu de `views/LiveCapture.tsx` sem mudar comportamento: a fábrica roda a cada render, como as
 * closures que substituiu, e o estado da tela entra por PARÂMETRO explícito.
 */
import type { Dispatch, SetStateAction, RefObject } from 'react';
import { makeCloze, motivoLegivel } from '@core';
import { bulkAddCards } from '../../data/api';
import { type VocabWord } from '../../types';
import { resolveWord, buildVocabWord, cardLangs, type WordOrigin } from '../vocabWord';
import { seedFromSelection, telaDoExercicio } from '../sentences';
import type { PracticeSeed, ExerciseId } from '../sentences';
import { baseLang } from '../languages';
import type { LangConfig } from '../langConfig';
import type { GatewayDaCaptura } from './tiposDaFala';

/** Tudo que o vocabulário da captura precisa da tela — por parâmetro, sem contexto novo. */
export interface DepsDaPalavraDaFala {
  gateway: GatewayDaCaptura;
  /** A config no formato que `vocabWord.ts` consome (espelhada em ref: os caminhos são assíncronos). */
  langConfigRef: RefObject<Pick<LangConfig, 'mine' | 'studying'>>;
  targetLangRef: RefObject<string>;
  /** Idioma REAL da palavra que está no Analista de Vocabulário. */
  selectedWordLangRef: RefObject<string>;
  speakWord: (word: string, lang?: string) => void;
  setSelectedExamWord: Dispatch<SetStateAction<VocabWord | null>>;
  /** Palavras já fichadas nesta visita (valor do render + o setter). */
  addedWords: string[];
  setAddedWords: Dispatch<SetStateAction<string[]>>;
  setFeedbackMsg: (msg: string) => void;
  /** Navegação entre telas (ex.: "praticar esta frase" a partir da captura ao vivo). */
  onChangeView?: (view: string, data?: any) => void;
}

export function criarPalavraDaFala(deps: DepsDaPalavraDaFala) {
  const {
    gateway, langConfigRef, targetLangRef, selectedWordLangRef, speakWord,
    setSelectedExamWord, addedWords, setAddedWords, setFeedbackMsg, onChangeView,
  } = deps;

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

  return { examineWord, handleAddWordToDeck, handlePracticeWord };
}
