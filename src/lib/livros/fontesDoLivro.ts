/**
 * DE ONDE O LEITOR TIRA O LIVRO: da estante do aparelho (`armazem.ts`). EPUB e PDF vão ao motor como
 * arquivo; TXT e a sessão `document` da Leitura antiga viram um livro de texto (`livroDeTexto`).
 */
import { fetchSessionTranscript } from '../../data/rotas/sessoes';
import type { LivroDoFoliate } from '../leitor/foliate/view.js';
import { capitulosDoTexto, livroDeTexto } from '../leitor/livroDeTexto';
import { estante, type LivroGuardado } from './armazem';

export interface LivroParaOMotor {
  guardado: LivroGuardado;
  entrada: File | LivroDoFoliate;
  /** Só na sessão: os textos de cada fala (para migrar as anotações antigas por frase). */
  falas?: string[];
  idioma?: string;
}

export async function livroParaOMotor(livroId: string, rotuloDoCapitulo: string): Promise<LivroParaOMotor | null> {
  const guardado = await estante.livro(livroId);
  if (!guardado) return null;
  if (guardado.origem === 'sessao') {
    const sessionId = livroId.replace(/^sessao:/, '');
    const { session, utterances } = await fetchSessionTranscript(sessionId);
    const falas = (utterances ?? []).map((u) => (u.sourceText ?? '').trim()).filter(Boolean);
    const idioma = utterances?.[0]?.sourceLang || session?.sourceLang || '';
    return {
      guardado: { ...guardado, titulo: session?.title || guardado.titulo, idioma },
      entrada: livroDeTexto({
        titulo: session?.title || guardado.titulo,
        idioma,
        capitulos: [{ titulo: '', paragrafos: falas }],
      }),
      falas,
      idioma,
    };
  }
  if (guardado.formato === 'txt') {
    const texto = await guardado.arquivo.text();
    return {
      guardado,
      entrada: livroDeTexto({
        titulo: guardado.titulo,
        autor: guardado.autor,
        idioma: guardado.idioma,
        capitulos: capitulosDoTexto(texto, rotuloDoCapitulo),
      }),
      idioma: guardado.idioma,
    };
  }
  return {
    guardado,
    entrada: new File([guardado.arquivo], guardado.nomeDoArquivo, { type: guardado.arquivo.type }),
    idioma: guardado.idioma,
  };
}
