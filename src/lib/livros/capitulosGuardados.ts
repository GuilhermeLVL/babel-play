/**
 * UM LIVRO DE TEXTO EM CAPÍTULOS NA ESTANTE (Wikisource, ou o texto de um livro trazido na L1): o arquivo
 * guardado é um JSON `[{ titulo, paragrafos }]` com o tipo `TIPO_DOS_CAPITULOS`. Módulo à parte e leve: o
 * leitor (`fontesDoLivro.ts`) lê sem carregar o que baixa da fonte.
 */
import type { CapituloDeTexto } from '../leitor/livroDeTexto';

/** O tipo do arquivo de um livro de texto em capítulos (Wikisource, ou o texto de um livro trazido). */
export const TIPO_DOS_CAPITULOS = 'application/x-frasy-capitulos+json';

export const emParagrafos = (texto: string) =>
  texto
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);

/** Os capítulos guardados (o JSON de `TIPO_DOS_CAPITULOS`), conferidos. `null` = não é desse tipo ou não confere. */
export async function lerCapitulosGuardados(arquivo: Blob): Promise<CapituloDeTexto[] | null> {
  if (arquivo.type !== TIPO_DOS_CAPITULOS) return null;
  try {
    const bruto = JSON.parse(await arquivo.text()) as unknown;
    if (!Array.isArray(bruto)) return null;
    const capitulos = bruto.filter(
      (c): c is CapituloDeTexto =>
        !!c &&
        typeof c.titulo === 'string' &&
        Array.isArray(c.paragrafos) &&
        c.paragrafos.every((p: unknown) => typeof p === 'string'),
    );
    return capitulos.length === bruto.length ? capitulos : null;
  } catch {
    return null;
  }
}

export const arquivoDosCapitulos = (capitulos: CapituloDeTexto[]) =>
  new Blob([JSON.stringify(capitulos)], { type: TIPO_DOS_CAPITULOS });
