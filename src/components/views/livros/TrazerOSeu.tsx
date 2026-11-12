import '../../../styles/questLivrosTrazer.css';

import { Download, FileUp, Library, Link2, ShieldCheck } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

import type { CapituloDeTexto } from '../../../core/livros/epub';
import { EXTENSOES_ACEITAS, GRUPOS_DE_FORMATOS } from '../../../core/livros/formatos';
import { ErroDoLivro, type MotivoDoErro } from '../../../core/livros/trazer';
import { importWeb } from '../../../data/rotas/importacao';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { t } from '../../../lib/i18n';
import { baixarCopiaDoLivro } from '../../../lib/livros/copiaDoArquivo';
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
  | { tipo: 'erro'; motivo: MotivoDoErro | 'outro'; mensagem: string; dica?: string }
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

const NOME_DE_FORMATO = /^[A-Z0-9][A-Za-z0-9 ()/+.-]{1,20}$/;

/** A frase de cada motivo: gentil, sem culpar, e dizendo o que fazer. `nome` = o formato que reconhecemos mas não abrimos. */
function mensagemDoMotivo(motivo: MotivoDoErro | 'outro', nome = ''): string {
  switch (motivo) {
    case 'drm':
      return t(
        'Esse arquivo tem proteção (DRM) e o Frasy não consegue abrir. Não é culpa sua: veja a ajuda "Comprei na Amazon, posso trazer?" aqui embaixo.',
      );
    case 'senha':
      return t(
        'Esse PDF tem senha e o Frasy não consegue abrir. Abra-o no leitor de PDF do seu aparelho, salve uma cópia sem senha e traga de novo.',
      );
    case 'pdf-imagem':
      return t(
        'Esse PDF é só imagem (escaneado ou fotografado) e ainda não lemos PDF escaneado. Procure uma versão com texto, como o EPUB, ou um PDF em que dê para selecionar as palavras.',
      );
    case 'grande':
      return t(
        'Esse arquivo é grande demais para abrir aqui (livros até 150 MB; documentos como DOCX, TXT e HTML, até 30 MB). Procure uma versão menor, como o EPUB.',
      );
    case 'corrompido':
      return t(
        'Não deu para ler esse arquivo: ele pode estar incompleto ou danificado. Baixe de novo e tente outra vez.',
      );
    case 'formato':
      return NOME_DE_FORMATO.test(nome)
        ? t('Ainda não abrimos arquivos {nome}. Se puder, salve ou exporte como PDF, DOCX ou EPUB e traga de novo.', {
            nome,
          })
        : t('Esse arquivo não parece ser um livro ou documento que o Frasy abre. Veja os formatos aceitos acima.');
    case 'vazio':
      return t('Esse arquivo está vazio ou não tem texto para ler. Baixe de novo e tente outra vez.');
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
      return t('Cole o endereço completo de um arquivo de livro (.epub, .pdf, .docx, .txt…), começando com https://');
  }
}

