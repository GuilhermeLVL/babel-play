import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  EyeOff,
  Layers,
  Loader2,
  Play,
  Plus,
  RotateCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  ativarNotasDoBaralho,
  type BaralhoAnkiResumo,
  desativarBaralho,
  type FiltroDeEstado,
  listarNotasDoBaralho,
  type NotaAnkiDetalhe,
  purgarBaralho,
} from '../../data/apiAnki';
import { data, numero } from '../../lib/i18n';
import { langLabelNaUI } from '../../lib/languages';
import { toast } from '../Toast';
import { Dialogo, IconeEmBloco } from '../ui';

/**
 * A ABA "GERENCIAR" DA TELA DO ANKI — o que já foi trazido, e o que fazer com cada baralho.
 *
 * Marcação do protótipo aprovado (`T.anki`, aba `baralhos`): uma pilha de `.cartao.p5.baralho`
 * (`.off` quando desativado), cada um com o ícone em bloco, o nome, o par de idiomas e a data, o
 * botão "Notas", o saldo "N de M notas ativadas" com a barra, e as ações (Ativar mais, Jogar só com
 * este, Desativar, Apagar). "Notas" abre a lista paginada do servidor (`.notas-baralho`), com busca
 * e os filtros de estado.
 *
 * A DISTINÇÃO QUE NÃO PODE SUMIR: `descartadas` é a régua de qualidade recusando (dá para corrigir
 * o mapeamento e reimportar) e `ausentes` é a nota que sumiu do arquivo no último import (histórico
 * do baralho). Por isso vêm em selos separados, nunca somados.
 *
 * O "Ativar" de um baralho desativado não existe aqui: o servidor não tem rota para reativar o
 * BARALHO (só `ativar` o próximo lote de notas). Um botão para isso seria um botão morto.
 */

export interface GerenciarBaralhosProps {
  baralhos: BaralhoAnkiResumo[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => void;
  /** Troca a lista local depois de uma ação (sem ir de novo ao servidor). */
  aoTrocarLista: (fn: (antes: BaralhoAnkiResumo[]) => BaralhoAnkiResumo[]) => void;
  /** "Trazer meu primeiro baralho": vai para a aba Trazer. */
  aoTrazer: () => void;
  /** "Jogar só com este": recorta os jogos por este baralho e volta ao Jogar. */
  onJogarSoCom?: (deckId: string, nome: string, lang?: string) => void;
  /** Ativar, desativar ou apagar mudam o acervo jogável: quem montou a tela relê o baralho. */
  onMudou?: () => void;
}

/* Os filtros do protótipo, na língua do servidor (`FiltroDeNotaAnki`). */
const FILTROS: Array<{ id: FiltroDeEstado | 'todas'; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'ativa', rotulo: 'Ativas' },
  { id: 'arquivada', rotulo: 'Arquivadas' },
  { id: 'descartada', rotulo: 'Descartadas' },
  { id: 'ausente_no_arquivo', rotulo: 'Ausentes no arquivo' },
];

/** Quantas notas ativar de uma vez — o mesmo lote da aba Trazer. */
const LOTE = 300;

/** "inglês → português", "inglês · ensina por definição" ou o nome do arquivo. */
function parDoBaralho(b: BaralhoAnkiResumo): string {
  if (!b.idiomaOrigem) return b.arquivoOrigem;
  const de = langLabelNaUI(b.idiomaOrigem).toLowerCase();
  if (!b.idiomaAlvo) return de;
  if (b.idiomaOrigem === b.idiomaAlvo) return `${de} · ensina por definição`;
  return `${de} → ${langLabelNaUI(b.idiomaAlvo).toLowerCase()}`;
}

