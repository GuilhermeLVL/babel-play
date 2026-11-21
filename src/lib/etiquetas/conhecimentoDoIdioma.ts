import { useEffect, useMemo } from 'react';

import { baseLang } from '../../core/texto/idioma';
import { chavesConhecidas } from '../../core/vocabulario/marcadas';
import { estaAnonimo } from '../identidade';
import { pedirVistas, useSnapshotDasEtiquetas } from './indiceDeEtiquetas';

export interface ConhecimentoDoIdioma {
  /** As chaves `aprendendo`/`dominada` do caderno e as marcadas "Já sei" no idioma (a entrada da cobertura). */
  conhecidas: ReadonlySet<string>;
  /** Quantas sessões a pessoa tem no idioma (o portão do número honesto). */
  sessoes: number;
  temConta: boolean;
}

/**
 * O QUE A PESSOA JÁ SABE EM QUALQUER IDIOMA, no aparelho: o par de `useConhecimento` (Leitura ativa, só inglês) para
 * as sessões e os livros. Lê o MESMO índice de etiquetas; nada do texto nem do caderno vai a servidor.
 *
 * `useConhecimento` não serve aqui porque fixa o idioma em `en`; a régua é a MESMA (`chavesConhecidas`). As marcadas
 * chegam depois do caderno: até lá a % sai um pouco menor e é recalculada quando o snapshot muda (esperar por elas
 * esconderia o número para sempre se a leitura falhar).
 */
export function useConhecimentoDoIdioma(lang: string | null | undefined): ConhecimentoDoIdioma {
  const idioma = baseLang(lang);
  const s = useSnapshotDasEtiquetas();
  const temConta = !estaAnonimo();
  useEffect(() => {
    if (temConta && idioma) pedirVistas(idioma);
  }, [temConta, idioma]);
  return useMemo(() => {
    const conhecidas = chavesConhecidas(s.caderno, s.marcadas, idioma, { incluirSemIdioma: true });
    return { conhecidas, sessoes: s.vistas.get(idioma)?.sessoes ?? 0, temConta };
  }, [s, temConta, idioma]);
}
