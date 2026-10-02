/**
 * CATÁLOGO DE PALAVRAS (F5) — "Todas as palavras" da tela Vocabulário.
 *
 * A marcação é a do protótipo aprovado (`T.vocabulario` + `tabelaPalavras()` em
 * `docs/prototipos/consistencia-telas.html`): `.cartao.p5.secao` com o título de seção, a busca em
 * `.busca`, a ordenação num `select.campo`, os filtros de nível e origem como `.pill` numa linha
 * `.chips`, e a lista numa `table.tabela` (Palavra, Tradução, Nível, Origem, Estado).
 *
 * A LÓGICA É A DE SEMPRE: busca, filtros e ordenação resolvidos NO SERVIDOR (`/api/vocab/pagina`),
 * com cursor — a página chega de 200 em 200 e "Mostrar mais" pede a próxima. E os três estados que
 * o catálogo antigo não tinha: carregando, erro (com tentar de novo) e vazio.
 *
 * O que a linha da tabela mostra vem do cartão REAL (`cartoes`, o mesmo deck da tela): o estado do
 * FSRS e a procedência. Procedência que o cartão não declara aparece como "—", nunca adivinhada.
 */
import { AlertTriangle, BookOpen, Inbox, RotateCw, Search } from 'lucide-react';
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '../../../data/api';
import { useQuestNovo } from '../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../lib/i18n';
import type { VocabCard } from '../../../types';
import { IconeEmBloco, TituloDeSecao } from '../../ui';
import NotaDeContagem from './NotaDeContagem';
import CatalogoDoQuest from './quest/CatalogoDoQuest';

export interface ItemCatalogo {
  id: string;
  word: string;
  back: string | null;
  cefrLevel: string | null;
  cefrSource: string | null;
  occurrences: number;
  lastSeenAt: number | null;
  firstSeenAt: number | null;
  difficultyScore: number | null;
  dueAt: number | null;
  /** De onde o cartão veio (`vocab_occurrences.origin_kind`): 'sessao', 'trilha', 'manual', 'anki', 'legado'… */
  origens?: string[];
}

type Ordem = 'recentes' | 'frequentes' | 'dificuldade' | 'alfabetica' | 'nivel';
const ORDENS: Array<{ id: Ordem; rotulo: string }> = [
  { id: 'recentes', rotulo: 'Mais recentes' },
  { id: 'frequentes', rotulo: 'Mais vistas' },
  { id: 'dificuldade', rotulo: 'Mais difíceis' },
  { id: 'alfabetica', rotulo: 'A → Z' },
  { id: 'nivel', rotulo: 'Nível' },
];
const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'ausente'] as const;
const ORIGENS = [
  { id: 'sessao', rotulo: 'Sessão' },
  { id: 'trilha', rotulo: 'Trilha' },
  { id: 'manual', rotulo: 'Manual' },
  { id: 'legado', rotulo: 'Anterior à contagem' },
];

/** Estado do cartão, pela fase REAL do FSRS. `null` = o cartão ainda não chegou do deck. */
function estadoDe(c: VocabCard | undefined): { rotulo: string; tom: string } | null {
  if (!c) return null;
  if (!c.inDeck) return { rotulo: 'Suspensa', tom: 'neu' };
  if (c.fsrsState === 'New') return { rotulo: 'Nova', tom: 'acc' };
  if (c.fsrsState === 'Review') return { rotulo: 'Em revisão', tom: 'ok' };
  return { rotulo: 'Aprendendo', tom: 'ok' };
}

/**
 * Procedência do cartão: as origens gravadas em `vocab_occurrences` (vêm com a página), na ordem
 * de quem pesa mais; sem elas, o que o cartão do deck declara. Nada declarado = "—".
 */
const ROTULO_DA_ORIGEM: Record<string, string> = {
  trilha: 'Trilha',
  anki: 'Anki',
  sessao: 'Sessão',
  import: 'Importada',
  manual: 'Manual',
  legado: 'Anterior à contagem',
};
function origemDe(item: ItemCatalogo, c: VocabCard | undefined): string {
  const achada = Object.keys(ROTULO_DA_ORIGEM).find((k) => item.origens?.includes(k));
  if (achada) return ROTULO_DA_ORIGEM[achada];
  if (c?.daTrilha) return 'Trilha';
  if (c?.daAnki) return 'Anki';
  if (c?.sourceSessionId) return 'Sessão';
  return '—';
}

/** O filtro em uso no catálogo — o escopo "Filtradas" do Exportar usa o mesmo. */
export interface FiltroDoCatalogo {
  q: string;
  niveis: string[];
  origens: string[];
  total: number;
}

