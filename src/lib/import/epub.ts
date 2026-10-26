/**
 * IMPORTAR UM EPUB NO NAVEGADOR (o "Trazer o seu" dos Livros e a leitura provisória da L1). O arquivo nunca
 * vai ao servidor: é aberto aqui, com o MESMO teto de expansão dos outros zips de terceiros
 * (`lib/zip/zipComTeto`), e só as entradas de texto (XHTML, OPF, container) são infladas. Imagens, fontes e
 * áudio são atravessados sem ocupar memória.
 *
 * A leitura do texto em si é a do núcleo (`core/livros/epub.ts`), a mesma que o script do catálogo usa.
 */
import { type EpubComoTexto, lerEpubComoTexto } from '../../core/livros/epub';
import { ExpansaoAcimaDoTeto, extrairDoZip } from '../zip/zipComTeto';

/** O mesmo teto do documento importado (`extrairDocumento`). */
const TETO_DO_ARQUIVO = 30 * 1024 * 1024;
/** Quanto TEXTO aberto um EPUB pode ter: um romance longo tem poucos MB de XHTML. */
const TETO_DO_TEXTO = 60 * 1024 * 1024;

const ENTRADA_DE_TEXTO = /(?:\.x?html?|\.opf|\.ncx|container\.xml)$/i;

export async function extrairEpub(arquivo: Blob): Promise<EpubComoTexto> {
  if (arquivo.size > TETO_DO_ARQUIVO) throw new Error('o EPUB passa do limite de 30 MB');
  try {
    /* Primeira passada: só os nomes (nada é inflado). Segunda: as entradas de texto, com teto. */
    const { nomes } = await extrairDoZip(arquivo, [], TETO_DO_TEXTO);
    const { entradas } = await extrairDoZip(
      arquivo,
      nomes.filter((n) => ENTRADA_DE_TEXTO.test(n)),
      TETO_DO_TEXTO,
    );
    const decodificador = new TextDecoder('utf-8');
    const arquivos: Record<string, string> = {};
    for (const [nome, bytes] of entradas) arquivos[nome] = decodificador.decode(bytes);
    const epub = lerEpubComoTexto(arquivos);
    if (!epub.capitulos.length) throw new Error('o EPUB não tinha texto legível');
    return epub;
  } catch (e) {
    if (e instanceof ExpansaoAcimaDoTeto) throw new Error('o EPUB expande demais ao abrir; arquivo recusado');
    throw e;
  }
}
