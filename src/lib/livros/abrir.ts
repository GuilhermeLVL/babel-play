/**
 * `abrirLivroNoLeitor(livro)` — A PORTA DO LEITOR (L2), chamada pelo catálogo (L1), pela estante do leitor
 * e pela Leitura antiga ("Abrir no leitor"). Substitui o ponto de encontro provisório da L1: a mesma função,
 * agora levando ao leitor de verdade.
 *
 * Entra um livro do catálogo (com as URLs dos formatos) ou um arquivo da pessoa; sai o leitor aberto em
 * `/leitor/<livroId>`, com o arquivo guardado no IndexedDB (`armazem.ts`) para reabrir sem rede e depois de
 * recarregar a página.
 *
 *  · CATÁLOGO: Standard Ebooks e Wikisource são baixados DO NAVEGADOR por CORS (nada passa pelo servidor do
 *    Frasy); a cópia curada do Gutenberg vem da URL pública do R2. Sem cookie (`credentials: 'omit'`).
 *  · ARQUIVO DA PESSOA (EPUB, PDF ou TXT): lido e guardado só no aparelho — NUNCA vai ao servidor. O id é o
 *    hash do conteúdo (`arq:<sha-256>`): o mesmo arquivo trazido de novo cai nas mesmas anotações.
 *  · SESSÃO `document` da Leitura antiga: vira um livro de texto (`abrirSessaoNoLeitor`).
 */
import { ehLivroId } from '../../core/leitura/anotacao';
import { reconhecerPeloConteudo } from '../../core/livros/formatos';
import { navegarPara } from '../rotas';
import { estante, type FormatoDoLivro, type LivroGuardado } from './armazem';

/** As fontes do catálogo (as mesmas do filtro legal da L1). */
export type FonteDoCatalogo = 'standard-ebooks' | 'wikisource' | 'gutenberg-curado' | 'internet-archive-aberto';

export interface LivroComFormatos {
  id: string;
  titulo: string;
  autores?: Array<{ nome: string } | string>;
  idioma?: string;
  fonte: FonteDoCatalogo | string;
  /** As URLs de cada formato. EPUB é o preferido; PDF e TXT, se não houver EPUB. */
  formatos: { epub?: string; pdf?: string; txt?: string };
  /** A linha de crédito ("Texto de domínio público obtido do Project Gutenberg"). */
  credito?: string;
}

/** Teto do arquivo (catálogo ou da pessoa): um EPUB ilustrado grande tem dezenas de MB. */
export const MAX_BYTES_DO_LIVRO = 150 * 1024 * 1024;

