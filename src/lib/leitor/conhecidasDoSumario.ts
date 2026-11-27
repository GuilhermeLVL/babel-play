/**
 * A % DE PALAVRAS CONHECIDAS DE CADA CAPÍTULO ANTES DE ABRI-LO (openspec `leitura-assistida`, tarefa C4; flag
 * `leitor_destaque_vocab`). Tudo no aparelho: lê o texto de cada seção pelo `createDocument` do livro (o mesmo caminho
 * limpo da busca e da reancoragem; o capítulo NÃO é aberto na tela) e conta com o vocabulário da pessoa. Uma seção por
 * fatia, cedendo o fio entre elas, e cancelável (a pessoa fechou o painel ou mudou o que sabe).
 */
import { porcentagemDeConhecidasDoTexto } from '../../core/leitura/conhecidasDoTexto';
import { type FonteDeVocabulario } from '../../core/leitura/destaqueDeVocabulario';
import type { ItemDoSumario, LivroDoFoliate } from './foliate/view.js';

/** Quantas seções um livro pode ter para valer a conta (acima disso o painel não mostra a %; protege livros enormes). */
export const MAXIMO_DE_SECOES = 400;

const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

/** O índice da seção de um `href` do sumário, ou `null` (link fora do livro, ou o livro não sabe resolver). */
export function indiceDoHref(livro: LivroDoFoliate, href: string): number | null {
  try {
    const r = livro.resolveHref?.(href) as { index?: unknown } | null | undefined;
    return typeof r?.index === 'number' && r.index >= 0 ? r.index : null;
  } catch {
    return null;
  }
}

function achatar(itens: readonly ItemDoSumario[], saida: ItemDoSumario[] = []): ItemDoSumario[] {
  for (const i of itens) {
    saida.push(i);
    if (i.subitems?.length) achatar(i.subitems, saida);
  }
  return saida;
}

/** O texto de uma seção (vazio se ela não tem documento). */
export async function textoDaSecao(livro: LivroDoFoliate, indice: number): Promise<string> {
  try {
    const doc = await livro.sections[indice]?.createDocument?.();
    return doc?.body?.textContent ?? doc?.documentElement?.textContent ?? '';
  } catch {
    return '';
  }
}

/**
 * A % de conhecidas por `href` do sumário. Itens que apontam para a mesma seção dividem a conta. Seção curta demais (ou
 * sem texto) fica de fora do mapa: sem número, sem chute. `aoProgredir` recebe o mapa parcial a cada seção pronta.
 */
export async function conhecidasPorItemDoSumario(o: {
  livro: LivroDoFoliate;
  sumario: readonly ItemDoSumario[];
  idioma: string;
  fonte: FonteDeVocabulario;
  cancelado: () => boolean;
  aoProgredir?: (parcial: ReadonlyMap<string, number>) => void;
}): Promise<Map<string, number>> {
  const saida = new Map<string, number>();
  if (!o.idioma || o.livro.sections.length > MAXIMO_DE_SECOES) return saida;
  const porSecao = new Map<number, number | null>();
  for (const item of achatar(o.sumario)) {
    if (o.cancelado()) return saida;
    if (!item.href) continue;
    const indice = indiceDoHref(o.livro, item.href);
    if (indice === null) continue;
    if (!porSecao.has(indice)) {
      const texto = await textoDaSecao(o.livro, indice);
      porSecao.set(indice, porcentagemDeConhecidasDoTexto(texto, o.idioma, o.fonte));
      await ceder();
      if (o.cancelado()) return saida;
    }
    const p = porSecao.get(indice);
    if (p != null) {
      saida.set(item.href, p);
      o.aoProgredir?.(saida);
    }
  }
  return saida;
}

/** A % de conhecidas do livro inteiro (as seções somadas por palavra, não a média das %), ou `null` sem dados. */
export async function conhecidasDoLivro(o: {
  livro: LivroDoFoliate;
  idioma: string;
  fonte: FonteDeVocabulario;
  cancelado: () => boolean;
}): Promise<number | null> {
  if (!o.idioma || o.livro.sections.length > MAXIMO_DE_SECOES) return null;
  const partes: string[] = [];
  for (let i = 0; i < o.livro.sections.length; i++) {
    partes.push(await textoDaSecao(o.livro, i));
    await ceder();
    if (o.cancelado()) return null;
  }
  return porcentagemDeConhecidasDoTexto(partes.join('\n\n'), o.idioma, o.fonte);
}
