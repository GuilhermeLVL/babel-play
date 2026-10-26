import { Search, SlidersHorizontal, X } from 'lucide-react';
import React, { useId, useMemo, useState } from 'react';

import {
  comecePorAqui,
  contarPor,
  filtrarLivros,
  type FiltrosDoCatalogo,
  ordenarLivros,
  paraOSeuNivel,
  prateleiras,
  type Tamanho,
  tamanhoDe,
} from '../../../core/livros/catalogo';
import {
  type CategoriaDoLivro,
  CATEGORIAS_DO_LIVRO,
  type FonteDoLivro,
  FONTES_DO_LIVRO,
  type LivroDoCatalogo,
  type LivroExcluido,
  NIVEIS_DO_LIVRO,
  type NivelDoLivro,
} from '../../../core/livros/tipos';
import { t, tp } from '../../../lib/i18n';
import CartaoDoLivro from './CartaoDoLivro';
import PorQueNaoEsta from './PorQueNaoEsta';
import { rotuloDaCategoria, rotuloDaFonte, rotuloDoIdioma, rotuloDoTamanho } from './rotulos';

const TAMANHOS: Tamanho[] = ['curto', 'medio', 'longo'];
/** As prateleiras da vitrine, na ordem. `simples` já é o "Comece por aqui"; `classicos` abre a lista. */
const ORDEM_DAS_PRATELEIRAS = CATEGORIAS_DO_LIVRO.filter((c) => c !== 'simples');

function Prateleira({
  titulo,
  descricao,
  livros,
  aoAbrir,
  controle,
  id,
}: {
  titulo: string;
  descricao?: string;
  livros: LivroDoCatalogo[];
  aoAbrir: (l: LivroDoCatalogo) => void;
  controle?: React.ReactNode;
  id: string;
}) {
  return (
    <section className="q-secao lv-prateleira" aria-labelledby={id} data-prateleira={id}>
      <header>
        <div>
          <h2 id={id}>{titulo}</h2>
          {descricao && <p>{descricao}</p>}
        </div>
        {controle}
      </header>
      {livros.length > 0 ? (
        <ul className="lv-fileira">
          {livros.map((l) => (
            <CartaoDoLivro key={l.id} livro={l} aoAbrir={() => aoAbrir(l)} />
          ))}
        </ul>
      ) : (
        <p className="lv-nota">{t('Ainda não há livro deste jeito neste idioma.')}</p>
      )}
    </section>
  );
}

