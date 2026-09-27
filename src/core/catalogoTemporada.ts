import type { ItemDaLoja, Raridade } from './tiposDaLoja';

/**
 * OS ITENS DA TEMPORADA 1 (recompensas v2, onda 5): molduras e títulos de perfil que só a trilha
 * entrega. Arquivo próprio, concatenado em `CATALOGO_DA_LOJA` numa linha, como `catalogoV2` e
 * `catalogoMaestria`. A casa de cada item (nível e trilha) mora em `temporada.ts`.
 *
 * POR QUE MOLDURA E TÍTULO. A trilha de assinante tem item em TODO nível (spec 8.3) e nunca paga
 * Seeds — Seeds pela assinatura seriam Seeds compráveis, o que a spec proíbe. Moldura e título são
 * dado + posse (aparecem no perfil, no cabeçalho do Personalizar e no ranking de adulto), não
 * precisam de arte nova e não dependem de maestria. O tema da temporada é o céu: títulos com nomes
 * de estrela, molduras com nomes de constelação — o mesmo universo do tema Observatório e do
 * cartão Constelação, que são as peças grandes da trilha grátis.
 *
 * Sem nível da conta, sem Seeds, fora do baú. Um ano depois do fim da temporada voltam à Loja com
 * Seeds pelo `precoSeedsDepois` (faixas calibradas em `docs/economia-v2.md`).
 */

/** O preço de volta, por raridade — dentro das faixas calibradas da Loja com Seeds. */
const PRECO_DE_VOLTA: Record<Raridade, number> = { comum: 400, raro: 1100, epico: 2800, lendario: 5200 };

const daT1 = (raridade: Raridade) => ({ raridade, origemTemporada: { temporada: 't1', precoSeedsDepois: PRECO_DE_VOLTA[raridade] } });

const slug = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** A raridade sobe com a casa da trilha de assinante: 1–10 comum, 11–20 raro, 21–29 épico, 30 lendário. */
export function raridadeDaCasa(nivel: number): Raridade {
  if (nivel >= 30) return 'lendario';
  if (nivel > 20) return 'epico';
  if (nivel > 10) return 'raro';
  return 'comum';
}

/** Títulos da trilha de assinante — as casas ímpares (1, 3, …, 29), na ordem. */
const ESTRELAS = [
  'Sírius', 'Vega', 'Altair', 'Rigel', 'Antares', 'Canopus', 'Arcturus', 'Aldebarã',
  'Betelgeuse', 'Spica', 'Deneb', 'Polaris', 'Achernar', 'Fomalhaut', 'Capella',
] as const;

/** Molduras da trilha de assinante — as casas pares (2, 4, …, 30), na ordem. A última é o marco. */
const CONSTELACOES = [
  'Órion', 'Lira', 'Cisne', 'Cruzeiro do Sul', 'Escorpião', 'Cassiopeia', 'Andrômeda', 'Pégaso',
  'Fênix', 'Dragão', 'Centauro', 'Águia', 'Leão', 'Ursa Maior', 'Via Láctea',
] as const;

export const TITULOS_DA_T1: ItemDaLoja[] = ESTRELAS.map((estrela, i) => ({
  id: `titulo-t1-${slug(estrela)}`,
  tipo: 'titulo',
  alvo: `t1-${slug(estrela)}`,
  nome: estrela,
  desc: 'Título de perfil da Temporada 1, trilha de assinante.',
  ...daT1(raridadeDaCasa(2 * i + 1)),
}));

export const MOLDURAS_DA_T1: ItemDaLoja[] = CONSTELACOES.map((constelacao, i) => ({
  id: `moldura-t1-${slug(constelacao)}`,
  tipo: 'moldura',
  alvo: `t1-${slug(constelacao)}`,
  nome: `Moldura ${constelacao}`,
  desc: 'Moldura de perfil da Temporada 1, trilha de assinante.',
  ...daT1(raridadeDaCasa(2 * i + 2)),
}));

/** As duas peças de perfil da trilha grátis (as outras três são tema, legenda e cartão, em `catalogoV2`). */
export const PERFIL_GRATIS_DA_T1: ItemDaLoja[] = [
  {
    id: 'titulo-t1-luneta',
    tipo: 'titulo',
    alvo: 't1-luneta',
    nome: 'Luneta',
    desc: 'Título de perfil da Temporada 1, trilha grátis.',
    ...daT1('comum'),
  },
  {
    id: 'moldura-t1-orbita',
    tipo: 'moldura',
    alvo: 't1-orbita',
    nome: 'Moldura Órbita',
    desc: 'Moldura de perfil da Temporada 1, trilha grátis.',
    ...daT1('raro'),
  },
];

export const CATALOGO_DA_TEMPORADA: ItemDaLoja[] = [...PERFIL_GRATIS_DA_T1, ...TITULOS_DA_T1, ...MOLDURAS_DA_T1];
