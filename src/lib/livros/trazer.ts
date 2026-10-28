/**
 * "TRAZER O SEU" no navegador: ler o arquivo escolhido (ou baixado de um link) e entregar capítulos de texto.
 * Nada daqui vai ao servidor: o arquivo é lido na memória do aparelho e o link é baixado DIRETO pelo
 * navegador, sem cookie (`credentials: 'omit'`), só de um host da lista (`HOSTS_DE_LIVRO_POR_LINK`).
 */
import { emCapitulosPorTamanho } from '../../core/livros/capitulosDeTexto';
import type { CapituloDeTexto } from '../../core/livros/epub';
import {
  ehFormatoDoMotor,
  formatoDoZip,
  type FormatoTrazido,
  mobiTemDrm,
  reconhecerPeloConteudo,
  TETO_DE_DOCUMENTO_EM_BYTES,
} from '../../core/livros/formatos';
import {
  ErroDoLivro,
  HOSTS_DE_LIVRO_POR_LINK,
  type MotivoDoErro,
  TETO_DO_LINK_EM_BYTES,
} from '../../core/livros/trazer';
import { extrairEpub } from '../import/epub';
import { conferirTamanhoDoDocx, extrairDocumento } from '../import/extrairDocumento';

const EXTENSAO_DE_LIVRO = /\.(epub|pdf|txt|mobi|azw3?|prc|fb2|fbz|cbz|docx|html?|xhtml|mhtml?|md|markdown)$/i;

export type MotivoDoLink = 'invalido' | 'pagina' | 'release' | 'host';

/** Forma plana (sem união): `motivo` nulo = o link vale e `url` e `formato` estão preenchidos. */
export interface LinkDeLivro {
  ok: boolean;
  url: string;
  /** A extensão do arquivo do link (o formato de verdade vem do conteúdo, depois de baixar). */
  formato: string | null;
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
  return { ok: true, url: u.toString(), formato: ext[1].toLowerCase(), motivo: null };
}

export interface LivroLido {
  formato: FormatoTrazido;
  titulo: string;
  autor?: string;
  idioma?: string;
  capitulos: CapituloDeTexto[];
  /** O arquivo original dos formatos que o motor abre (EPUB, PDF, MOBI, FB2, CBZ), guardado para o leitor. */
  arquivo?: Blob;
  /** Os demais (TXT, HTML, Markdown, DOCX): a cópia fiel dos bytes, para "Baixar cópia do arquivo". */
  copia?: Blob;
  nomeDoArquivo: string;
}

/** Um texto corrido (PDF, TXT) vira capítulos de ~3000 palavras, para a leitura não ser uma página só. */
export function emCapitulos(texto: string, rotulo: (i: number) => string): CapituloDeTexto[] {
  return emCapitulosPorTamanho(texto.replace(/\r\n?/g, '\n'), rotulo);
}

const semExtensao = (nome: string) => nome.replace(/\.[^.]+$/, '').trim() || nome;

/** Um campo de metadados do foliate: texto, lista ou mapa por idioma. Devolve o primeiro texto que achar. */
function textoDoMetadado(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (Array.isArray(v)) {
    const nomes = v.map(textoDoMetadado).filter((x): x is string => !!x);
    return nomes.length ? nomes.join(', ') : undefined;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return textoDoMetadado(o.name ?? o.value ?? Object.values(o)[0]);
  }
  return undefined;
}

/**
 * Abre MOBI/AZW3, FB2 ou CBZ no motor só para CONFERIR (arquivo íntegro, sem proteção) e tirar título e autor.
 * O motor lê o arquivo de novo quando a pessoa abre o livro; aqui nada é guardado.
 */
async function conferirNoMotor(
  arquivo: File,
  formato: 'mobi' | 'fb2' | 'cbz',
): Promise<{ titulo?: string; autor?: string; idioma?: string }> {
  try {
    const { makeBook } = await import('../leitor/foliate/view.js');
    const livro = await makeBook(arquivo);
    try {
      if (!livro.sections.length) throw new Error('sem páginas');
      const m = livro.metadata ?? {};
      return {
        titulo: formato === 'cbz' ? undefined : textoDoMetadado(m.title),
        autor: textoDoMetadado(m.author),
        idioma: textoDoMetadado(m.language),
      };
    } finally {
      livro.destroy?.();
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'DRMError') throw new ErroDoLivro('drm');
    throw new ErroDoLivro('corrompido', e instanceof Error ? e.message : String(e));
  }
}

const bytesDe = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/** Os nomes dos arquivos dentro de um zip, sem descompactar nada. */
async function nomesDoZip(arquivo: Blob): Promise<string[]> {
  const { unzip } = await import('fflate');
  const bytes = await bytesDe(arquivo);
  const nomes: string[] = [];
  await new Promise<void>((resolve, reject) =>
    unzip(
      bytes,
      {
        filter: (f) => {
          nomes.push(f.name);
          return false;
        },
      },
      (err) => (err ? reject(err) : resolve()),
    ),
  );
  return nomes;
}

