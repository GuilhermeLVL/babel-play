/**
 * A MEMÓRIA AGRUPADA POR FONTE (openspec `modelo-do-aluno-e-dados` 4.3 e `cartoes` 4.2; flag `estudo_palavras_v2`): as mesmas
 * fontes do catálogo de conteúdo (sessões, baralhos do Anki e a Trilha), com as contagens de `GET /api/vocab/conteudo`
 * (as palavras de cada uma são EXATAMENTE as do catálogo, não uma conta paralela) e, ao lado, a retenção e a próxima revisão
 * de `GET /api/vocab/memoria-por-baralho`.
 *
 * Uma fonte sem revisão no histórico aparece do mesmo jeito, com `retencao` nula: o catálogo manda no que existe.
 */
import type { ContagemDaFonte, ContagensDeConteudo } from '../learning/contagensDeConteudo';
import {
  type MemoriaDoBaralho,
  type MemoriaPorBaralho,
  type QuandoVolta,
  quandoVolta,
  retencaoDoBaralho,
} from './memoriaDoBaralho';

export type GrupoDeFonte = 'sessao' | 'anki' | 'trilha';

export interface LinhaPorFonte extends ContagemDaFonte {
  grupo: GrupoDeFonte;
  /** Id da sessão ou do baralho do Anki; `trilha` para a Trilha. */
  id: string;
  /** `''` na Trilha (a tela dá o nome). */
  nome: string;
  /** Revisões do baralho na janela, e a retenção em % (nula abaixo de 20). */
  revisoes: number;
  retencao: number | null;
  volta: QuandoVolta;
}

export interface GrupoPorFonte {
  grupo: GrupoDeFonte;
  linhas: LinhaPorFonte[];
}

export function agruparPorFonte(
  k: ContagensDeConteudo,
  memoria: MemoriaPorBaralho | null,
  inicioDoDia: number,
): GrupoPorFonte[] {
  const agora = memoria?.agora ?? k.agora;
  const achar = (tipo: MemoriaDoBaralho['tipo'], id: string) =>
    memoria?.baralhos.find((b) => b.tipo === tipo && b.id === id);
  const linha = (grupo: GrupoDeFonte, id: string, nome: string, c: ContagemDaFonte): LinhaPorFonte => {
    const m = achar(grupo, id);
    return {
      grupo,
      id,
      nome,
      palavras: c.palavras,
      frases: c.frases,
      paraHoje: c.paraHoje,
      revisoes: m?.revisoes ?? 0,
      retencao: m ? retencaoDoBaralho(m) : null,
      volta: quandoVolta(m?.proximaRevisao ?? null, agora, inicioDoDia),
    };
  };
  const grupos: GrupoPorFonte[] = [
    { grupo: 'sessao', linhas: k.sessoes.map((s) => linha('sessao', s.id, s.nome, s)) },
    { grupo: 'anki', linhas: k.anki.map((b) => linha('anki', b.id, b.nome, b)) },
    { grupo: 'trilha', linhas: k.trilha ? [linha('trilha', 'trilha', '', k.trilha)] : [] },
  ];
  return grupos.filter((g) => g.linhas.length > 0);
}
