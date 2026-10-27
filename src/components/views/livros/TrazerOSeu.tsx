import '../../../styles/questLivrosTrazer.css';

import { FileUp, Link2, ShieldCheck } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

import type { CapituloDeTexto } from '../../../core/livros/epub';
import { ErroDoLivro, type MotivoDoErro } from '../../../core/livros/trazer';
import { importWeb } from '../../../data/rotas/importacao';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { t } from '../../../lib/i18n';
import {
  guardarConteudo,
  guardarEmMemoria,
  guardarMeuLivro,
  lerMeusLivros,
  type MeuLivro,
  novoIdDeLivroTrazido,
  type ResultadoDaGuarda,
} from '../../../lib/livros/meusLivros';
import {
  baixarLivroDoLink,
  comoErroDoLivro,
  emCapitulos,
  lerArquivoTrazido,
  type LivroLido,
  validarLinkDeLivro,
} from '../../../lib/livros/trazer';
import AjudaDoKindle from './AjudaDoKindle';
import OndeAcharLivros from './OndeAcharLivros';

type Estado =
  | { tipo: 'parado' }
  | { tipo: 'lendo'; oQue: string; etapa: 'baixando' | 'abrindo' }
  | { tipo: 'erro'; motivo: MotivoDoErro | 'outro'; mensagem: string }
  | { tipo: 'pronto'; livro: MeuLivro; guarda: ResultadoDaGuarda; sairam: string[] };

/**
 * O aviso de direitos: curto, sem prometer que conferimos a origem do arquivo.
 * TEXTO PENDENTE DE REVISÃO DE ADVOGADO (junto com a seção jurídica da pesquisa de 27/10/2026).
 */
function AvisoDeDireitos({ testid }: { testid: string }) {
  return (
    <p className="lv-direitos" data-testid={testid}>
      <ShieldCheck aria-hidden />
      <span>
        {t(
          'Traga só livros que você tem o direito de ler (de domínio público, de licença aberta ou que você comprou sem proteção). O arquivo fica só no seu aparelho.',
        )}
      </span>
    </p>
  );
}

/** A frase de cada motivo: gentil, sem culpar, e dizendo o que fazer. */
function mensagemDoMotivo(motivo: MotivoDoErro | 'outro'): string {
  switch (motivo) {
    case 'drm':
      return t(
        'Esse arquivo tem proteção (DRM) e o Frasy não consegue abrir. Não é culpa sua: veja a ajuda "Comprei na Amazon, posso trazer?" aqui embaixo.',
      );
    case 'pdf-imagem':
      return t(
        'Esse PDF parece ser só imagem (digitalizado), sem texto para ler. Procure uma versão com texto, como o EPUB.',
      );
    case 'grande':
      return t('Esse arquivo é grande demais para abrir aqui. Procure uma versão menor, como o EPUB.');
    case 'corrompido':
      return t(
        'Não deu para ler esse arquivo: ele pode estar incompleto ou danificado. Baixe de novo e tente outra vez.',
      );
    case 'formato':
      return t('Esse arquivo não parece ser um livro que o Frasy abre. Traga um EPUB, um PDF ou um TXT.');
    case 'vazio':
      return t('Esse arquivo está vazio. Baixe de novo e tente outra vez.');
    case 'rede':
      return t('Não consegui baixar esse link. Confira o endereço ou baixe o arquivo e solte aqui.');
    case 'pagina':
      return t(
        'Isso é uma página, não um arquivo de livro. Veja o guia "Onde encontrar livros legais": baixe o arquivo e solte aqui.',
      );
    case 'release':
      return t(
        'Esse link é de uma versão (release) do GitHub, que o navegador não deixa baixar direto. Baixe o arquivo e solte aqui.',
      );
    case 'host':
      return t(
        'Daqui o Frasy só baixa links do raw.githubusercontent.com. Para outro site, baixe o arquivo e solte aqui.',
      );
    default:
      return t('Cole o endereço completo de um arquivo (.epub, .pdf ou .txt), começando com https://');
  }
}

/**
 * "TRAZER O SEU" (CAT10): o arquivo solto ou escolhido (EPUB, PDF ou TXT, reconhecido pelo conteúdo), um link de
 * arquivo do GitHub (baixado pelo NAVEGADOR) e o artigo por link pela importação de página que já existe
 * (`/api/import/web`, o único caminho que passa pelo servidor, e a tela diz isso). Livros e arquivos nunca vão ao
 * servidor. Quando termina, o livro abre no leitor e fica em "Meus livros", neste aparelho.
 */
