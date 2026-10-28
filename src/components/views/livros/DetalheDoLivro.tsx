import { ArrowLeft, BookmarkCheck, BookmarkPlus, BookOpen, ExternalLink, ImagePlus, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';

import { capaDoLivro } from '../../../core/livros/capas';
import { tamanhoDe } from '../../../core/livros/catalogo';
import type { LivroDoCatalogo, Pessoa } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';
import { direcaoDoTexto } from '../../../lib/languages';
import { idDoCatalogo } from '../../../lib/livros/abrir';
import { useCapaLocal } from '../../../lib/livros/capasLocais';
import { guardarMeuLivro, removerMeuLivro, useMeusLivros } from '../../../lib/livros/meusLivros';
import { autoresDe, CapaDoLivro, rotuloDoTempo } from './CartaoDoLivro';
import OutrosIdiomasDaObra from './OutrosIdiomasDaObra';
import { rotuloDaCategoria, rotuloDaClassificacao, rotuloDaFonte, rotuloDoIdioma, rotuloDoTamanho } from './rotulos';
import TrocarCapa from './TrocarCapa';

const comAno = (p: Pessoa) => (p.anoMorte != null ? `${p.nome} (†${p.anoMorte})` : p.nome);
const numero = (n: number) => n.toLocaleString('pt-BR');

/**
 * O DETALHE DE UM LIVRO: o que ele é, de onde vem, por que é legal tê-lo aqui, o nível estimado e o "Ler".
 * O selo (CAT02) diz em uma linha a razão de o livro estar no catálogo: domínio público no Brasil, o ano de
 * morte de quem escreveu (e de quem traduziu) e a fonte.
 */
export default function DetalheDoLivro({
  livro,
  aoVoltar,
  aoLer,
  outrasEdicoes = [],
  aoAbrirEdicao = () => {},
  aoLerEdicao = () => {},
}: {
  livro: LivroDoCatalogo;
  aoVoltar: () => void;
  aoLer: () => void;
  /** As edições da mesma obra em OUTROS idiomas que este leitor pode ver (filtro legal e etário já aplicados). */
  outrasEdicoes?: readonly LivroDoCatalogo[];
  aoAbrirEdicao?: (l: LivroDoCatalogo) => void;
  aoLerEdicao?: (l: LivroDoCatalogo) => void;
}) {
  const meus = useMeusLivros();
  const [trocando, setTrocando] = useState(false);
  const capaLocal = useCapaLocal(idDoCatalogo(livro.id));
  const capaDoCatalogo = capaDoLivro(livro);
  const guardado = meus.some((m) => m.id === livro.id);
  const anoDoSelo = Math.max(...livro.autores.map((a) => a.anoMorte ?? 0));
  const selo = [
    t('Domínio público no Brasil'),
    livro.tradutores.length
      ? t('autor †{ano}, tradutor †{ano2}', {
          ano: anoDoSelo,
          ano2: Math.max(...livro.tradutores.map((p) => p.anoMorte ?? 0)),
        })
      : t('autor †{ano}', { ano: anoDoSelo }),
    t('fonte {fonte}', { fonte: rotuloDaFonte(livro.fonte) }),
  ].join(' · ');

  const alternarGuardado = () => {
    if (guardado) void removerMeuLivro(livro.id);
    else
      guardarMeuLivro({
        id: livro.id,
        titulo: livro.titulo,
        autor: autoresDe(livro),
        origem: 'catalogo',
        formato: livro.fonte === 'wikisource' ? 'web' : 'epub',
        idioma: livro.idioma,
      });
  };

  return (
    <div className="q-palco lv lv-detalhe" data-testid="livro-detalhe">
      <header className="q-cab">
        <button type="button" className="q-ctl q-voltar" onClick={aoVoltar} aria-label={t('Voltar ao catálogo')}>
          <ArrowLeft aria-hidden />
        </button>
        <div>
          <p className="q-sobre">
            {rotuloDoIdioma(livro.idioma)} · {rotuloDaFonte(livro.fonte)}
          </p>
          <h1 lang={livro.idioma} dir={direcaoDoTexto(livro.idioma)}>
            {livro.titulo}
          </h1>
        </div>
      </header>

      <div className="lv-detalhe-corpo">
        <div className="lv-detalhe-capa">
          <CapaDoLivro livro={livro} grande decorativa={false} />
          {capaDoCatalogo && !capaLocal && <small className="lv-capa-credito">{capaDoCatalogo.credito}</small>}
          <button type="button" className="q-chip" onClick={() => setTrocando(true)} data-testid="trocar-capa-abrir">
            <ImagePlus aria-hidden /> {t('Trocar capa')}
          </button>
        </div>
        <div className="lv-detalhe-info">
          <p className="lv-autores">
            {t('de {autores}', { autores: livro.autores.map(comAno).join(', ') })}
            {livro.tradutores.length > 0 && (
              <>
                <br />
                {t('tradução de {nomes}', { nomes: livro.tradutores.map(comAno).join(', ') })}
              </>
            )}
          </p>
          <p className="lv-selo-legal" data-testid="selo-legal">
            <ShieldCheck aria-hidden /> {selo}
          </p>
          <div className="q-acoes">
            <button type="button" className="q-ctl pri" onClick={aoLer} data-testid="ler-livro">
              <BookOpen aria-hidden /> {t('Ler')}
            </button>
            <button type="button" className="q-ctl" onClick={alternarGuardado} aria-pressed={guardado}>
              {guardado ? <BookmarkCheck aria-hidden /> : <BookmarkPlus aria-hidden />}
              {guardado ? t('Em Meus livros') : t('Guardar em Meus livros')}
            </button>
            {livro.formatos.pagina && (
              <a className="q-chip" href={livro.formatos.pagina} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> {t('Ver na fonte')}
              </a>
            )}
          </div>

          <OutrosIdiomasDaObra edicoes={outrasEdicoes} aoAbrir={aoAbrirEdicao} aoLer={aoLerEdicao} />

          <dl className="lv-ficha">
            <div>
              <dt>{t('Nível estimado')}</dt>
              <dd>
                {livro.nivel ?? t('Sem estimativa')}
                {livro.nivelDetalhe && (
                  <small>
                    {[
                      livro.nivelDetalhe.cobertura && t('vocabulário {n}', { n: livro.nivelDetalhe.cobertura }),
                      livro.nivelDetalhe.legibilidade && t('frases {n}', { n: livro.nivelDetalhe.legibilidade }),
                      t('{n} amostras de 1000 palavras', { n: livro.nivelDetalhe.amostras }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('Tamanho')}</dt>
              <dd>
                {rotuloDoTamanho(tamanhoDe(livro.palavras))}
                <small>
                  {t('{n} palavras · cerca de {tempo} de leitura', {
                    n: numero(livro.palavras),
                    tempo: rotuloDoTempo(livro.minutosEstimados),
                  })}
                </small>
              </dd>
            </div>
            {livro.categorias.length > 0 && (
              <div>
                <dt>{t('Categorias')}</dt>
                <dd>{livro.categorias.map(rotuloDaCategoria).join(', ')}</dd>
              </div>
            )}
            <div>
              <dt>{t('Faixa etária')}</dt>
              <dd>{rotuloDaClassificacao(livro.classificacao)}</dd>
            </div>
            <div>
              <dt>{t('Licença')}</dt>
              <dd>{livro.licenca}</dd>
            </div>
            <div>
              <dt>{t('Crédito')}</dt>
              <dd>{livro.credito}</dd>
            </div>
          </dl>

          {livro.resumo && (
            <p className="lv-resumo" lang={livro.idioma} dir={direcaoDoTexto(livro.idioma)}>
              {livro.resumo}
            </p>
          )}
          <p className="lv-nota">
            {t(
              'O nível é uma estimativa feita a partir do texto: o vocabulário comparado com as listas de cada nível e o tamanho das frases. Folhear as primeiras páginas ainda é o melhor teste.',
            )}
          </p>
        </div>
      </div>
      {trocando && (
        <TrocarCapa livroId={idDoCatalogo(livro.id)} titulo={livro.titulo} aoFechar={() => setTrocando(false)} />
      )}
    </div>
  );
}
