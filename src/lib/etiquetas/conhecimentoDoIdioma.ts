import { useEffect, useMemo } from 'react';

import { baseLang } from '../../core/texto/idioma';
import { estaAnonimo } from '../identidade';
import { pedirVistas, useSnapshotDasEtiquetas } from './indiceDeEtiquetas';

export interface ConhecimentoDoIdioma {
  /** As chaves `aprendendo`/`dominada` do caderno no idioma (a entrada da cobertura). */
  conhecidas: ReadonlySet<string>;
  /** Quantas sessões a pessoa tem no idioma (o portão do número honesto). */
  sessoes: number;
  temConta: boolean;
}

/**
 * O QUE A PESSOA JÁ SABE EM QUALQUER IDIOMA, no aparelho: o par de `useConhecimento` (Leitura ativa, só inglês) para
 * as sessões e os livros. Lê o MESMO índice de etiquetas; nada do texto nem do caderno vai a servidor.
 *
 * `useConhecimento` não serve aqui porque fixa o idioma em `en`. O laço abaixo espelha o dele; quem mesclar o #192
 * (marcadas "Já sei") troca só o laço por `chavesConhecidas(s.caderno, s.marcadas, idioma, { incluirSemIdioma: true })`.
 */
export function useConhecimentoDoIdioma(lang: string | null | undefined): ConhecimentoDoIdioma {
  const idioma = baseLang(lang);
  const s = useSnapshotDasEtiquetas();
  const temConta = !estaAnonimo();
  useEffect(() => {
    if (temConta && idioma) pedirVistas(idioma);
  }, [temConta, idioma]);
  return useMemo(() => {
    const conhecidas = new Set<string>();
    for (const balde of [s.caderno?.get(idioma), s.caderno?.get('')]) {
      for (const [chave, estado] of balde ?? []) if (estado !== 'nova') conhecidas.add(chave);
    }
    return { conhecidas, sessoes: s.vistas.get(idioma)?.sessoes ?? 0, temConta };
  }, [s, temConta, idioma]);
}
