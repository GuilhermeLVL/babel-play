/**
 * O CATÁLOGO DE PEÇAS DO AVATAR (versionado): acessórios que a receita liga ou desliga. Núcleo puro: aqui só
 * mora o DADO (id, categoria, osso, orçamento, compatibilidade); a geometria é de `src/lib/avatar/pecas3d.ts`
 * e os nomes que a pessoa lê são de `src/components/avatar/estudio/nomesDasPecas.ts` (o core não traduz).
 *
 * REGRAS:
 *  · Peças PROCEDURAIS e leves (≤ 500 triângulos cada), sem arquivo externo. Todas usam UM material compartilhado
 *    (cor por vértice): o conjunto soma 1 material ao modelo, e cada peça soma 0.
 *  · REPRESENTAÇÃO NÃO É RECOMPENSA: peças de acessibilidade (aparelho auditivo, implante coclear, óculos) são
 *    sempre `tipo: 'livre'`, nunca vão para a loja e continuam visíveis em qualquer tier (inclusive no PiP).
 *  · `tipo: 'loja'` é só cosmético puro e a posse vem da régua da loja (`estadoDoItem`), não daqui.
 */
import type { TierDoAvatar } from './tiers';

/** Mesma união de `OrigemDePeca` (receita.ts); repetida aqui para o catálogo não importar a receita (sem ciclo). */
export type OrigemDePeca = 'familia' | 'colecao' | 'importado';

export const VERSAO_DO_CATALOGO_DE_PECAS = 1 as const;

export type CategoriaDaPeca = 'acessorio' | 'cabeca' | 'adereco';
export const CATEGORIAS_DA_PECA: readonly CategoriaDaPeca[] = ['acessorio', 'cabeca', 'adereco'];

/** Ossos do humanoide VRM que uma peça pode pedir. */
export type OssoDaPeca = 'head' | 'neck';

/** Onde a peça fica: duas peças que dividem um lugar não convivem. */
export type LugarDaPeca =
  | 'rosto'
  | 'topo-da-cabeca'
  | 'fone'
  | 'aparelho-e'
  | 'aparelho-d'
  | 'implante-e'
  | 'implante-d'
  | 'pescoco'
  | 'flutuante';

/** Tetos de triângulos EXTRAS por peça. */
export const TETO_DE_TRIANGULOS_POR_PECA = 500;

export interface PecaDoCatalogo {
  id: string;
  /** Nome em português (referência; a UI traduz por `nomesDasPecas.ts`). */
  nome: string;
  categoria: CategoriaDaPeca;
  tipo: 'livre' | 'loja';
  /** Representação de uma pessoa (visão, audição): nunca vira item de loja e aparece em qualquer tier. */
  acessibilidade: boolean;
  /** Ossos do humanoide que o modelo precisa ter; sem eles a peça não é montada (e a UI avisa). */
  requer: readonly OssoDaPeca[];
  lugares: readonly LugarDaPeca[];
  /** Triângulos extras que a peça soma (medido contra a geometria real em teste) e materiais extras (sempre 0). */
  orcamento: { triangulos: number; materiais: 0 };
  /** `todas` ou a lista de origens de base em que a peça é oferecida. */
  bases: 'todas' | readonly OrigemDePeca[];
  /** Cor de fábrica da parte recolorível (id da paleta de peças). */
  corPadrao: string;
}

/** Cores que a pessoa escolhe para a parte principal da peça. Os ids repetem os da paleta de cabelo (nomes já traduzidos). */
export const CORES_DE_PECA: readonly { id: string; hex: string }[] = [
  { id: 'padrao', hex: '' },
  { id: 'preto', hex: '#1c1a1a' },
  { id: 'castanho', hex: '#5a3a24' },
  { id: 'grisalho', hex: '#9a9a9a' },
  { id: 'branco', hex: '#ececec' },
  { id: 'ruivo', hex: '#a8452a' },
  { id: 'loiro', hex: '#d8b46a' },
  { id: 'verde', hex: '#2f9b5a' },
  { id: 'azul', hex: '#2f5fd0' },
  { id: 'roxo', hex: '#7a4bc0' },
  { id: 'rosa', hex: '#e0609b' },
];
export const TOKEN_DE_COR_PADRAO = 'padrao';
export const ehCorDePeca = (id: unknown): id is string =>
  typeof id === 'string' && CORES_DE_PECA.some((c) => c.id === id);
export const hexDaCorDePeca = (id: string): string | null => {
  const c = CORES_DE_PECA.find((x) => x.id === id);
  return c && c.hex ? c.hex : null;
};

