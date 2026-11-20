/**
 * O QUE ESTÁ À VENDA, ACOMPANHANDO AS FLAGS — os ganchos que as telas usam para nomear o plano certo (o Plus
 * com a v4, o Premium sem ela; o plano sem anúncios) e para não afirmar preço antes de as flags chegarem.
 *
 * `planoDeEntradaAgora()` (`lib/planoDeEntrada`) lê o cache uma vez: a tela pintada antes de o servidor
 * responder ficava com o nome antigo ("Conhecer o Premium" com a v4 ligada). Estes ganchos assinam as
 * mudanças (`useFlag`) e releem a decisão da matriz (`core/planos`).
 */
import { useSyncExternalStore } from 'react';

import {
  FLAG_STT_AO_VIVO,
  FLAG_VENDA_PLANOS_V3,
  FLAG_VENDA_PLANOS_V4,
  planoDeEntrada,
  type PlanoPago,
  planoSemAnuncios,
} from '../core/planos';
import { useFlag } from './flags';
import { EVENTO_DAS_FLAGS, flagLigada, flagsAtuais } from './flagsCache';

/** O plano de entrada (`planoDeEntrada`), re-renderizando quando a `venda_planos_v4` muda. */
export function usePlanoDeEntrada(): PlanoPago {
  useFlag(FLAG_VENDA_PLANOS_V4);
  return planoDeEntrada(flagLigada);
}

/** O plano sem anúncios à venda agora (`planoSemAnuncios`), re-renderizando quando a venda muda. */
export function usePlanoSemAnuncios(): PlanoPago | null {
  useFlag(FLAG_VENDA_PLANOS_V3);
  useFlag(FLAG_VENDA_PLANOS_V4);
  useFlag(FLAG_STT_AO_VIVO);
  return planoSemAnuncios(flagLigada);
}

/**
 * As flags já são conhecidas (chegaram do servidor ou estão no cache do aparelho)? Antes disso, quem depende
 * delas para afirmar um preço espera: dizer "R$ 19,90" e trocar para "R$ 14,90" segundos depois é mostrar
 * um preço errado. O servidor devolve TODAS as flags avaliadas (ligadas ou não), então lista vazia é "ainda
 * não sei".
 */
export function useFlagsConhecidas(): boolean {
  useFlag(FLAG_VENDA_PLANOS_V4); // liga a atualização periódica das flags
  return useSyncExternalStore(
    assinarAsFlags,
    () => Object.keys(flagsAtuais()).length > 0,
    () => false,
  );
}

function assinarAsFlags(cb: () => void): () => void {
  window.addEventListener(EVENTO_DAS_FLAGS, cb);
  return () => window.removeEventListener(EVENTO_DAS_FLAGS, cb);
}
