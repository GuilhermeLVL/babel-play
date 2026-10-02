import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Flame,
  Gamepad2,
  GraduationCap,
  Info,
  Minus,
  Sheet,
  Sprout,
  Table2,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import React, { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { AppMetrics } from '../../data/api';
import { type ExerciseResultRow, fetchDeck, fetchExerciseResults } from '../../data/api';
import { useQuestNovo } from '../../lib/dispositivo/telaNovaDoQuest';
import { t, tp } from '../../lib/i18n';
import { usePreferencias } from '../../lib/preferencias';
import type { VocabCard } from '../../types';
import { CabecalhoDeTela, Tela } from '../ui';
import MetaDeNivel from './estatisticas/MetaDeNivel';
import EstatisticasDoQuest, { type PainelDoQuest } from './estatisticas/quest/EstatisticasDoQuest';

/**
 * ESTATÍSTICAS — a tela do protótipo aprovado (`T.estatisticas`), sobre dado REAL.
 *
 * O protótipo desenhava a tela com números sorteados. Aqui cada gráfico sai de uma fonte que o app
 * já guarda: os resultados de exercício (quando, quanto tempo, acertou ou não, qual jogo) e os
 * cartões do caderno (quando entraram, quando voltam). Regras do protótipo (skill dataviz): uma
 * série por gráfico na cor do destaque; eixo único; grade recessiva; dica em cada marca; tabela
 * alternativa em todo gráfico; variação com ícone + texto, nunca só cor.
 *
 * A META DIÁRIA é a de Perfil → Você (`lib/preferencias`, `metaMin`): a linha tracejada do gráfico
 * de minutos e as barras mais escuras que a bateram.
 *
 * FICOU DE FORA o que o app não tem: o relatório semanal por e-mail e o filtro por idioma (os
 * resultados não guardam idioma).
 */

interface EstatisticasProps {
  metrics: AppMetrics | null;
  onChangeView: (view: string) => void;
}

const DIA = 86_400_000;
const DIA_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtD = (d: Date) => `${d.getDate()} ${MES[d.getMonth()]}`;
const inicioDoDia = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Nome do jogo pelo `kind` gravado no resultado. */
const NOME_DO_JOGO: Record<string, string> = {
  memory: 'Memória',
  wordsearch: 'Caça-palavras',
  termo: 'Soletrar (Termo)',
  blitz: 'Duelo relâmpago',
  escuta: 'Qual foi a fala?',
  ditado: 'Ditado',
  karaoke: 'Karaokê da fala',
  scramble: 'Frase embaralhada',
  conectores: 'Caça-conectores',
  typing: 'Revisão digitando',
  mc: 'Revisão de escolha',
};

interface Dia {
  d: Date;
  min: number;
  novas: number;
  total: number;
  certos: number;
  respostas: number;
}

/** 90 dias até hoje, montados dos resultados e dos cartões. */
function montarDias(resultados: ExerciseResultRow[], cartoes: VocabCard[]): Dia[] {
  const hoje = inicioDoDia(Date.now());
  const dias: Dia[] = Array.from({ length: 90 }, (_, i) => ({
    d: new Date(hoje - (89 - i) * DIA),
    min: 0,
    novas: 0,
    total: 0,
    certos: 0,
    respostas: 0,
  }));
  const indice = (ms: number) => Math.round((inicioDoDia(ms) - dias[0].d.getTime()) / DIA);
  const ms = new Array<number>(90).fill(0);
  for (const r of resultados) {
    const i = indice(r.createdAt);
    if (i < 0 || i > 89) continue;
    ms[i] += typeof r.ms === 'number' ? r.ms : 0;
    dias[i].respostas++;
    if (r.correct) dias[i].certos++;
  }
  let antes = 0;
  for (const c of cartoes) {
    if (!c.createdAtMs) continue;
    const i = indice(c.createdAtMs);
    if (i < 0) antes++;
    else if (i <= 89) dias[i].novas++;
  }
  let acumulado = antes;
  dias.forEach((d, i) => {
    d.min = Math.round(ms[i] / 60_000);
    acumulado += d.novas;
    d.total = acumulado;
  });
  return dias;
}

/* ── Gráficos em SVG (marcação e classes do protótipo) ── */
const barraArred = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

function GraficoDeBarras<T>({
  rotuloDoGrafico,
  dados,
  rotulo,
  valor,
  unidade,
  altura = 180,
  meta,
  q,
}: {
  rotuloDoGrafico: string;
  dados: T[];
  rotulo: (d: T) => string;
  valor: (d: T) => number;
  unidade: string;
  altura?: number;
  /** A meta (a linha tracejada); a barra que a alcança fica mais escura. */
  meta?: number;
  /**
   * No headset: a largura medida da caixa, em px. O desenho passa a valer 1 unidade = 1 px (rótulo de
   * 14 px de verdade), com margens maiores e o valor escrito em cima da barra, porque lá não há hover.
   */
  q?: number;
}) {
  const W = q ?? 480,
    H = q ? 210 : Math.round(altura * 0.8),
    m = q ? { t: 28, r: 8, b: 34, l: 46 } : { t: 14, r: 6, b: 24, l: 30 },
    iw = W - m.l - m.r,
    ih = H - m.t - m.b;
  const max = Math.max(1, meta ?? 0, ...dados.map(valor)) * 1.15;
  const bw = iw / Math.max(1, dados.length),
    gap = Math.min(q ? 10 : 6, bw * 0.28);
  const y = (v: number) => m.t + ih - (v / max) * ih;
  // No headset cabe um rótulo a cada ~76 px; com mais de 7 barras o rótulo é a data, não o dia da semana.
  const passo = q ? Math.ceil(dados.length / Math.max(2, Math.floor(iw / 76))) : Math.ceil(dados.length / 7);
  const rotuloDoEixo = (d: T) => {
    const partes = rotulo(d).split(' · ');
    return partes[q && dados.length > 7 ? partes.length - 1 : 0];
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico-svg" role="img" aria-label={rotuloDoGrafico}>
      {[0, 0.5, 1].map((f) => {
        const v = Math.round((max * f) / 1.15);
        return (
          <g key={f}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="g-grade" />
            <text x={m.l - (q ? 10 : 6)} y={y(v) + (q ? 5 : 4)} className="g-eixo" textAnchor="end">
              {v}
            </text>
          </g>
        );
      })}
      {dados.map((d, i) => {
        const v = valor(d),
          x = m.l + i * bw + gap / 2,
          w = Math.max(2, bw - gap),
          h = Math.max(v ? 3 : 0, ih - (y(v) - m.t));
        return (
          <g key={i}>
            <title>{`${rotulo(d)}: ${v} ${unidade}`}</title>
            <rect x={m.l + i * bw} y={m.t} width={bw} height={ih} className="g-alvo" />
            {/* Sem meta não há "bateu/não bateu": a série inteira vai no acento. */}
            {v > 0 && (
              <path
                d={barraArred(x, y(v), w, h)}
                className={`g-barra ${meta && v >= meta ? 'bateu' : ''}`}
                style={meta ? undefined : { fill: 'var(--accent)' }}
              />
            )}
            {/* Poucas barras no headset: o valor vai escrito em cima (lá a dica do hover não existe). */}
            {q && dados.length <= 14 && v > 0 && (
              <text x={x + w / 2} y={y(v) - 7} className="g-eixo forte" textAnchor="middle">
                {v}
              </text>
            )}
            {i % passo === 0 && (
              <text x={x + w / 2} y={H - (q ? 10 : 8)} className="g-eixo" textAnchor="middle">
                {rotuloDoEixo(d)}
              </text>
            )}
          </g>
        );
      })}
      {meta ? (
        <>
          <line x1={m.l} x2={W - m.r} y1={y(meta)} y2={y(meta)} className="g-meta" />
          <text x={W - m.r} y={y(meta) - 6} className="g-eixo forte" textAnchor="end">
            meta {meta} {unidade}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function GraficoDeLinha({ dados, q }: { dados: Dia[]; /** No headset: a largura medida, em px. */ q?: number }) {
  const W = q ?? 480,
    H = q ? 210 : 170,
    m = q ? { t: 30, r: 14, b: 34, l: 54 } : { t: 22, r: 10, b: 24, l: 34 },
    iw = W - m.l - m.r,
    ih = H - m.t - m.b;
  const vs = dados.map((d) => d.total);
  const min = Math.min(...vs) * 0.96,
    max = Math.max(...vs) * 1.02 || 1;
  const faixa = max - min || 1;
  const x = (i: number) => m.l + (i / Math.max(1, dados.length - 1)) * iw,
    y = (v: number) => m.t + ih - ((v - min) / faixa) * ih;
  const pts = dados.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`);
  const passo = q ? Math.ceil(dados.length / Math.max(2, Math.floor(iw / 96))) : Math.ceil(dados.length / 5);
  const ultimo = vs[vs.length - 1];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="grafico-svg"
      role="img"
      aria-label="Palavras no caderno ao longo do tempo"
    >
      {[min, (min + max) / 2, max].map((v, k) => (
        <g key={k}>
          <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} className="g-grade" />
          <text x={m.l - (q ? 10 : 6)} y={y(v) + (q ? 5 : 4)} className="g-eixo" textAnchor="end">
            {Math.round(v)}
          </text>
        </g>
      ))}
      <path
        d={`M${pts[0]} L${pts.join(' L')} L${x(dados.length - 1)},${m.t + ih} L${m.l},${m.t + ih}Z`}
        className="g-area"
      />
      <polyline points={pts.join(' ')} className="g-linha" />
      <circle cx={x(dados.length - 1)} cy={y(ultimo)} r={q ? '7' : '5'} className="g-ponto" />
      <text
        x={x(dados.length - 1) - (q ? 12 : 8)}
        y={y(ultimo) - (q ? 13 : 10)}
        className="g-eixo forte"
        textAnchor="end"
      >
        {ultimo} palavras
      </text>
      {dados.map((d, i) => (
        <g key={i}>
          <title>{`${fmtD(d.d)}: ${d.total} palavras${d.novas ? ` (+${d.novas})` : ''}`}</title>
          <rect x={x(i) - iw / dados.length / 2} y={m.t} width={iw / dados.length} height={ih} className="g-alvo" />
        </g>
      ))}
      {dados.map((d, i) =>
        i % passo === 0 ? (
          <text key={`e${i}`} x={x(i)} y={H - (q ? 10 : 8)} className="g-eixo" textAnchor="middle">
            {fmtD(d.d)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function Calendario({ dias, q }: { dias: Dia[]; /** No headset: células de 22 px, 1 unidade = 1 px. */ q?: boolean }) {
  const ult = dias.slice(-84),
    cel = q ? 22 : 14,
    g = q ? 4 : 3,
    esq = q ? 46 : 34,
    topo = q ? 24 : 18,
    ini = ult[0].d.getDay();
  const nivel = (m: number) => (m === 0 ? 0 : m < 8 ? 1 : m < 15 ? 2 : m < 22 ? 3 : 4);
  const semanas = Math.ceil((ult.length + ini) / 7);
  const W = esq + semanas * (cel + g),
    H = 7 * (cel + g) + topo + 4;
  let mesAnterior = -1;
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={q ? { width: W, maxWidth: '100%' } : { maxWidth: Math.round(W * 1.35) }}
        className="grafico-svg cal"
        role="img"
        aria-label="Calendário de atividade das últimas 12 semanas"
      >
        {['seg', 'qua', 'sex'].map((t, k) => (
          <text key={t} x="0" y={topo + 4 + (k * 2 + 1) * (cel + g) + cel - (q ? 9 : 3)} className="g-eixo">
            {t}
          </text>
        ))}
        {ult.map((x, i) => {
          const p = i + ini,
            c = Math.floor(p / 7),
            r = p % 7;
          return (
            <rect
              key={i}
              x={esq + c * (cel + g)}
              y={topo + r * (cel + g)}
              width={cel}
              height={cel}
              rx={q ? '5' : '3'}
              className={`g-cel n${nivel(x.min)}`}
            >
              <title>{`${DIA_SEM[x.d.getDay()]}, ${fmtD(x.d)}: ${x.min ? `${x.min} min` : x.respostas ? 'menos de 1 min' : 'sem estudo'}`}</title>
            </rect>
          );
        })}
        {Array.from({ length: semanas }, (_, c) => {
          const d = ult[Math.max(0, c * 7 - ini)];
          if (!d || d.d.getMonth() === mesAnterior) return null;
          mesAnterior = d.d.getMonth();
          return (
            <text key={`m${c}`} x={esq + c * (cel + g)} y={q ? '14' : '10'} className="g-eixo">
              {MES[d.d.getMonth()]}
            </text>
          );
        })}
      </svg>
      <div className="legenda-cal" aria-hidden>
        <span className="mut">menos</span>
        {[0, 1, 2, 3, 4].map((n) => (
          <i key={n} className={`g-cel-leg n${n}`} />
        ))}
        <span className="mut">mais</span>
      </div>
    </>
  );
}

function BarrasHorizontais({ dados, unidade, max }: { dados: [string, number][]; unidade: string; max: number }) {
  return (
    <div className="hbarras" role="list">
      {dados.map(([r, v]) => (
        <div key={r} className="hbarra" role="listitem" title={`${r}: ${v}${unidade === '%' ? '%' : ` ${unidade}`}`}>
          <span className="hb-rot">{r}</span>
          <span className="hb-trilho">
            <span style={{ width: `${(v / Math.max(1, max)) * 100}%` }} />
          </span>
          <b className="tn">
            {v}
            {unidade === '%' ? '%' : ''}
          </b>
        </div>
      ))}
    </div>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: (string | number)[][] }) {
  return (
    <div className="compara" tabIndex={0} style={{ maxHeight: 260, overflow: 'auto' }}>
      <table className="tabela">
        <thead>
          <tr>
            {cab.map((c) => (
              <th key={c} className="label-mono">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className="tn">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CartaoDeGrafico({
  id,
  Icone,
  titulo,
  desc,
  grafico,
  tabela,
  extra,
}: {
  id: string;
  Icone: typeof Clock;
  titulo: string;
  desc: string;
  grafico: ReactNode;
  tabela: ReactNode;
  extra?: ReactNode;
}) {
  const [comoTabela, setComoTabela] = useState(false);
  return (
    <section className="cartao p5 graf-cartao" aria-labelledby={`gt-${id}`}>
      <div className="tsec">
        <div className="tsec-l">
          <div className="tsec-t">
            <Icone aria-hidden />
            <h2 id={`gt-${id}`}>{titulo}</h2>
          </div>
          <p className="desc">{desc}</p>
        </div>
        <button
          type="button"
          className="btn btn-outline peq"
          aria-pressed={comoTabela}
          onClick={() => setComoTabela((v) => !v)}
        >
          {comoTabela ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}{' '}
          {comoTabela ? 'Ver gráfico' : 'Ver como tabela'}
        </button>
      </div>
      {comoTabela ? tabela : grafico}
      {extra}
    </section>
  );
}

function Variacao({ v, un = '%' }: { v: number | null; un?: '%' | 'pp' }) {
  if (v == null) return null;
  if (v === 0)
    return (
      <span className="var neutra">
        <Minus aria-hidden /> igual ao anterior
      </span>
    );
  return (
    <span className={`var ${v > 0 ? 'sobe' : 'desce'}`}>
      {v > 0 ? <TrendingUp aria-hidden /> : <TrendingDown aria-hidden />} {v > 0 ? '+' : ''}
      {v}
      {un === 'pp' ? ' p.p.' : '%'} <span aria-hidden>vs. anterior</span>
      <span className="sr">em relação ao período anterior</span>
    </span>
  );
}

export default function Estatisticas({ metrics, onChangeView }: EstatisticasProps) {
  const [periodo, setPeriodo] = useState<7 | 30 | 90>(30);
  const [resultados, setResultados] = useState<ExerciseResultRow[] | null>(null);
  const [cartoes, setCartoes] = useState<VocabCard[] | null>(null);
  const [menuExportar, setMenuExportar] = useState(false);
  const { metaMin } = usePreferencias();
  /* No Meta Quest com as telas novas, a mesma tela em outro arranjo (`EstatisticasDoQuest`): os dados,
     o período e as ações são os daqui. */
  const questNovo = useQuestNovo();
  // O menu fecha no clique fora e no Esc, como o `.menu-midia` do protótipo.
  useEffect(() => {
    if (!menuExportar) return;
    const fora = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-exportar]')) setMenuExportar(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuExportar(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [menuExportar]);

  useEffect(() => {
    let vivo = true;
    fetchExerciseResults()
      .then((r) => vivo && setResultados(r))
      .catch(() => vivo && setResultados([]));
    fetchDeck()
      .then((c) => vivo && setCartoes(c))
      .catch(() => vivo && setCartoes([]));
    return () => {
      vivo = false;
    };
  }, []);

  const dias = useMemo(() => (resultados && cartoes ? montarDias(resultados, cartoes) : null), [resultados, cartoes]);

  /** Revisões dos próximos 7 dias: vencidas entram hoje (é quando vão aparecer). */
  const previsao = useMemo(() => {
    if (!cartoes) return [];
    const hoje = inicioDoDia(Date.now());
    const l = Array.from({ length: 7 }, (_, i) => ({ d: new Date(hoje + i * DIA), n: 0 }));
    for (const c of cartoes) {
      if (!c.inDeck || !c.dueAtMs) continue;
      const i = Math.max(0, Math.round((inicioDoDia(c.dueAtMs) - hoje) / DIA));
      if (i < 7) l[i].n++;
    }
    return l;
  }, [cartoes]);

  const acertoPorJogo: [string, number][] = (metrics?.acertoPorExercicio ?? [])
    .filter((a) => a.total > 0)
    .map((a): [string, number] => [NOME_DO_JOGO[a.kind] ?? a.kind, Math.round(a.acerto)])
    .sort((a, b) => b[1] - a[1]);
  const porNivel: [string, number][] = (metrics?.levelDistribution ?? []).map((l): [string, number] => [
    l.level === 'N/D' ? 'sem nível' : l.level,
    l.count,
  ]);

  const filtros = (
    <div className="filtros-stats" role="group" aria-label="Filtros">
      <div className="seg" role="radiogroup" aria-label="Período">
        {(
          [
            [7, '7 dias'],
            [30, '30 dias'],
            [90, '90 dias'],
          ] as const
        ).map(([v, r]) => (
          <button key={v} type="button" role="radio" aria-checked={periodo === v} onClick={() => setPeriodo(v)}>
            {r}
          </button>
        ))}
      </div>
      {dias && (
        <span className="mut" style={{ fontSize: 12.5 }}>
          {fmtD(dias[90 - periodo].d)} a {fmtD(dias[89].d)} de {dias[89].d.getFullYear()}
        </span>
      )}
    </div>
  );

  const exportarCsv = () => {
    if (!dias) return;
    const linhas = [
      ['data', 'minutos', 'respostas', 'acertos', 'palavras_novas', 'palavras_no_caderno'],
      ...dias.map((d) => [d.d.toISOString().slice(0, 10), d.min, d.respostas, d.certos, d.novas, d.total]),
    ];
    const blob = new Blob([linhas.map((l) => l.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'babel-play-estatisticas.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const cabecalho = (
    <>
      <CabecalhoDeTela
        sobrancelha="Seu progresso"
        icone={ChartColumn}
        titulo="Estatísticas"
        sub="Quanto você estudou, o que aprendeu e o que vem pela frente."
        acoes={
          /* "Exportar ▾" do protótipo com o que o app sabe gerar: os dados em CSV e a página
             impressa (o navegador salva em PDF). Relatório por e-mail e imagem não existem aqui. */
          <div className="linha" style={{ gap: 8, position: 'relative' }} data-exportar>
            <button
              type="button"
              className="btn btn-outline"
              aria-haspopup="menu"
              aria-expanded={menuExportar}
              disabled={!dias}
              onClick={() => setMenuExportar((v) => !v)}
            >
              <Download aria-hidden /> Exportar <ChevronDown aria-hidden />
            </button>
            {menuExportar && (
              <div className="menu-midia cartao" role="menu" style={{ top: 46 }}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuExportar(false);
                    window.setTimeout(() => window.print(), 50);
                  }}
                >
                  <FileText aria-hidden />
                  Imprimir ou salvar em PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuExportar(false);
                    exportarCsv();
                  }}
                >
                  <Sheet aria-hidden />
                  Dados em CSV
                </button>
              </div>
            )}
          </div>
        }
      />
      {filtros}
    </>
  );

  const imprimir = () => window.setTimeout(() => window.print(), 50);

  if (!dias) {
    if (questNovo)
      return (
        <EstatisticasDoQuest
          carregando
          periodo={periodo}
          aoTrocarPeriodo={setPeriodo}
          intervalo={null}
          kpis={[]}
          paineis={[]}
          semEstudo={false}
          aoExportarCsv={exportarCsv}
          aoImprimir={imprimir}
          aoPraticar={() => onChangeView('play')}
        />
      );
    return (
      <Tela largura="larga">
        {cabecalho}
        <div className="ladrilhos">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="cartao ladrilho esqueleto" style={{ height: 118 }} />
          ))}
        </div>
        <div className="g2 secao">
          <div className="cartao esqueleto" style={{ height: 260 }} />
          <div className="cartao esqueleto" style={{ height: 260 }} />
        </div>
      </Tela>
    );
  }

  const at = dias.slice(-periodo),
    ant = periodo < 90 ? dias.slice(-2 * periodo, -periodo) : [];
  const soma = (l: Dia[], k: 'min' | 'novas') => l.reduce((s, x) => s + x[k], 0);
  const ativos = (l: Dia[]) => l.filter((x) => x.respostas > 0).length;
  const acerto = (l: Dia[]) => {
    const r = l.reduce((s, x) => s + x.respostas, 0);
    return r ? Math.round((l.reduce((s, x) => s + x.certos, 0) / r) * 100) : null;
  };
  const variacao = (a: number, b: number) => (ant.length && b ? Math.round(((a - b) / b) * 100) : null);
  const acertoAt = acerto(at),
    acertoAnt = acerto(ant);
  const kpis: [typeof Clock, string, string, number | null, string, '%' | 'pp'][] = [
    [
      Clock,
      'Minutos de estudo',
      String(soma(at, 'min')),
      variacao(soma(at, 'min'), soma(ant, 'min')),
      `${Math.round(soma(at, 'min') / periodo)} min por dia, em média`,
      '%',
    ],
    [
      CalendarCheck,
      'Dias ativos',
      `${ativos(at)} de ${periodo}`,
      variacao(ativos(at), ativos(ant)),
      `${Math.round((ativos(at) / periodo) * 100)}% dos dias`,
      '%',
    ],
    [
      Sprout,
      'Palavras novas',
      String(soma(at, 'novas')),
      variacao(soma(at, 'novas'), soma(ant, 'novas')),
      `${dias[89].total} no caderno`,
      '%',
    ],
    [
      Target,
      'Acerto médio',
      acertoAt != null ? `${acertoAt}%` : '—',
      acertoAt != null && acertoAnt != null ? acertoAt - acertoAnt : null,
      acertoAt != null ? 'nas revisões e nos jogos' : 'sem respostas no período',
      'pp',
    ],
    [
      Flame,
      'Ofensiva atual',
      `${metrics?.streakDays ?? 0} dia${metrics?.streakDays === 1 ? '' : 's'}`,
      null,
      metrics?.maiorSequenciaPresenca != null
        ? `recorde: ${metrics.maiorSequenciaPresenca} dias`
        : 'dias seguidos com estudo',
      '%',
    ],
  ];

  const agrupado =
    periodo === 90
      ? Array.from({ length: 13 }, (_, s) => {
          const bloco = dias.slice(s * 7, s * 7 + 7);
          return { rotulo: `sem. ${fmtD(bloco[0].d)}`, min: bloco.reduce((a, x) => a + x.min, 0) };
        })
      : at.map((d) => ({ rotulo: `${DIA_SEM[d.d.getDay()]} · ${fmtD(d.d)}`, min: d.min }));
  const pico = previsao.reduce((m, x) => (x.n > m.n ? x : m), previsao[0] ?? { d: new Date(), n: 0 });
  const maisFraco = acertoPorJogo[acertoPorJogo.length - 1];

  /* As linhas das tabelas equivalentes: as mesmas na tela de sempre e na do headset. */
  const linhasDeMinutos: (string | number)[][] = agrupado.map((d) => [d.rotulo.replace(' · ', ', '), d.min]);
  const linhasDoCaderno: (string | number)[][] = at.map((d) => [fmtD(d.d), d.total, d.novas ? `+${d.novas}` : '—']);
  const linhasDoCalendario: (string | number)[][] = dias
    .slice(-84)
    .map((d) => [`${DIA_SEM[d.d.getDay()]}, ${fmtD(d.d)}`, d.min || (d.respostas ? '< 1' : '—')]);
  const linhasDaPrevisao: (string | number)[][] = previsao.map((d) => [`${DIA_SEM[d.d.getDay()]}, ${fmtD(d.d)}`, d.n]);
  const linhasDosJogos: (string | number)[][] = acertoPorJogo.map(([r, v]) => [r, `${v}%`]);

  if (questNovo) {
    const paineis: PainelDoQuest[] = [
      {
        id: 'minutos',
        Icone: Clock,
        aba: t('Minutos'),
        titulo: periodo === 90 ? t('Minutos por semana') : t('Minutos por dia'),
        desc:
          periodo === 90
            ? t(
                'A linha tracejada é a sua meta de {n} min por dia, vezes 7 na semana. Barras mais escuras bateram a meta.',
                {
                  n: metaMin,
                },
              )
            : t('A linha tracejada é a sua meta de {n} min por dia. Barras mais escuras bateram a meta.', {
                n: metaMin,
              }),
        grafico: (largura) => (
          <GraficoDeBarras
            rotuloDoGrafico="Minutos de estudo"
            dados={agrupado}
            rotulo={(d) => d.rotulo}
            valor={(d) => d.min}
            unidade="min"
            meta={periodo === 90 ? metaMin * 7 : metaMin}
            q={largura}
          />
        ),
        cab: [t('Data'), t('Minutos')],
        linhas: linhasDeMinutos,
      },
      {
        id: 'vocab',
        Icone: BookOpen,
        aba: t('Palavras'),
        titulo: t('Palavras no caderno'),
        desc: t('O total acumulado. Cada degrau é um dia com palavras novas.'),
        grafico: (largura) => <GraficoDeLinha dados={at} q={largura} />,
        cab: [t('Data'), t('Total'), t('Novas')],
        linhas: linhasDoCaderno,
      },
      {
        id: 'calendario',
        Icone: CalendarDays,
        aba: t('Calendário'),
        titulo: t('Calendário de atividade'),
        desc: t('Últimas 12 semanas. Quanto mais escuro, mais minutos no dia.'),
        grafico: () => <Calendario dias={dias} q />,
        cab: [t('Data'), t('Minutos')],
        linhas: linhasDoCalendario,
      },
      {
        id: 'previsao',
        Icone: CalendarClock,
        aba: t('Revisões'),
        titulo: t('Revisões nos próximos 7 dias'),
        desc: t('Quantas palavras voltam para revisão em cada dia, pela repetição espaçada.'),
        grafico: (largura) => (
          <GraficoDeBarras
            rotuloDoGrafico="Previsão de revisões"
            dados={previsao}
            rotulo={(d) => `${DIA_SEM[d.d.getDay()]} · ${fmtD(d.d)}`}
            valor={(d) => d.n}
            unidade="palavras"
            q={largura}
          />
        ),
        cab: [t('Dia'), t('Palavras')],
        linhas: linhasDaPrevisao,
        nota:
          pico.n > 0
            ? tp(
                pico.n,
                'Pico na {dia}: {n} palavra. Revisar um pouco antes suaviza a semana.',
                'Pico na {dia}: {n} palavras. Revisar um pouco antes suaviza a semana.',
                { dia: DIA_SEM[pico.d.getDay()] },
              )
            : undefined,
      },
      {
        id: 'jogos',
        Icone: Gamepad2,
        aba: t('Jogos'),
        titulo: t('Acerto por jogo'),
        desc: t('Onde você vai melhor e onde vale praticar mais.'),
        grafico: () => <BarrasHorizontais dados={acertoPorJogo} unidade="%" max={100} />,
        vazio: acertoPorJogo.length ? undefined : t('Nenhuma rodada registrada ainda.'),
        cab: [t('Jogo'), t('Acerto')],
        linhas: linhasDosJogos,
        nota: maisFraco ? t('Mais fraco: {jogo}.', { jogo: maisFraco[0] }) : undefined,
        acao: maisFraco ? { rotulo: t('Praticar agora'), aoTocar: () => onChangeView('play') } : undefined,
      },
      {
        id: 'niveis',
        Icone: GraduationCap,
        aba: t('Níveis'),
        titulo: t('Palavras por nível'),
        desc: t('Nível CEFR das palavras do seu caderno (estimativa quando fora da lista curada).'),
        grafico: () => (
          <BarrasHorizontais dados={porNivel} unidade="palavras" max={Math.max(...porNivel.map(([, n]) => n))} />
        ),
        vazio: porNivel.length ? undefined : t('Sem palavras no caderno ainda.'),
        cab: [t('Nível'), t('Palavras')],
        linhas: porNivel,
      },
      { id: 'meta', Icone: Target, aba: t('Meta'), conteudo: <MetaDeNivel metrics={metrics} /> },
    ];
    return (
      <EstatisticasDoQuest
        carregando={false}
        periodo={periodo}
        aoTrocarPeriodo={setPeriodo}
        intervalo={`${fmtD(dias[90 - periodo].d)} a ${fmtD(dias[89].d)} de ${dias[89].d.getFullYear()}`}
        kpis={kpis.map(([Icone, rotulo, valor, variacao, sub, un]) => ({ Icone, rotulo, valor, variacao, sub, un }))}
        paineis={paineis}
        semEstudo={dias[89].total === 0 && dias.every((d) => d.respostas === 0)}
        aoExportarCsv={exportarCsv}
        aoImprimir={imprimir}
        aoPraticar={() => onChangeView('play')}
      />
    );
  }

  return (
    <Tela largura="larga">
      {cabecalho}
      <div className="ladrilhos kpis">
        {kpis.map(([Icone, r, v, d, sub, un]) => (
          <div key={r} className="cartao ladrilho kpi">
            <span className="linha" style={{ gap: 8 }}>
              <Icone aria-hidden style={{ width: 15, height: 15, color: 'var(--ink-muted)' }} />
              <span className="label-mono">{r}</span>
            </span>
            <span className="v tn">{v}</span>
            <small className="mut">{sub}</small>
            <Variacao v={d} un={un} />
          </div>
        ))}
      </div>

      <div className="stats-grade">
        <CartaoDeGrafico
          id="minutos"
          Icone={Clock}
          titulo={periodo === 90 ? 'Minutos por semana' : 'Minutos por dia'}
          desc={`A linha tracejada é a sua meta de ${metaMin} min${periodo === 90 ? ' por dia (×7 por semana)' : ''}. Barras mais escuras bateram a meta.`}
          grafico={
            <GraficoDeBarras
              rotuloDoGrafico="Minutos de estudo"
              dados={agrupado}
              rotulo={(d) => d.rotulo}
              valor={(d) => d.min}
              unidade="min"
              meta={periodo === 90 ? metaMin * 7 : metaMin}
            />
          }
          tabela={<Tabela cab={['Data', 'Minutos']} linhas={linhasDeMinutos} />}
        />
        <CartaoDeGrafico
          id="vocab"
          Icone={BookOpen}
          titulo="Palavras no caderno"
          desc="O total acumulado. Cada degrau é um dia com palavras novas."
          grafico={<GraficoDeLinha dados={at} />}
          tabela={<Tabela cab={['Data', 'Total', 'Novas']} linhas={linhasDoCaderno} />}
        />
        <CartaoDeGrafico
          id="calendario"
          Icone={CalendarDays}
          titulo="Calendário de atividade"
          desc="Últimas 12 semanas. Quanto mais escuro, mais minutos no dia."
          grafico={<Calendario dias={dias} />}
          tabela={<Tabela cab={['Data', 'Minutos']} linhas={linhasDoCalendario} />}
        />
        <CartaoDeGrafico
          id="previsao"
          Icone={CalendarClock}
          titulo="Revisões nos próximos 7 dias"
          desc="Quantas palavras voltam para revisão em cada dia, pela repetição espaçada."
          grafico={
            <GraficoDeBarras
              rotuloDoGrafico="Previsão de revisões"
              dados={previsao}
              rotulo={(d) => `${DIA_SEM[d.d.getDay()]} · ${fmtD(d.d)}`}
              valor={(d) => d.n}
              unidade="palavras"
              altura={160}
            />
          }
          tabela={<Tabela cab={['Dia', 'Palavras']} linhas={linhasDaPrevisao} />}
          extra={
            pico.n > 0 ? (
              <p className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>
                <Info aria-hidden style={{ width: 13, height: 13, verticalAlign: -2 }} /> Pico na{' '}
                {DIA_SEM[pico.d.getDay()]}: {pico.n} {pico.n === 1 ? 'palavra' : 'palavras'}. Revisar um pouco antes
                suaviza a semana.
              </p>
            ) : undefined
          }
        />
        <CartaoDeGrafico
          id="jogos"
          Icone={Gamepad2}
          titulo="Acerto por jogo"
          desc="Onde você vai melhor e onde vale praticar mais."
          grafico={
            acertoPorJogo.length ? (
              <BarrasHorizontais dados={acertoPorJogo} unidade="%" max={100} />
            ) : (
              <p className="mut">Nenhuma rodada registrada ainda.</p>
            )
          }
          tabela={<Tabela cab={['Jogo', 'Acerto']} linhas={linhasDosJogos} />}
          extra={
            maisFraco ? (
              <p className="mut" style={{ fontSize: 12.5, marginTop: 10 }}>
                Mais fraco: <b style={{ color: 'var(--ink)' }}>{maisFraco[0]}</b>.{' '}
                <button type="button" className="link" onClick={() => onChangeView('play')}>
                  Praticar agora
                </button>
              </p>
            ) : undefined
          }
        />
        <CartaoDeGrafico
          id="niveis"
          Icone={GraduationCap}
          titulo="Palavras por nível"
          desc="Nível CEFR das palavras do seu caderno (estimativa quando fora da lista curada)."
          grafico={
            porNivel.length ? (
              <BarrasHorizontais dados={porNivel} unidade="palavras" max={Math.max(...porNivel.map(([, n]) => n))} />
            ) : (
              <p className="mut">Sem palavras no caderno ainda.</p>
            )
          }
          tabela={<Tabela cab={['Nível', 'Palavras']} linhas={porNivel} />}
        />
      </div>

      <MetaDeNivel metrics={metrics} />
    </Tela>
  );
}