export default function Vitrine({
  livros,
  exclusoes,
  ano,
  anoLimite,
  idioma,
  aoTrocarIdioma,
  nivel,
  aoTrocarNivel,
  menor,
  aoAbrir,
  aoTrazer,
}: {
  /** Só o que este leitor pode ver (`livrosVisiveis`). */
  livros: readonly LivroDoCatalogo[];
  exclusoes: readonly LivroExcluido[];
  ano: number;
  anoLimite: number;
  idioma: string;
  aoTrocarIdioma: (idioma: string) => void;
  nivel: NivelDoLivro;
  aoTrocarNivel: (n: NivelDoLivro) => void;
  menor: boolean;
  aoAbrir: (l: LivroDoCatalogo) => void;
  aoTrazer: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [niveis, setNiveis] = useState<NivelDoLivro[]>([]);
  const [categoria, setCategoria] = useState<CategoriaDoLivro | ''>('');
  const [tamanho, setTamanho] = useState<Tamanho | ''>('');
  const [fonte, setFonte] = useState<FonteDoLivro | ''>('');
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const idDosFiltros = useId();

  const porIdioma = useMemo(() => contarPor(livros, (l) => l.idioma), [livros]);
  const idiomas = useMemo(
    () => [...porIdioma.keys()].sort((a, b) => rotuloDoIdioma(a).localeCompare(rotuloDoIdioma(b), 'pt-BR')),
    [porIdioma],
  );
  const doIdioma = useMemo(() => livros.filter((l) => l.idioma === idioma), [livros, idioma]);

  const filtros: FiltrosDoCatalogo = {
    texto,
    idioma,
    niveis,
    categoria: categoria || null,
    tamanho: tamanho || null,
    fonte: fonte || null,
  };
  const ativos = niveis.length + (categoria ? 1 : 0) + (tamanho ? 1 : 0) + (fonte ? 1 : 0);
  const filtrando = !!texto.trim() || ativos > 0;
  const resultados = filtrando ? ordenarLivros(filtrarLivros(livros, filtros), texto) : [];
  /* A mesma busca nos outros idiomas: "nada em inglês" não é "nada". */
  const emOutros =
    filtrando && texto.trim()
      ? filtrarLivros(livros, { ...filtros, idioma: null }).filter((l) => l.idioma !== idioma)
      : [];
  const outroIdioma = emOutros.length ? [...contarPor(emOutros, (l) => l.idioma)].sort((a, b) => b[1] - a[1])[0] : null;

  const contagemCategorias = contarPor(doIdioma, (l) => l.categorias);
  const contagemFontes = contarPor(doIdioma, (l) => l.fonte);
  const contagemTamanhos = contarPor(doIdioma, (l) => tamanhoDe(l.palavras));
  const contagemNiveis = contarPor(doIdioma, (l) => l.nivel);

  const limpar = () => {
    setTexto('');
    setNiveis([]);
    setCategoria('');
    setTamanho('');
    setFonte('');
  };

  return (
    <>
      <section className="lv-busca" role="search" aria-label={t('Buscar livros')}>
        <div className="lv-busca-linha">
          <label className="q-campo lv-campo-busca">
            <span className="sr-only">{t('Buscar por título ou autor')}</span>
            <Search aria-hidden className="lv-lupa" />
            <input
              type="search"
              autoComplete="off"
              placeholder={t('Buscar por título ou autor')}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              data-testid="busca-de-livros"
            />
          </label>
          <label className="q-campo lv-idioma">
            <span className="sr-only">{t('Idioma dos livros')}</span>
            <select value={idioma} onChange={(e) => aoTrocarIdioma(e.target.value)} data-testid="idioma-dos-livros">
              {idiomas.map((i) => (
                <option key={i} value={i}>
                  {rotuloDoIdioma(i)} ({porIdioma.get(i)})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="q-chip"
            aria-expanded={filtrosAbertos}
            aria-controls={idDosFiltros}
            onClick={() => setFiltrosAbertos((a) => !a)}
          >
            <SlidersHorizontal aria-hidden /> {t('Filtros')}
            {ativos > 0 && <span className="lv-contagem">{ativos}</span>}
          </button>
        </div>

        <div id={idDosFiltros} className="lv-filtros" hidden={!filtrosAbertos} data-testid="filtros-de-livros">
          <fieldset className="lv-grupo">
            <legend>{t('Nível')}</legend>
            <div className="lv-opcoes">
              {NIVEIS_DO_LIVRO.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="q-chip"
                  aria-pressed={niveis.includes(n)}
                  disabled={!contagemNiveis.get(n) && !niveis.includes(n)}
                  onClick={() => setNiveis((ns) => (ns.includes(n) ? ns.filter((x) => x !== n) : [...ns, n]))}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="lv-grupo">
            <legend>{t('Tamanho')}</legend>
            <div className="lv-opcoes">
              {TAMANHOS.map((tm) => (
                <button
                  key={tm}
                  type="button"
                  className="q-chip"
                  aria-pressed={tamanho === tm}
                  disabled={!contagemTamanhos.get(tm) && tamanho !== tm}
                  onClick={() => setTamanho((x) => (x === tm ? '' : tm))}
                >
                  {rotuloDoTamanho(tm)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="q-campo">
            <span>{t('Categoria')}</span>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaDoLivro | '')}
              data-testid="categoria-dos-livros"
            >
              <option value="">{t('Todas')}</option>
              {CATEGORIAS_DO_LIVRO.filter((c) => contagemCategorias.get(c)).map((c) => (
                <option key={c} value={c}>
                  {rotuloDaCategoria(c)} ({contagemCategorias.get(c)})
                </option>
              ))}
            </select>
          </label>
          <label className="q-campo">
            <span>{t('Fonte')}</span>
            <select value={fonte} onChange={(e) => setFonte(e.target.value as FonteDoLivro | '')}>
              <option value="">{t('Todas')}</option>
              {FONTES_DO_LIVRO.filter((f) => contagemFontes.get(f)).map((f) => (
                <option key={f} value={f}>
                  {rotuloDaFonte(f)} ({contagemFontes.get(f)})
                </option>
              ))}
            </select>
          </label>
          {ativos > 0 && (
            <button type="button" className="q-ctl" onClick={limpar}>
              <X aria-hidden /> {t('Limpar filtros')}
            </button>
          )}
        </div>
      </section>

      {filtrando ? (
        <section className="q-secao" aria-labelledby="lv-resultados" data-testid="resultados-de-livros">
          <header>
            <div>
              <h2 id="lv-resultados" aria-live="polite">
                {resultados.length === 0
                  ? t('Nenhum livro encontrado')
                  : tp(resultados.length, '{n} livro encontrado', '{n} livros encontrados')}
              </h2>
              {outroIdioma && (
                <p>
                  {tp(outroIdioma[1], 'Há {n} resultado em {idioma}.', 'Há {n} resultados em {idioma}.', {
                    idioma: rotuloDoIdioma(outroIdioma[0]).toLowerCase(),
                  })}{' '}
                  <button type="button" className="lv-link" onClick={() => aoTrocarIdioma(outroIdioma[0])}>
                    {t('Ver em {idioma}', { idioma: rotuloDoIdioma(outroIdioma[0]).toLowerCase() })}
                  </button>
                </p>
              )}
            </div>
            <button type="button" className="q-ctl" onClick={limpar}>
              <X aria-hidden /> {t('Limpar busca')}
            </button>
          </header>
          {resultados.length > 0 && (
            <ul className="lv-grade">
              {resultados.map((l) => (
                <CartaoDoLivro key={l.id} livro={l} aoAbrir={() => aoAbrir(l)} />
              ))}
            </ul>
          )}
          {resultados.length === 0 && (
            <PorQueNaoEsta
              busca={texto}
              exclusoes={exclusoes}
              ano={ano}
              anoLimite={anoLimite}
              menor={menor}
              aoTrazer={aoTrazer}
            />
          )}
        </section>
      ) : (
        <>
          <Prateleira
            id="lv-comece"
            titulo={t('Comece por aqui')}
            descricao={t('Os mais lidos entre os mais fáceis deste idioma.')}
            livros={comecePorAqui(doIdioma, idioma)}
            aoAbrir={aoAbrir}
          />
          <Prateleira
            id="lv-seu-nivel"
            titulo={t('Para o seu nível')}
            descricao={t('O seu nível e o de baixo: ler um pouco abaixo do limite dá fluência.')}
            livros={paraOSeuNivel(doIdioma, idioma, nivel)}
            aoAbrir={aoAbrir}
            controle={
              <label className="q-campo lv-nivel">
                <span>{t('Seu nível')}</span>
                <select
                  value={nivel}
                  onChange={(e) => aoTrocarNivel(e.target.value as NivelDoLivro)}
                  data-testid="seu-nivel"
                >
                  {NIVEIS_DO_LIVRO.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            }
          />
          {prateleiras(doIdioma, idioma, ORDEM_DAS_PRATELEIRAS).map((p) => (
            <Prateleira
              key={p.categoria}
              id={`lv-cat-${p.categoria}`}
              titulo={rotuloDaCategoria(p.categoria)}
              livros={p.livros}
              aoAbrir={aoAbrir}
            />
          ))}
          <details className="lv-porque-dobra">
            <summary>{t('Não achou um livro? Por que alguns livros não estão aqui')}</summary>
            <PorQueNaoEsta
              busca=""
              exclusoes={exclusoes}
              ano={ano}
              anoLimite={anoLimite}
              menor={menor}
              aoTrazer={aoTrazer}
            />
          </details>
        </>
      )}
    </>
  );
}