export default function GerenciarBaralhos({
  baralhos,
  carregando,
  erro,
  recarregar,
  aoTrocarLista,
  aoTrazer,
  onJogarSoCom,
  onMudou,
}: GerenciarBaralhosProps) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [apagando, setApagando] = useState<BaralhoAnkiResumo | null>(null);

  const ativarMais = async (b: BaralhoAnkiResumo) => {
    setOcupado(b.id);
    try {
      const r = await ativarNotasDoBaralho(b.id, LOTE);
      aoTrocarLista((antes) => antes.map((x) => (x.id === b.id ? { ...x, ativas: x.ativas + r.ativadas } : x)));
      toast.ok(`${r.ativadas} notas ativadas em ${b.nome}`);
      onMudou?.();
    } catch (e) {
      toast.error('Não consegui ativar as notas.', { detail: e });
    } finally {
      setOcupado(null);
    }
  };

  const desativar = async (b: BaralhoAnkiResumo) => {
    setOcupado(b.id);
    try {
      await desativarBaralho(b.id);
      aoTrocarLista((antes) => antes.map((x) => (x.id === b.id ? { ...x, estado: 'desativado', ativas: 0 } : x)));
      onMudou?.();
    } catch (e) {
      toast.error('Não consegui desativar o baralho.', { detail: e });
    } finally {
      setOcupado(null);
    }
  };

  const apagar = async (b: BaralhoAnkiResumo) => {
    setOcupado(b.id);
    try {
      await purgarBaralho(b.id);
      aoTrocarLista((antes) => antes.filter((x) => x.id !== b.id));
      if (aberto === b.id) setAberto(null);
      toast.ok(`“${b.nome}” apagado`);
      onMudou?.();
    } catch (e) {
      toast.error('Não consegui apagar o baralho.', { detail: e });
    } finally {
      setOcupado(null);
      setApagando(null);
    }
  };

  if (erro) {
    return (
      <section className="cartao p5">
        <div className="aviso-info warn" role="alert">
          <AlertTriangle aria-hidden />
          <span>
            Não consegui carregar os seus baralhos. <span className="mut">{erro}</span>
          </span>
        </div>
        <button type="button" className="btn btn-outline peq" style={{ marginTop: 12 }} onClick={recarregar}>
          <RotateCw aria-hidden /> Tentar de novo
        </button>
      </section>
    );
  }

  if (carregando) {
    return (
      <section className="cartao p5" aria-busy="true">
        <p className="mut linha" style={{ gap: 8 }}>
          <Loader2 className="animate-spin" aria-hidden /> Carregando os seus baralhos…
        </p>
      </section>
    );
  }

  if (!baralhos.length) {
    return (
      <section className="cartao">
        <div className="vazio">
          <IconeEmBloco icone={Layers} />
          <h3>Nenhum baralho trazido ainda</h3>
          <p>Traga um .apkg do Anki: as palavras entram na sua fila de revisão e nos jogos.</p>
          <button type="button" className="btn btn-solid" onClick={aoTrazer}>
            <Upload aria-hidden /> Trazer meu primeiro baralho
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="pilha">
      {baralhos.map((b) => {
        const on = b.estado === 'ativo';
        const restantes = Math.max(0, b.total - b.ativas - b.descartadas - b.ausentes);
        const abertoAqui = aberto === b.id;
        const pct = b.total ? (b.ativas / b.total) * 100 : 0;
        return (
          <section key={b.id} className={`cartao p5 baralho ${on ? '' : 'off'}`}>
            <div className="entre" style={{ alignItems: 'flex-start' }}>
              <div className="linha" style={{ gap: 12, alignItems: 'flex-start' }}>
                <IconeEmBloco icone={Layers} />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                    {b.nome} {!on && <span className="badge neu">desativado</span>}
                  </h3>
                  <p className="mut" style={{ fontSize: 12.5 }}>
                    {parDoBaralho(b)} · trazido em {data(new Date(b.createdAt))}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline peq"
                aria-expanded={abertoAqui}
                onClick={() => setAberto(abertoAqui ? null : b.id)}
              >
                {abertoAqui ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} Notas
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="entre mut tn" style={{ fontSize: 12.5 }}>
                <span title="Notas do arquivo do Anki. Uma nota pode virar mais de um cartão na sua fila.">
                  <b style={{ color: 'var(--ink)' }}>{numero(b.ativas)}</b> de {numero(b.total)} notas ativadas
                </span>
                <span className="linha" style={{ gap: 6 }}>
                  {b.descartadas > 0 && (
                    <span
                      className="badge warn"
                      title="A régua de qualidade recusou estas notas. Dá para corrigir o mapeamento e reimportar."
                    >
                      {b.descartadas} descartadas
                    </span>
                  )}
                  {b.ausentes > 0 && (
                    <span
                      className="badge neu"
                      title="Estas notas sumiram do arquivo no último import. É histórico do baralho, não defeito."
                    >
                      {b.ausentes} ausentes
                    </span>
                  )}
                </span>
              </div>
              <div className="barra" style={{ marginTop: 6 }}>
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="linha" style={{ gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              {restantes > 0 && (
                <button
                  type="button"
                  className="btn btn-outline peq"
                  disabled={ocupado === b.id}
                  onClick={() => void ativarMais(b)}
                >
                  <Plus aria-hidden /> Ativar mais {Math.min(LOTE, restantes)}
                </button>
              )}
              {/* Só com nota ativa: um baralho sem nada ativado levaria a uma rodada vazia. */}
              {onJogarSoCom && on && b.ativas > 0 && (
                <button
                  type="button"
                  className="btn btn-outline peq"
                  onClick={() => onJogarSoCom(b.id, b.nome, b.idiomaOrigem ?? undefined)}
                >
                  <Play aria-hidden /> Jogar só com este
                </button>
              )}
              {on && (
                <button
                  type="button"
                  className="btn btn-outline peq"
                  disabled={ocupado === b.id}
                  onClick={() => void desativar(b)}
                >
                  <EyeOff aria-hidden /> Desativar
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline peq perigo"
                disabled={ocupado === b.id}
                onClick={() => setApagando(b)}
              >
                <Trash2 aria-hidden /> Apagar
              </button>
            </div>
            {abertoAqui && <NotasDoBaralho baralho={b} />}
          </section>
        );
      })}

      {apagando && (
        <Dialogo
          icone={Trash2}
          titulo={`Apagar “${apagando.nome}”?`}
          sub={`Sai do app com as ${numero(apagando.total)} notas. O arquivo original do Anki não é tocado, e o histórico de revisão que você já fez continua.`}
          largura=""
          aoFechar={() => setApagando(null)}
        >
          <div className="dlg-pe">
            <button type="button" className="btn btn-outline" data-autofocus onClick={() => setApagando(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-solid perigo-solid"
              disabled={ocupado === apagando.id}
              onClick={() => void apagar(apagando)}
            >
              <Trash2 aria-hidden /> Apagar de vez
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}

/** As notas de um baralho: busca (300 ms), filtros de estado e "carregar mais" pelo cursor. */
function NotasDoBaralho({ baralho }: { baralho: BaralhoAnkiResumo }) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [estado, setEstado] = useState<FiltroDeEstado | 'todas'>('todas');
  const [itens, setItens] = useState<NotaAnkiDetalhe[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = useCallback(
    async (depoisDe: string | null) => {
      setErro(null);
      setCarregando(true);
      try {
        const p = await listarNotasDoBaralho(baralho.id, {
          cursor: depoisDe,
          estado: estado === 'todas' ? undefined : estado,
          busca: buscaAplicada.trim() || undefined,
          limite: 50,
        });
        setItens((antes) => (depoisDe ? [...antes, ...p.itens] : p.itens));
        setTotal(p.total);
        setCursor(p.proximoCursor);
      } catch (e) {
        setErro(String((e as Error)?.message ?? e));
      } finally {
        setCarregando(false);
      }
    },
    [baralho.id, estado, buscaAplicada],
  );

  useEffect(() => {
    void carregar(null);
  }, [carregar]);

  const selo = (n: NotaAnkiDetalhe): [string, string] =>
    n.motivoDescarte
      ? ['warn', 'descartada']
      : n.estado === 'ausente_no_arquivo'
        ? ['neu', 'ausente']
        : n.estado === 'arquivada'
          ? ['neu', 'arquivada']
          : ['ok', 'ativa'];

  return (
    <div className="notas-baralho entra">
      <div className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
        <label className="busca" style={{ maxWidth: 240 }}>
          <Search aria-hidden />
          <span className="sr">Buscar nota</span>
          <input
            className="campo"
            placeholder="Buscar nota…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <div className="chips" role="radiogroup" aria-label="Filtrar notas">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="pill"
              role="radio"
              aria-checked={estado === f.id}
              onClick={() => setEstado(f.id)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>
      {erro ? (
        <div className="aviso-info warn" role="alert" style={{ marginTop: 10 }}>
          <AlertTriangle aria-hidden />
          <span>{erro}</span>
        </div>
      ) : itens.length ? (
        <>
          <ul className="lista-mapa" style={{ marginTop: 10 }}>
            {itens.map((n) => {
              const [tom, rotulo] = selo(n);
              return (
                <li key={n.id}>
                  <div>
                    <b>{n.frente}</b>
                    <small className="mut">{n.verso || 'sem tradução'}</small>
                  </div>
                  <span />
                  <span className={`badge ${tom}`} title={n.motivoDescarte ?? undefined}>
                    {rotulo}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mut" style={{ fontSize: 12, marginTop: 8 }}>
            Mostrando {numero(itens.length)} de {numero(total)}
            {cursor && (
              <>
                {' · '}
                <button type="button" className="link" disabled={carregando} onClick={() => void carregar(cursor)}>
                  carregar mais
                </button>
              </>
            )}
          </p>
        </>
      ) : carregando ? (
        <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }} aria-busy="true">
          Carregando as notas…
        </p>
      ) : (
        <div className="vazio">
          <IconeEmBloco icone={Search} />
          <h3>Nenhuma nota com esse filtro</h3>
          <p>Troque o filtro ou a busca.</p>
        </div>
      )}
    </div>
  );
}