/** Os ids de TODAS as palavras que casam com o filtro (o catálogo só carrega 200 por vez). */
export async function idsDoFiltro(f: FiltroDoCatalogo): Promise<Set<string>> {
  const ids = new Set<string>();
  type Cursor = { valor: unknown; id: string } | null;
  let cursor: Cursor = null;
  for (let pagina = 0; pagina < 50; pagina++) {
    const p = new URLSearchParams({ limite: '500', ordem: 'recentes' });
    if (f.q) p.set('q', f.q);
    if (f.niveis.length) p.set('niveis', f.niveis.join(','));
    if (f.origens.length) p.set('origens', f.origens.join(','));
    if (cursor) {
      p.set('cursorValor', String(cursor.valor ?? ''));
      p.set('cursorId', cursor.id);
    }
    const res = await apiFetch(`/api/vocab/pagina?${p.toString()}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const dados = (await res.json()) as { itens: ItemCatalogo[]; proximoCursor: Cursor };
    dados.itens.forEach((i) => ids.add(i.id));
    cursor = dados.proximoCursor;
    if (!cursor) break;
  }
  return ids;
}

export default function CatalogoDePalavras({
  aoAbrirPalavra,
  aoMudarFiltro,
  cartoes = [],
  rodape,
}: {
  aoAbrirPalavra?: (id: string) => void;
  /** Avisa o filtro em uso (e quantas palavras casam) a quem precisa dele: o Exportar. */
  aoMudarFiltro?: (f: FiltroDoCatalogo) => void;
  /** O deck real da tela: de onde saem o estado, a origem e a contagem por nível. */
  cartoes?: VocabCard[];
  /** O que vem depois da tabela (o aviso de palavras sem tradução). */
  rodape?: ReactNode;
}) {
  const questNovo = useQuestNovo();
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [niveis, setNiveis] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [total, setTotal] = useState(0);
  /** O total SEM filtro: o "de N" de "3 de 12 no caderno". */
  const [totalGeral, setTotalGeral] = useState<number | null>(null);
  const [cursor, setCursor] = useState<{ valor: unknown; id: string } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Quantos cartões há de cada origem (do servidor; o modo sem conta não sabe, e fica sem número). */
  const [porOrigem, setPorOrigem] = useState<Record<string, number> | null>(null);
  const campoDeBusca = useRef<HTMLInputElement>(null);
  const [contagem, setContagem] = useState<{ inicioEm: number | null; totalLegado: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    void apiFetch('/api/vocab/inicio-da-contagem')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setContagem(d))
      .catch(() => setContagem(null)); // a nota é informativa: falhar nela não pode quebrar a tela
  }, []);

  // Debounce da busca: digitar não pode disparar uma requisição por tecla.
  useEffect(() => {
    const espera = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(espera);
  }, [busca]);

  const temFiltro = !!buscaAplicada.trim() || niveis.length > 0 || origens.length > 0;

  const carregar = useCallback(
    async (proximo: boolean) => {
      setErro(null);
      if (proximo) setCarregandoMais(true);
      else setCarregando(true);
      try {
        const p = new URLSearchParams({ limite: '200', ordem });
        if (buscaAplicada.trim()) p.set('q', buscaAplicada.trim());
        if (niveis.length) p.set('niveis', niveis.join(','));
        if (origens.length) p.set('origens', origens.join(','));
        if (proximo && cursor) {
          p.set('cursorValor', String(cursor.valor ?? ''));
          p.set('cursorId', cursor.id);
        }

        const res = await apiFetch(`/api/vocab/pagina?${p.toString()}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const dados = await res.json();
        setItens((antes) => (proximo ? [...antes, ...dados.itens] : dados.itens));
        setTotal(dados.total);
        if (!proximo) aoMudarFiltro?.({ q: buscaAplicada.trim(), niveis, origens, total: dados.total });
        if (!temFiltro) setTotalGeral(dados.total);
        setCursor(dados.proximoCursor);
        if (dados.porOrigem) setPorOrigem(dados.porOrigem);
      } catch (e) {
        // ESTADO DE ERRO REAL. Antes os fetches faziam `.catch(() => [])` e rede caída era
        // indistinguível de baralho vazio.
        setErro(String((e as Error)?.message ?? e));
      } finally {
        setCarregando(false);
        setCarregandoMais(false);
      }
    },
    [ordem, buscaAplicada, niveis, origens, cursor, temFiltro, aoMudarFiltro],
  );

  /* `carregar` fica FORA das deps de propósito: ela depende de `cursor`, que esta chamada zera.
     Incluí-la faria o efeito re-disparar a cada página carregada e reiniciar a lista do começo,
     o oposto de paginar. As deps aqui são exatamente o que reinicia a busca. */
  useEffect(() => {
    setCursor(null);
    void carregar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordem, buscaAplicada, niveis, origens]);

  const porId = useMemo(() => new Map(cartoes.map((c) => [c.id, c])), [cartoes]);
  /** Quantas palavras há em cada nível — do deck real. "sem nível" é o cartão sem CEFR. */
  const porNivel = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cartoes) {
      const n = c.cefrLevel || 'ausente';
      m.set(n, (m.get(n) ?? 0) + 1);
    }
    return m;
  }, [cartoes]);

  const alternar = (lista: string[], set: (v: string[]) => void, v: string) =>
    set(lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);

  const limpar = () => {
    setBusca('');
    setNiveis([]);
    setOrigens([]);
    campoDeBusca.current?.focus();
  };
  const temFiltroDePilula = niveis.length > 0 || origens.length > 0;
  const geral = totalGeral ?? total;

  /* NO META QUEST: o mesmo catálogo, no desenho do headset (`quest/CatalogoDoQuest.tsx`). A busca, a
     ordem, os filtros e a paginação são os daqui. */
  if (questNovo) {
    return (
      <CatalogoDoQuest
        carregando={carregando}
        carregandoMais={carregandoMais}
        erro={erro}
        total={total}
        geral={geral}
        busca={busca}
        aoBuscar={setBusca}
        refDaBusca={campoDeBusca}
        ordem={ordem}
        ordens={ORDENS.map((o) => ({ id: o.id, rotulo: t(o.rotulo) }))}
        aoOrdenar={(id) => setOrdem(id as Ordem)}
        niveis={NIVEIS.map((n) => {
          const qtd = porNivel.get(n) ?? 0;
          const ativo = niveis.includes(n);
          return {
            id: n,
            rotulo: n === 'ausente' ? t('sem nível') : n,
            qtd,
            ativo,
            desligado: !qtd && !ativo && cartoes.length > 0,
          };
        })}
        aoAlternarNivel={(n) => alternar(niveis, setNiveis, n)}
        origens={ORIGENS.map((o) => {
          const qtd = porOrigem ? (porOrigem[o.id] ?? 0) : null;
          const ativo = origens.includes(o.id);
          return { id: o.id, rotulo: t(o.rotulo), qtd, ativo, desligado: qtd === 0 && !ativo };
        })}
        aoAlternarOrigem={(o) => alternar(origens, setOrigens, o)}
        temFiltro={temFiltro}
        aoLimpar={limpar}
        nota={ordem === 'frequentes' && contagem ? <NotaDeContagem {...contagem} /> : null}
        linhas={itens.map((c) => {
          const cartao = porId.get(c.id);
          const estado = estadoDe(cartao);
          return {
            id: c.id,
            palavra: c.word,
            traducao: c.back,
            nivel: c.cefrLevel,
            dicaDoNivel: !c.cefrLevel
              ? t('Palavra fora da wordlist, nível desconhecido, não estimado')
              : c.cefrSource === 'curado'
                ? t('Nível curado')
                : t('Nível de wordlist (CEFR-J)'),
            fonteDoNivel: !c.cefrLevel
              ? t('fora da lista')
              : c.cefrSource === 'curado'
                ? t('curado')
                : t('lista CEFR-J'),
            origem: t(origemDe(c, cartao)),
            estado: estado && { rotulo: t(estado.rotulo), tom: estado.tom },
          };
        })}
        aoAbrir={(id) => aoAbrirPalavra?.(id)}
        temMais={!!cursor}
        aoMostrarMais={() => void carregar(true)}
        aoTentarDeNovo={() => void carregar(false)}
        rodape={rodape}
      />
    );
  }

  return (
    <section className="cartao p5 secao" style={{ marginTop: 20 }}>
      <TituloDeSecao
        icone={BookOpen}
        titulo="Todas as palavras"
        desc="Busque, filtre por nível e origem. Clique num termo para ouvir a pronúncia e ver a explicação."
        direita={
          <span className="mut tn" style={{ fontSize: 12.5 }} aria-live="polite">
            {carregando ? 'carregando…' : `${total} de ${geral} no caderno`}
          </span>
        }
      />
      <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="busca">
          <Search aria-hidden />
          <span className="sr">Buscar palavra</span>
          <input
            className="campo"
            id="busca-palavra"
            ref={campoDeBusca}
            placeholder="Buscar palavra ou tradução"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <select
          className="campo"
          style={{ width: 'auto' }}
          aria-label="Ordenar"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
        >
          {ORDENS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>
        <span className="label-mono">Nível</span>
        {NIVEIS.map((n) => {
          const ativo = niveis.includes(n);
          const qtd = porNivel.get(n) ?? 0;
          return (
            <button
              key={n}
              type="button"
              className="pill"
              aria-pressed={ativo}
              disabled={!qtd && !ativo && cartoes.length > 0}
              onClick={() => alternar(niveis, setNiveis, n)}
            >
              {n === 'ausente' ? 'sem nível' : n} <span className="n">{qtd}</span>
            </button>
          );
        })}
        <span className="label-mono" style={{ marginLeft: 10 }}>
          Origem
        </span>
        {ORIGENS.map((o) => {
          const ativo = origens.includes(o.id);
          const qtd = porOrigem ? (porOrigem[o.id] ?? 0) : null;
          return (
            <button
              key={o.id}
              type="button"
              className="pill"
              aria-pressed={ativo}
              disabled={qtd === 0 && !ativo}
              onClick={() => alternar(origens, setOrigens, o.id)}
            >
              {o.rotulo}
              {qtd !== null && (
                <>
                  {' '}
                  <span className="n">{qtd}</span>
                </>
              )}
            </button>
          );
        })}
        {temFiltroDePilula && (
          <button type="button" className="link" style={{ marginLeft: 6 }} onClick={limpar}>
            Limpar
          </button>
        )}
      </div>

      {/* A contagem de encontros só pesa na ordem "Mais vistas" — é ali que "1×" precisaria da nota. */}
      {ordem === 'frequentes' && contagem && (
        <div style={{ marginTop: 12 }}>
          <NotaDeContagem {...contagem} />
        </div>
      )}

      <div
        style={{ marginTop: 14, border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}
        id="tabela-palavras"
        aria-busy={carregando}
      >
        {erro ? (
          <div className="vazio">
            <IconeEmBloco icone={AlertTriangle} tom="warn" />
            <h3>Não consegui carregar seu vocabulário.</h3>
            <p>{erro}</p>
            <button type="button" className="btn btn-outline" onClick={() => void carregar(false)}>
              <RotateCw aria-hidden /> Tentar de novo
            </button>
          </div>
        ) : carregando ? (
          // Sem zeros durante o carregamento: mostrar "0" é afirmar um número falso.
          <p className="mut" style={{ padding: 14, fontSize: 13 }}>
            Carregando as palavras…
          </p>
        ) : itens.length === 0 ? (
          temFiltro ? (
            <div className="vazio">
              <IconeEmBloco icone={Search} />
              <h3>Nada com esses filtros</h3>
              <p>Tire um filtro de nível ou de origem.</p>
              <button type="button" className="btn btn-outline" onClick={limpar}>
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="vazio">
              <IconeEmBloco icone={Inbox} />
              <h3>Seu vocabulário está vazio</h3>
              <p>Capture uma sessão ou toque numa palavra durante a leitura para começar.</p>
            </div>
          )
        ) : (
          <table className="tabela">
            <thead>
              <tr>
                <th className="label-mono">Palavra</th>
                <th className="label-mono">Tradução</th>
                <th className="label-mono col-extra">Nível</th>
                <th className="label-mono col-extra">Origem</th>
                <th className="label-mono">Estado</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => {
                const cartao = porId.get(c.id);
                const estado = estadoDe(cartao);
                const curado = c.cefrSource === 'curado';
                return (
                  <tr
                    key={c.id}
                    data-palavra={c.word}
                    tabIndex={0}
                    onClick={() => aoAbrirPalavra?.(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        aoAbrirPalavra?.(c.id);
                      }
                    }}
                  >
                    <td className="termo">{c.word}</td>
                    <td className="mut">{c.back || <span style={{ opacity: 0.6 }}>sem tradução</span>}</td>
                    <td className="col-extra">
                      <span
                        className="badge neu"
                        title={
                          !c.cefrLevel
                            ? 'Palavra fora da wordlist, nível desconhecido, não estimado'
                            : curado
                              ? 'Nível curado'
                              : 'Nível de wordlist (CEFR-J)'
                        }
                      >
                        {c.cefrLevel ?? 'sem nível'}
                      </span>
                    </td>
                    <td className="col-extra mut">{origemDe(c, cartao)}</td>
                    <td>{estado ? <span className={`badge ${estado.tom}`}>{estado.rotulo}</span> : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {!erro && !carregando && cursor && (
        <div className="linha" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-outline peq"
            disabled={carregandoMais}
            onClick={() => void carregar(true)}
          >
            {carregandoMais ? 'Carregando…' : `Mostrar mais (${itens.length} de ${total})`}
          </button>
        </div>
      )}
      {rodape}
    </section>
  );
}
