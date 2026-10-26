import { FileUp, Link2 } from 'lucide-react';
import React, { useId, useRef, useState } from 'react';

import type { CapituloDeTexto } from '../../../core/livros/epub';
import { importWeb } from '../../../data/rotas/importacao';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { t } from '../../../lib/i18n';
import { extrairEpub } from '../../../lib/import/epub';
import { extrairDocumento } from '../../../lib/import/extrairDocumento';
import {
  guardarConteudo,
  guardarEmMemoria,
  guardarMeuLivro,
  type MeuLivro,
  novoIdDeLivroTrazido,
} from '../../../lib/livros/meusLivros';

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'lendo'; oQue: string }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'pronto'; livro: MeuLivro; guardado: boolean };

/** Um texto corrido (PDF, artigo) vira capítulos de ~3000 palavras, para a leitura não ser uma página só. */
function emCapitulos(texto: string, rotulo: (i: number) => string): CapituloDeTexto[] {
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

/**
 * "TRAZER O SEU" (CAT10): EPUB e PDF abertos do disco, no navegador (o arquivo nunca vai ao servidor), e
 * artigo por link pela importação de página que já existe (`/api/import/web`, o único caminho que passa
 * pelo servidor, e a tela diz isso). O que chega vai para "Meus livros", neste aparelho.
 */
export default function TrazerOSeu({ aoAbrir }: { aoAbrir: (livro: MeuLivro) => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [url, setUrl] = useState('');
  const campoDoArquivo = useRef<HTMLInputElement>(null);
  const idDoLink = useId();
  const rotulo = (i: number) => t('Parte {n}', { n: i + 1 });

  const concluir = async (
    dados: Omit<MeuLivro, 'id' | 'adicionadoEm' | 'status' | 'etiquetas' | 'progresso'>,
    capitulos: CapituloDeTexto[],
    arquivo?: Blob,
  ) => {
    const id = novoIdDeLivroTrazido();
    const conteudo = { id, capitulos, ...(arquivo ? { arquivo } : {}) };
    guardarEmMemoria(conteudo);
    const guardado = await guardarConteudo(conteudo);
    const livro = guardarMeuLivro({ id, ...dados, status: 'lendo' });
    setEstado({ tipo: 'pronto', livro, guardado });
  };

  const aoEscolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEstado({ tipo: 'lendo', oQue: arquivo.name });
    try {
      const nome = arquivo.name.toLowerCase();
      if (nome.endsWith('.epub') || arquivo.type === 'application/epub+zip') {
        const epub = await extrairEpub(arquivo);
        await concluir(
          {
            titulo: epub.metadados.titulo || arquivo.name.replace(/\.[^.]+$/, ''),
            autor: epub.metadados.autores.map((a) => a.nome).join(', ') || undefined,
            origem: 'arquivo',
            formato: 'epub',
            idioma: epub.metadados.idioma || undefined,
          },
          epub.capitulos,
          arquivo,
        );
        return;
      }
      if (nome.endsWith('.pdf') || arquivo.type === 'application/pdf') {
        const doc = await extrairDocumento(arquivo);
        await concluir(
          { titulo: doc.title, origem: 'arquivo', formato: 'pdf' },
          emCapitulos(doc.text, rotulo),
          arquivo,
        );
        return;
      }
      setEstado({ tipo: 'erro', mensagem: t('Este formato não abre aqui. Traga um arquivo EPUB ou PDF.') });
    } catch (e) {
      setEstado({
        tipo: 'erro',
        mensagem: t('Não deu para abrir este arquivo: {motivo}.', {
          motivo: e instanceof Error ? e.message : String(e),
        }),
      });
    }
  };

  const aoTrazerLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const endereco = url.trim();
    if (!/^https?:\/\//i.test(endereco)) {
      setEstado({ tipo: 'erro', mensagem: t('Cole o endereço completo, começando com https://') });
      return;
    }
    setEstado({ tipo: 'lendo', oQue: endereco });
    try {
      const pagina = await importWeb(endereco);
      await concluir(
        { titulo: pagina.title || endereco, origem: 'link', formato: 'web', url: endereco, idioma: pagina.lang },
        emCapitulos(pagina.text, rotulo),
      );
      setUrl('');
    } catch (err) {
      setEstado({
        tipo: 'erro',
        mensagem: t('Não deu para trazer esta página: {motivo}.', {
          motivo: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  };

  return (
    <section className="lv-trazer" aria-labelledby="lv-trazer-titulo" data-testid="trazer-o-seu">
      <header>
        <h2 id="lv-trazer-titulo">{t('Trazer o seu')}</h2>
        <p>{t('Leia aqui um livro ou um artigo que você já tem. Ele fica em Meus livros, neste aparelho.')}</p>
      </header>

      <div className="q-cartao">
        <h3>
          <FileUp aria-hidden /> {t('Arquivo EPUB ou PDF')}
        </h3>
        <p className="lv-nota">
          {t(
            'O arquivo é aberto no seu aparelho e não é enviado ao Frasy. PDF digitalizado (só imagem) ainda não abre.',
          )}
        </p>
        <div className="q-acoes">
          <button
            type="button"
            className="q-ctl pri"
            onClick={() => campoDoArquivo.current?.click()}
            disabled={estado.tipo === 'lendo'}
          >
            <FileUp aria-hidden /> {t('Escolher arquivo')}
          </button>
        </div>
        <input
          ref={campoDoArquivo}
          hidden
          tabIndex={-1}
          aria-hidden
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          onChange={(e) => {
            void aoEscolherArquivo(e.target.files?.[0]);
            e.target.value = '';
          }}
          data-testid="arquivo-do-livro"
        />
      </div>

      {!edicaoEstatica() && (
        <form className="q-cartao" onSubmit={(e) => void aoTrazerLink(e)}>
          <h3>
            <Link2 aria-hidden /> {t('Artigo por link')}
          </h3>
          <p className="lv-nota">
            {t('Para ler uma página da internet, o servidor do Frasy busca o endereço e traz só o texto dela.')}
          </p>
          <label className="q-campo" htmlFor={idDoLink}>
            <span>{t('Endereço do artigo')}</span>
            <input
              id={idDoLink}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="q-acoes">
            <button type="submit" className="q-ctl" disabled={!url.trim() || estado.tipo === 'lendo'}>
              <Link2 aria-hidden /> {t('Trazer artigo')}
            </button>
          </div>
        </form>
      )}

      <div aria-live="polite" className="lv-estado-do-trazer">
        {estado.tipo === 'lendo' && <p role="status">{t('Abrindo {nome}…', { nome: estado.oQue })}</p>}
        {estado.tipo === 'erro' && (
          <p role="alert" className="lv-erro">
            {estado.mensagem}
          </p>
        )}
        {estado.tipo === 'pronto' && (
          <div className="q-cartao" data-testid="trazido">
            <p>
              <b>{estado.livro.titulo}</b>{' '}
              {estado.guardado
                ? t('está em Meus livros.')
                : t(
                    'abriu, mas este navegador não deixou guardar o conteúdo: depois de fechar a aba, será preciso trazer o arquivo de novo.',
                  )}
            </p>
            <div className="q-acoes">
              <button type="button" className="q-ctl pri" onClick={() => aoAbrir(estado.livro)}>
                {t('Ler agora')}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
