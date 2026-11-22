import { useEffect, useState } from 'react';

import { type CoberturaDoConteudo, coberturaDoConteudo } from '../core/leitura/coberturaDoConteudo';
import { type RotuloDaCobertura, rotuloDaCobertura } from '../core/leitura/coberturaDoTexto';
import { SESSOES_MINIMAS_PARA_NOVA } from '../core/vocabulario/etiquetas';
import { useConhecimentoDoIdioma } from '../lib/etiquetas/conhecimentoDoIdioma';

export interface CoberturaParaATela {
  cobertura: CoberturaDoConteudo;
  rotulo: RotuloDaCobertura;
}

/* Fora do caminho crítico: a conta espera a tela pintar (ocioso do navegador; sem ele, um timeout). */
export function quandoOcioso(f: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  const { requestIdleCallback, cancelIdleCallback } = w;
  if (requestIdleCallback && cancelIdleCallback) {
    const id = requestIdleCallback.call(w, f, { timeout: 1500 });
    return () => cancelIdleCallback.call(w, id);
  }
  const id = window.setTimeout(f, 50);
  return () => window.clearTimeout(id);
}

/**
 * A cobertura do conteúdo (`trechos` no idioma `lang`) já com o rótulo, ou `null` quando o número não é honesto: sem
 * conta, com menos de `SESSOES_MINIMAS_PARA_NOVA` sessões no idioma, idioma sem espaço entre palavras ou pouco texto.
 * Calculada no aparelho, em tempo ocioso; até lá devolve `null`.
 */
export function useCoberturaDoConteudo(
  trechos: readonly string[] | null,
  lang: string | null | undefined,
): CoberturaParaATela | null {
  const conhecimento = useConhecimentoDoIdioma(lang);
  const [pronta, setPronta] = useState<{
    trechos: readonly string[];
    lang: string;
    c: CoberturaDoConteudo | null;
  } | null>(null);
  const habilitada =
    !!trechos?.length && !!lang && conhecimento.temConta && conhecimento.sessoes >= SESSOES_MINIMAS_PARA_NOVA;
  useEffect(() => {
    if (!habilitada || !trechos || !lang) {
      setPronta(null);
      return;
    }
    return quandoOcioso(() =>
      setPronta({ trechos, lang, c: coberturaDoConteudo(trechos, lang, conhecimento.conhecidas) }),
    );
  }, [habilitada, trechos, lang, conhecimento.conhecidas]);
  /* O resultado só vale para a entrada que o gerou: ao trocar de capítulo, o do anterior some até a conta nova. */
  if (!pronta?.c || !habilitada || pronta.trechos !== trechos || pronta.lang !== lang) return null;
  const r = rotuloDaCobertura({
    porcentagem: pronta.c.porcentagem,
    sessoes: conhecimento.sessoes,
    temConta: conhecimento.temConta,
  });
  return r ? { cobertura: pronta.c, rotulo: r.rotulo } : null;
}