export default function TrazerOSeu({ aoAbrir }: { aoAbrir: (livro: MeuLivro) => void }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [url, setUrl] = useState('');
  const [urlDoLivro, setUrlDoLivro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [lembrete, setLembrete] = useState(false);
  const saiuParaUmaFonte = useRef(false);
  const campoDoArquivo = useRef<HTMLInputElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const idDoLink = useId();
  const idDoLinkDoLivro = useId();
  const rotulo = (i: number) => t('Parte {n}', { n: i + 1 });

  /* Depois de abrir a página de uma fonte, ao voltar para a aba: "Baixou um livro? Solte o arquivo aqui". */
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible' && saiuParaUmaFonte.current) {
        saiuParaUmaFonte.current = false;
        setLembrete(true);
      }
    };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const concluir = async (
    dados: Omit<MeuLivro, 'id' | 'adicionadoEm' | 'status' | 'etiquetas' | 'progresso'>,
    capitulos: CapituloDeTexto[],
    arquivo?: Blob,
  ) => {
    const id = novoIdDeLivroTrazido();
    const conteudo = { id, capitulos, ...(arquivo ? { arquivo } : {}) };
    guardarEmMemoria(conteudo);
    const guarda = await guardarConteudo(conteudo);
    /* Os títulos dos que saíram para este caber (o conteúdo; a entrada na lista continua). */
    const sairam =
      'removidos' in guarda
        ? lerMeusLivros()
            .filter((l) => guarda.removidos.includes(l.id))
            .map((l) => l.titulo)
        : [];
    const livro = guardarMeuLivro({ id, ...dados, status: 'lendo' });
    setLembrete(false);
    /* Deu tudo certo: abre direto no leitor. Se algo não coube, fica o cartão com o aviso. */
    if (guarda.guardado && sairam.length === 0) {
      aoAbrir(livro);
      setEstado({ tipo: 'parado' });
      return;
    }
    setEstado({ tipo: 'pronto', livro, guarda, sairam });
  };

  const concluirLivro = (lido: LivroLido, origem: 'arquivo' | 'link', endereco?: string) =>
    concluir(
      {
        titulo: lido.titulo,
        autor: lido.autor,
        origem,
        formato: lido.formato,
        idioma: lido.idioma,
        ...(endereco ? { url: endereco } : {}),
      },
      lido.capitulos,
      lido.arquivo,
    );

  const falhou = (e: unknown) => {
    const erro = comoErroDoLivro(e);
    setEstado({ tipo: 'erro', motivo: erro.motivo, mensagem: mensagemDoMotivo(erro.motivo) });
  };

  const aoEscolherArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEstado({ tipo: 'lendo', oQue: arquivo.name, etapa: 'abrindo' });
    try {
      await concluirLivro(await lerArquivoTrazido(arquivo, rotulo), 'arquivo');
    } catch (e) {
      falhou(e);
    }
  };

  const aoTrazerLivroDoLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const link = validarLinkDeLivro(urlDoLivro);
    if (link.motivo) {
      falhou(new ErroDoLivro(link.motivo));
      return;
    }
    setEstado({ tipo: 'lendo', oQue: link.url, etapa: 'baixando' });
    try {
      const arquivo = await baixarLivroDoLink(link.url);
      setEstado({ tipo: 'lendo', oQue: arquivo.name, etapa: 'abrindo' });
      await concluirLivro(await lerArquivoTrazido(arquivo, rotulo), 'link', link.url);
      setUrlDoLivro('');
    } catch (err) {
      falhou(err);
    }
  };

  const aoTrazerLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const endereco = url.trim();
    if (!/^https?:\/\//i.test(endereco)) {
      setEstado({
        tipo: 'erro',
        motivo: 'invalido',
        mensagem: t('Cole o endereço completo, começando com https://'),
      });
      return;
    }
    setEstado({ tipo: 'lendo', oQue: endereco, etapa: 'abrindo' });
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
        motivo: 'outro',
        mensagem: t('Não deu para trazer esta página: {motivo}.', {
          motivo: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  };

  const ocupado = estado.tipo === 'lendo';

  return (
    <section className="lv-trazer" aria-labelledby="lv-trazer-titulo" data-testid="trazer-o-seu">
      <header>
        <h2 id="lv-trazer-titulo">{t('Trazer o seu')}</h2>
        <p>{t('Leia aqui um livro ou um artigo que você já tem. Ele fica em Meus livros, neste aparelho.')}</p>
      </header>

      {lembrete && (
        <div className="lv-lembrete" role="status" data-testid="lembrete-de-volta">
          <span>{t('Baixou um livro? Solte o arquivo aqui.')}</span>
          <button
            type="button"
            className="q-ctl"
            onClick={() => {
              setLembrete(false);
              zona.current?.focus();
            }}
          >
            {t('Ir para a área de soltar')}
          </button>
        </div>
      )}

      <div className="q-cartao">
        <div
          ref={zona}
          className={`lv-soltar${arrastando ? ' arrastando' : ''}`}
          role="button"
          tabIndex={0}
          aria-disabled={ocupado}
          aria-label={t('Solte um livro aqui ou escolha um arquivo')}
          data-testid="zona-de-soltar"
          onClick={() => !ocupado && campoDoArquivo.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !ocupado) {
              e.preventDefault();
              campoDoArquivo.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            if (!ocupado) void aoEscolherArquivo(e.dataTransfer.files?.[0]);
          }}
        >
          <FileUp aria-hidden />
          <b>{t('Solte o livro aqui')}</b>
          <span>{t('EPUB, PDF ou TXT. Ou escolha um arquivo do seu aparelho.')}</span>
          <span className="q-ctl pri" aria-hidden>
            {t('Escolher arquivo')}
          </span>
        </div>
        <input
          ref={campoDoArquivo}
          hidden
          tabIndex={-1}
          aria-hidden
          type="file"
          accept=".epub,.pdf,.txt,application/epub+zip,application/pdf,text/plain"
          onChange={(e) => {
            void aoEscolherArquivo(e.target.files?.[0]);
            e.target.value = '';
          }}
          data-testid="arquivo-do-livro"
        />
        <p className="lv-nota">{t('PDF digitalizado (só imagem) ainda não abre.')}</p>
        <AvisoDeDireitos testid="aviso-de-direitos" />
      </div>

      <form className="q-cartao" onSubmit={(e) => void aoTrazerLivroDoLink(e)} data-testid="form-link-de-livro">
        <h3>
          <Link2 aria-hidden /> {t('Colar o link de um livro')}
        </h3>
        <p className="lv-nota">
          {t(
            'Cole o endereço de um arquivo .epub, .pdf ou .txt do GitHub (raw.githubusercontent.com). O seu navegador baixa o arquivo direto: ele não passa pelo Frasy.',
          )}
        </p>
        <label className="q-campo" htmlFor={idDoLinkDoLivro}>
          <span>{t('Endereço do arquivo')}</span>
          <input
            id={idDoLinkDoLivro}
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://raw.githubusercontent.com/…"
            value={urlDoLivro}
            onChange={(e) => setUrlDoLivro(e.target.value)}
            data-testid="link-do-livro"
          />
        </label>
        <div className="q-acoes">
          <button type="submit" className="q-ctl" disabled={!urlDoLivro.trim() || ocupado}>
            <Link2 aria-hidden /> {t('Trazer livro')}
          </button>
        </div>
        <AvisoDeDireitos testid="aviso-de-direitos-link" />
      </form>

      <div aria-live="polite" className="lv-estado-do-trazer">
        {estado.tipo === 'lendo' && (
          <div role="status" data-testid="trazendo">
            <p>
              {estado.etapa === 'baixando'
                ? t('Baixando {nome}…', { nome: estado.oQue })
                : t('Abrindo {nome}…', { nome: estado.oQue })}
            </p>
            <progress aria-label={t('Em andamento')} />
          </div>
        )}
        {estado.tipo === 'erro' && (
          <p role="alert" className="lv-erro" data-testid="erro-do-trazer" data-motivo={estado.motivo}>
            {estado.mensagem}
          </p>
        )}
        {estado.tipo === 'pronto' && (
          <div className="q-cartao" data-testid="trazido">
            <p>
              <b>{estado.livro.titulo}</b>{' '}
              {estado.guarda.guardado
                ? t('está em Meus livros.')
                : 'motivo' in estado.guarda && estado.guarda.motivo === 'grande-demais'
                  ? t(
                      'abriu, mas é grande demais para ficar guardado neste aparelho: depois de fechar a aba, será preciso trazer o arquivo de novo.',
                    )
                  : t(
                      'abriu, mas este navegador não deixou guardar o conteúdo: depois de fechar a aba, será preciso trazer o arquivo de novo.',
                    )}
            </p>
            {estado.sairam.length > 0 && (
              <p className="lv-nota">
                {t(
                  'Para caber, saiu deste aparelho o conteúdo dos livros abertos há mais tempo: {titulos}. Eles continuam na lista; para ler, traga o arquivo de novo.',
                  {
                    titulos: estado.sairam.join(', '),
                  },
                )}
              </p>
            )}
            <div className="q-acoes">
              <button type="button" className="q-ctl pri" onClick={() => aoAbrir(estado.livro)}>
                {t('Ler agora')}
              </button>
            </div>
          </div>
        )}
      </div>

      <OndeAcharLivros
        aoIrParaFonte={() => {
          saiuParaUmaFonte.current = true;
        }}
      />
      <AjudaDoKindle />

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
            <button type="submit" className="q-ctl" disabled={!url.trim() || ocupado}>
              <Link2 aria-hidden /> {t('Trazer artigo')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
