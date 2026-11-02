/**
 * OS FORMATOS DE "TRAZER O SEU": o que o Frasy abre, reconhecido pelo CONTEÚDO (assinatura de bytes) e não pela
 * extensão. Regras PURAS (sem React, sem rede, sem DOM).
 *
 *  · o que o motor de leitura abre como arquivo: EPUB, PDF, MOBI/AZW3, FB2 e CBZ;
 *  · o que vira texto em capítulos: TXT, HTML, Markdown e DOCX;
 *  · o que o Frasy só RECONHECE para recusar com uma frase útil (DOC, RTF, DJVU, RAR…) ou por proteção (DRM).
 *
 * O Frasy NÃO remove proteção (LDA art. 107). Aqui só se detecta e se recusa.
 */

export type FormatoTrazido = 'epub' | 'pdf' | 'mobi' | 'fb2' | 'cbz' | 'docx' | 'txt' | 'html' | 'md';

/** Os formatos que o motor de leitura (foliate-js) abre direto do arquivo. */
export const FORMATOS_DO_MOTOR = ['epub', 'pdf', 'mobi', 'fb2', 'cbz'] as const;
export type FormatoDoMotor = (typeof FORMATOS_DO_MOTOR)[number];

export const ehFormatoDoMotor = (f: string | undefined): f is FormatoDoMotor =>
  !!f && (FORMATOS_DO_MOTOR as readonly string[]).includes(f);

/** Os formatos aceitos, em grupos, como a tela os mostra (só os que de fato funcionam). */
export const GRUPOS_DE_FORMATOS = [
  { id: 'livros', formatos: ['EPUB', 'MOBI', 'AZW3', 'FB2'] },
  { id: 'documentos', formatos: ['PDF', 'DOCX', 'TXT', 'HTML', 'Markdown'] },
  { id: 'quadrinhos', formatos: ['CBZ'] },
] as const;

/** O `accept` do seletor de arquivos: só ajuda a escolher; quem decide é o conteúdo. */
export const EXTENSOES_ACEITAS = [
  '.epub',
  '.mobi',
  '.azw',
  '.azw3',
  '.prc',
  '.fb2',
  '.fbz',
  '.zip',
  '.cbz',
  '.pdf',
  '.docx',
  '.txt',
  '.text',
  '.html',
  '.htm',
  '.xhtml',
  '.mhtml',
  '.mht',
  '.md',
  '.markdown',
].join(',');

/** Teto de um documento que vira texto (TXT, HTML, Markdown, DOCX). */
export const TETO_DE_DOCUMENTO_EM_BYTES = 30 * 1024 * 1024;

/**
 * Forma plana (sem união, o projeto não liga `strictNullChecks`): `ok` com o `formato`, ou `ok: false` com o
 * `motivo`. `nome` = o formato que reconhecemos mas não abrimos ("DJVU"); vazio = não reconhecemos.
 */
export interface Reconhecido {
  ok: boolean;
  formato: FormatoTrazido | 'zip' | null;
  motivo: 'drm' | 'formato' | 'vazio' | null;
  nome?: string;
}

const aceito = (formato: FormatoTrazido | 'zip'): Reconhecido => ({ ok: true, formato, motivo: null });
const recusado = (motivo: 'drm' | 'formato' | 'vazio', nome?: string): Reconhecido => ({
  ok: false,
  formato: null,
  motivo,
  ...(nome ? { nome } : {}),
});

const comeca = (b: Uint8Array, ...sequencia: number[]) => sequencia.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, de: number, ate: number) =>
  Array.from(b.subarray(de, ate), (c) => (c < 128 ? String.fromCharCode(c) : '?')).join('');

