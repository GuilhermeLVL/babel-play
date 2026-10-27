/**
 * O GANCHO DAS ETIQUETAS E DO HISTÓRICO DA PALAVRA NO LEITOR.
 *
 * A frente paralela das etiquetas (`lib/etiquetas/indiceDeEtiquetas`, `data-etiqueta`, o componente
 * `HistoricoDaPalavra`) ainda não está nesta base. Quando ela entrar, os dois pontos de encaixe são estes,
 * e só estes — a folha da palavra do leitor (`FolhaDaPalavraDoLivro`) já os chama:
 *
 *  1. `etiquetaDaPalavra(palavra, idioma)` → o `data-etiqueta` da palavra ('salva' | 'aprendendo' |
 *     'dominada'…), lido do índice de etiquetas. Vai no cartão, NÃO pintado no texto do livro (a pesquisa,
 *     INT04: etiqueta no cartão, não no texto).
 *  2. `<HistoricoNaFolha palavra idioma />` → renderiza o `HistoricoDaPalavra` (lazy) com o estado, as
 *     contagens e onde a palavra apareceu.
 *
 * Até lá, os dois devolvem "nada" e a folha funciona como a da Leitura de sempre.
 */
import type { ReactNode } from 'react';

/** A etiqueta da palavra (o valor de `data-etiqueta`), ou `undefined` sem o índice de etiquetas. */
export function etiquetaDaPalavra(_palavra: string, _idioma: string): string | undefined {
  void _palavra;
  void _idioma;
  return undefined;
}

/** O histórico da palavra dentro da folha. Sem a frente das etiquetas, não mostra nada. */
export function HistoricoNaFolha(_props: { palavra: string; idioma: string }): ReactNode {
  void _props;
  return null;
}
