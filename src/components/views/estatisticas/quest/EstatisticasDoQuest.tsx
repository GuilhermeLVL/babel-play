import '../../../../styles/questEstatisticas.css';

import type { LucideIcon } from 'lucide-react';
import {
  ChartColumn,
  Download,
  FileText,
  Gamepad2,
  Minus,
  Sheet,
  Table2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

import { noHeadset } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { t } from '../../../../lib/i18n';
import { Dialogo, fecharDialogoDe } from '../../../ui';

/**
 * AS ESTATÍSTICAS NO META QUEST (segunda rodada do desenho do headset, 01/10/2026).
 *
 * A tela de sempre empilha seis gráficos em duas colunas e rola. No headset, UM gráfico por vez, largo,
 * desenhado em pixels de verdade (o rótulo tem 14 px na tela, e não 11 unidades de um desenho que
 * encolhe), com as abas em cima e a tabela equivalente a um toque: no Quest não há hover, então a dica
 * de cada barra não existe, e é a tabela que diz o número exato.
 *
 * Só apresentação: os números, os gráficos e as ações chegam prontos de `Estatisticas.tsx`, que
 * continua dono dos dados e do período.
 */

export interface KpiDoQuest {
  Icone: LucideIcon;
  rotulo: string;
  valor: string;
  /** Variação contra o período anterior; `null` quando não há com o que comparar. */
  variacao: number | null;
  sub: string;
  un: '%' | 'pp';
}

export interface PainelDoQuest {
  id: string;
  Icone: LucideIcon;
  /** O nome curto, na aba. */
  aba: string;
  titulo?: string;
  desc?: string;
  /** O gráfico, desenhado na largura medida (px). */
  grafico?: (largura: number) => ReactNode;
  /** A tabela equivalente. */
  cab?: string[];
  linhas?: (string | number)[][];
  /** Sem dado para desenhar: a frase que explica. */
  vazio?: string;
  /** Uma leitura do gráfico, numa linha, com no máximo uma ação. */
  nota?: string;
  acao?: { rotulo: string; aoTocar: () => void };
  /** Painel que não é gráfico (a meta de nível): entra inteiro. */
  conteudo?: ReactNode;
}

/** O gráfico na largura REAL da caixa: 1 unidade do desenho = 1 px, e o rótulo tem o tamanho que o CSS diz. */
function Medido({ children }: { children: (largura: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(Math.round(el.clientWidth));
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Sem medida (o primeiro quadro, ou um ambiente sem layout): uma largura que desenha bem.
  return (
    <div ref={ref} className="qe-grafico">
      {children(Math.min(1200, Math.max(300, largura || 640)))}
    </div>
  );
}

function Variacao({ v, un }: { v: number | null; un: '%' | 'pp' }) {
  if (v == null) return null;
  if (v === 0)
    return (
      <span className="q-delta">
        <Minus aria-hidden /> {t('igual ao período anterior')}
      </span>
    );
  const valor = `${v > 0 ? '+' : ''}${v}${un === 'pp' ? ' p.p.' : '%'}`;
  return (
    <span className={`q-delta ${v > 0 ? 'sobe' : 'desce'}`}>
      {v > 0 ? <TrendingUp aria-hidden /> : <TrendingDown aria-hidden />}
      <span aria-hidden>{t('{v} vs. anterior', { v: valor })}</span>
      <span className="sr">{t('{v} em relação ao período anterior', { v: valor })}</span>
    </span>
  );
}

const PERIODOS = [7, 30, 90] as const;

export default function EstatisticasDoQuest({
  carregando,
  periodo,
  aoTrocarPeriodo,
  intervalo,
  kpis,
  paineis,
  semEstudo,
  aoExportarCsv,
  aoImprimir,
  aoPraticar,
}: {
  /** Os dados ainda não chegaram: a tela mostra a forma do que vem. */
  carregando: boolean;
  periodo: 7 | 30 | 90;
  aoTrocarPeriodo: (p: 7 | 30 | 90) => void;
  /** "2 set a 1 out de 2026". */
  intervalo: string | null;
  kpis: KpiDoQuest[];
  paineis: PainelDoQuest[];
  /** Nenhuma resposta e nenhuma palavra ainda: a tela diz o que falta e por onde começar. */
  semEstudo: boolean;
  aoExportarCsv: () => void;
  aoImprimir: () => void;
  aoPraticar: () => void;
}) {
  const [aba, setAba] = useState<string | null>(null);
  const [comoTabela, setComoTabela] = useState<Record<string, boolean>>({});
  const [exportando, setExportando] = useState(false);
  const ativo: PainelDoQuest | undefined = paineis.find((p) => p.id === aba) ?? paineis[0];

  return (
    <div className="q-palco qe" data-testid="estatisticas-no-quest">
      <header className="q-cab">
        <div>
          <p className="q-sobre">{intervalo ? `${t('Seu progresso')} · ${intervalo}` : t('Seu progresso')}</p>
          <h1>{t('Estatísticas')}</h1>
        </div>
        <div className="q-abas q-seg" role="group" aria-label={t('Período')}>
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              className="q-aba"
              aria-pressed={periodo === p}
              onClick={() => aoTrocarPeriodo(p)}
            >
              {t('{n} dias', { n: p })}
            </button>
          ))}
        </div>
        <button type="button" className="q-ctl" disabled={carregando} onClick={() => setExportando(true)}>
          <Download aria-hidden /> {t('Exportar')}
        </button>
      </header>

      {carregando || !ativo ? (
        <div role="status" aria-label={t('Carregando as estatísticas')} className="qe-espera">
          <div className="qe-kpis">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="q-esqueleto" style={{ minHeight: 128 }} />
            ))}
          </div>
          <div className="q-esqueleto" style={{ minHeight: 68, borderRadius: 999 }} />
          <div className="q-esqueleto" style={{ minHeight: 300, borderRadius: 20 }} />
        </div>
      ) : (
        <>
          {semEstudo && (
            <div className="q-aviso" role="note" data-testid="sem-estudo">
              <span>{t('Ainda não há estudo registrado. Os gráficos se preenchem conforme você revisa e joga.')}</span>
              <button type="button" className="q-ctl" onClick={aoPraticar}>
                <Gamepad2 aria-hidden /> {t('Praticar agora')}
              </button>
            </div>
          )}

          <div className="qe-kpis">
            {kpis.map((k) => (
              <div key={k.rotulo} className="q-num qe-kpi">
                <span className="q-rotulo">
                  <k.Icone aria-hidden /> {k.rotulo}
                </span>
                <b>{k.valor}</b>
                <span>{k.sub}</span>
                <Variacao v={k.variacao} un={k.un} />
              </div>
            ))}
          </div>

          <div className="q-abas qe-abas" role="tablist" aria-label={t('Gráficos')}>
            {paineis.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`qe-aba-${p.id}`}
                aria-selected={p.id === ativo.id}
                aria-controls={`qe-painel-${p.id}`}
                className="q-aba"
                onClick={() => setAba(p.id)}
              >
                <p.Icone aria-hidden /> {p.aba}
              </button>
            ))}
          </div>

          {/* TODOS os painéis ficam montados e só o da aba aparece: na impressão (`@media print` em
              `questEstatisticas.css`) saem os seis gráficos e a meta, em sequência, como na tela de sempre. */}
          {paineis.map((p) => (
            <div
              className="q-cartao qe-painel"
              role="tabpanel"
              key={p.id}
              id={`qe-painel-${p.id}`}
              aria-labelledby={`qe-aba-${p.id}`}
              data-painel={p.id}
              hidden={p.id !== ativo.id}
            >
              {p.conteudo ?? (
                <>
                  <div className="q-secao">
                    <header>
                      <div>
                        <h2>{p.titulo}</h2>
                        {p.desc && <p>{p.desc}</p>}
                      </div>
                      <button
                        type="button"
                        className="q-ctl"
                        aria-pressed={!!comoTabela[p.id]}
                        onClick={() => setComoTabela((v) => ({ ...v, [p.id]: !v[p.id] }))}
                      >
                        {comoTabela[p.id] ? <ChartColumn aria-hidden /> : <Table2 aria-hidden />}
                        {comoTabela[p.id] ? t('Ver gráfico') : t('Ver como tabela')}
                      </button>
                    </header>
                  </div>
                  {comoTabela[p.id] ? (
                    <div className="q-tabela-caixa qe-tabela" tabIndex={0}>
                      <table className="q-tabela">
                        <thead>
                          <tr>
                            {(p.cab ?? []).map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(p.linhas ?? []).map((l, i) => (
                            <tr key={i}>
                              {l.map((c, j) => (
                                <td key={j}>{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!p.linhas?.length && (
                        <p className="q-texto qe-sem-linhas">{p.vazio ?? t('Sem dados no período.')}</p>
                      )}
                    </div>
                  ) : p.vazio ? (
                    <p className="q-texto qe-vazio">{p.vazio}</p>
                  ) : (
                    <Medido key={p.id}>{(largura) => p.grafico?.(largura)}</Medido>
                  )}
                  {p.nota && (
                    <div className="q-aviso" role="note">
                      <span>{p.nota}</span>
                      {p.acao && (
                        <button type="button" className="q-ctl" onClick={p.acao.aoTocar}>
                          <Gamepad2 aria-hidden /> {p.acao.rotulo}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </>
      )}

      {exportando && (
        <Dialogo
          icone={Download}
          titulo={t('Exportar')}
          sub={t('Os dados dos últimos 90 dias, ou esta tela como documento.')}
          aoFechar={() => setExportando(false)}
        >
          <div className="dlg-corpo">
            <div className="q-lista">
              <button
                type="button"
                className="q-linha"
                data-autofocus
                onClick={(e) => {
                  fecharDialogoDe(e.currentTarget);
                  setExportando(false);
                  aoExportarCsv();
                }}
              >
                <span className="q-ic">
                  <Sheet aria-hidden />
                </span>
                <span>
                  <b>{t('Dados em CSV')}</b>
                  <small>{t('Um arquivo com cada dia: minutos, respostas, acertos e palavras.')}</small>
                </span>
              </button>
              <button
                type="button"
                className="q-linha"
                onClick={(e) => {
                  fecharDialogoDe(e.currentTarget);
                  setExportando(false);
                  aoImprimir();
                }}
              >
                <span className="q-ic">
                  <FileText aria-hidden />
                </span>
                <span>
                  <b>{t('Imprimir ou salvar em PDF')}</b>
                  <small>
                    {/* O navegador do headset pode não imprimir; o do computador imprime. */}
                    {noHeadset()
                      ? t(
                          'Abre a impressão do navegador com todos os gráficos e a meta. Se o headset não imprimir, use o CSV.',
                        )
                      : t('Abre a impressão do navegador com todos os gráficos e a meta.')}
                  </small>
                </span>
              </button>
            </div>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
