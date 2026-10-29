/**
 * EXPORTAR E IMPORTAR A RECEITA (arquivo `.json` local). A receita é DADO: este módulo só lê texto, valida e devolve
 * uma cópia; nunca executa nada, nunca segue URL e nunca devolve o objeto recebido.
 *
 * Limites ANTES de qualquer `JSON.parse`: tamanho (16 KB em bytes UTF-8), profundidade de aninhamento (varredura
 * iterativa do texto, então um `[[[[…` de 16 KB não estoura a pilha) e URL em qualquer texto. Depois do parse, a
 * validação é a estrita de `validarReceita` (campo desconhecido, `__proto__`, NaN/Infinity, texto longo).
 *
 * A base só pode ser `colecao`, `familia` ou `importado`. Para `importado`, quem chama (a lib, que enxerga o
 * IndexedDB) confere se o arquivo existe neste aparelho: o core devolve `base.origem` e a UI avisa
 * "modelo não encontrado neste aparelho".
 */
import { validarPecas } from './pecas';
import { type ReceitaDeAvatar, validarReceita, VERSAO_ATUAL_DA_RECEITA, VERSAO_DA_RECEITA_COM_PECAS } from './receita';

export const LIMITES_DO_ARQUIVO = {
  /** Bytes (UTF-8) do texto. */
  bytes: 16 * 1024,
  /** Aninhamento máximo de `{}`/`[]` (a receita real tem 2). */
  profundidade: 6,
} as const;

export type ResultadoDaImportacao =
  | { ok: true; receita: ReceitaDeAvatar; avisos: AvisoDaImportacao[] }
  | { ok: false; erros: string[] };

export type AvisoDaImportacao = { codigo: 'pecas_removidas'; ids: string[] } | { codigo: 'versao_antiga' };

/** Bytes de um texto em UTF-8, sem `TextEncoder` (o core não depende de DOM). */
export function bytesEmUtf8(texto: string): number {
  let n = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4; // par substituto: 4 bytes no total
      i += 1;
    } else n += 3;
  }
  return n;
}

/** Maior aninhamento de `{`/`[` fora de strings. Iterativo e O(n). */
function profundidadeDoTexto(texto: string): number {
  let atual = 0;
  let maior = 0;
  let dentro = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (dentro) {
      if (c === '\\') i += 1;
      else if (c === '"') dentro = false;
    } else if (c === '"') dentro = true;
    else if (c === '{' || c === '[') {
      atual += 1;
      if (atual > maior) maior = atual;
    } else if (c === '}' || c === ']') atual -= 1;
  }
  return maior;
}

/** Texto que parece endereço (esquema com `://`, `javascript:`, `data:`, `file:`, `//host`). */
const PARECE_URL = /(?:^|[^a-z0-9])(?:[a-z][a-z0-9+.-]{1,20}:\/\/|javascript:|data:|file:|blob:)|^\/\/|\bwww\./i;

function acharUrl(valor: unknown, nivel = 0): boolean {
  if (nivel > LIMITES_DO_ARQUIVO.profundidade + 2) return true;
  if (typeof valor === 'string') return PARECE_URL.test(valor);
  if (Array.isArray(valor)) return valor.some((v) => acharUrl(v, nivel + 1));
  if (valor && typeof valor === 'object')
    return Object.entries(valor).some(([k, v]) => PARECE_URL.test(k) || acharUrl(v, nivel + 1));
  return false;
}

/**
 * Leva uma receita (v1 ou v2) à v2: tira as peças que o catálogo não conhece, repete ou que brigam por lugar (na
 * v1 elas eram ids soltos que nada desenhava). Devolve a lista do que saiu para a UI avisar.
 */
export function migrarReceitaParaV2(r: ReceitaDeAvatar): { receita: ReceitaDeAvatar; removidas: string[] } {
  const mantidas: string[] = [];
  const removidas: string[] = [];
  for (const id of r.pecas) {
    if (validarPecas([...mantidas, id], { origem: r.base.origem }).length === 0) mantidas.push(id);
    else removidas.push(id);
  }
  const cores: Record<string, string> = {};
  for (const [id, cor] of Object.entries(r.coresDasPecas ?? {})) if (mantidas.includes(id)) cores[id] = cor;
  return {
    receita: {
      versao: VERSAO_DA_RECEITA_COM_PECAS,
      base: { ...r.base },
      paleta: { ...r.paleta },
      pecas: mantidas,
      coresDasPecas: cores,
      ajustes: { ...r.ajustes },
      meta: { ...r.meta },
    },
    removidas,
  };
}

/** Copia com as chaves em ordem alfabética (listas mantêm a ordem: ela é a das peças). */
function canonizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonizar);
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, canonizar(o[k])]),
    );
  }
  return valor;
}

/** O JSON canônico da receita: sempre v2, chaves ordenadas, sem campo extra, uma quebra de linha no fim. */
export function exportarReceita(receita: ReceitaDeAvatar): string {
  const v2 = receita.versao === VERSAO_ATUAL_DA_RECEITA ? receita : migrarReceitaParaV2(receita).receita;
  // Passa pela validação: o que sai do app tem de entrar de volta.
  const r = validarReceita(v2);
  if ('erros' in r) throw new Error(`receita inválida: ${r.erros.join('; ')}`);
  return `${JSON.stringify(canonizar(r.receita), null, 2)}\n`;
}

const erro = (...erros: string[]): ResultadoDaImportacao => ({ ok: false, erros });

/** Lê o texto de um arquivo de receita. Nunca lança. */
export function importarReceita(texto: unknown): ResultadoDaImportacao {
  try {
    if (typeof texto !== 'string') return erro('arquivo: precisa ser texto');
    if (texto.length > LIMITES_DO_ARQUIVO.bytes || bytesEmUtf8(texto) > LIMITES_DO_ARQUIVO.bytes)
      return erro('arquivo: grande demais para uma receita (máximo 16 KB)');
    if (profundidadeDoTexto(texto) > LIMITES_DO_ARQUIVO.profundidade) return erro('arquivo: aninhamento demais');
    let bruto: unknown;
    try {
      bruto = JSON.parse(texto);
    } catch {
      return erro('arquivo: não é um JSON válido');
    }
    if (acharUrl(bruto)) return erro('arquivo: endereços externos não são aceitos em uma receita');
    const lida = validarReceita(bruto);
    if ('erros' in lida) return { ok: false, erros: lida.erros };
    const avisos: AvisoDaImportacao[] = [];
    if (lida.receita.versao === VERSAO_ATUAL_DA_RECEITA) return { ok: true, receita: lida.receita, avisos };
    avisos.push({ codigo: 'versao_antiga' });
    const { receita, removidas } = migrarReceitaParaV2(lida.receita);
    if (removidas.length > 0) avisos.push({ codigo: 'pecas_removidas', ids: removidas });
    return { ok: true, receita, avisos };
  } catch {
    return erro('arquivo: ilegível');
  }
}
