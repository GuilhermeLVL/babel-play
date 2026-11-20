/**
 * O MANIFESTO DO TEXTO DE UM LIVRO PD — os hashes curtos de cada parágrafo, para o servidor do parceiro de leitura
 * conferir que o trecho que o cliente mandou é MESMO do livro do catálogo (L4 de Livros & Leitura).
 *
 * POR QUE. Os tetos maiores do catálogo (40 trechos, 8.000 caracteres) e o cache compartilhado só valem para texto em
 * domínio público. Sem conferir, um cliente diria "é o pg-1513" e mandaria o capítulo de um livro protegido: o
 * servidor guardaria (e serviria a outros) a resposta sobre aquele texto. Com o manifesto, trecho que não casa vale
 * como livro trazido pela pessoa (1.500 caracteres, sem cache).
 *
 * A UNIDADE É O PARÁGRAFO como o app o lê: o texto do capítulo que `lerEpubComoTexto` (EPUB do Standard Ebooks e a
 * cópia curada do Gutenberg) devolve, cortado nas linhas em branco (`paragrafosDoCapitulo`). A tela do leitor TEM de
 * montar os trechos assim para o livro do catálogo ser reconhecido. O hash é sobre o parágrafo inteiro, normalizado
 * (`normalizarParaManifesto`): parágrafo cortado no meio não casa — e cai no teto do livro trazido, sem erro.
 *
 * O HASH: os primeiros `BYTES_DO_HASH` bytes (40 bits) do SHA-256, em hex. Um trecho falso casar por acaso com um dos
 * ~10 mil parágrafos de um livro tem chance de ~1 em 100 milhões, e TODOS os trechos do pedido têm de casar.
 *
 * Módulo puro (usa só `crypto.subtle`, que o navegador, o Node e o Worker têm): o script que gera o manifesto, o
 * servidor e a tela leem igual.
 */

export const VERSAO_DO_MANIFESTO = 1;
export const BYTES_DO_HASH = 5;
const HEX_DO_HASH = BYTES_DO_HASH * 2;

/** Espaços colapsados, NFC, aspas e travessões tipográficos como os retos — o que muda entre leitores, não o texto. */
export function normalizarParaManifesto(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[‘’‚‛′`]/g, "'")
    .replace(/[“”„‟″«»‹›「」]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Os parágrafos de um capítulo (o texto com parágrafos separados por linha em branco), já normalizados. */
export function paragrafosDoCapitulo(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map(normalizarParaManifesto)
    .filter((p) => p.length > 0);
}

interface Subtle {
  digest(algoritmo: string, dados: Uint8Array): Promise<ArrayBuffer>;
}
const subtle = (): Subtle => (globalThis as unknown as { crypto: { subtle: Subtle } }).crypto.subtle;

/** O hash curto de um parágrafo (normalizado aqui dentro). */
export async function hashDoTrecho(texto: string): Promise<string> {
  const Codificador = (globalThis as unknown as { TextEncoder: new () => { encode(s: string): Uint8Array } })
    .TextEncoder;
  const dados = new Codificador().encode(normalizarParaManifesto(texto));
  const bytes = new Uint8Array(await subtle().digest('SHA-256', dados)).slice(0, BYTES_DO_HASH);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** O arquivo publicado: os hashes ordenados e concatenados (sem separador: cada um tem `HEX_DO_HASH` letras). */
export interface ManifestoDoLivro {
  versao: typeof VERSAO_DO_MANIFESTO;
  livroId: string;
  paragrafos: number;
  hashes: string;
}

export async function montarManifesto(livroId: string, capitulos: readonly string[]): Promise<ManifestoDoLivro> {
  const todos = new Set<string>();
  for (const c of capitulos) for (const p of paragrafosDoCapitulo(c)) todos.add(await hashDoTrecho(p));
  const ordenados = [...todos].sort();
  return { versao: VERSAO_DO_MANIFESTO, livroId, paragrafos: ordenados.length, hashes: ordenados.join('') };
}

/** O conjunto de hashes de um manifesto lido de fora, ou `null` quando ele está fora da forma. */
export function lerManifesto(bruto: unknown, livroId: string): ReadonlySet<string> | null {
  const m = bruto as Partial<ManifestoDoLivro> | null;
  if (!m || m.versao !== VERSAO_DO_MANIFESTO || m.livroId !== livroId || typeof m.hashes !== 'string') return null;
  if (m.hashes.length % HEX_DO_HASH !== 0 || !/^[0-9a-f]*$/.test(m.hashes)) return null;
  const s = new Set<string>();
  for (let i = 0; i < m.hashes.length; i += HEX_DO_HASH) s.add(m.hashes.slice(i, i + HEX_DO_HASH));
  return s;
}
