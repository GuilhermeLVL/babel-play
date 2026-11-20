/**
 * "BAIXAR EPUB" DO CATÁLOGO: só a Standard Ebooks (CC0) oferece o arquivo, e como LINK DIRETO à fonte (o Frasy
 * não copia nem hospeda). Gutenberg e Wikisource ficam de fora: a tradução tem direito próprio e o prazo é de
 * 70 anos (LDA arts. 14 e 41). Sem `URL` (o núcleo não tem DOM): o host é conferido por padrão de texto.
 */
const PADRAO = /^https:\/\/standardebooks\.org\/ebooks\/[A-Za-z0-9_./-]+\.epub(\?[A-Za-z0-9_=&.-]*)?$/;

export function epubParaBaixar(livro: { fonte: string; formatos: { epub?: string } }): string | null {
  const url = livro.formatos.epub;
  if (livro.fonte !== 'standard-ebooks' || !url || !PADRAO.test(url)) return null;
  const base = url.split('?')[0];
  return `${base}?source=download`;
}
