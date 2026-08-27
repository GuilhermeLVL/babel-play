/**
 * FICHAR UMA PALAVRA NO DECK — a resposta do servidor tratada num lugar só.
 *
 * QUATRO telas montavam o mesmo `bulkAddCards` de um cartão só e repetiam, byte a byte, o mesmo
 * tratamento do resultado: guardar o que entrou e AVISAR o motivo do que foi recusado. O `jscpd`
 * media três clones em cima desse bloco (`Analysis`↔`Reading`, `Analysis`↔`Metrics`,
 * `Metrics`↔`Study`).
 *
 * O risco não é o tamanho do trecho: é o `skipped` sumir de UMA das cópias numa edição futura.
 * O servidor aplica régua de qualidade e deduplica por (palavra, idioma) — sem o aviso, o clique
 * "adiciona" a palavra, o servidor recusa, e a tela não diz nada. Clique que não faz nada e não
 * explica é indistinguível de bug, e foi assim que o baralho chegou a 194 repetições.
 *
 * O que este módulo NÃO faz, de propósito: não mexe em estado de tela. Cada chamador guarda os
 * cartões criados no seu próprio `vocabCards` — `Study` ainda precisa do cartão real de volta para
 * abrir a revisão nele, e `Analysis`/`Reading` também alimentam `addedWords`. Devolver a lista e
 * deixar o `setState` fora foi o que permitiu unificar sem mudar o que cada tela faz depois.
 */
import { makeCloze, motivoLegivel } from '@core';
import { bulkAddCards } from '../data/api';
import type { VocabCard, VocabWord } from '../types';
import { cardLangs, resolveWord } from './vocabWord';
import type { ResolvedWord } from './vocabWord';
import type { LangConfig } from './langConfig';
import { toast } from '../components/Toast';

export interface CartaoAFichar {
  word: string;
  /** Tradução REAL — ou vazia. Nunca inventada. */
  back: string;
  /** Frase de onde a palavra saiu. É dela que os idiomas do cartão foram resolvidos. */
  sentence?: string;
  /** Idiomas já decididos pelo produtor único (`vocabWord.resolveWord`). */
  resolved: ResolvedWord;
  cloze: ReturnType<typeof makeCloze>;
  /** Sessão de origem, quando a palavra veio de uma (Análise/Leitura). */
  sessionId?: string;
}

/**
 * Devolve os cartões CRIADOS de verdade.
 *
 * Lista vazia quer dizer uma de duas coisas, e nas duas o chamador não tem o que fazer: o servidor
 * recusou (e o motivo JÁ foi dito ao usuário aqui) ou a chamada falhou (e o deck em tela fica como
 * estava, que é o estado consistente).
 */
export async function ficharCartao(c: CartaoAFichar): Promise<VocabCard[]> {
  try {
    const { cards: created, skipped } = await bulkAddCards([{
      word: c.word,
      back: c.back,
      sentence: c.sentence || undefined,
      // Idiomas REAIS da PALAVRA (o da frase de onde ela saiu → o alvo decidido por ele).
      ...cardLangs(c.resolved),
      clozePrompt: c.cloze?.prompt,
      clozeAnswer: c.cloze?.answer,
      sessionId: c.sessionId,
    }]);
    if (created.length) return created;
    // O servidor aplica a régua de qualidade e deduplica: quando recusa, a tela DIZ o
    // motivo. Clique que não faz nada e não explica é indistinguível de bug.
    if (skipped.length) toast.warn(`"${skipped[0].word}": ${motivoLegivel(skipped[0].motivo)}`);
  } catch { /* falha silenciosa, deck permanece consistente */ }
  return [];
}

/**
 * Ficha uma palavra vinda do Analista de Vocabulário (Estudo e Métricas).
 *
 * Os idiomas do cartão vêm da FRASE de contexto da palavra (com o rótulo dela como declarado) e
 * NÃO do par votado do deck — era o par votado que gravava a palavra inglesa como portuguesa
 * quando o baralho era majoritariamente português.
 *
 * `resolveWord` fica FORA do `try` de propósito: a falha dele não é "o servidor recusou o cartão",
 * é erro de programação, e engoli-la aqui esconderia exatamente o que se quer ver.
 */
export async function ficharPalavraDoAnalista(w: VocabWord, config: LangConfig): Promise<VocabCard[]> {
  const sentence = w.example || '';
  const cloze = sentence ? makeCloze(sentence, w.word) : null;
  const resolved = await resolveWord({
    word: w.word,
    context: sentence || undefined,
    declaredLang: w.lang || undefined,
    config,
  });
  return ficharCartao({
    word: w.word,
    back: w.translation || '', // tradução REAL (ou vazia, nunca inventada)
    sentence,
    resolved,
    cloze,
  });
}
