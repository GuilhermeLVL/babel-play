/**
 * TETOS DE UM ZIP NÃO CONFIÁVEL (EPUB, CBZ, DOCX, FB2.zip, backup da estante). Regras PURAS, aplicadas à lista
 * de entradas lida do diretório central ANTES de descompactar qualquer coisa. Falha fechada.
 *
 *  · nº de entradas, tamanho descompactado por entrada e no total, e a razão de compressão (bomba de zip);
 *  · caminhos: nada de `..`, caminho absoluto, `\`, letra de unidade, controle ou nome absurdo (zip slip);
 *  · CBZ: nº de páginas e tamanho de cada imagem.
 */

export interface EntradaDoZip {
  nome: string;
  /** Tamanho descompactado declarado no cabeçalho. */
  tamanho: number;
}

export const TETOS_DO_ZIP = {
  entradas: 20_000,
  porEntrada: 64 * 1024 * 1024,
  total: 300 * 1024 * 1024,
  razao: 200,
  nomeMaximo: 512,
  paginasDeCbz: 3000,
  imagemDeCbz: 30 * 1024 * 1024,
} as const;

export type ProblemaDoZip = 'grande' | 'corrompido';

/** O caminho de uma entrada é seguro para ler/restaurar? (sem `..`, absoluto, `\`, unidade, controle) */
export function caminhoSeguroNoZip(nome: string): boolean {
  if (!nome || nome.length > TETOS_DO_ZIP.nomeMaximo) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(nome)) return false;
  if (nome.startsWith('/') || /^[a-zA-Z]:/.test(nome)) return false;
  return !nome.split('/').some((parte) => parte === '..');
}

/**
 * Confere as entradas. `tamanhoDoArquivo` = bytes do zip inteiro (para a razão de compressão). Devolve `null`
 * se está dentro dos tetos, ou o problema (`grande` = estoura um teto; `corrompido` = caminho suspeito).
 */
export function problemaDoZip(entradas: readonly EntradaDoZip[], tamanhoDoArquivo: number): ProblemaDoZip | null {
  if (entradas.length > TETOS_DO_ZIP.entradas) return 'grande';
  let total = 0;
  for (const e of entradas) {
    if (!caminhoSeguroNoZip(e.nome)) return 'corrompido';
    if (e.tamanho > TETOS_DO_ZIP.porEntrada) return 'grande';
    total += e.tamanho;
    if (total > TETOS_DO_ZIP.total) return 'grande';
  }
  if (total > 1024 * 1024 && total / Math.max(1, tamanhoDoArquivo) > TETOS_DO_ZIP.razao) return 'grande';
  return null;
}

const IMAGEM = /\.(jpe?g|png|gif|bmp|webp|svg|avif|jxl)$/i;

/** Tetos extras do CBZ: páginas demais, ou uma imagem enorme (a decodificação é preguiçosa, uma por vez). */
export function problemaDoCbz(entradas: readonly EntradaDoZip[]): ProblemaDoZip | null {
  const imagens = entradas.filter((e) => IMAGEM.test(e.nome));
  if (imagens.length > TETOS_DO_ZIP.paginasDeCbz) return 'grande';
  if (imagens.some((e) => e.tamanho > TETOS_DO_ZIP.imagemDeCbz)) return 'grande';
  return null;
}
