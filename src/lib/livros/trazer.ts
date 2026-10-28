/**
 * "TRAZER O SEU" no navegador: ler o arquivo escolhido (ou baixado de um link) e entregar capítulos de texto.
 * Nada daqui vai ao servidor: o arquivo é lido na memória do aparelho e o link é baixado DIRETO pelo
 * navegador, sem cookie (`credentials: 'omit'`), só de um host da lista (`HOSTS_DE_LIVRO_POR_LINK`).
 */
import type { CapituloDeTexto } from '../../core/livros/epub';
import {
  ErroDoLivro,
  formatoPeloConteudo,
  type FormatoTrazido,
  HOSTS_DE_LIVRO_POR_LINK,
  type MotivoDoErro,
  TETO_DO_LINK_EM_BYTES,
} from '../../core/livros/trazer';
import { extrairEpub } from '../import/epub';
import { extrairDocumento } from '../import/extrairDocumento';

const EXTENSAO_DE_LIVRO = /\.(epub|pdf|txt)$/i;

export type MotivoDoLink = 'invalido' | 'pagina' | 'release' | 'host';

/** Forma plana (sem união): `motivo` nulo = o link vale e `url` e `formato` estão preenchidos. */
export interface LinkDeLivro {
  ok: boolean;
  url: string;
  formato: FormatoTrazido | null;
  motivo: MotivoDoLink | null;
}

const recusa = (motivo: MotivoDoLink): LinkDeLivro => ({ ok: false, url: '', formato: null, motivo });

/** Valida o que a pessoa colou. Nunca devolve uma URL fora de `HOSTS_DE_LIVRO_POR_LINK`. */
export function validarLinkDeLivro(bruto: string): LinkDeLivro {
  let u: URL;
  let caminho: string;
  try {
    u = new URL(bruto.trim());
    caminho = decodeURIComponent(u.pathname);
  } catch {
    return recusa('invalido');
  }
  if (u.protocol !== 'https:' || u.username || u.password) return recusa('invalido');
  const host = u.hostname.toLowerCase();

  if (host === 'github.com' || host === 'www.github.com') {
    if (/^\/[^/]+\/[^/]+\/releases\//.test(caminho)) return recusa('release');
    /* github.com/<u>/<r>/blob|raw/<ref>/<arquivo> é o mesmo arquivo do raw: reescreve para o host liberado. */
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(caminho);
    if (m && EXTENSAO_DE_LIVRO.test(caminho)) {
      return validarLinkDeLivro(
        `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3].split('/').map(encodeURIComponent).join('/')}`,
      );
    }
    return recusa('pagina');
  }
  if (!(HOSTS_DE_LIVRO_POR_LINK as readonly string[]).includes(host)) {
    /* Um endereço de arquivo de outro host: não dá para baixar aqui; o caminho é baixar e soltar. */
    return recusa(EXTENSAO_DE_LIVRO.test(caminho) ? 'host' : 'pagina');
  }
  const ext = EXTENSAO_DE_LIVRO.exec(caminho);
  if (!ext) return recusa('pagina');
  return { ok: true, url: u.toString(), formato: ext[1].toLowerCase() as FormatoTrazido, motivo: null };
}

export interface LivroLido {
  formato: FormatoTrazido;
  titulo: string;
  autor?: string;
  idioma?: string;
  capitulos: CapituloDeTexto[];
  /** O arquivo original (EPUB e PDF), guardado no aparelho para o leitor. */
  arquivo?: Blob;
}

/** Um texto corrido (PDF, TXT) vira capítulos de ~3000 palavras, para a leitura não ser uma página só. */
export function emCapitulos(texto: string, rotulo: (i: number) => string): CapituloDeTexto[] {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim());
  const capitulos: CapituloDeTexto[] = [];
  let atual: string[] = [];
  let palavras = 0;
  for (const p of paragrafos) {
    atual.push(p.trim());
    palavras += p.split(/\s+/).length;
    if (palavras >= 3000) {
      capitulos.push({ titulo: rotulo(capitulos.length), texto: atual.join('\n\n') });
      atual = [];
      palavras = 0;
    }
  }
  if (atual.length) capitulos.push({ titulo: rotulo(capitulos.length), texto: atual.join('\n\n') });
  return capitulos;
}

