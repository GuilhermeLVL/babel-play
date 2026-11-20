import { useMemo, useState } from 'react';

import { rotuloDaCobertura, sugestoesDoCatalogo } from '../../../core/leitura/coberturaDoTexto';
import {
  type FichaDeTexto,
  NIVEIS_DO_TEXTO,
  type NivelDoTexto,
  nivelNumerico,
} from '../../../core/leitura/fichaDeTexto';
import { t } from '../../../lib/i18n';
import { minutosDoTexto, nomeDaCategoria, nomeDoRotulo, rotuloDoNivel, SELO_DE_ORIGEM } from './rotulos';
import type { Conhecimento } from './useConhecimento';

/**
 * T1 — O CATÁLOGO DE LEITURAS (spec `leitura-ativa-acervo`). Filtros por nível e por categoria, a seção do topo
 * ("Para você agora" na faixa de bom desafio, ou "Comece por aqui" sem histórico) e a lista, com os lidos no fim.
 * A cobertura é calculada no aparelho e só aparece quando o número é honesto.
 */
export default function Catalogo(props: {
  fichas: FichaDeTexto[];
  cobertura: ReadonlyMap<string, number>;
  conhecimento: Conhecimento;
  lidos: ReadonlySet<string>;
  aoAbrir: (id: string) => void;
}) {
  const { fichas, cobertura, conhecimento, lidos, aoAbrir } = props;
  const [nivel, setNivel] = useState<NivelDoTexto | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(fichas.map((f) => f.categoria))], [fichas]);

  const comNumero = (id: string) =>
    rotuloDaCobertura({
      porcentagem: cobertura.get(id) ?? 0,
      sessoes: conhecimento.sessoes,
      temConta: conhecimento.temConta,
    });
  const honesto = fichas.length > 0 && comNumero(fichas[0].id) !== null;
  const sugestoes = sugestoesDoCatalogo(fichas, honesto ? cobertura : null, lidos);

  const filtradas = fichas
    .filter((f) => (!nivel || f.nivel === nivel) && (!categoria || f.categoria === categoria))
    .sort((a, b) => Number(lidos.has(a.id)) - Number(lidos.has(b.id)));
  const semFiltro = !nivel && !categoria;

  const cartao = (f: FichaDeTexto) => {
    const r = comNumero(f.id);
    const lido = lidos.has(f.id);
    return (
      <li key={f.id}>
        <button type="button" className="la-cartao" onClick={() => aoAbrir(f.id)} data-texto={f.id}>
          <h3 lang="en">{f.titulo}</h3>
          <span className="la-meta">
            {nomeDaCategoria(f.categoria)} · {rotuloDoNivel(f)} · {minutosDoTexto(f.texto)}
          </span>
          {lido ? (
            <span className="la-lido">{t('Lido ✓')}</span>
          ) : (
            r && (
              <span className="la-cobertura">
                {t('Você já sabe {n}%', { n: r.porcentagem })}
                <span className="la-rotulo" data-rotulo={r.rotulo}>
                  {nomeDoRotulo(r.rotulo)}
                </span>
              </span>
            )
          )}
          <span className="la-selo">{SELO_DE_ORIGEM()}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="q-palco la" data-testid="leitura-ativa-catalogo">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{t('Leitura ativa')}</p>
          <h1>{t('Leituras')}</h1>
          <p className="la-sub">{t('Textos curtos em inglês para ouvir, ler em voz alta e escrever.')}</p>
        </div>
      </header>

      <div className="la-filtros" role="group" aria-label={t('Filtrar por nível')}>
        <button type="button" className="q-chip" aria-pressed={!nivel} onClick={() => setNivel(null)}>
          {t('Todos os níveis')}
        </button>
        {NIVEIS_DO_TEXTO.map((n) => (
          <button
            key={n}
            type="button"
            className="q-chip"
            aria-pressed={nivel === n}
            onClick={() => setNivel(nivel === n ? null : n)}
          >
            {t('Nível {n}', { n: nivelNumerico(n) })}
          </button>
        ))}
      </div>
      <div className="la-filtros" role="group" aria-label={t('Filtrar por categoria')}>
        <button type="button" className="q-chip" aria-pressed={!categoria} onClick={() => setCategoria(null)}>
          {t('Todas as categorias')}
        </button>
        {categorias.map((c) => (
          <button
            key={c}
            type="button"
            className="q-chip"
            aria-pressed={categoria === c}
            onClick={() => setCategoria(categoria === c ? null : c)}
          >
            {nomeDaCategoria(c)}
          </button>
        ))}
      </div>

      {semFiltro && sugestoes.ids.length > 0 && (
        <section className="q-secao" aria-labelledby="la-sugestoes">
          <header>
            <h2 id="la-sugestoes">{sugestoes.titulo === 'comece' ? t('Comece por aqui') : t('Para você agora')}</h2>
          </header>
          <ul className="la-lista">
            {sugestoes.ids.map((id) => fichas.find((f) => f.id === id)).map((f) => f && cartao(f))}
          </ul>
        </section>
      )}

      <section className="q-secao" aria-labelledby="la-todos">
        <header>
          <h2 id="la-todos">{t('Todos os textos')}</h2>
        </header>
        {filtradas.length === 0 ? (
          <div className="q-vazio" data-testid="leitura-ativa-vazio">
            <p>{t('Nenhum texto com esses filtros.')}</p>
            <div className="q-acoes">
              <button
                type="button"
                className="q-ctl pri"
                onClick={() => {
                  setNivel(null);
                  setCategoria(null);
                }}
              >
                {t('Limpar filtros')}
              </button>
            </div>
          </div>
        ) : (
          <ul className="la-lista">{filtradas.map(cartao)}</ul>
        )}
      </section>

      {!conhecimento.temConta && (
        <p className="la-credito">{t('Entre para o Frasy lembrar das palavras que você já sabe.')}</p>
      )}
    </div>
  );
}
