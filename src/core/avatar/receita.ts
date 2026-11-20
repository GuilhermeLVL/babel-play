/**
 * A RECEITA DO AVATAR: o avatar salvo é DADO (JSON versionado), nunca código nem arquivo de terceiros.
 *
 * Validação ESTRITA e de saída nova: `validarReceita` não devolve o objeto recebido, devolve uma CÓPIA
 * montada campo a campo. Campo desconhecido, tipo errado, número fora da faixa, texto longo ou `__proto__`
 * são recusados com a lista dos motivos. Núcleo puro: sem DOM, sem rede, sem `URL`/`TextDecoder`.
 *
 * Não entram na receita: foto, URL de terceiros, dado biográfico. O arquivo do "traga o seu" vive só no
 * IndexedDB (`origem: 'importado'`); a receita guarda apenas o id local dele.
 */

import { ehCorDePeca, validarPecas } from './pecas';

/** `1`: a receita original (peças só como ids soltos, nada as desenha). `2` (M6): peças do catálogo + cor por peça. */
export const VERSAO_DA_RECEITA = 1 as const;
export const VERSAO_DA_RECEITA_COM_PECAS = 2 as const;
/** A versão que o app grava e exporta. A 1 continua lida (e migrada com `migrarReceitaParaV2`). */
export const VERSAO_ATUAL_DA_RECEITA = VERSAO_DA_RECEITA_COM_PECAS;

export type OrigemDaBase = 'familia' | 'colecao' | 'importado';
export const ORIGENS_DA_BASE: readonly OrigemDaBase[] = ['familia', 'colecao', 'importado'];

export const FAIXAS_DE_AJUSTE = {
  escala: { min: 0.7, max: 1.3 },
  altura: { min: 0.8, max: 1.2 },
  largura: { min: 0.8, max: 1.2 },
} as const;
export type ChaveDeAjuste = keyof typeof FAIXAS_DE_AJUSTE;

export interface ReceitaDeAvatar {
  versao: typeof VERSAO_DA_RECEITA | typeof VERSAO_DA_RECEITA_COM_PECAS;
  base: { origem: OrigemDaBase; id: string };
  /** Tokens de paleta (ids, nunca cor crua): pele, cabelo e olhos. */
  paleta: { pele: string; cabelo: string; olhos: string };
  /** Ids de peças do catálogo (`pecas.ts`), na ordem em que são desenhadas. Na v2, só ids que o catálogo conhece. */
  pecas: string[];
  /** v2: cor de cada peça (id da peça para id de `CORES_DE_PECA`). Ausente = cores de fábrica. */
  coresDasPecas?: Record<string, string>;
  /** Ajustes numéricos, cada um com faixa própria. Chave fora de `FAIXAS_DE_AJUSTE` é recusada. */
  ajustes: Partial<Record<ChaveDeAjuste, number>>;
  meta: { nome: string; criadoEm: number };
}

export const LIMITES_DA_RECEITA = {
  tamanhoDoId: 64,
  maxPecas: 24,
  tamanhoDoNome: 40,
  /** Teto de `criadoEm` (ms): ano ~2286, longe do limite seguro de inteiro. */
  maxCriadoEm: 10_000_000_000_000,
  maxErros: 20,
} as const;

export type ResultadoDaReceita = { ok: true; receita: ReceitaDeAvatar } | { ok: false; erros: string[] };

const ID = /^[a-z0-9][a-z0-9_-]*$/;
// eslint-disable-next-line no-control-regex -- recusar caractere de controle no nome é o ponto
const CONTROLE = /[\u0000-\u001f\u007f]/;

type Bruto = Record<string, unknown>;

const objetoPuro = (v: unknown): v is Bruto => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

const idValido = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= LIMITES_DA_RECEITA.tamanhoDoId && ID.test(v);

