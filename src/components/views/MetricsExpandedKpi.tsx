import React from 'react';
// F5 — os imports de `recharts` e os ícones do gráfico saíram junto com a TERCEIRA cópia da
// série semanal, que agora vive só em `components/metrics/EvolucaoSemanal.tsx`.
import { X, Target, Clock, Activity, BookOpen, Mic } from 'lucide-react';
import type { AppMetrics } from '../../data/api';
import { Confianca, SemDado } from '../Honestidade';
import EvolucaoSemanal from '../metrics/EvolucaoSemanal';

export type KpiType = 'volume' | 'retention' | 'time' | 'level' | null;

interface MetricsExpandedKpiProps {
  kpi: KpiType;
  onClose: () => void;
  /** Métricas REAIS do backend. Opcional para não quebrar chamadas antigas. */
  metrics?: AppMetrics | null;
}

// ─────────────────────────── Helpers honestos ───────────────────────────

/**
 * Placeholder para quando não há dado real — jamais fabricamos números.
 *
 * O texto padrão (usado quando o chamador não passa `note`) dizia "em breve", como se faltasse uma
 * feature. Não falta: falta HISTÓRICO da própria conta (sessões/revisões suficientes para desenhar
 * o gráfico). Não há data para prometer, então a frase não promete uma — só explica a causa real e
 * mantém a garantia de que nada foi inventado para preencher o espaço.
 */


// `fmtWeek` saiu: o formato da semana agora é único e mora em `EvolucaoSemanal`.