const peca = (
  p: Omit<PecaDoCatalogo, 'bases' | 'tipo' | 'acessibilidade'> & Partial<PecaDoCatalogo>,
): PecaDoCatalogo => ({
  tipo: 'livre',
  acessibilidade: false,
  bases: 'todas',
  ...p,
});

export const PECAS: readonly PecaDoCatalogo[] = [
  peca({
    id: 'oculos-redondo',
    nome: 'Óculos redondos',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['rosto'],
    orcamento: { triangulos: 230, materiais: 0 },
    corPadrao: 'preto',
  }),
  peca({
    id: 'oculos-quadrado',
    nome: 'Óculos quadrados',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['rosto'],
    orcamento: { triangulos: 140, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'fone-de-ouvido',
    nome: 'Fone de ouvido',
    categoria: 'acessorio',
    requer: ['head'],
    lugares: ['fone', 'implante-e', 'implante-d'],
    orcamento: { triangulos: 180, materiais: 0 },
    corPadrao: 'preto',
  }),
  peca({
    id: 'aparelho-auditivo-esq',
    nome: 'Aparelho auditivo (orelha esquerda)',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['aparelho-e'],
    orcamento: { triangulos: 180, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'aparelho-auditivo-dir',
    nome: 'Aparelho auditivo (orelha direita)',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['aparelho-d'],
    orcamento: { triangulos: 180, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'implante-coclear-esq',
    nome: 'Implante coclear (orelha esquerda)',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['implante-e'],
    orcamento: { triangulos: 170, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'implante-coclear-dir',
    nome: 'Implante coclear (orelha direita)',
    categoria: 'acessorio',
    acessibilidade: true,
    requer: ['head'],
    lugares: ['implante-d'],
    orcamento: { triangulos: 170, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'bone',
    nome: 'Boné',
    categoria: 'cabeca',
    requer: ['head'],
    lugares: ['topo-da-cabeca'],
    orcamento: { triangulos: 180, materiais: 0 },
    corPadrao: 'azul',
  }),
  peca({
    id: 'chapeu-simples',
    nome: 'Chapéu simples',
    categoria: 'cabeca',
    requer: ['head'],
    lugares: ['topo-da-cabeca'],
    orcamento: { triangulos: 110, materiais: 0 },
    corPadrao: 'castanho',
  }),
  peca({
    id: 'faixa-de-cabelo',
    nome: 'Faixa de cabelo',
    categoria: 'cabeca',
    requer: ['head'],
    lugares: ['topo-da-cabeca'],
    orcamento: { triangulos: 120, materiais: 0 },
    corPadrao: 'rosa',
  }),
  peca({
    id: 'balao-de-fala',
    nome: 'Balão de fala',
    categoria: 'adereco',
    requer: ['head'],
    lugares: ['flutuante'],
    orcamento: { triangulos: 150, materiais: 0 },
    corPadrao: 'branco',
  }),
  peca({
    id: 'lenco',
    nome: 'Lenço',
    categoria: 'adereco',
    requer: ['neck'],
    lugares: ['pescoco'],
    orcamento: { triangulos: 180, materiais: 0 },
    corPadrao: 'ruivo',
  }),
  // Exemplos de LOJA: só estética. Preço e nível moram em `catalogoV2.ts`.
  peca({
    id: 'cartola',
    nome: 'Cartola',
    categoria: 'cabeca',
    tipo: 'loja',
    requer: ['head'],
    lugares: ['topo-da-cabeca'],
    orcamento: { triangulos: 110, materiais: 0 },
    corPadrao: 'preto',
  }),
  peca({
    id: 'chapeu-de-explorador',
    nome: 'Chapéu de explorador',
    categoria: 'cabeca',
    tipo: 'loja',
    requer: ['head'],
    lugares: ['topo-da-cabeca'],
    orcamento: { triangulos: 110, materiais: 0 },
    corPadrao: 'loiro',
  }),
  peca({
    id: 'capa',
    nome: 'Capa',
    categoria: 'adereco',
    tipo: 'loja',
    requer: ['neck'],
    lugares: ['pescoco'],
    orcamento: { triangulos: 120, materiais: 0 },
    corPadrao: 'roxo',
  }),
];

export const IDS_DAS_PECAS: readonly string[] = PECAS.map((p) => p.id);
export const pecaPorId = (id: string): PecaDoCatalogo | undefined => PECAS.find((p) => p.id === id);

/** Peças que o aparelho mostra mesmo no tier fraco e no PiP. */
export const ehPecaDeAcessibilidade = (id: string): boolean => pecaPorId(id)?.acessibilidade === true;

/* ── Orçamento ───────────────────────────────────────────────────────────────────────────────── */

export const LIMITE_DE_PECAS = 8;

export interface OrcamentoDePecas {
  /** Quantas peças no máximo. */
  maxPecas: number;
  /** Soma dos triângulos extras. */
  triangulos: number;
  /** Peças decorativas aparecem? (As de acessibilidade aparecem sempre.) */
  decorativas: boolean;
}

export const ORCAMENTO_DE_PECAS: Record<TierDoAvatar, OrcamentoDePecas> = {
  fraco: { maxPecas: 4, triangulos: 1200, decorativas: false },
  medio: { maxPecas: 6, triangulos: 2000, decorativas: true },
  forte: { maxPecas: LIMITE_DE_PECAS, triangulos: 2600, decorativas: true },
};

export const triangulosDasPecas = (ids: readonly string[]): number =>
  ids.reduce((s, id) => s + (pecaPorId(id)?.orcamento.triangulos ?? 0), 0);

export const compativelComABase = (p: PecaDoCatalogo, origem: OrigemDePeca): boolean =>
  p.bases === 'todas' || p.bases.includes(origem);

/**
 * Valida uma lista de ids contra o catálogo: id desconhecido, repetido, peça incompatível com a base, duas peças
 * no mesmo lugar, mais que o limite e estouro do orçamento do tier (`forte` por padrão: a receita é portátil).
 */
export function validarPecas(
  ids: readonly string[],
  contexto: { origem?: OrigemDePeca; tier?: TierDoAvatar } = {},
): string[] {
  const erros: string[] = [];
  const orc = ORCAMENTO_DE_PECAS[contexto.tier ?? 'forte'];
  const vistos = new Set<string>();
  const lugares = new Map<LugarDaPeca, string>();
  for (const id of ids) {
    const p = pecaPorId(id);
    if (!p) {
      erros.push(`pecas: peça desconhecida "${id.slice(0, 30)}"`);
      continue;
    }
    if (vistos.has(id)) {
      erros.push(`pecas: peça repetida "${id}"`);
      continue;
    }
    vistos.add(id);
    if (contexto.origem && !compativelComABase(p, contexto.origem))
      erros.push(`pecas: "${id}" não combina com este modelo`);
    for (const lugar of p.lugares) {
      const ocupante = lugares.get(lugar);
      if (ocupante && ocupante !== id) erros.push(`pecas: "${id}" e "${ocupante}" usam o mesmo lugar`);
      else lugares.set(lugar, id);
    }
  }
  if (ids.length > orc.maxPecas) erros.push(`pecas: no máximo ${orc.maxPecas} peças`);
  if (triangulosDasPecas(ids) > orc.triangulos) erros.push('pecas: orçamento de triângulos estourado');
  return erros;
}

/**
 * O que o aparelho de fato monta num tier: tier fraco só tem acessibilidade; depois corta, na ordem da receita, o
 * que passa do limite de peças ou de triângulos do tier. Nunca lança.
 */
export function pecasParaOTier(
  ids: readonly string[],
  tier: TierDoAvatar,
): { usadas: string[]; cortadas: { id: string; motivo: 'tier' | 'orcamento' | 'desconhecida' }[] } {
  const orc = ORCAMENTO_DE_PECAS[tier];
  const usadas: string[] = [];
  const cortadas: { id: string; motivo: 'tier' | 'orcamento' | 'desconhecida' }[] = [];
  // A acessibilidade passa na frente quando falta orçamento: representação importa mais que enfeite.
  const candidatas = [...ids].sort(
    (a, b) => Number(ehPecaDeAcessibilidade(b)) - Number(ehPecaDeAcessibilidade(a)) || ids.indexOf(a) - ids.indexOf(b),
  );
  let tri = 0;
  for (const id of candidatas) {
    const p = pecaPorId(id);
    if (!p) cortadas.push({ id, motivo: 'desconhecida' });
    else if (!orc.decorativas && !p.acessibilidade) cortadas.push({ id, motivo: 'tier' });
    else if (usadas.length >= orc.maxPecas || tri + p.orcamento.triangulos > orc.triangulos)
      cortadas.push({ id, motivo: 'orcamento' });
    else {
      usadas.push(id);
      tri += p.orcamento.triangulos;
    }
  }
  // Devolve na ordem da receita (a ordem decide quem desenha por cima).
  return { usadas: ids.filter((id) => usadas.includes(id)), cortadas };
}
