/**
 * A SELEÇÃO EM MASSA da aba Palavras (openspec `cartoes` 6.2b; flag `estudo_palavras_v2`): as ações que valem para vários
 * cartões de uma vez e as regras puras, as mesmas no navegador e no servidor (que não confia no cliente).
 *
 * "Mover" (de baralho) NÃO entra: o baralho de um cartão é a origem dele (idioma, sessão, Anki, Trilha), não um campo que a
 * pessoa troque; sem decisão do dono sobre baralhos do usuário, mover seria inventar dado. "Exportar" é do navegador
 * (`lib/palavras/exportarSelecao.ts`) e não passa por aqui.
 */
import { MAX_ETIQUETAS, normalizarEtiquetas } from '../vocabulario/etiquetasDoUsuario';

/** O teto de cartões por pedido: o do prompt da tarefa (lote de 50). */
export const LIMITE_DO_LOTE = 50;

export type AcaoEmLote =
  | { acao: 'suspender' }
  | { acao: 'retomar' }
  | { acao: 'etiquetar'; adicionar: string[]; remover: string[] };

/** Ids sem repetição, na ordem em que chegaram. */
export function idsDoLote(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * As etiquetas de UM cartão depois de adicionar e remover. `null` se alguma etiqueta pedida é inválida ou se o cartão
 * passaria de 10: o pedido inteiro é recusado (400), nunca cortado em silêncio.
 */
export function etiquetasDepoisDoLote(
  atuais: readonly string[],
  adicionar: readonly string[],
  remover: readonly string[],
): string[] | null {
  const add = normalizarEtiquetas(adicionar);
  const rem = normalizarEtiquetas(remover);
  if (!add.ok || !rem.ok) return null;
  const tirar = new Set(rem.etiquetas);
  const resultado = atuais.filter((e) => !tirar.has(e));
  for (const e of add.etiquetas) if (!resultado.includes(e)) resultado.push(e);
  return resultado.length > MAX_ETIQUETAS ? null : resultado;
}
