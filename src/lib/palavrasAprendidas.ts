import { useEffect, useState } from 'react';

import { fetchDeck } from '../data/api';
import type { VocabCard } from '../types';
import { chaveDaPalavra } from './estilosDeLegenda';
import { estadoDoCartao } from './pelesDeCartao';

/**
 * AS PALAVRAS QUE A PESSOA JÁ APRENDEU — o que o estilo de legenda destaca (onda 4).
 *
 * A MESMA régua da pele de cartão (`estadoDoCartao`, que lê a fase do FSRS que o cartão já
 * carrega): tudo o que deixou de ser "nova" no caderno — aprendida ou dominada.
 */
export function palavrasAprendidas(cartas: readonly VocabCard[]): Set<string> {
  const s = new Set<string>();
  for (const c of cartas) if (c.inDeck && c.word && estadoDoCartao(c) !== 'nova') s.add(chaveDaPalavra(c.word));
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
