import { AlertTriangle, Inbox, RotateCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode, type RefObject, useId, useState } from 'react';

import { numero, t } from '../../../../lib/i18n';

/**
 * "TODAS AS PALAVRAS" NO META QUEST: o catálogo do Vocabulário no desenho do headset.
 *
 * Só apresentação. `CatalogoDePalavras.tsx` continua dono da busca (com a espera de 300 ms), da ordem,
 * dos filtros, da paginação por cursor no servidor e dos três estados (espera, erro, vazio); aqui chega
 * tudo pronto.
 *
 * O que muda de forma: os onze filtros (sete níveis e quatro origens) ficam atrás de "Filtros", que diz
 * quantos estão ligados; a tabela tem linhas altas, e a linha inteira abre a palavra (a palavra é um
 * botão de verdade, para o leitor de tela e para a resposta ao apontar).
 */

export interface LinhaDoCatalogo {
  id: string;
  palavra: string;
  traducao: string | null;
  nivel: string | null;
  /** De onde veio o nível, por extenso (a dica do computador). */
  dicaDoNivel: string;
  /** O mesmo, em duas palavras, ESCRITO na linha: no headset não há dica ao passar o ponteiro. */
  fonteDoNivel: string;
  origem: string;
  /** `null` = o cartão ainda não chegou do baralho. */
  estado: { rotulo: string; tom: string } | null;
}

export interface FiltroDoQuest {
  id: string;
  rotulo: string;
  /** `null` = o servidor não disse quantas há (modo sem conta): o chip fica sem número. */
  qtd: number | null;
  ativo: boolean;
  desligado: boolean;
}

