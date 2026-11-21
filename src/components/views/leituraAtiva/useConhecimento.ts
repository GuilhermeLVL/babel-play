import { useEffect, useMemo } from 'react';

import { estadoNoCaderno } from '../../../core/vocabulario/etiquetas';
import { chavesConhecidas } from '../../../core/vocabulario/marcadas';
import { pedirVistas, useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { estaAnonimo } from '../../../lib/identidade';

/** O idioma dos textos do acervo (o MVP é só inglês). */
export const IDIOMA_DOS_TEXTOS = 'en';

export interface Conhecimento {
  /** As chaves `aprendendo`/`dominada` do caderno e as marcadas "Já sei" no idioma dos textos (a entrada da cobertura). */
  conhecidas: ReadonlySet<string>;
  /** Quantas sessões a pessoa tem no idioma (o portão do número honesto). */
  sessoes: number;
  temConta: boolean;
  /** A palavra já está no caderno, em qualquer estado? */
  noCaderno(chave: string): boolean;
}

/**
 * O QUE A PESSOA JÁ SABE, no aparelho: o índice de etiquetas (o caderno lido uma vez por página e as sessões por
 * idioma). Nada do texto nem do caderno vai a servidor por causa da cobertura.
 */
export function useConhecimento(): Conhecimento {
  const s = useSnapshotDasEtiquetas();
  const temConta = !estaAnonimo();
  useEffect(() => {
    if (temConta) pedirVistas(IDIOMA_DOS_TEXTOS);
  }, [temConta]);
  return useMemo(() => {
    const conhecidas = chavesConhecidas(s.caderno, s.marcadas, IDIOMA_DOS_TEXTOS, { incluirSemIdioma: true });
    return {
      conhecidas,
      sessoes: s.vistas.get(IDIOMA_DOS_TEXTOS)?.sessoes ?? 0,
      temConta,
      noCaderno: (chave: string) => !!estadoNoCaderno(s.caderno, chave, IDIOMA_DOS_TEXTOS),
    };
  }, [s, temConta]);
}