const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '').trim() || nome;

/** Lê o arquivo pelo CONTEÚDO. Erros viram `ErroDoLivro` com um motivo que a tela sabe explicar. */
export async function lerArquivoTrazido(arquivo: File, rotulo: (i: number) => string): Promise<LivroLido> {
  if (!arquivo.size) throw new ErroDoLivro('vazio');
  const formato = formatoPeloConteudo(new Uint8Array(await arquivo.slice(0, 4096).arrayBuffer()));
  if (!formato) throw new ErroDoLivro('formato');

  if (formato === 'epub') {
    const epub = await extrairEpub(arquivo);
    return {
      formato,
      titulo: epub.metadados.titulo || semExtensao(arquivo.name),
      autor: epub.metadados.autores.map((a) => a.nome).join(', ') || undefined,
      idioma: epub.metadados.idioma || undefined,
      capitulos: epub.capitulos,
      arquivo,
    };
  }
  try {
    /* O extrator decide por nome e tipo: dá a ele o formato que o CONTEÚDO provou. */
    const normal = new File([arquivo], `${semExtensao(arquivo.name)}.${formato}`, {
      type: formato === 'pdf' ? 'application/pdf' : 'text/plain',
    });
    const doc = await extrairDocumento(normal);
    return {
      formato,
      titulo: doc.title || semExtensao(arquivo.name),
      capitulos: emCapitulos(doc.text, rotulo),
      ...(formato === 'pdf' ? { arquivo } : {}),
    };
  } catch (e) {
    throw comoErroDoLivro(e);
  }
}

/** Erros do extrator de documentos (mensagens de texto e `PasswordException` do pdfjs) viram motivos. */
export function comoErroDoLivro(e: unknown): ErroDoLivro {
  if (e instanceof ErroDoLivro) return e;
  const nome = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  let motivo: MotivoDoErro = 'corrompido';
  if (nome === 'PasswordException' || /password|senha|encrypt/i.test(msg)) motivo = 'drm';
  else if (/sem texto selecion|digitalizado/i.test(msg)) motivo = 'pdf-imagem';
  else if (/limite de|grande demais|mais de \d+ p/i.test(msg)) motivo = 'grande';
  else if (/vazio/i.test(msg)) motivo = 'vazio';
  return new ErroDoLivro(motivo, msg);
}

/**
 * Baixa o livro de um link válido (`validarLinkDeLivro`) NO NAVEGADOR e devolve um `File`. Confere o tamanho
 * antes (cabeçalho) e depois (bytes de verdade). A assinatura é conferida por `lerArquivoTrazido`.
 */
export async function baixarLivroDoLink(
  bruto: string,
  buscar: typeof fetch = (url, init) => fetch(url, init),
): Promise<File> {
  const link = validarLinkDeLivro(bruto);
  if (link.motivo) throw new ErroDoLivro(link.motivo);
  let r: Response;
  try {
    r = await buscar(link.url, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
  } catch {
    throw new ErroDoLivro('rede');
  }
  if (!r.ok) throw new ErroDoLivro('rede', `a fonte respondeu ${r.status}`);
  if (Number(r.headers.get('content-length') ?? 0) > TETO_DO_LINK_EM_BYTES) throw new ErroDoLivro('grande');
  const blob = await r.blob();
  if (blob.size > TETO_DO_LINK_EM_BYTES) throw new ErroDoLivro('grande');
  const nome = decodeURIComponent(new URL(link.url).pathname.split('/').pop() || `livro.${link.formato}`);
  return new File([blob], nome, { type: blob.type });
}
