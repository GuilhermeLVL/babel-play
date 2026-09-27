/**
 * TIPOS do catálogo, fora de `loja.ts` para os catálogos satélites (`catalogoV2`,
 * `catalogoMaestria`, `efeitosDeJogo`) tiparem seus itens sem importar o módulo que os concatena
 * — o gate `morto:ciclos` conta também import de tipo. `loja.ts` reexporta tudo.
 */
import type { MinigameId } from './minigames/types';

export type Raridade = 'comum' | 'raro' | 'epico' | 'lendario';

/* Vinha de `lib/desbloqueios`. Mora aqui porque o catálogo é quem o usa para tipar `tipo`, e o
   core não pode depender de `lib/` (a seta aponta só para dentro). `desbloqueios.ts` passa a
   importar daqui — continua sendo o dono da REGRA de nível; o core é o dono do VOCABULÁRIO. */
export type TipoDesbloqueavel = 'tema' | 'fonte' | 'posicao' | 'estudio';

/** Tipos além dos desbloqueáveis clássicos: partículas, rastro do mouse e as capacidades da
 *  galeria. `pack`, `cursor` e `aprimoramento` saíram nas recompensas v2 (27/09); `fonte` e
 *  `posicao` continuam como tipo (a régua de `desbloqueios` os consulta), sem item no catálogo:
 *  fora do catálogo = livre. */
export type TipoDaLoja =
  | TipoDesbloqueavel
  | 'particulas'
  | 'rastro'
  | 'galeria'
  | 'efeito-acerto'
  | 'efeito-combo'
  | 'finalizacao'
  | 'moldura'
  | 'titulo' // onda 3 (maestria)
  | 'legenda'
  | 'cartao'; // onda 4 (legenda e cartão)

export interface ItemDaLoja {
  id: string;
  tipo: TipoDaLoja;
  /** id concreto usado pelo módulo que equipa (ThemeType, FonteType, ParticulasType...). */
  alvo: string;
  nome: string;
  desc: string;
  raridade: Raridade;
  /**
   * Nível que destrava de graça (1 = livre desde o início). AUSENTE = o nível não abre (recompensas
   * v2): itens novos só de Seeds e os de maestria. A simulação da onda 2 mostrou que o nível da
   * conta abre tudo antes das Seeds (`docs/economia-v2.md`).
   */
  nivel?: number;
  /** Preço do ATALHO em Seeds; ausente = só por nível. */
  precoSeeds?: number;
  /** Cores de prévia (swatches) quando fizer sentido. */
  previa?: string[];
  /**
   * EXCLUSIVO DE CONQUISTA (economia v2): id da conquista que libera. Sem nível, sem preço —
   * a Loja mostra o cadeado "Conquista: X" e o item só fica equipável com a conquista feita.
   */
  exclusivoDe?: string;
  /**
   * PREÇO EM CRÉDITOS — a moeda comprada com dinheiro (mudança credito-com-destino).
   *
   * Um item tem preço numa moeda OU na outra, nunca nas duas: misturar as duas faria o mesmo
   * objeto ter dois valores e apagaria a linha que separa "ganhei estudando" de "paguei". Item
   * com `precoCreditos` não tem `precoSeeds`, e a régua das quatro origens o classifica como
   * `creditos`.
   */
  precoCreditos?: number;
  /**
   * EXCLUSIVO DE TEMPORADA (recompensas v2, onda 5): a temporada cuja trilha entrega o item — o
   * nível e a trilha moram na tabela de `temporada.ts`, não aqui. Sem nível da conta, sem Seeds,
   * sem Créditos e fora do baú; `precoSeedsDepois` é o preço com que ele volta à Loja 365 dias
   * depois do fim da temporada (`precoSeedsDoItem`). A posse vem do crédito
   * `temporada:<id>:<nível>:<trilha>` conferido no servidor.
   */
  origemTemporada?: { temporada: string; precoSeedsDepois: number };
  /** O jogo a que o item pertence (efeitos de maestria, molduras e títulos). */
  jogo?: MinigameId;
  /**
   * EXCLUSIVO DE MAESTRIA (recompensas v2, onda 3): o nível de maestria do jogo que libera o item.
   * Sem nível da conta, sem Seeds, sem Créditos, fora do baú — nunca à venda. A posse vem do
   * crédito `maestria:<jogo>:<nível>` conferido no servidor.
   */
  origemMaestria?: { jogo: MinigameId; nivel: 2 | 3 | 4 | 5 };
}