/** Os 3 passos, para quem nunca fez isso. */
function Passos() {
  const passos = [
    { n: 1, titulo: t('Tenha o arquivo'), dica: t('Baixe ou separe o livro ou o documento no seu aparelho.') },
    { n: 2, titulo: t('Solte aqui'), dica: t('Arraste para a área abaixo, ou toque nela para escolher.') },
    { n: 3, titulo: t('Leia'), dica: t('Ele abre na hora e fica em Meus livros.') },
  ];
  return (
    <ol className="lv-passos" data-testid="passos-de-trazer" aria-label={t('Como trazer o seu')}>
      {passos.map((p) => (
        <li key={p.n} className="lv-passo">
          <span className="lv-passo-n" aria-hidden>
            {p.n}
          </span>
          <span>
            <b>{p.titulo}</b>
            <small>{p.dica}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Os formatos aceitos em chips, por grupo. Só entra o que de fato abre. */
function FormatosAceitos() {
  const rotulos: Record<string, string> = {
    livros: t('Livros'),
    documentos: t('Documentos'),
    quadrinhos: t('Quadrinhos'),
  };
  return (
    <div className="lv-formatos" role="group" aria-label={t('Formatos aceitos')} data-testid="formatos-aceitos">
      {GRUPOS_DE_FORMATOS.map((g) => (
        <div key={g.id} className="lv-formatos-grupo" data-testid={`formatos-${g.id}`}>
          <span className="lv-formatos-rotulo">{rotulos[g.id]}:</span>
          <ul>
            {g.formatos.map((f) => (
              <li key={f} className="lv-chip">
                {f}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * "TRAZER O SEU" (CAT10): o arquivo solto ou escolhido (livro ou documento, reconhecido pelo conteúdo), um link de
 * arquivo do GitHub (baixado pelo NAVEGADOR) e o artigo por link pela importação de página que já existe
 * (`/api/import/web`, o único caminho que passa pelo servidor, e a tela diz isso). Livros e arquivos nunca vão ao
 * servidor. Quando termina, o cartão "Pronto!" oferece abrir agora, ver em Meus livros e baixar a cópia.
 */
export default function TrazerOSeu({
  aoAbrir,
  aoVerMeusLivros,
}: {
  aoAbrir: (livro: MeuLivro) => void;
  aoVerMeusLivros?: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'parado' });
  const [url, setUrl] = useState('');
  const [urlDoLivro, setUrlDoLivro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [lembrete, setLembrete] = useState(false);
  const [semCopia, setSemCopia] = useState(false);
  const saiuParaUmaFonte = useRef(false);
  const campoDoArquivo = useRef<HTMLInputElement>(null);
  const zona = useRef<HTMLDivElement>(null);
  const cartaoPronto = useRef<HTMLDivElement>(null);
  const mensagemDeErro = useRef<HTMLParagraphElement>(null);
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

  /* Terminou: o foco vai para o cartão "Pronto!" (quem usa teclado ou leitor de tela cai nele). */
  useEffect(() => {
    if (estado.tipo === 'pronto') cartaoPronto.current?.focus();
    /* No celular a mensagem fica abaixo da dobra: traz o erro para a vista. */
    if (estado.tipo === 'erro') mensagemDeErro.current?.scrollIntoView?.({ block: 'center' });
  }, [estado]);

  const concluir = async (
    dados: Omit<MeuLivro, 'id' | 'adicionadoEm' | 'status' | 'etiquetas' | 'progresso'>,
    capitulos: CapituloDeTexto[],
    extras: { arquivo?: Blob; copia?: Blob; nomeDoArquivo?: string } = {},
  ) => {
    const id = novoIdDeLivroTrazido();
    const conteudo = {
      id,
      capitulos,
      ...(extras.arquivo ? { arquivo: extras.arquivo } : {}),
      ...(extras.copia ? { copia: extras.copia } : {}),
      ...(extras.nomeDoArquivo ? { nomeDoArquivo: extras.nomeDoArquivo } : {}),
    };
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
    setSemCopia(false);
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
      {
        arquivo: lido.arquivo,
        copia: lido.copia,
        nomeDoArquivo: lido.nomeDoArquivo,
      },
    );

  const falhou = (e: unknown) => {
    const erro = comoErroDoLivro(e);
    setEstado({
      tipo: 'erro',
      motivo: erro.motivo,
      mensagem: mensagemDoMotivo(erro.motivo, erro.motivo === 'formato' ? erro.message : ''),
    });
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
        {
          titulo: pagina.title || endereco,
          origem: 'link',
          formato: 'web',
          url: endereco,
          idioma: pagina.lang,
        },
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

  const abrirAjudaDoDrm = () => {
    const ajuda = document.querySelector<HTMLDetailsElement>('[data-testid="ajuda-kindle"]');
    if (!ajuda) return;
    ajuda.open = true;
    ajuda.scrollIntoView?.({ block: 'center' });
    ajuda.querySelector('summary')?.focus();
  };

  const ocupado = estado.tipo === 'lendo';

  return (
    <section className="lv-trazer" aria-labelledby="lv-trazer-titulo" data-testid="trazer-o-seu">
      <header>
        <h2 id="lv-trazer-titulo">{t('Trazer um livro seu')}</h2>
        <p>
          {t(
            'Leia aqui um livro, um documento ou um artigo que você já tem. Ele fica em Meus livros, neste aparelho: o arquivo não vai para a internet.',
          )}
        </p>
      </header>

      <Passos />

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
          <b>{t('Solte o arquivo aqui')}</b>
          <span>{t('Ou toque para escolher um arquivo do seu aparelho.')}</span>
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
          accept={EXTENSOES_ACEITAS}
          onChange={(e) => {
            void aoEscolherArquivo(e.target.files?.[0]);
            e.target.value = '';
          }}
          data-testid="arquivo-do-livro"
        />
        <FormatosAceitos />
        <p className="lv-nota lv-drm" data-testid="linha-drm">
          <ShieldCheck aria-hidden />
          <span>
            {t('Livros com proteção (DRM) não abrem.')}{' '}
            <button type="button" className="lv-link" onClick={abrirAjudaDoDrm}>
              {t('O que é isso?')}
            </button>
          </span>
        </p>
        <p className="lv-nota">
          {t(
            'Documentos (DOCX, TXT, HTML, Markdown) viram texto: títulos e parágrafos ficam, imagens e tabelas não. PDF só com texto: ainda não lemos PDF escaneado.',
          )}
        </p>
        <AvisoDeDireitos testid="aviso-de-direitos" />
      </div>

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
          <p
            ref={mensagemDeErro}
            role="alert"
            className="lv-erro"
            data-testid="erro-do-trazer"
            data-motivo={estado.motivo}
          >
            {estado.mensagem}
          </p>
        )}
        {estado.tipo === 'pronto' && (
          <div
            ref={cartaoPronto}
            tabIndex={-1}
            className="q-cartao lv-pronto"
            data-testid="trazido"
            aria-labelledby="lv-pronto-titulo"
          >
            <h3 id="lv-pronto-titulo">{t('Pronto!')}</h3>
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
                {t('Abrir agora')}
              </button>
              {aoVerMeusLivros && (
                <button type="button" className="q-ctl" onClick={aoVerMeusLivros}>
                  <Library aria-hidden /> {t('Ver em Meus livros')}
                </button>
              )}
              {estado.livro.formato !== 'web' && (
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() => void baixarCopiaDoLivro(estado.livro).then((ok) => setSemCopia(!ok))}
                >
                  <Download aria-hidden /> {t('Baixar cópia do arquivo')}
                </button>
              )}
            </div>
            {semCopia && (
              <p className="lv-nota" role="status">
                {t('Não achei o arquivo neste aparelho para baixar. Traga-o de novo.')}
              </p>
            )}
          </div>
        )}
      </div>

      <form className="q-cartao" onSubmit={(e) => void aoTrazerLivroDoLink(e)} data-testid="form-link-de-livro">
        <h3>
          <Link2 aria-hidden /> {t('Colar o link de um livro')}
        </h3>
        <p className="lv-nota">
          {t(
            'Cole o endereço de um arquivo de livro (.epub, .pdf, .mobi, .docx, .txt…) do GitHub (raw.githubusercontent.com). O seu navegador baixa o arquivo direto: ele não passa pelo Frasy.',
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
