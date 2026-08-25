/**
 * IDIOMA FALADO — o idioma que a app REALMENTE usa para narrar um texto e para reconhecer a fala
 * do usuário.
 *
 * POR QUE ISTO EXISTE (bug real, relatado pelo usuário):
 *   "A frase está em inglês, o narrador vem em português, e quando eu falo não tenho garantia de que
 *    ele está avaliando a pronúncia em inglês ou em português."
 *
 * Ele estava certo, e a causa não era o TTS: era o METADADO de idioma, que chega errado por dois
 * caminhos independentes.
 *
 *   1. `Sentence.lang` vem de `utterance.sourceLang`, gravado lá atrás na Captura. Ali `sourceLang`
 *      é o idioma do SEU microfone (padrão 'pt-BR') e as falas do sistema recebem `targetLang`. Se os
 *      seletores não corresponderem ao áudio real, a frase inglesa fica rotulada como portuguesa —
 *      e ninguém a jusante desconfia.
 *   2. `seedFromSelection(texto, studyLang, …)` carimba QUALQUER seleção com o idioma estudado, sem
 *      olhar o texto. Selecionar uma frase em inglês com o deck em português produz `lang: 'pt'`.
 *
 * O estrago é duplo e silencioso: `u.lang = 'pt-BR'` faz o TTS ler inglês com voz portuguesa, e
 * `recognition.lang = 'pt-BR'` faz o reconhecedor tentar casar fonemas ingleses com o modelo acústico
 * do português. A nota que sai disso não mede nada — e a app estaria ENSINANDO ERRADO com um número
 * de aparência precisa.
 *
 * A CORREÇÃO: não confiar cegamente no rótulo. Conferi-lo contra o texto com o detector de idioma que
 * já existe (`lib/langDetect`), que usa o LanguageDetector nativo do navegador quando há e cai numa
 * heurística determinística quando não há. Quando o detector discorda do rótulo COM CONFIANÇA, o texto
 * ganha a palavra final — o texto é o fato, o rótulo é só o que alguém declarou.
 *
 * HONESTIDADE: isto NÃO inventa idioma. Sem sinal no texto, o rótulo declarado prevalece. E a
 * divergência nunca é silenciosa: `mismatch` existe para a UI dizer, na cara, qual idioma está sendo
 * usado e por quê — o usuário precisa poder auditar a decisão que gerou a nota dele.
 */
import { useEffect, useState } from 'react';
import { detectLanguage, type LangDetection } from './langDetect';
import { baseLang, toBcp47 } from './languages';

/**
 * Confiança mínima para o texto DERRUBAR o idioma declarado.
 *
 * Calibrado contra `detectHeuristic`: uma frase de ~8+ palavras com palavras-função claras chega a
 * 0.8+; frases curtas ficam abaixo por causa do fator de amostra. Abaixo deste piso preferimos manter
 * o declarado a trocar o idioma com base num palpite — trocar errado é tão ruim quanto não trocar.
 */
const OVERRIDE_CONFIDENCE = 0.6;

export interface SpokenLang {
  /** ISO-639-1 que a app vai USAR (voz + reconhecimento). '' = desconhecido. */
  lang: string;
  /** O mesmo, em BCP-47 — a forma que `SpeechSynthesis` e `SpeechRecognition` esperam. */
  bcp47: string;
  /** De onde saiu a decisão. 'declared' = o metadado dos dados; 'detected' = o texto venceu. */
  source: 'declared' | 'detected' | 'unknown';
  /** O idioma que os dados AFIRMAVAM (ISO-639-1). '' quando não havia rótulo nenhum. */
  declared: string;
  /** O que o detector viu no texto. `null` = sem sinal suficiente (não é erro; é honestidade). */
  detected: LangDetection | null;
  /** O texto contradiz o rótulo, com confiança suficiente para agir. A UI DEVE mostrar isso. */
  mismatch: boolean;
  /** A detecção terminou. Enquanto `false`, não inicie reconhecimento de fala — o idioma é provisório. */
  ready: boolean;
}

function settle(declared: string, detected: LangDetection | null, ready: boolean): SpokenLang {
  const dec = baseLang(declared || '');
  const det = detected ? baseLang(detected.lang) : '';

  // O texto derruba o rótulo só quando discorda E está confiante.
  const overrides =
    !!det && det !== dec && (detected?.confidence ?? 0) >= OVERRIDE_CONFIDENCE;

  // Sem rótulo, qualquer detecção já é melhor que nada — mas continua sendo "detectado", não "declarado".
  const useDetected = overrides || (!dec && !!det);
  const lang = useDetected ? det : dec;

  return {
    lang,
    bcp47: lang ? toBcp47(lang) : '',
    source: lang ? (useDetected ? 'detected' : 'declared') : 'unknown',
    declared: dec,
    detected,
    mismatch: overrides && !!dec,
    ready,
  };
}

/**
 * Resolve o idioma de um texto, conferindo o rótulo declarado contra o conteúdo.
 * Versão imperativa — para quem não está num componente React.
 */
export async function resolveSpokenLang(text: string, declared: string): Promise<SpokenLang> {
  const detected = await detectLanguage(text || '');
  return settle(declared, detected, true);
}

/**
 * Versão React. Devolve imediatamente o idioma DECLARADO (`ready: false`) para a tela não piscar, e
 * reconcilia com o texto assim que a detecção volta.
 *
 * Quem for iniciar reconhecimento de fala deve esperar `ready` — pontuar a pronúncia com o idioma
 * errado produz um número sem significado, e é exatamente o bug que este módulo existe para matar.
 */
export function useSpokenLang(text: string, declared: string): SpokenLang {
  const [state, setState] = useState<SpokenLang>(() => settle(declared, null, false));

  useEffect(() => {
    let alive = true;
    // Volta ao provisório ao trocar de frase: nunca reaproveitar a detecção da frase anterior.
    setState(settle(declared, null, false));
    void detectLanguage(text || '').then(detected => {
      if (alive) setState(settle(declared, detected, true));
    });
    return () => { alive = false; };
  }, [text, declared]);

  return state;
}
