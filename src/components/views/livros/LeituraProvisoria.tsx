import { ArrowLeft, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { t } from '../../../lib/i18n';
import { direcaoDoTexto } from '../../../lib/languages';
import { marcarAberto } from '../../../lib/livros/meusLivros';
import { CopiaIndisponivel, type TextoAberto } from '../../../lib/livros/textoDoLivro';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; texto: TextoAberto };

/**
 * A LEITURA PROVISÓRIA (L1). É o que `abrirLivroNoLeitor` abre até o leitor da L2 chegar: o texto do livro,
 * capítulo por capítulo, buscado pelo navegador direto da fonte. Sem paginação, sem grifos, sem posição
 * salva, e a tela diz isso em uma linha, sem prometer data.
 */
export default function LeituraProvisoria({
  id,
  titulo,
  idioma,
  credito,
  abrir,
  aoVoltar,
}: {
  id: string;
  titulo: string;
  idioma?: string;
  credito?: string;
  /** Abre o texto (da fonte, ou do aparelho para um livro trazido). */
  abrir: () => Promise<TextoAberto | null>;
  aoVoltar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [capitulo, setCapitulo] = useState(0);
  const [corpo, setCorpo] = useState<string | null>(null);
  const artigo = useRef<HTMLElement>(null);

  useEffect(() => {
    let vivo = true;
    setEstado({ tipo: 'carregando' });
    abrir()
      .then((texto) => {
        if (!vivo) return;
        if (!texto) {
          setEstado({
            tipo: 'erro',
            mensagem: t('O conteúdo deste livro não está mais neste aparelho. Traga o arquivo de novo.'),
          });
          return;
        }
        marcarAberto(id);
        setEstado({ tipo: 'pronto', texto });
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setEstado({
          tipo: 'erro',
          mensagem:
            e instanceof CopiaIndisponivel
              ? t(
                  'A cópia revisada deste livro ainda não foi publicada. Tente um livro do Standard Ebooks ou da Wikisource.',
                )
              : t('Não conseguimos abrir o texto agora ({motivo}). Confira a conexão e tente de novo.', {
                  motivo: e instanceof Error ? e.message : String(e),
                }),
        });
      });
    return () => {
      vivo = false;
    };
    // `abrir` muda a cada render de quem chama; o que identifica o livro é o id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (estado.tipo !== 'pronto') return;
    let vivo = true;
    setCorpo(null);
    estado.texto
      .lerCapitulo(capitulo)
      .then((c) => vivo && setCorpo(c))
      .catch(() => vivo && setCorpo(''));
    return () => {
      vivo = false;
    };
  }, [estado, capitulo]);

  const irPara = (i: number) => {
    setCapitulo(i);
    artigo.current?.scrollIntoView({ block: 'start' });
    artigo.current?.focus({ preventScroll: true });
  };

  const titulos = estado.tipo === 'pronto' ? estado.texto.titulos : [];

  return (
    <div className="q-palco lv lv-leitura" data-testid="leitura-provisoria">
      <header className="q-cab">
        <button type="button" className="q-ctl q-voltar" onClick={aoVoltar} aria-label={t('Voltar')}>
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <p className="q-sobre">{t('Leitura')}</p>
          <h1 lang={idioma}>{titulo}</h1>
        </div>
      </header>
      <p className="lv-aviso">
        <Info aria-hidden />
        {t('Leitura simples: ainda sem marcar a página nem grifar. O leitor completo vem numa próxima versão.')}
      </p>

      {estado.tipo === 'carregando' && (
        <div className="q-carregando" role="status">
          {t('Abrindo o livro…')}
        </div>
      )}
      {estado.tipo === 'erro' && (
        <div className="q-vazio" role="alert">
          <p>{estado.mensagem}</p>
          <div className="q-acoes">
            <button type="button" className="q-ctl" onClick={aoVoltar}>
              {t('Voltar')}
            </button>
          </div>
        </div>
      )}
      {estado.tipo === 'pronto' && (
        <>
          {titulos.length > 1 && (
            <nav className="lv-capitulos" aria-label={t('Capítulos')}>
              <button
                type="button"
                className="q-ctl"
                onClick={() => irPara(capitulo - 1)}
                disabled={capitulo === 0}
                aria-label={t('Capítulo anterior')}
              >
                <ChevronLeft aria-hidden />
              </button>
              <label className="q-campo lv-capitulo-escolha">
                <span className="sr-only">{t('Capítulo')}</span>
                <select value={capitulo} onChange={(e) => irPara(Number(e.target.value))}>
                  {titulos.map((tt, i) => (
                    <option key={i} value={i}>
                      {tt}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="q-ctl"
                onClick={() => irPara(capitulo + 1)}
                disabled={capitulo >= titulos.length - 1}
                aria-label={t('Próximo capítulo')}
              >
                <ChevronRight aria-hidden />
              </button>
            </nav>
          )}
          <article
            ref={artigo}
            tabIndex={-1}
            className="lv-texto"
            lang={idioma}
            dir={direcaoDoTexto(idioma)}
            aria-busy={corpo === null}
            data-testid="texto-do-livro"
          >
            {corpo === null ? (
              <div className="q-esqueleto" aria-hidden />
            ) : corpo ? (
              corpo.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
            ) : (
              <p>{t('Este capítulo veio vazio.')}</p>
            )}
          </article>
          {credito && <p className="lv-nota">{credito}</p>}
        </>
      )}
    </div>
  );
}