/**
 * Lê o arquivo pelo CONTEÚDO. Erros viram `ErroDoLivro` com um motivo que a tela sabe explicar
 * (`detalhe` = o nome do formato que não abrimos, quando o motivo é `formato`).
 */
export async function lerArquivoTrazido(arquivo: File, rotulo: (i: number) => string): Promise<LivroLido> {
  if (!arquivo.size) throw new ErroDoLivro('vazio');
  const cabeca = new Uint8Array(await arquivo.slice(0, 4096).arrayBuffer());
  const r = reconhecerPeloConteudo(cabeca, arquivo.name);
  if (!r.ok || !r.formato) throw new ErroDoLivro(r.motivo ?? 'formato', r.nome ?? '');
  let formato: FormatoTrazido;
  if (r.formato === 'zip') {
    let nomes: string[];
    try {
      nomes = await nomesDoZip(arquivo);
    } catch {
      throw new ErroDoLivro('corrompido', 'o arquivo zip não abre');
    }
    const z = formatoDoZip(nomes);
    if (!z.ok || !z.formato) throw new ErroDoLivro('formato', z.nome);
    formato = z.formato;
  } else formato = r.formato;

  const nome = arquivo.name || 'livro';
  const titulo = semExtensao(nome);
  const base = { formato, nomeDoArquivo: nome };
  const ehDoMotor = ehFormatoDoMotor(formato);
  if (arquivo.size > (ehDoMotor ? TETO_DO_LINK_EM_BYTES : TETO_DE_DOCUMENTO_EM_BYTES)) {
    throw new ErroDoLivro('grande');
  }

  try {
    if (formato === 'epub') {
      const epub = await extrairEpub(arquivo);
      return {
        ...base,
        titulo: epub.metadados.titulo || titulo,
        autor: epub.metadados.autores.map((a) => a.nome).join(', ') || undefined,
        idioma: epub.metadados.idioma || undefined,
        capitulos: epub.capitulos,
        arquivo,
      };
    }
    if (formato === 'mobi') {
      /* A proteção primeiro, só pelos bytes do cabeçalho: nem abre o livro. */
      if (mobiTemDrm(await bytesDe(arquivo.slice(0, 512 * 1024)))) throw new ErroDoLivro('drm');
    }
    if (formato === 'mobi' || formato === 'fb2' || formato === 'cbz') {
      const meta = await conferirNoMotor(arquivo, formato);
      return {
        ...base,
        titulo: meta.titulo || titulo,
        autor: meta.autor,
        idioma: meta.idioma,
        capitulos: [],
        arquivo,
      };
    }
    if (formato === 'pdf') {
      /* O extrator decide por nome e tipo: dá a ele o formato que o CONTEÚDO provou. */
      const normal = new File([arquivo], `${titulo}.pdf`, {
        type: 'application/pdf',
      });
      const doc = await extrairDocumento(normal);
      return {
        ...base,
        titulo: doc.title || titulo,
        capitulos: emCapitulos(doc.text, rotulo),
        arquivo,
      };
    }
    /* O resto vira texto em capítulos; a cópia fiel dos bytes fica para "Baixar cópia do arquivo". */
    const doc = await documentoEmCapitulos(arquivo, formato, rotulo);
    if (!doc.capitulos.some((c) => c.texto.trim())) throw new ErroDoLivro('vazio', 'o documento não tinha texto');
    return {
      ...base,
      titulo: doc.titulo || titulo,
      idioma: doc.idioma,
      capitulos: doc.capitulos,
      copia: arquivo,
    };
  } catch (e) {
    throw comoErroDoLivro(e);
  }
}

async function documentoEmCapitulos(arquivo: File, formato: FormatoTrazido, rotulo: (i: number) => string) {
  const docs = await import('../import/documentosEmCapitulos');
  if (formato === 'docx') {
    await conferirTamanhoDoDocx(arquivo);
    return docs.docxEmCapitulos(await arquivo.arrayBuffer(), rotulo);
  }
  let texto = (await docs.decodificarTexto(await bytesDe(arquivo))).trim();
  if (!texto) throw new ErroDoLivro('vazio');
  if (formato === 'html') {
    if (/^\s*mime-version:/i.test(texto.slice(0, 200)) || /multipart\/related/i.test(texto.slice(0, 2000))) {
      const html = docs.htmlDoMhtml(texto);
      if (!html) throw new ErroDoLivro('corrompido', 'o MHTML não tinha página');
      texto = html;
    }
    return docs.htmlEmCapitulos(texto, rotulo);
  }
  if (formato === 'md') return docs.markdownEmCapitulos(texto, rotulo);
  return docs.textoEmCapitulos(texto, rotulo);
}

/** Erros do extrator de documentos (mensagens de texto e `PasswordException` do pdfjs) viram motivos. */
export function comoErroDoLivro(e: unknown): ErroDoLivro {
  if (e instanceof ErroDoLivro) return e;
  const nome = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  let motivo: MotivoDoErro = 'corrompido';
  if (nome === 'PasswordException' || /password|senha/i.test(msg)) motivo = 'senha';
  else if (/encrypt|drm/i.test(msg)) motivo = 'drm';
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