export class ErroAoAbrirLivro extends Error {
  constructor(
    readonly code: 'formato' | 'grande' | 'rede' | 'sem_formato' | 'vazio',
    mensagem: string,
  ) {
    super(mensagem);
  }
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** O id de um arquivo da pessoa: 32 hex do SHA-256 do conteúdo. */
export async function idDoArquivo(bytes: ArrayBuffer): Promise<string> {
  return `arq:${hex(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 32)}`;
}

/** O formato pelo conteúdo (assinatura), e não pelo nome: `.epub` renomeado de outra coisa não engana. */
export function formatoDosBytes(cabeca: Uint8Array, nome = ''): FormatoDoLivro | null {
  const r = reconhecerPeloConteudo(cabeca, nome);
  if (!r.ok) return /\.(txt|text|md)$/i.test(nome) ? 'txt' : null;
  /* Um zip aqui é tratado como EPUB; quem trouxe pela tela "Trazer o seu" já sabe o formato (CBZ, por exemplo). */
  if (r.formato === 'zip') return 'epub';
  if (r.formato === 'epub' || r.formato === 'pdf' || r.formato === 'mobi' || r.formato === 'fb2' || r.formato === 'cbz')
    return r.formato;
  return /\.(txt|text|md)$/i.test(nome) ? 'txt' : null;
}

const nomeDoAutor = (a: { nome: string } | string) => (typeof a === 'string' ? a : a.nome);

/** O id do livro do catálogo como chave segura (o id da L1, ou um derivado dele). */
export function idDoCatalogo(id: string): string {
  const candidato = id.startsWith('cat:') ? id : `cat:${id}`;
  return ehLivroId(candidato) ? candidato : `cat:${encodeURIComponent(id).replace(/%/g, '_').slice(0, 110)}`;
}

async function baixar(url: string): Promise<Blob> {
  let r: Response;
  try {
    r = await fetch(url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
  } catch {
    throw new ErroAoAbrirLivro('rede', 'não consegui baixar o livro');
  }
  if (!r.ok) throw new ErroAoAbrirLivro('rede', `a fonte respondeu ${r.status}`);
  const tamanho = Number(r.headers.get('content-length') ?? 0);
  if (tamanho > MAX_BYTES_DO_LIVRO) throw new ErroAoAbrirLivro('grande', 'o livro é grande demais');
  const blob = await r.blob();
  if (blob.size > MAX_BYTES_DO_LIVRO) throw new ErroAoAbrirLivro('grande', 'o livro é grande demais');
  return blob;
}

/** Prepara o livro (baixa ou lê, e guarda no aparelho) sem navegar. Devolve o id. Exportada para o teste. */
export async function prepararLivro(livro: LivroComFormatos | File, agora = Date.now()): Promise<string> {
  if (livro instanceof Blob) {
    const arquivo = livro as File;
    if (!arquivo.size) throw new ErroAoAbrirLivro('vazio', 'o arquivo está vazio');
    if (arquivo.size > MAX_BYTES_DO_LIVRO) throw new ErroAoAbrirLivro('grande', 'o arquivo é grande demais');
    const bytes = await arquivo.arrayBuffer();
    const formato = formatoDosBytes(new Uint8Array(bytes.slice(0, 8)), arquivo.name);
    if (!formato) throw new ErroAoAbrirLivro('formato', 'formato não suportado (use EPUB, PDF, MOBI, FB2, CBZ ou TXT)');
    const livroId = await idDoArquivo(bytes);
    const ja = await estante.livro(livroId);
    if (!ja) {
      await estante.guardarLivro({
        livroId,
        titulo: arquivo.name.replace(/\.(epub|pdf|txt|text|md)$/i, '') || arquivo.name,
        formato,
        origem: 'usuario',
        arquivo: new Blob([bytes], { type: arquivo.type || mimeDe(formato) }),
        nomeDoArquivo: arquivo.name,
        adicionadoEm: agora,
        abertoEm: agora,
      });
    }
    return livroId;
  }
  const livroId = idDoCatalogo(livro.id);
  if (await estante.livro(livroId)) return livroId;
  const formato: FormatoDoLivro | null = livro.formatos.epub
    ? 'epub'
    : livro.formatos.pdf
      ? 'pdf'
      : livro.formatos.txt
        ? 'txt'
        : null;
  if (!formato) throw new ErroAoAbrirLivro('sem_formato', 'o livro não tem arquivo para abrir');
  const blob = await baixar(livro.formatos[formato]!);
  const guardado: LivroGuardado = {
    livroId,
    titulo: livro.titulo,
    autor: livro.autores?.map(nomeDoAutor).join(', ') || undefined,
    idioma: livro.idioma,
    formato,
    origem: 'catalogo',
    credito: livro.credito,
    dominioPublico: true,
    arquivo: blob,
    nomeDoArquivo: `${livroId.replace(/[^a-z0-9-]+/gi, '-')}.${formato}`,
    adicionadoEm: agora,
    abertoEm: agora,
  };
  await estante.guardarLivro(guardado);
  return livroId;
}

export const MIME_DO_FORMATO: Record<FormatoDoLivro, string> = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  mobi: 'application/x-mobipocket-ebook',
  fb2: 'application/x-fictionbook+xml',
  cbz: 'application/vnd.comicbook+zip',
  txt: 'text/plain',
};
const mimeDe = (f: FormatoDoLivro) => MIME_DO_FORMATO[f];

/** O que o catálogo (L1) passa: o id do livro (do catálogo ou o `meu-…` de um livro trazido). */
export interface LivroParaAbrir {
  id: string;
}

/**
 * Abre o livro no leitor.
 *  · `{ id }` do catálogo (L1) ou de "Meus livros" → `/livros/<id>/ler`, que monta o leitor sobre o livro do
 *    catálogo (`LeitorDoCatalogo`). Quem chama, na L1, não muda;
 *  · um arquivo do aparelho → guardado na estante e aberto em `/leitor/<arq:hash>`.
 */
export async function abrirLivroNoLeitor(livro: LivroParaAbrir | File): Promise<{ livroId: string }> {
  if (!(livro instanceof Blob)) {
    navegarPara({ view: 'livros', livroId: livro.id, lendo: true });
    return { livroId: livro.id };
  }
  const livroId = await prepararLivro(livro);
  await estante.marcarAberto(livroId);
  navegarPara({ view: 'leitor', livroId });
  return { livroId };
}

/** O detalhe de um livro do catálogo (créditos, licença, nível, "Ler"). */
export function abrirDetalheDoLivro(livro: LivroParaAbrir): void {
  navegarPara({ view: 'livros', livroId: livro.id });
}

/** De volta ao catálogo. */
export function voltarAoCatalogo(): void {
  navegarPara({ view: 'livros' });
}

/** O id de uma sessão `document` aberta no leitor. */
export const idDaSessao = (sessionId: string) => `sessao:${sessionId}`.slice(0, 120);

/**
 * Abre uma sessão `kind:'document'` da Leitura antiga no leitor. O texto vem do servidor quando o leitor
 * monta (`fontesDoLivro.ts`): aqui só se registra o livro na estante para "continuar lendo".
 */
export async function abrirSessaoNoLeitor(
  sessionId: string,
  titulo: string,
  agora = Date.now(),
): Promise<{ livroId: string }> {
  const livroId = idDaSessao(sessionId);
  const ja = await estante.livro(livroId);
  await estante.guardarLivro({
    livroId,
    titulo: titulo || ja?.titulo || 'Documento',
    formato: 'txt',
    origem: 'sessao',
    arquivo: new Blob([]),
    nomeDoArquivo: `${sessionId}.txt`,
    adicionadoEm: ja?.adicionadoEm ?? agora,
    abertoEm: agora,
  });
  navegarPara({ view: 'leitor', livroId });
  return { livroId };
}
