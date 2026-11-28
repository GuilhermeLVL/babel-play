/**
 * O GANCHO DAS ETIQUETAS E DO HISTÓRICO DA PALAVRA NO LEITOR.
 *
 * Os dois pontos de encaixe da folha da palavra do leitor (`FolhaDaPalavraDoLivro`):
 *
 *  1. `etiquetaDaPalavra(palavra, idioma)` → o `data-etiqueta` da palavra ('salva' | 'aprendendo' |
 *     'dominada'…), lido do índice de etiquetas. Vai no cartão, NÃO pintado no texto do livro (a pesquisa,
 *     INT04: etiqueta no cartão, não no texto).
 *  2. `<HistoricoNaFolha palavra idioma />` → a força da palavra (`ForcaDaPalavra`), flag `forca_na_legenda`.
 *
 * `etiquetaDaPalavra` ainda devolve "nada" (a etiqueta do leitor não está ligada); `HistoricoNaFolha` mostra só a força.
 */
import type { ReactNode } from 'react';

import { FLAG_FORCA_NA_LEGENDA } from '../../../core/planos';
import { chaveAtiva } from '../../../core/texto/chaveAtiva';
import { forcaNoCaderno } from '../../../core/vocabulario/etiquetas';
import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { useFlag } from '../../../lib/flags';
import ForcaDaPalavra from '../../vocab/ForcaDaPalavra';

/** A etiqueta da palavra (o valor de `data-etiqueta`), ou `undefined` sem o índice de etiquetas. */
export function etiquetaDaPalavra(_palavra: string, _idioma: string): string | undefined {
  void _palavra;
  void _idioma;
  return undefined;
}

/**
 * A força da palavra dentro da folha (`ForcaDaPalavra`, a mesma da legenda), lida do índice de etiquetas em memória.
 * Só com a flag `forca_na_legenda` ligada e a palavra no caderno; sem isso, não mostra nada. O histórico completo
 * (sessões, jogos, nota) segue fora do leitor.
 */
export function HistoricoNaFolha({ palavra, idioma }: { palavra: string; idioma: string }): ReactNode {
  const porForca = useFlag(FLAG_FORCA_NA_LEGENDA);
  const s = useSnapshotDasEtiquetas();
  const forca = porForca ? forcaNoCaderno(s.forcas, chaveAtiva(palavra, idioma), idioma) : undefined;
  if (!forca) return null;
  return (
    <p className="cartao-palavra-forca-lida" data-testid="forca-no-cartao">
      <ForcaDaPalavra forca={forca} />
    </p>
  );
}
