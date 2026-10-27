/**
 * O LIVRO DA L1 NA ESTANTE DO LEITOR (`/livros/<id>/ler`). O catálogo (L1) e "Meus livros" chamam
 * `abrirLivroNoLeitor({ id })`; a tela de Livros então monta o leitor (`LeitorDoCatalogo`) sobre o que estas
 * funções põem na estante do aparelho (`armazem.ts`):
 *
 *  · Standard Ebooks: o EPUB direto da fonte, por CORS (`?source=download` pula a página de agradecimento);
 *  · cópia curada do Gutenberg: o EPUB da URL pública do R2 (`VITE_LIVROS_URL` + a chave do catálogo);
 *  · Wikisource: os capítulos pela API (a mesma origem da L1, `abrirTextoDoCatalogo`), guardados como texto
 *    em capítulos (`capitulosGuardados.ts`);
 *  · trazido pela pessoa (`meu-…`): o arquivo original (EPUB/PDF) que a L1 guardou, ou os capítulos de texto.
 *
 * Nada passa pelo servidor do Frasy. A segunda abertura não baixa de novo (a estante já tem o livro).
 */
import type { LivroDoCatalogo } from '../../core/livros/tipos';
import type { CapituloDeTexto } from '../leitor/livroDeTexto';
import { ErroAoAbrirLivro, formatoDosBytes, idDoCatalogo, prepararLivro } from './abrir';
import { estante, type LivroGuardado } from './armazem';
import { arquivoDosCapitulos, emParagrafos } from './capitulosGuardados';
import { lerConteudo, lerDaMemoria, type MeuLivro } from './meusLivros';
import { abrirTextoDoCatalogo, CopiaIndisponivel } from './textoDoLivro';

/** Quantos capítulos da Wikisource se pedem ao mesmo tempo. */
const PEDIDOS_SIMULTANEOS = 4;

const autoresDe = (livro: LivroDoCatalogo) => livro.autores.map((a) => a.nome).join(', ') || undefined;

/** Põe o livro do catálogo na estante (se ainda não está) e devolve o id do leitor. */
export async function prepararDoCatalogo(livro: LivroDoCatalogo, rotulo: (i: number) => string): Promise<string> {
  const livroId = idDoCatalogo(livro.id);
  if (await estante.livro(livroId)) return livroId;
  const { formatos } = livro;
  const base = { id: livro.id, titulo: livro.titulo, autores: livro.autores, idioma: livro.idioma };
  if (livro.fonte === 'standard-ebooks' && formatos.epub) {
    return prepararLivro({
      ...base,
      fonte: livro.fonte,
      credito: livro.credito,
      formatos: { epub: `${formatos.epub}?source=download` },
    });
  }
  if (livro.fonte === 'gutenberg-curado' && formatos.r2) {
    const r2 = (import.meta.env?.VITE_LIVROS_URL as string | undefined)?.replace(/\/+$/, '');
    if (!r2) throw new CopiaIndisponivel();
    return prepararLivro({
      ...base,
      fonte: livro.fonte,
      credito: livro.credito,
      formatos: { epub: `${r2}/${formatos.r2}` },
    });
  }
  if (livro.fonte === 'wikisource' && formatos.wikisource) {
    const texto = await abrirTextoDoCatalogo(livro, rotulo);
    const capitulos: CapituloDeTexto[] = new Array(texto.titulos.length);
    let proximo = 0;
    const trabalhador = async () => {
      while (proximo < texto.titulos.length) {
        const i = proximo++;
        capitulos[i] = { titulo: texto.titulos[i] ?? '', paragrafos: emParagrafos(await texto.lerCapitulo(i)) };
      }
    };
    await Promise.all(Array.from({ length: Math.min(PEDIDOS_SIMULTANEOS, texto.titulos.length) }, trabalhador));
    if (!capitulos.some((c) => c.paragrafos.length)) throw new ErroAoAbrirLivro('vazio', 'a fonte não trouxe texto');
    const agora = Date.now();
    await estante.guardarLivro({
      livroId,
      titulo: livro.titulo,
      autor: autoresDe(livro),
      idioma: livro.idioma,
      formato: 'txt',
      origem: 'catalogo',
      credito: livro.credito,
      dominioPublico: true,
      arquivo: arquivoDosCapitulos(capitulos),
      nomeDoArquivo: `${livroId.replace(/[^a-z0-9-]+/gi, '-')}.txt`,
      adicionadoEm: agora,
      abertoEm: agora,
    });
    return livroId;
  }
  throw new ErroAoAbrirLivro('sem_formato', 'este livro não tem um formato que o navegador abra');
}

/**
 * Põe na estante um livro trazido pela pessoa na L1 (`meu-…`). O id do leitor é o mesmo da L1. `null` = o
 * conteúdo não está mais neste aparelho.
 */
export async function prepararMeuLivro(meu: MeuLivro): Promise<string | null> {
  if (await estante.livro(meu.id)) return meu.id;
  const conteudo = lerDaMemoria(meu.id) ?? (await lerConteudo(meu.id));
  if (!conteudo) return null;
  const agora = Date.now();
  const comum: Omit<LivroGuardado, 'formato' | 'arquivo' | 'nomeDoArquivo'> = {
    livroId: meu.id,
    titulo: meu.titulo,
    autor: meu.autor,
    idioma: meu.idioma,
    origem: 'usuario',
    adicionadoEm: meu.adicionadoEm || agora,
    abertoEm: agora,
  };
  if (conteudo.arquivo?.size) {
    const bytes = await conteudo.arquivo.arrayBuffer();
    const formato = formatoDosBytes(new Uint8Array(bytes.slice(0, 8)));
    if (formato === 'epub' || formato === 'pdf') {
      await estante.guardarLivro({
        ...comum,
        formato,
        arquivo: new Blob([bytes], { type: formato === 'epub' ? 'application/epub+zip' : 'application/pdf' }),
        nomeDoArquivo: `${meu.id}.${formato}`,
      });
      return meu.id;
    }
  }
  const capitulos = conteudo.capitulos.map((c) => ({ titulo: c.titulo, paragrafos: emParagrafos(c.texto) }));
  await estante.guardarLivro({
    ...comum,
    formato: 'txt',
    arquivo: arquivoDosCapitulos(capitulos),
    nomeDoArquivo: `${meu.id}.txt`,
  });
  return meu.id;
}
