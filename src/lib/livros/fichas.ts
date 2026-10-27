/**
 * AS FICHAS DOS LIVROS NO CLIENTE (`public/catalogo/fichas/<id>.json`, L4 de Livros & Leitura): o "parceiro de
 * leitura" grátis, estático e sob demanda — nada vai ao servidor do Frasy além do próprio arquivo.
 *
 * O ÍNDICE (`indice.json`) diz quem tem ficha, para a tela não pedir um arquivo que não existe; a ficha de cada livro só
 * é baixada quando a pessoa abre o livro ou a aba da ficha, e fica em memória nesta aba.
 *
 * QUEM VÊ O QUÊ é de `fichaParaLeitor` (`src/core/livros/ficha.ts`), a ÚNICA porta: o livro tem de estar visível para
 * quem lê (o menor não vê a ficha do livro que não pode ver), spoiler só a pedido, e o sensível só a partir de 16.
 * Ficha fora da forma (`validarFicha`) não aparece.
 */
import type { TetoDeClassificacao } from '../../core/livros/catalogo';
import { type FichaDoLivro, fichaParaLeitor, validarFicha } from '../../core/livros/ficha';

const PASTA = '/catalogo/fichas';

let indice: Promise<ReadonlySet<string>> | null = null;
const fichas = new Map<string, Promise<FichaDoLivro | null>>();

/** Os ids que têm ficha (uma vez por carga; falhou, a próxima chamada tenta de novo). */
export function idsComFicha(): Promise<ReadonlySet<string>> {
  indice ??= fetch(`${PASTA}/indice.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`índice das fichas indisponível (HTTP ${r.status})`);
      return r.json() as Promise<{ versao?: unknown; fichas?: unknown }>;
    })
    .then((j) => new Set(Array.isArray(j.fichas) ? j.fichas.filter((x): x is string => typeof x === 'string') : []))
    .catch((e) => {
      indice = null;
      throw e;
    });
  return indice;
}

/** A ficha crua e validada de um livro, ou `null` (sem ficha, ou fora da forma). */
async function fichaCrua(id: string): Promise<FichaDoLivro | null> {
  if (!(await idsComFicha()).has(id)) return null;
  let p = fichas.get(id);
  if (!p) {
    p = fetch(`${PASTA}/${encodeURIComponent(id)}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = validarFicha(j);
        return v.ok && v.ficha.livroId === id ? v.ficha : null;
      })
      .catch(() => {
        fichas.delete(id);
        return null;
      });
    fichas.set(id, p);
  }
  return p;
}

/**
 * A ficha como ESTA pessoa a vê, ou `null`. `livro` é o do catálogo (a classificação decide); `livroVisivel` responde
 * pelos livros do "leia também" (a tela passa a mesma régua da vitrine).
 */
export async function carregarFicha(
  livro: { id: string; classificacao?: unknown },
  o: { teto: TetoDeClassificacao; mostrarSpoilers: boolean; livroVisivel: (id: string) => boolean },
): Promise<FichaDoLivro | null> {
  const ficha = await fichaCrua(livro.id);
  return ficha ? fichaParaLeitor(ficha, livro, o) : null;
}
