/**
 * "BAIXAR CÓPIA DO ARQUIVO": devolve à pessoa, byte a byte, o arquivo que ela trouxe (guardado no aparelho em
 * "Meus livros"). Nada passa pelo servidor. Livros do catálogo não entram aqui (a fonte é quem os distribui).
 */
import { lerConteudo, lerDaMemoria, type MeuLivro } from './meusLivros';

/** Baixa um `Blob` com este nome (âncora temporária; a URL é revogada logo depois). */
export function baixarBlob(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const EXTENSAO_POR_FORMATO: Record<string, string> = {
  epub: 'epub',
  pdf: 'pdf',
  mobi: 'mobi',
  fb2: 'fb2',
  cbz: 'cbz',
  docx: 'docx',
  txt: 'txt',
  html: 'html',
  md: 'md',
};

/** Tira o que o sistema de arquivos não aceita no nome, sem mexer nas letras com acento. */
export const nomeSeguroDeArquivo = (nome: string) =>
  nome
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'livro';

export interface CopiaDoLivro {
  blob: Blob;
  nome: string;
}

/**
 * A cópia fiel do arquivo de um livro trazido, ou `null` (o conteúdo saiu do aparelho, ou o livro veio por link
 * de página e nunca teve arquivo).
 */
export async function copiaFielDoLivro(
  livro: Pick<MeuLivro, 'id' | 'titulo' | 'formato'>,
): Promise<CopiaDoLivro | null> {
  const c = lerDaMemoria(livro.id) ?? (await lerConteudo(livro.id));
  const blob = c?.arquivo?.size ? c.arquivo : c?.copia?.size ? c.copia : null;
  if (!blob) return null;
  const extensao = EXTENSAO_POR_FORMATO[livro.formato ?? ''] ?? 'bin';
  return { blob, nome: nomeSeguroDeArquivo(c?.nomeDoArquivo || `${livro.titulo}.${extensao}`) };
}

/** Baixa a cópia; devolve `false` quando não há o que baixar. */
export async function baixarCopiaDoLivro(livro: Pick<MeuLivro, 'id' | 'titulo' | 'formato'>): Promise<boolean> {
  const copia = await copiaFielDoLivro(livro);
  if (!copia) return false;
  baixarBlob(copia.blob, copia.nome);
  return true;
}
