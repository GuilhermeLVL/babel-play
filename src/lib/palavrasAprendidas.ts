import { useEffect, useState } from 'react';

import { fetchDeck } from '../data/api';
import type { VocabCard } from '../types';
import { chaveDaPalavra } from './estilosDeLegenda';

/**
 * AS PALAVRAS QUE A PESSOA JÁ APRENDEU — o que o estilo de legenda destaca (onda 4).
 *
 * "Aprendida" é a fase REAL do FSRS que o cartão já carrega (`fsrsState`, derivado em
 * `data/rotas/vocabulario.ts`): tudo o que saiu de `New` no caderno. Nada é recalculado aqui.
 */
export function palavrasAprendidas(cartas: readonly VocabCard[]): Set<string> {
  const s = new Set<string>();
  for (const c of cartas) if (c.inDeck && c.fsrsState !== 'New' && c.word) s.add(chaveDaPalavra(c.word));
  return s;
}

/** Lê o caderno uma vez (sem bloquear a legenda: até chegar, nada é marcado). */
export function usePalavrasAprendidas(): ReadonlySet<string> {
  const [aprendidas, setAprendidas] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let vivo = true;
    fetchDeck()
      .then((cartas) => {
        if (vivo) setAprendidas(palavrasAprendidas(cartas));
      })
      .catch(() => {
        /* sem caderno: nenhuma palavra marcada */
      });
    return () => {
      vivo = false;
    };
  }, []);
  return aprendidas;
}