export default function CatalogoDoQuest({
  carregando,
  carregandoMais,
  erro,
  total,
  geral,
  busca,
  aoBuscar,
  refDaBusca,
  ordem,
  ordens,
  aoOrdenar,
  niveis,
  aoAlternarNivel,
  origens,
  aoAlternarOrigem,
  temFiltro,
  aoLimpar,
  nota,
  linhas,
  aoAbrir,
  temMais,
  aoMostrarMais,
  aoTentarDeNovo,
  rodape,
}: {
  carregando: boolean;
  carregandoMais: boolean;
  erro: string | null;
  /** Quantas casam com a busca e os filtros. */
  total: number;
  /** Quantas há no caderno, sem filtro. */
  geral: number;
  busca: string;
  aoBuscar: (v: string) => void;
  refDaBusca: RefObject<HTMLInputElement | null>;
  ordem: string;
  ordens: Array<{ id: string; rotulo: string }>;
  aoOrdenar: (id: string) => void;
  niveis: FiltroDoQuest[];
  aoAlternarNivel: (id: string) => void;
  origens: FiltroDoQuest[];
  aoAlternarOrigem: (id: string) => void;
  /** Há busca ou filtro em uso (decide qual estado vazio aparece). */
  temFiltro: boolean;
  aoLimpar: () => void;
  /** A nota de início da contagem (só na ordem "Mais vistas"). */
  nota?: ReactNode;
  linhas: LinhaDoCatalogo[];
  aoAbrir: (id: string) => void;
  temMais: boolean;
  aoMostrarMais: () => void;
  aoTentarDeNovo: () => void;
  rodape?: ReactNode;
}) {
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const idFiltros = useId();
  const ligados = niveis.filter((n) => n.ativo).length + origens.filter((o) => o.ativo).length;

  const grupo = (rotulo: string, itens: FiltroDoQuest[], aoAlternar: (id: string) => void) => (
    <div className="qv-grupo" role="group" aria-label={rotulo}>
      <span className="q-rotulo">{rotulo}</span>
      {itens.map((f) => (
        <button
          key={f.id}
          type="button"
          className="q-aba"
          aria-pressed={f.ativo}
          disabled={f.desligado}
          onClick={() => aoAlternar(f.id)}
        >
          {f.rotulo}
          {f.qtd !== null && <span className="n">{numero(f.qtd)}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <section className="q-secao qv-catalogo" aria-label={t('Todas as palavras')} data-testid="catalogo-no-quest">
      <header>
        <div>
          <h2>{t('Todas as palavras')}</h2>
          <p>{t('Busque, filtre por nível e origem. Toque numa palavra para ouvir a pronúncia e ver a explicação.')}</p>
        </div>
        <span className="q-chip qv-quantas" aria-live="polite">
          {carregando
            ? t('Carregando as palavras…')
            : t('{n} de {total} no caderno', { n: numero(total), total: numero(geral) })}
        </span>
        <button
          type="button"
          className="q-ctl"
          aria-expanded={filtrosAbertos}
          aria-controls={idFiltros}
          onClick={() => setFiltrosAbertos((v) => !v)}
        >
          <SlidersHorizontal aria-hidden /> {t('Filtros')}
          {ligados > 0 && <span className="q-tag">{ligados}</span>}
        </button>
      </header>

      <div className="qv-busca">
        <label className="q-campo qv-campo-busca">
          <span className="sr">{t('Buscar palavra')}</span>
          <Search aria-hidden />
          <input
            ref={refDaBusca}
            type="search"
            autoComplete="off"
            placeholder={t('Buscar palavra ou tradução')}
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
          />
        </label>
        <label className="q-campo qv-ordem">
          <span className="sr">{t('Ordenar')}</span>
          <select aria-label={t('Ordenar')} value={ordem} onChange={(e) => aoOrdenar(e.target.value)}>
            {ordens.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtrosAbertos && (
        <div className="q-cartao qv-filtros" id={idFiltros}>
          {grupo(t('Nível'), niveis, aoAlternarNivel)}
          {grupo(t('Origem'), origens, aoAlternarOrigem)}
          {ligados > 0 && (
            <div className="q-acoes">
              <button type="button" className="q-ctl" onClick={aoLimpar}>
                <X aria-hidden /> {t('Limpar')}
              </button>
            </div>
          )}
        </div>
      )}

      {nota}

      <div id="tabela-palavras" aria-busy={carregando}>
        {erro ? (
          <div className="q-vazio" role="alert">
            <span className="q-ic">
              <AlertTriangle aria-hidden />
            </span>
            <h3>{t('Não consegui carregar seu vocabulário.')}</h3>
            <p>{erro}</p>
            <button type="button" className="q-ctl pri" onClick={aoTentarDeNovo}>
              <RotateCw aria-hidden /> {t('Tentar de novo')}
            </button>
          </div>
        ) : carregando ? (
          // Sem zeros durante a espera: mostrar "0" é afirmar um número falso.
          <div className="qv-espera" role="status" aria-label={t('Carregando as palavras…')}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="q-esqueleto" />
            ))}
          </div>
        ) : linhas.length === 0 ? (
          temFiltro ? (
            <div className="q-vazio">
              <span className="q-ic">
                <Search aria-hidden />
              </span>
              <h3>{t('Nada com esses filtros')}</h3>
              <p>{t('Tire um filtro de nível ou de origem, ou apague a busca.')}</p>
              <button type="button" className="q-ctl pri" onClick={aoLimpar}>
                <X aria-hidden /> {t('Limpar filtros')}
              </button>
            </div>
          ) : (
            <div className="q-vazio">
              <span className="q-ic">
                <Inbox aria-hidden />
              </span>
              <h3>{t('Seu vocabulário está vazio')}</h3>
              <p>{t('Capture uma sessão ou toque numa palavra durante a leitura para começar.')}</p>
            </div>
          )
        ) : (
          <div className="q-tabela-caixa">
            <table className="q-tabela qv-tabela">
              <thead>
                <tr>
                  <th>{t('Palavra')}</th>
                  <th>{t('Tradução')}</th>
                  <th className="qv-extra">{t('Nível')}</th>
                  <th className="qv-extra">{t('Origem')}</th>
                  <th>{t('Estado')}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.id}
                    className="clicavel"
                    data-palavra={l.palavra}
                    data-tocavel
                    onClick={() => aoAbrir(l.id)}
                  >
                    <td>
                      {/* A linha inteira é o alvo (`data-tocavel`: ela responde ao apontar); o botão é o
                          caminho do teclado e do leitor de tela, e o toque nele sobe para a linha. */}
                      <button
                        type="button"
                        className="qv-palavra"
                        aria-label={t('Abrir {palavra}', { palavra: l.palavra })}
                      >
                        {l.palavra}
                      </button>
                    </td>
                    <td className={l.traducao ? undefined : 'qv-apagado'}>{l.traducao || t('sem tradução')}</td>
                    <td className="qv-extra">
                      <span className="q-tag off" title={l.dicaDoNivel}>
                        {l.nivel ?? t('sem nível')}
                      </span>
                      <small className="qv-fonte">{l.fonteDoNivel}</small>
                    </td>
                    <td className="qv-extra">{l.origem}</td>
                    <td>
                      {l.estado ? <span className={`q-tag qv-estado ${l.estado.tom}`}>{l.estado.rotulo}</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!erro && !carregando && temMais && (
        <div className="q-acoes qv-mais">
          <button type="button" className="q-ctl" disabled={carregandoMais} onClick={aoMostrarMais}>
            {carregandoMais
              ? t('Carregando…')
              : t('Mostrar mais ({n} de {total})', { n: numero(linhas.length), total: numero(total) })}
          </button>
        </div>
      )}
      {rodape}
    </section>
  );
}