function fmtMinutes(ms: number): string {
  const total = Math.round((ms || 0) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export default function MetricsExpandedKpi({ kpi, onClose, metrics }: MetricsExpandedKpiProps) {
  if (!kpi) return null;

  const hasMetrics = !!metrics;
  const levelDist = metrics?.levelDistribution ?? [];
  const levelTotal = levelDist.reduce((sum, l) => sum + (l.count || 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-2xl bg-canvas h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-border-subtle overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-border-subtle bg-surface flex justify-between items-center shrink-0">
          <div>
            <h2 className="font-display font-extrabold text-2xl text-ink tracking-tight flex items-center gap-3">
              {kpi === 'volume' && <><BookOpen className="w-6 h-6 text-accent" /> Detalhamento: Volume Lexical</>}
              {kpi === 'retention' && <><Activity className="w-6 h-6 text-good" /> Detalhamento: Retenção</>}
              {kpi === 'time' && <><Clock className="w-6 h-6 text-rare" /> Detalhamento: Tempo de Interação</>}
              {kpi === 'level' && <><Target className="w-6 h-6 text-warn" /> Detalhamento: Nível Predominante</>}
            </h2>
            <p className="text-[13px] text-ink-muted mt-1">Exploração das suas métricas reais de aprendizado</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-hover rounded-full transition-colors text-ink-muted hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

          {/* Aviso quando o modal foi aberto sem métricas reais carregadas */}
          {!hasMetrics && (
            <SemDado motivo="Métricas ainda não carregadas. Nenhum dado foi fabricado para preencher esta tela." />
          )}

          {/* VOLUME DETAILS */}
          {hasMetrics && kpi === 'volume' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1">Palavras Únicas</div>
                  <div className="font-display font-black text-3xl text-ink">{(metrics!.uniqueWords ?? 0).toLocaleString('pt-BR')}</div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">Formas distintas capturadas</div>
                </div>
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1">Cards no Deck</div>
                  <div className="font-display font-black text-3xl text-ink">{(metrics!.deckSize ?? 0).toLocaleString('pt-BR')}</div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">{metrics!.newCards ?? 0} novos • {metrics!.dueToday ?? 0} p/ revisar</div>
                </div>
              </div>

              {/* Terceira e última cópia deste gráfico — agora o mesmo componente das outras duas. */}
              <EvolucaoSemanal serie={metrics!.vocabByWeek} titulo="Aquisição por Semana" altura={250} />
            </>
          )}

          {/* RETENTION DETAILS */}
          {hasMetrics && kpi === 'retention' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1">Retenção Média</div>
                  <div className="font-display font-black text-3xl text-ink">
                    {metrics!.avgRetentionConfidence > 0 ? `${Math.round(metrics!.avgRetention * 100)}%` : '-'}
                  </div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">
                    {metrics!.avgRetentionConfidence > 0 ? `${Math.round(metrics!.avgRetentionConfidence * 100)}% de confiança` : 'sem revisões ainda'}
                  </div>
                </div>
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1">Estabilidade Média</div>
                  <div className="font-display font-black text-3xl text-ink">
                    {metrics!.avgStability > 0 ? `${metrics!.avgStability.toFixed(1)}d` : '-'}
                  </div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">Intervalo médio de memória (FSRS)</div>
                </div>
              </div>

              <div className="card-panel p-6 bg-surface border-border-subtle">
                <h3 className="font-bold text-[14px] text-ink mb-4">Desempenho nas Revisões</h3>
                {metrics!.reviews > 0 ? (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="font-display font-bold text-2xl text-ink">{metrics!.reviews}</div>
                      <div className="text-[11px] text-ink-muted uppercase font-bold mt-1">Revisões</div>
                    </div>
                    <div>
                      <div className="font-display font-bold text-2xl text-good-ink">{metrics!.correctReviews}</div>
                      <div className="text-[11px] text-ink-muted uppercase font-bold mt-1">Acertos</div>
                    </div>
                    <div>
                      <div className="font-display font-bold text-2xl text-ink">
                        {metrics!.accuracyConfidence > 0 ? `${Math.round(metrics!.accuracy * 100)}%` : '-'}
                      </div>
                      <div className="text-[11px] text-ink-muted uppercase font-bold mt-1">Acurácia</div>
                    </div>
                  </div>
                ) : (
                  <SemDado motivo="Nenhuma revisão registrada ainda, a retenção por fonte aparecerá quando houver histórico." />
                )}
              </div>
            </>
          )}

          {/* TIME DETAILS */}
          {hasMetrics && kpi === 'time' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1 flex items-center gap-1"><Mic className="w-3 h-3" /> Tempo de Fala</div>
                  <div className="font-display font-black text-3xl text-ink">
                    {metrics!.speakingMs > 0 ? fmtMinutes(metrics!.speakingMs) : '-'}
                  </div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">Áudio captado ao vivo</div>
                </div>
                <div className="card-panel p-5 bg-surface border-border-subtle">
                  <div className="text-[11px] font-bold text-ink-muted uppercase mb-1">Ritmo (WPM)</div>
                  <div className="font-display font-black text-3xl text-ink">
                    {metrics!.wpmConfidence > 0 ? Math.round(metrics!.wpm) : '-'}
                  </div>
                  <div className="text-[11px] text-ink-muted font-bold mt-1">
                    {metrics!.wpmConfidence > 0 ? `${Math.round(metrics!.wpmConfidence * 100)}% de confiança` : 'sem fala suficiente'}
                  </div>
                </div>
              </div>

              <div className="card-panel p-6 bg-surface border-border-subtle">
                <h3 className="font-bold text-[14px] text-ink mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rare" /> Distribuição por atividade
                </h3>
                <SemDado motivo="Ainda não há segmentação de tempo por tipo de atividade, sem dados fabricados. Disponível quando o app registrar a duração de cada sessão." />
              </div>
            </>
          )}

          {/* LEVEL DETAILS */}
          {hasMetrics && kpi === 'level' && (
            <>
              <div className="bg-warn-soft/40 border border-warn/20 rounded-2xl p-6 text-center">
                <div className="flex justify-center mb-3">
                  <Confianca estimativa valor={metrics!.levelConfidence} />
                </div>
                <p className="text-[13px] text-ink-muted max-w-sm mx-auto">
                  A distribuição por nível CEFR é uma <strong className="text-ink">estimativa</strong> derivada do seu vocabulário
                  consolidado. A confiança reflete o volume de dados disponível.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-[14px] text-ink">Decomposição por Nível CEFR</h3>
                {levelDist.length > 0 && levelTotal > 0 ? (
                  levelDist.map((lvl) => {
                    const percent = Math.round((lvl.count / levelTotal) * 100);
                    return (
                      <div key={lvl.level} className="card-panel p-5 bg-surface border-border-subtle">
                        <div className="flex justify-between items-end mb-3">
                          <div className="font-bold text-[14px] text-ink">{lvl.level}</div>
                          <div className="text-right shrink-0 ml-4">
                            <div className="font-display font-bold text-xl text-ink">{lvl.count.toLocaleString('pt-BR')}</div>
                            <div className="text-[11px] font-mono text-ink-muted uppercase">termos · {percent}%</div>
                          </div>
                        </div>
                        <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-border-subtle">
                          <div className="bg-ink h-full" style={{ width: `${percent}%` }}></div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <SemDado motivo="Ainda não há vocabulário suficiente para estimar a distribuição por nível CEFR." />
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