const temPropria = (o: Bruto, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** Chaves próprias (inclui `__proto__` quando veio de `JSON.parse`, que a cria como propriedade própria). */
function soChaves(o: Bruto, permitidas: readonly string[], caminho: string, erros: string[]) {
  for (const k of Reflect.ownKeys(o).map(String)) {
    if (!permitidas.includes(k)) erros.push(`${caminho}: campo desconhecido "${k.slice(0, 30)}"`);
  }
}

function lerBase(v: unknown, erros: string[]): ReceitaDeAvatar['base'] | null {
  if (!objetoPuro(v)) {
    erros.push('base: precisa ser um objeto');
    return null;
  }
  soChaves(v, ['origem', 'id'], 'base', erros);
  const origemOk = typeof v.origem === 'string' && (ORIGENS_DA_BASE as readonly string[]).includes(v.origem);
  if (!origemOk) erros.push('base.origem: precisa ser familia, colecao ou importado');
  if (!idValido(v.id)) erros.push('base.id: id inválido');
  return origemOk && idValido(v.id) ? { origem: v.origem as OrigemDaBase, id: v.id } : null;
}

function lerPaleta(v: unknown, erros: string[]): ReceitaDeAvatar['paleta'] | null {
  if (!objetoPuro(v)) {
    erros.push('paleta: precisa ser um objeto');
    return null;
  }
  soChaves(v, ['pele', 'cabelo', 'olhos'], 'paleta', erros);
  const { pele, cabelo, olhos } = v;
  if (!idValido(pele)) erros.push('paleta.pele: id inválido');
  if (!idValido(cabelo)) erros.push('paleta.cabelo: id inválido');
  if (!idValido(olhos)) erros.push('paleta.olhos: id inválido');
  return idValido(pele) && idValido(cabelo) && idValido(olhos) ? { pele, cabelo, olhos } : null;
}

function lerPecas(v: unknown, erros: string[]): string[] | null {
  if (!Array.isArray(v)) {
    erros.push('pecas: precisa ser uma lista');
    return null;
  }
  if (v.length > LIMITES_DA_RECEITA.maxPecas) {
    erros.push(`pecas: no máximo ${LIMITES_DA_RECEITA.maxPecas}`);
    return null;
  }
  if (!v.every(idValido)) {
    erros.push('pecas: id inválido na lista');
    return null;
  }
  return [...new Set(v as string[])];
}

function lerCoresDasPecas(v: unknown, pecas: string[], erros: string[]): Record<string, string> | null {
  if (!objetoPuro(v)) {
    erros.push('coresDasPecas: precisa ser um objeto');
    return null;
  }
  const saida: Record<string, string> = {};
  let ok = true;
  for (const k of Reflect.ownKeys(v).map(String)) {
    if (!pecas.includes(k)) {
      erros.push(`coresDasPecas: "${k.slice(0, 30)}" não é uma peça da receita`);
      ok = false;
    } else if (!ehCorDePeca(v[k])) {
      erros.push(`coresDasPecas.${k}: cor desconhecida`);
      ok = false;
    } else saida[k] = v[k] as string;
  }
  return ok ? saida : null;
}

function lerAjustes(v: unknown, erros: string[]): ReceitaDeAvatar['ajustes'] | null {
  if (!objetoPuro(v)) {
    erros.push('ajustes: precisa ser um objeto');
    return null;
  }
  soChaves(v, Object.keys(FAIXAS_DE_AJUSTE), 'ajustes', erros);
  const saida: ReceitaDeAvatar['ajustes'] = {};
  for (const k of Object.keys(FAIXAS_DE_AJUSTE) as ChaveDeAjuste[]) {
    if (!temPropria(v, k)) continue;
    const n = v[k];
    const { min, max } = FAIXAS_DE_AJUSTE[k];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      erros.push(`ajustes.${k}: número entre ${min} e ${max}`);
    else saida[k] = n;
  }
  return saida;
}

function lerMeta(v: unknown, erros: string[]): ReceitaDeAvatar['meta'] | null {
  if (!objetoPuro(v)) {
    erros.push('meta: precisa ser um objeto');
    return null;
  }
  soChaves(v, ['nome', 'criadoEm'], 'meta', erros);
  const { nome, criadoEm } = v;
  const max = LIMITES_DA_RECEITA.tamanhoDoNome;
  // Testa o comprimento ANTES de qualquer regex: um texto de 1 MB é recusado em O(1).
  const nomeOk =
    typeof nome === 'string' && nome.length <= max * 4 && !CONTROLE.test(nome) && nome.trim().length <= max;
  if (!nomeOk) erros.push(`meta.nome: texto de até ${max} caracteres, sem controle`);
  const dataOk =
    typeof criadoEm === 'number' &&
    Number.isInteger(criadoEm) &&
    criadoEm >= 0 &&
    criadoEm <= LIMITES_DA_RECEITA.maxCriadoEm;
  if (!dataOk) erros.push('meta.criadoEm: inteiro em milissegundos');
  return nomeOk && dataOk ? { nome: (nome as string).trim(), criadoEm } : null;
}

function validar(entrada: unknown): ResultadoDaReceita {
  if (!objetoPuro(entrada)) return { ok: false, erros: ['receita: precisa ser um objeto'] };
  const erros: string[] = [];
  const v2 = entrada.versao === VERSAO_DA_RECEITA_COM_PECAS;
  soChaves(
    entrada,
    ['versao', 'base', 'paleta', 'pecas', 'ajustes', 'meta', ...(v2 ? ['coresDasPecas'] : [])],
    'receita',
    erros,
  );

  if (entrada.versao !== VERSAO_DA_RECEITA && !v2) {
    const futura = typeof entrada.versao === 'number' && Number.isFinite(entrada.versao) && entrada.versao > 2;
    erros.push(futura ? 'versao: receita de uma versão mais nova que este app' : 'versao: precisa ser 1 ou 2');
  }
  const base = lerBase(entrada.base, erros);
  const paleta = lerPaleta(entrada.paleta, erros);
  const pecas = lerPecas(entrada.pecas, erros);
  // v2: as peças valem contra o catálogo (id desconhecido, incompatível, lugar repetido, orçamento).
  if (v2 && pecas) {
    const problemas = validarPecas(pecas, base ? { origem: base.origem } : {});
    if (problemas.length > 0) erros.push(...problemas);
  }
  const cores =
    v2 && pecas && temPropria(entrada, 'coresDasPecas') ? lerCoresDasPecas(entrada.coresDasPecas, pecas, erros) : {};
  const ajustes = lerAjustes(entrada.ajustes, erros);
  const meta = lerMeta(entrada.meta, erros);

  if (erros.length > 0 || !base || !paleta || !pecas || !ajustes || !meta || !cores)
    return { ok: false, erros: erros.slice(0, LIMITES_DA_RECEITA.maxErros) };
  if (!v2) return { ok: true, receita: { versao: VERSAO_DA_RECEITA, base, paleta, pecas, ajustes, meta } };
  return {
    ok: true,
    receita: { versao: VERSAO_DA_RECEITA_COM_PECAS, base, paleta, pecas, coresDasPecas: cores, ajustes, meta },
  };
}

/** Nunca lança: um getter ou um Proxy hostil vira "ilegível". */
export function validarReceita(entrada: unknown): ResultadoDaReceita {
  try {
    return validar(entrada);
  } catch {
    return { ok: false, erros: ['receita: ilegível'] };
  }
}
