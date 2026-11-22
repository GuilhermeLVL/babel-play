import { useEffect, useState } from 'react';

import { type ParaEstudarDaSessao, paraEstudarDaSessao } from '../core/leitura/paraEstudarDaSessao';
import { SESSOES_MINIMAS_PARA_NOVA } from '../core/vocabulario/etiquetas';
import { useConhecimentoDoIdioma } from '../lib/etiquetas/conhecimentoDoIdioma';
import { quandoOcioso } from './useCoberturaDoConteudo';

type Falas = ReadonlyArray<{ texto: string; lang?: string | null }>;

/**
 * As frases i+1 e as palavras novas da sessão (`paraEstudarDaSessao`), ou `null` quando não são honestas: sem conta,
 * com menos de `SESSOES_MINIMAS_PARA_NOVA` sessões no idioma (quase tudo pareceria novo), idioma sem espaço entre
 * palavras ou pouco texto. O MESMO portão da cobertura. Calculado no aparelho, em tempo ocioso; até lá `null`.
 */
export function useParaEstudarDaSessao(falas: Falas | null, lang: string | null | undefined) {
  const conhecimento = useConhecimentoDoIdioma(lang);
  const [pronta, setPronta] = useState<{ falas: Falas; lang: string; r: ParaEstudarDaSessao | null } | null>(null);
  const habilitada =
    !!falas?.length && !!lang && conhecimento.temConta && conhecimento.sessoes >= SESSOES_MINIMAS_PARA_NOVA;
  useEffect(() => {
    if (!habilitada || !falas || !lang) {
      setPronta(null);
      return;
    }
    return quandoOcioso(() => setPronta({ falas, lang, r: paraEstudarDaSessao(falas, lang, conhecimento.conhecidas) }));
  }, [habilitada, falas, lang, conhecimento.conhecidas]);
  if (!pronta?.r || !habilitada || pronta.falas !== falas || pronta.lang !== lang) return null;
  return pronta.r;
}