/** Formatos conhecidos que o Frasy não abre: o nome vai na mensagem ("Ainda não abrimos DJVU"). */
function naoAceito(b: Uint8Array): string | null {
  if (comeca(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return 'DOC';
  if (ascii(b, 0, 5) === '{\\rtf') return 'RTF';
  if (ascii(b, 0, 8) === 'AT&TFORM') return 'DJVU';
  if (ascii(b, 0, 4) === 'Rar!') return 'RAR (CBR)';
  if (comeca(b, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return '7Z';
  if (ascii(b, 0, 8) === 'ITOLITLS') return 'LIT';
  if (ascii(b, 60, 68) === 'TEXtREAd') return 'PDB';
  if (comeca(b, 0x89, 0x50, 0x4e, 0x47) || comeca(b, 0xff, 0xd8, 0xff) || ascii(b, 0, 3) === 'GIF') return 'imagem';
  return null;
}

/** Kindle moderno (KFX) e Topaz (AZW1): contêineres que o Frasy não abre; tratados como protegidos. */
function ehKindleFechado(b: Uint8Array): boolean {
  return ascii(b, 0, 3) === 'TPZ' || (ascii(b, 0, 4) === 'CONT' && b[5] === 0);
}

/**
 * O formato pela assinatura da CABEÇA do arquivo (os primeiros 4 KB bastam; o MOBI olha o byte 60). Um zip volta
 * como `'zip'`: quem lê a lista de nomes decide com `formatoDoZip`. `nome` só desempata texto puro (.md).
 */
export function reconhecerPeloConteudo(cabeca: Uint8Array, nome = ''): Reconhecido {
  if (!cabeca.length) return recusado('vazio');
  if (comeca(cabeca, 0x50, 0x4b, 0x03, 0x04)) return aceito('zip');
  if (comeca(cabeca, 0x25, 0x50, 0x44, 0x46)) return aceito('pdf');
  if (ascii(cabeca, 60, 68) === 'BOOKMOBI') return aceito('mobi');
  if (ehKindleFechado(cabeca)) return recusado('drm');
  const conhecido = naoAceito(cabeca);
  if (conhecido) return recusado('formato', conhecido);

  const utf16 = comeca(cabeca, 0xff, 0xfe) || comeca(cabeca, 0xfe, 0xff);
  if (!utf16) {
    for (const b of cabeca.subarray(0, 4096)) {
      /* Tab, LF, CR: o resto dos controles (NUL inclusive) é binário. */
      if (b < 9 || (b > 13 && b < 32)) return recusado('formato');
    }
  }
  const inicio = utf16 ? '' : ascii(cabeca, 0, 4096).toLowerCase();
  if (/<fictionbook[\s>]/.test(inicio)) return aceito('fb2');
  if (
    /^\s*(mime-version:|from:|subject:|content-type:\s*multipart\/related)/.test(inicio) &&
    inicio.includes('multipart/related')
  )
    return aceito('html');
  if (/^\s*(<\?xml[^>]*>\s*)?(<!doctype\s+html|<html|<head|<body)/.test(inicio) || /<html[\s>]/.test(inicio))
    return aceito('html');
  if (/\.(md|markdown|mdown)$/i.test(nome)) return aceito('md');
  if (/\.(html?|xhtml)$/i.test(nome) && /<(p|div|h[1-6]|br|body|span)[\s>/]/.test(inicio)) return aceito('html');
  return aceito('txt');
}

/** Atalho: só o formato (ou `null`). Um zip volta como `'zip'`. */
export function formatoPeloConteudo(cabeca: Uint8Array, nome = ''): FormatoTrazido | 'zip' | null {
  const r = reconhecerPeloConteudo(cabeca, nome);
  return r.formato;
}

/** O que há dentro de um zip, pela lista de nomes: EPUB, DOCX, CBZ (só imagens), FB2.zip ou algo que não abrimos. */
export function formatoDoZip(nomes: readonly string[]): {
  ok: boolean;
  formato: 'epub' | 'docx' | 'cbz' | 'fb2' | null;
  nome?: string;
} {
  const baixos = nomes.map((n) => n.toLowerCase());
  if (baixos.includes('meta-inf/container.xml')) return { ok: true, formato: 'epub' as const };
  if (baixos.includes('word/document.xml')) return { ok: true, formato: 'docx' as const };
  if (baixos.includes('meta-inf/manifest.xml') && baixos.includes('content.xml'))
    return { ok: false, formato: null, nome: 'ODT' };
  if (baixos.some((n) => n.startsWith('xl/') || n.startsWith('ppt/')))
    return { ok: false, formato: null, nome: 'Excel/PowerPoint' };
  if (baixos.some((n) => n.endsWith('.fb2'))) return { ok: true, formato: 'fb2' as const };
  const util = baixos.filter((n) => !n.startsWith('__macosx/') && !(n.split('/').pop() ?? '').startsWith('._'));
  const imagens = util.filter((n) => /\.(jpe?g|png|gif|bmp|webp|svg|avif|jxl)$/.test(n));
  const paginas = util.filter((n) => /\.(x?html?|opf|ncx)$/.test(n));
  if (imagens.length && !paginas.length) return { ok: true, formato: 'cbz' as const };
  if (baixos.includes('mimetype') && paginas.length) return { ok: true, formato: 'epub' as const };
  return { ok: false, formato: null, nome: 'ZIP' };
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

/**
 * O MOBI/AZW tem proteção (DRM)? O campo `encryption` do cabeçalho PalmDOC (2 bytes, no registro 0) é 0 sem
 * proteção; 1 e 2 são as cifras do Mobipocket/Kindle. `bytes` precisa cobrir a tabela de registros e o começo do
 * registro 0 (os primeiros ~256 KB sobram). Não consegue decidir (cabeça curta) → `false`; o `mobi.js` confere
 * de novo ao abrir.
 */
export function mobiTemDrm(bytes: Uint8Array): boolean {
  if (bytes.length < 86 || ascii(bytes, 60, 68) !== 'BOOKMOBI') return false;
  const registros = u16(bytes, 76);
  if (!registros) return false;
  const inicio = u32(bytes, 78);
  if (inicio + 14 > bytes.length) return false;
  return u16(bytes, inicio + 12) !== 0;
}
