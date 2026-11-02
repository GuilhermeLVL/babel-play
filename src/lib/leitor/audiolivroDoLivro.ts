/**
 * A PORTA DO AUDIOLIVRO NO LEITOR (F2): o livro aberto tem áudio pré-gerado que ESTA pessoa pode ouvir?
 *
 *  · flag `audiolivros` desligada, livro trazido pela pessoa (nunca vai ao CDN) ou fora do catálogo: `null`, sem ler
 *    nem o catálogo;
 *  · livro sem `audio` publicado, ou não visível para quem lê (`temAudioVisivel`: menor, livro a revisar): `null`, sem
 *    nenhuma requisição ao CDN de áudio;
 *  · só então o código do CDN chega por `import()` e abre o manifesto. Qualquer falha: `null` (a voz do aparelho lê).
 *
 * Este arquivo fica FORA de `audiolivro/` de propósito: é leve, entra no chunk do leitor, e só ele decide carregar
 * o resto (`tests/audiolivro-chunk.test.ts`).
 */
import { temAudioVisivel, type TetoDeClassificacao } from '../../core/livros/catalogo';
import type { AudioDoCatalogo, LivroDoCatalogo } from '../../core/livros/tipos';
import type { AudioGravadoDoLivro } from './narrador';

export interface EntradaDaPorta {
  /** O id do leitor (`cat:<id do catálogo>` para os livros do catálogo). */
  livroId: string;
  origem: string | undefined;
  flagLigada: boolean;
  teto: TetoDeClassificacao;
  catalogo: () => Promise<{ livros: readonly LivroDoCatalogo[] }>;
  abrir?: (idDoCatalogo: string, audio: AudioDoCatalogo) => Promise<AudioGravadoDoLivro | null>;
}

const abrirPadrao = (id: string, audio: AudioDoCatalogo) =>
  import('./audiolivro/doLivro').then((m) => m.abrirAudiolivro(id, audio));

export async function audiolivroDoLivro(e: EntradaDaPorta): Promise<AudioGravadoDoLivro | null> {
  if (!e.flagLigada || e.origem !== 'catalogo' || !e.livroId.startsWith('cat:') || e.livroId.length <= 4) return null;
  try {
    const id = e.livroId.slice(4);
    const livro = (await e.catalogo()).livros.find((l) => l.id === id);
    if (!livro || !livro.audio || !temAudioVisivel(livro, e.teto, e.flagLigada)) return null;
    return await (e.abrir ?? abrirPadrao)(livro.id, livro.audio);
  } catch {
    return null;
  }
}
