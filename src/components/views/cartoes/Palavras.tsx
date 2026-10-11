import {
  AudioLines,
  BookOpen,
  CircleCheck,
  Download,
  GraduationCap,
  type LucideIcon,
  Pause,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareCheck,
  TriangleAlert,
  Undo2,
  WalletCards,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { updateCard } from '../../../data/api';
import { cartaoDificil, cartoesDoConteudo } from '../../../lib/conteudo/cartoes';
import type { Conteudo } from '../../../lib/conteudo/estado';
import { numero, t, tp } from '../../../lib/i18n';
import { anima, polido, reduz } from '../../../lib/polimento/base';
import { sentir } from '../../../lib/polimento/sentidos';
import type { Recording, VocabCard } from '../../../types';
import { toast } from '../../Toast';

/**
 * A ABA "PALAVRAS": O NAVEGADOR DE CARTÕES — porte de `ctPalavras`, `ctTabela`, `ctFiltros`,
 * `ctFaixaDaSelecao` e `ctEmMassa` (`cartoes.js:413-509, 1230-1263` do protótipo enxuto).
 *
 * A busca fica presa no alto (no celular, longe da barra de baixo); os estados numa linha, com
 * "Difíceis" em segundo; ordem e "fora da revisão" atrás de "Filtros". QUEM MANDA NO CONTEÚDO É A FICHA
 * do cabeçalho: não há filtro de idioma, de sessão nem de baralho aqui.
 *
 * O DADO é o baralho que a aba já baixava (`GET /api/vocab`): a busca, os estados, a ordem e o recorte do
 * conteúdo são contas feitas aqui, então as contagens de cada estado são exatas e a lista responde na
 * hora. A tela desenha 200 linhas por vez.
 *
 * FORA (o app não tem o dado ou a ação): etiquetas ("#trabalho", "Etiquetar"), a bandeira, "Mover para
 * Difíceis" (difícil é conta de erros, não pasta). Em massa ficam Suspender (com Desfazer de verdade),
 * Praticar e Exportar.
 */

type Estado = 'todos' | 'dificeis' | 'hoje' | 'nova' | 'aprendendo' | 'revisao' | 'suspensa';
type Ordem = 'vence' | 'recentes' | 'az' | 'erros';

const POR_VEZ = 200;
/** Por quanto tempo o "Desfazer" fica no pé da lista (`cartoes.js:1250`). */
const DESFAZER_MS = 9000;

type ComErros = VocabCard & { lapses?: number | null };
const erros = (c: VocabCard) => (c as ComErros).lapses ?? 0;

function noEstado(c: VocabCard, estado: Estado, agora: number): boolean {
  if (estado === 'suspensa') return !c.inDeck;
  if (!c.inDeck) return false;
  if (estado === 'todos') return true;
  if (estado === 'dificeis') return cartaoDificil(c as ComErros);
  if (estado === 'hoje') return c.dueAtMs != null && c.dueAtMs <= agora;
  if (estado === 'nova') return c.fsrsState === 'New';
  if (estado === 'aprendendo') return c.fsrsState === 'Learning';
  return c.fsrsState === 'Review' || c.fsrsState === 'Relearning';
}

/** "hoje", "amanhã", "em 3 d": quando o cartão volta (`c.vence`, `cartoes.js:100`). */
function volta(c: VocabCard, inicioDeHoje: number): string {
  if (!c.inDeck) return t('suspensa');
  if (c.fsrsState === 'New' || c.dueAtMs == null) return '—';
  const dias = Math.floor((c.dueAtMs - inicioDeHoje) / 86_400_000);
  if (dias <= 0) return t('hoje');
  if (dias === 1) return t('amanhã');
  return t('em {n} d', { n: dias });
}

function estadoDe(c: VocabCard): [string, string] {
  if (!c.inDeck) return [t('Suspensa'), 'neu'];
  if (c.fsrsState === 'New') return [t('Nova'), 'acc'];
  if (c.fsrsState === 'Learning') return [t('Aprendendo'), 'warn'];
  return [t('Em revisão'), 'ok'];
}

export default function Palavras({
  cartoes,
  carregando,
  conteudo,
  rotuloDoConteudo,
  sessoes,
  aoAbrir,
  aoPraticar,
  aoExportar,
  aoMudar,
  rodape,
}: {
  /** O baralho inteiro (com as suspensas). */
  cartoes: VocabCard[];
  carregando: boolean;
  conteudo: Conteudo;
  /** "Reunião de produto", "Tudo em inglês"; vazio quando é "Tudo" de um idioma só (`ctQuantas`, `cartoes.js:467`). */
  rotuloDoConteudo: string;
  /** As sessões do app: o nome na coluna Origem. */
  sessoes: Recording[];
  aoAbrir: (id: string) => void;
  /** "Praticar": a folha das práticas com as selecionadas. */
  aoPraticar: (ids: string[], rotulo: string) => void;
  aoExportar: (selecionadas: VocabCard[]) => void;
  /** Cartões mudaram no servidor (suspender, desfazer): quem guarda o baralho atualiza. */
  aoMudar: (novos: VocabCard[]) => void;
  /** O que vem depois da tabela (o aviso de palavras sem tradução). */
  rodape?: ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>('todos');
  const [ordem, setOrdem] = useState<Ordem>('vence');
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState(false);
  const [selecionando, setSelecionando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [desfazer, setDesfazer] = useState<{ ids: string[]; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const tabela = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  /* "Vence hoje" depende do relógio: o instante é o de quando a lista abriu. */
  const [agora] = useState(() => Date.now());
  const inicioDeHoje = useMemo(() => {
    const d = new Date(agora);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [agora]);

  const doConteudo = useMemo(() => cartoesDoConteudo(cartoes, conteudo), [cartoes, conteudo]);
  const conta = useMemo(() => {
    const n: Record<Estado, number> = {
      todos: 0,
      dificeis: 0,
      hoje: 0,
      nova: 0,
      aprendendo: 0,
      revisao: 0,
      suspensa: 0,
    };
    for (const c of doConteudo) for (const k of Object.keys(n) as Estado[]) if (noEstado(c, k, agora)) n[k] += 1;
    return n;
  }, [doConteudo, agora]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase();
    const l = doConteudo.filter(
      (c) =>
        noEstado(c, estado, agora) &&
        (!q ||
          c.word.toLocaleLowerCase().includes(q) ||
          (c.translation ?? '').toLocaleLowerCase().includes(q) ||
          (c.sentence ?? '').toLocaleLowerCase().includes(q)),
    );
    const longe = Number.MAX_SAFE_INTEGER;
    if (ordem === 'az') l.sort((a, b) => a.word.localeCompare(b.word));
    else if (ordem === 'erros') l.sort((a, b) => erros(b) - erros(a) || a.word.localeCompare(b.word));
    else if (ordem === 'recentes') l.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
    else l.sort((a, b) => (a.dueAtMs ?? longe) - (b.dueAtMs ?? longe) || a.word.localeCompare(b.word));
    return l;
  }, [doConteudo, estado, busca, ordem, agora]);

  /* Mudou o que a lista mostra: volta ao começo, e as linhas entram (`ctRepintarTabela`, `cartoes.js:1228`). */
  const chaveDaLista = `${estado}|${ordem}|${busca}|${conteudo.idioma}|${JSON.stringify(conteudo.fonte)}`;
  const primeira = useRef(true);
  useEffect(() => {
    setMostrar(POR_VEZ);
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (!polido() || reduz()) return;
    tabela.current
      ?.querySelectorAll('tbody tr:nth-child(-n+14)')
      .forEach((x, k) =>
        anima(
          x,
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { d: 320, atraso: k * 22 },
        ),
      );
  }, [chaveDaLista]);

  /* O "Desfazer" some sozinho. */
  useEffect(() => {
    if (!desfazer) return;
    const relogio = window.setTimeout(() => setDesfazer(null), DESFAZER_MS);
    return () => window.clearTimeout(relogio);
  }, [desfazer]);

  const linhas = filtradas.slice(0, mostrar);
  const total = doConteudo.filter((c) => c.inDeck).length;
  const ligados = (ordem !== 'vence' ? 1 : 0) + (estado === 'suspensa' ? 1 : 0);
  const limpar = () => {
    setEstado('todos');
    setOrdem('vence');
    setBusca('');
    campo.current?.focus();
  };

  const marcar = (id: string) => {
    sentir('toque');
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };
  const todasMarcadas = filtradas.length > 0 && filtradas.every((c) => marcados.has(c.id));
  const marcarTodas = () => {
    sentir('toque');
    setMarcados((m) => {
      const novo = new Set(m);
      for (const c of filtradas) {
        if (todasMarcadas) novo.delete(c.id);
        else novo.add(c.id);
      }
      return novo;
    });
  };
  const sairDaSelecao = () => {
    setSelecionando(false);
    setMarcados(new Set());
  };

  /** Suspende (ou devolve) vários cartões; devolve os que mudaram de verdade. */
  const porNoBaralho = async (ids: string[], inDeck: boolean): Promise<VocabCard[]> => {
    const feitos: VocabCard[] = [];
    for (const id of ids) {
      try {
        feitos.push(await updateCard(id, { inDeck }));
      } catch {
        /* o que falhar fica como estava; a contagem do aviso diz quantas mudaram */
      }
    }
    if (feitos.length) aoMudar(feitos);
    return feitos;
  };
  const selecionadas = () => cartoes.filter((c) => marcados.has(c.id));
  const suspender = async () => {
    const ids = selecionadas()
      .filter((c) => c.inDeck)
      .map((c) => c.id);
    if (!ids.length || ocupado) return sairDaSelecao();
    setOcupado(true);
    const feitos = await porNoBaralho(ids, false);
    setOcupado(false);
    sairDaSelecao();
    if (!feitos.length) return toast.error(t('Não deu para suspender as palavras.'));
    sentir('sucesso');
    setDesfazer({
      ids: feitos.map((c) => c.id),
      texto: tp(feitos.length, '{n} suspensa', '{n} suspensas', { n: numero(feitos.length) }),
    });
  };
  const desfazerAMassa = async () => {
    if (!desfazer || ocupado) return;
    setOcupado(true);
    const feitos = await porNoBaralho(desfazer.ids, true);
    setOcupado(false);
    setDesfazer(null);
    if (!feitos.length) return toast.error(t('Não deu para desfazer.'));
    sentir('desliga');
    toast.ok(t('Desfeito: as palavras voltaram para a revisão.'));
  };
  const praticar = () => {
    const ids = [...marcados];
    if (!ids.length) return;
    aoPraticar(
      ids,
      tp(ids.length, '{n} palavra selecionada', '{n} palavras selecionadas', { n: numero(ids.length) }),
    );
  };

  const tituloDaSessao = useMemo(() => new Map(sessoes.map((s) => [s.id, s.title])), [sessoes]);
  const origem = (c: VocabCard): [LucideIcon, string] => {
    if (c.sourceSessionId)
      return [AudioLines, tituloDaSessao.get(c.sourceSessionId) || c.sourceSessionTitle || t('Sessão')];
    if (c.daAnki) return [WalletCards, t('Anki')];
    if (c.daTrilha) return [GraduationCap, t('Trilha')];
    return [BookOpen, '—'];
  };

  const ESTADOS: Array<[Estado, string]> = [
    ['todos', t('Todas')],
    ['dificeis', t('Difíceis')],
    ['hoje', t('Vencem hoje')],
    ['nova', t('Novas')],
    ['aprendendo', t('Aprendendo')],
    ['revisao', t('Em revisão')],
  ];
  const ORDENS: Array<[Ordem, string]> = [
    ['vence', t('Volta primeiro')],
    ['recentes', t('Mais recentes')],
    ['az', t('A–Z')],
    ['erros', t('Mais erradas')],
  ];
  const n = marcados.size;

  return (
    <section
      className="q-secao qv-catalogo ct-catalogo"
      aria-label={t('Todas as palavras')}
      data-testid="palavras-dos-cartoes"
    >
      <div className="ct-busca-fixa">
        <label className="q-campo qv-campo-busca">
          <span className="sr">{t('Buscar palavra')}</span>
          <Search aria-hidden />
          <input
            ref={campo}
            type="search"
            autoComplete="off"
            placeholder={t('Buscar palavra ou frase')}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="q-ctl ct-filtros-botao"
          aria-expanded={abertos}
          aria-controls="ct-filtros"
          onClick={() => setAbertos((v) => !v)}
        >
          <SlidersHorizontal aria-hidden />
          <span>{t('Filtros')}</span>
          {ligados > 0 && <span className="q-tag">{ligados}</span>}
        </button>
        <button
          type="button"
          className="q-ctl ct-selecionar"
          aria-pressed={selecionando}
          aria-label={t('Selecionar várias')}
          title={t('Selecionar várias: suspender, praticar, exportar')}
          onClick={() => {
            setDesfazer(null);
            if (selecionando) sairDaSelecao();
            else setSelecionando(true);
          }}
        >
          <SquareCheck aria-hidden />
          <span>{t('Selecionar')}</span>
        </button>
      </div>
      <div className="ct-estados-caixa">
        <div className="q-abas ct-estados" role="radiogroup" aria-label={t('Estado do cartão')}>
          {ESTADOS.map(([v, r]) => (
            <button
              key={v}
              type="button"
              role="radio"
              className="q-aba"
              aria-checked={estado === v}
              data-ct-estado={v}
              onClick={() => setEstado(v)}
            >
              {r} <span className="n">{carregando ? '' : numero(conta[v])}</span>
            </button>
          ))}
        </div>
      </div>
      {abertos && (
        <div className="q-cartao qv-filtros" id="ct-filtros">
          <div className="qv-grupo" role="group" aria-label={t('Ordenar')}>
            <span className="q-rotulo">{t('Ordenar')}</span>
            {ORDENS.map(([v, r]) => (
              <button key={v} type="button" className="q-aba" aria-pressed={ordem === v} onClick={() => setOrdem(v)}>
                {r}
              </button>
            ))}
          </div>
          <div className="qv-grupo" role="group" aria-label={t('Fora da revisão')}>
            <span className="q-rotulo">{t('Fora da revisão')}</span>
            <button
              type="button"
              className="q-aba"
              aria-pressed={estado === 'suspensa'}
              onClick={() => setEstado(estado === 'suspensa' ? 'todos' : 'suspensa')}
            >
              {t('Suspensas')}
              <span className="n">{numero(conta.suspensa)}</span>
            </button>
          </div>
          {ligados > 0 && (
            <div className="q-acoes">
              <button type="button" className="q-ctl" onClick={limpar}>
                <X aria-hidden /> {t('Limpar')}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="ct-quantas">
        <span className="qv-quantas" aria-live="polite">
          {carregando
            ? t('Carregando as palavras…')
            : [t('{n} de {total}', { n: numero(filtradas.length), total: numero(total) }), rotuloDoConteudo]
                .filter(Boolean)
                .join(' · ')}
        </span>
      </p>
      <div id="ct-tabela" ref={tabela} aria-busy={carregando}>
        {carregando ? (
          <div className="qv-espera" role="status" aria-label={t('Carregando as palavras…')}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="q-esqueleto" />
            ))}
          </div>
        ) : !filtradas.length ? (
          <div className="q-vazio">
            <span className="q-ic">
              <Search aria-hidden />
            </span>
            <h3>{t('Nada com esses filtros')}</h3>
            <p>{t('Tire um filtro ou apague a busca.')}</p>
            <button type="button" className="q-ctl pri" onClick={limpar}>
              <X aria-hidden /> {t('Limpar filtros')}
            </button>
          </div>
        ) : (
          <div className="q-tabela-caixa">
            <table className={`q-tabela qv-tabela ct-tabela ${selecionando ? 'ct-selecionando' : ''}`.trim()}>
              <thead>
                <tr>
                  {selecionando && (
                    <th className="ct-th-caixa">
                      <button
                        type="button"
                        className="ct-caixa"
                        role="checkbox"
                        aria-checked={todasMarcadas}
                        aria-label={t('Selecionar todas as {n} da lista', { n: numero(filtradas.length) })}
                        onClick={marcarTodas}
                      />
                    </th>
                  )}
                  <th>{t('Palavra')}</th>
                  <th>{t('Tradução')}</th>
                  <th className="qv-extra">{t('Origem')}</th>
                  <th className="qv-extra">{t('Volta')}</th>
                  <th>{t('Estado')}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((c) => {
                  const [rotulo, tom] = estadoDe(c);
                  const [IconeDaOrigem, nomeDaOrigem] = origem(c);
                  const marcada = marcados.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className="clicavel"
                      data-palavra={c.word}
                      data-tocavel
                      data-marcada={marcada ? '' : undefined}
                      onClick={() => (selecionando ? marcar(c.id) : aoAbrir(c.id))}
                    >
                      {selecionando && (
                        <td className="ct-td-caixa">
                          {/* O toque sobe para a linha, que é quem marca. */}
                          <button
                            type="button"
                            className="ct-caixa"
                            role="checkbox"
                            aria-checked={marcada}
                            aria-label={t('Selecionar {palavra}', { palavra: c.word })}
                          />
                        </td>
                      )}
                      <td>
                        <button
                          type="button"
                          className="qv-palavra"
                          aria-label={t('Abrir {palavra}', { palavra: c.word })}
                          lang={c.srcLang || undefined}
                          tabIndex={selecionando ? -1 : undefined}
                        >
                          {c.word}
                        </button>
                        {cartaoDificil(c as ComErros) && (
                          <span
                            className="ct-marca dif"
                            title={t('Difícil: errada {n} vezes', { n: erros(c) })}
                            aria-label={t('Difícil: errada {n} vezes', { n: erros(c) })}
                            role="img"
                          >
                            <TriangleAlert aria-hidden />
                          </span>
                        )}
                      </td>
                      <td className={c.translation ? undefined : 'qv-apagado'}>{c.translation || t('sem tradução')}</td>
                      <td className="qv-extra">
                        <span className="ct-origem-da-linha">
                          <IconeDaOrigem aria-hidden />
                          {nomeDaOrigem}
                        </span>
                      </td>
                      <td className="qv-extra ct-volta">{volta(c, inicioDeHoje)}</td>
                      <td>
                        <span className={`q-tag qv-estado ${tom}`}>{rotulo}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!carregando && filtradas.length > linhas.length && (
        <div className="q-acoes qv-mais">
          <button type="button" className="q-ctl" onClick={() => setMostrar((v) => v + POR_VEZ)}>
            <RotateCw aria-hidden />{' '}
            {t('Mostrar mais ({n} de {total})', { n: numero(linhas.length), total: numero(filtradas.length) })}
          </button>
        </div>
      )}
      {rodape}
      {desfazer ? (
        <div className="q-faixa q-no-pe ct-faixa-sel ct-faixa-desfazer" role="status">
          <span className="q-tempo">
            <CircleCheck aria-hidden />
            &nbsp;{desfazer.texto}
          </span>
          <span className="q-espaco" />
          <button type="button" className="q-ctl" disabled={ocupado} onClick={() => void desfazerAMassa()}>
            <Undo2 aria-hidden /> {t('Desfazer')}
          </button>
          <button
            type="button"
            className="q-ctl ct-so-icone"
            aria-label={t('Fechar o aviso')}
            onClick={() => setDesfazer(null)}
          >
            <X aria-hidden />
          </button>
        </div>
      ) : (
        selecionando && (
          <div className="q-faixa q-no-pe ct-faixa-sel" role="toolbar" aria-label={t('Ações para as selecionadas')}>
            <span className="q-tempo">
              <b>{numero(n)}</b>&nbsp;{n === 1 ? t('selecionada') : t('selecionadas')}
            </span>
            <button
              type="button"
              className="q-ctl"
              data-ct-massa="suspender"
              disabled={!n || ocupado}
              onClick={() => void suspender()}
            >
              <Pause aria-hidden /> {t('Suspender')}
            </button>
            <button type="button" className="q-ctl" data-ct-massa="praticar" disabled={!n} onClick={praticar}>
              <Sparkles aria-hidden /> {t('Praticar')}
            </button>
            <button
              type="button"
              className="q-ctl ct-so-pc"
              data-ct-massa="exportar"
              disabled={!n}
              onClick={() => aoExportar(selecionadas())}
            >
              <Download aria-hidden /> {t('Exportar')}
            </button>
            <span className="q-espaco" />
            <button
              type="button"
              className="q-ctl ct-cancelar"
              aria-label={t('Cancelar a seleção')}
              onClick={sairDaSelecao}
            >
              <X aria-hidden />
              <span>{t('Cancelar')}</span>
            </button>
          </div>
        )
      )}
    </section>
  );
}
