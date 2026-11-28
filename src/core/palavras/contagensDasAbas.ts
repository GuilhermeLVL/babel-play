/**
 * AS CONTAGENS NAS ABAS DE "PRATICAR" E NOS BARALHOS DO ANKI DESATIVADOS (openspec `cartoes` 9.4 e 7.4; flag
 * `estudo_palavras_v2`). Só regra pura; os números são os de `GET /api/vocab/conteudo` (o seletor de conteúdo) e de
 * `GET /api/anki/decks`, sem conta paralela.
 */
import type { ContagemDaFonte, ContagensDeConteudo } from '../learning/contagensDeConteudo';

/** A fonte escolhida na ficha de conteúdo (o formato de `lib/conteudo/estado`, sem importá-lo). */
export type FonteEscolhida =
  | { tipo: 'tudo' }
  | { tipo: 'dificeis' }
  | { tipo: 'trilha' }
  | { tipo: 'sessao' | 'anki'; id: string };

export interface ContagensDePraticar {
  /** Cartões que vencem agora na fonte: o que a aba "Cartões" abre. */
  cartoes: number;
  /** Palavras da fonte: o que a aba "Jogos" tem para jogar. */
  jogos: number;
}

function daFonte(k: ContagensDeConteudo, f: FonteEscolhida): ContagemDaFonte | null {
  if (f.tipo === 'tudo') return k.tudo;
  if (f.tipo === 'dificeis') return k.dificeis;
  if (f.tipo === 'trilha') return k.trilha;
  return (f.tipo === 'sessao' ? k.sessoes : k.anki).find((x) => x.id === f.id) ?? null;
}

/** Os dois números das abas de "Praticar" para a fonte escolhida, ou `null` enquanto o catálogo não chegou ou a fonte sumiu. */
export function contagensDasAbasDePraticar(
  k: ContagensDeConteudo | null,
  fonte: FonteEscolhida,
): ContagensDePraticar | null {
  if (!k) return null;
  const c = daFonte(k, fonte);
  return c ? { cartoes: c.paraHoje, jogos: c.palavras } : null;
}

export interface BaralhoDoAnkiNaLista {
  id: string;
  nome: string;
  estado: 'ativo' | 'desativado' | string;
  /** Notas que o arquivo trouxe. */
  total: number;
}

/**
 * Os baralhos do Anki DESATIVADOS: o catálogo de conteúdo só lista baralho com cartão na revisão, então o desativado some
 * de lá e a pessoa não sabe que ele continua guardado. Esta é a lista que a tela mostra à parte, com "Gerenciar" (reativar
 * por novas notas, apagar de vez). Desativar não apaga nada; só tira o baralho da fila de Hoje e dos jogos.
 */
export function baralhosDoAnkiDesativados(baralhos: readonly BaralhoDoAnkiNaLista[]): BaralhoDoAnkiNaLista[] {
  return baralhos.filter((b) => b.estado === 'desativado');
}
