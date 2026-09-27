import type { ItemDaLoja } from './tiposDaLoja';

/**
 * AS PEÇAS DO OURO DAS CONQUISTAS (recompensas v2, onda 5 — spec 9).
 *
 * Arquivo próprio, concatenado em `CATALOGO_DA_LOJA` numa linha, pelo mesmo motivo de
 * `catalogoMaestria.ts` e `catalogoV2.ts`: as ondas acrescentam em paralelo sem conflito em
 * `loja.ts`.
 *
 * Cada conquista de degrau OURO entrega uma moldura ou um título que não se compra: sem `nivel`,
 * sem `precoSeeds`, sem `precoCreditos`. O `exclusivoDe` aponta para a conquista — é o que tira a
 * peça da vitrine, do baú e do Passe (`autorizarGasto`, `ehSorteavelNoDrop`, `slotsDoPasse`) e o
 * que `estadoDoItem` consulta para destrancá-la. Os ids batem com `CosmeticoExclusivo`
 * (`learning/conquistas.ts`); `tests/conquistas-v2.test.ts` confere os dois lados.
 */
const moldura = (id: string, conquista: string, nome: string, desc: string): ItemDaLoja => ({
  id,
  tipo: 'moldura',
  alvo: id,
  nome,
  desc,
  raridade: 'epico',
  exclusivoDe: conquista,
});

const titulo = (id: string, conquista: string, nome: string, desc: string): ItemDaLoja => ({
  id,
  tipo: 'titulo',
  alvo: id,
  nome,
  desc,
  raridade: 'lendario',
  exclusivoDe: conquista,
});

export const CATALOGO_DAS_CONQUISTAS: ItemDaLoja[] = [
  moldura('moldura-conquista-biblioteca', 'caderno-1000', 'Moldura Biblioteca', 'De quem fichou 1.000 palavras.'),
  titulo('titulo-conquista-memoria', 'revisor-2000', 'Memória de ferro', 'De quem acertou 2.000 revisões.'),
  moldura('moldura-conquista-antena', 'capturas-100', 'Moldura Antena', 'De quem gravou ou importou 100 sessões.'),
  titulo('titulo-conquista-ouvido', 'ouvido-absoluto', 'Ouvido absoluto', 'De quem chegou ao Ouro nos três jogos de escuta.'),
  titulo('titulo-conquista-impecavel', 'impecavel', 'Impecável', 'De quem fechou 50 rodadas com 3 estrelas.'),
  moldura('moldura-conquista-arcade', 'arcade', 'Moldura Fliperama', 'De quem chegou ao Bronze em 12 jogos.'),
  titulo('titulo-conquista-inabalavel', 'inabalavel', 'Inabalável', 'De quem praticou 100 dias seguidos.'),
  moldura('moldura-conquista-calendario', 'habito', 'Moldura Calendário', 'De quem completou 12 semanas de prática.'),
  titulo('titulo-conquista-veterano', 'nivel-25', 'Veterano', 'De quem chegou ao nível 25.'),
];
