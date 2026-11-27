/**
 * A FORÇA DA PALAVRA ESCOLHIDA NO CARTÃO DO LEITOR (openspec `leitura-assistida`, Fatia C, tarefa C5).
 *
 * A força NÃO é gravada como status à parte: sai do agendador (`forcaDoCartao`). Escolher "1" só guarda a palavra (cartão
 * sem revisões = força 1, o "Não sei"). Escolher 2, 3 ou 4 numa palavra SEM revisões cria o cartão com a estabilidade
 * inicial equivalente (`estadoInicialDaForca`), pela rota que já existe (`POST /api/vocab/:id/desfazer`, que grava o estado
 * do agendador; num cartão sem revisões não há registro de revisão para desfazer). Cartão que já tem revisões NÃO é
 * mexido: a firmeza dele é o histórico, e quem a muda é a revisão.
 */
import type { Forca } from '../../core/learning/forcaDoCartao';
import { estadoInicialDaForca, type InfoDaPalavra, infoDaPalavra } from '../../core/leitura/destaqueDeVocabulario';
import { chaveAtiva } from '../../core/texto/chaveAtiva';
import { baseLang } from '../../core/texto/idioma';
import { desfazerRevisao, fetchDeck } from '../../data/api';
import type { VocabCard } from '../../types';
import { carregarCaderno, lerSnapshotDasEtiquetas, marcarSalva } from '../etiquetas/indiceDeEtiquetas';

/**
 * `statusDaPalavra(chave, idioma)`: o contrato da Fatia C com as outras fatias da leitura assistida (a seleção, o balão da
 * tradução e o ajuste de nível leem). O estado e a força da palavra no vocabulário da pessoa, do índice de etiquetas que já
 * está em memória: sem rede, O(1) por chave. A frequência no capítulo não existe aqui (vem do destaque; fora dele é 0).
 */
export function statusDaPalavra(chave: string, idioma: string): InfoDaPalavra {
  return infoDaPalavra(lerSnapshotDasEtiquetas(), [chave], idioma);
}

export type ResultadoDaForca =
  | { ok: true; forca: Forca }
  /** O cartão já tem revisões: a força vem do histórico e não é trocada à mão. */
  | { ok: false; motivo: 'ja-revisada' | 'sem-cartao' | 'falhou' };

/** O cartão da palavra no baralho (a mesma chave e o mesmo idioma-base), ou `undefined`. */
export async function cartaoDaPalavra(palavra: string, idioma: string): Promise<VocabCard | undefined> {
  const chave = chaveAtiva(palavra, idioma);
  if (!chave) return undefined;
  const base = baseLang(idioma);
  const baralho = await fetchDeck().catch(() => [] as VocabCard[]);
  return baralho.find((c) => c.inDeck && chaveAtiva(c.word, c.srcLang) === chave && baseLang(c.srcLang) === base);
}

/**
 * Dá à palavra a força escolhida. `fichar` guarda a palavra com a frase do livro (o `salvarNoDeck` do leitor) e devolve o
 * cartão criado; só é chamado quando a palavra ainda não tem cartão.
 */
export async function definirForcaDaPalavra(o: {
  palavra: string;
  idioma: string;
  forca: Forca;
  fichar: () => Promise<VocabCard | undefined>;
  agora?: number;
}): Promise<ResultadoDaForca> {
  try {
    let cartao = await cartaoDaPalavra(o.palavra, o.idioma);
    if (!cartao) cartao = await o.fichar();
    if (!cartao) return { ok: false, motivo: 'sem-cartao' };
    if ((cartao.reps ?? 0) > 0) return { ok: false, motivo: 'ja-revisada' };
    if (o.forca > 1) {
      await desfazerRevisao(cartao.id, estadoInicialDaForca(o.forca as 2 | 3 | 4, o.agora ?? Date.now()));
    }
    /* Pinta já; o caderno relido confirma (ou corrige) logo depois. */
    marcarSalva(o.palavra, o.idioma, o.forca);
    void carregarCaderno();
    return { ok: true, forca: o.forca };
  } catch {
    return { ok: false, motivo: 'falhou' };
  }
}
