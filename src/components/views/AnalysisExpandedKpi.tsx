import React from 'react';
import { X, Activity, MessageSquareWarning, Crosshair, TrendingUp, AlertTriangle, BookOpen, Clock, BarChart2, Zap, Sparkles, Tags } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { extractKeywords } from '@core';
import { SemDado } from '../Honestidade';

export type AnalysisKpiType = 'ppm' | 'fillers' | 'lexical_richness' | 'dominant_tone' | 'long_pauses' | 'words_read' | 'study_time' | 'flesch' | 'density' | 'jargons' | 'articulatory_pauses' | 'topics' | null;

/** Subconjunto real de um enunciado da sessão (ver UtteranceRow em data/api.ts). */
interface KpiUtterance {
  sourceText?: string | null;
  tStartMs?: number | null;
  tEndMs?: number | null;
}

/** Contagem de marcadores de hesitação, já calculada por quem abriu o painel (ver `vicios`). */
interface ViciosDoKpi {
  total: number;
  palavras: number;
  porMilPalavras: number;
  detalhe: Array<{ marcador: string; vezes: number }>;
  idiomas: string[];
  palavrasSemLista: number;
}

interface AnalysisExpandedKpiProps {
  kpi: AnalysisKpiType;
  onClose: () => void;
  /**
   * Transcrição REAL da sessão. Quando ausente/vazia, as métricas derivadas
   * exibem "sem dados suficientes" — nunca dados fabricados.
   */
  utterances?: KpiUtterance[];
  /**
   * Vícios JÁ CONTADOS pela tela que abriu este painel — não recalculados aqui de propósito.
   *
   * O cartão conta sobre `sentences`, que aplica a cadeia de fallback de idioma da Análise (fala →
   * idioma da sessão → idioma da Captura); as linhas cruas de `utterances` não têm esse fallback.
   * Recontar aqui daria um número DIFERENTE do cartão que a pessoa acabou de clicar, e duas contas
   * para o mesmo indicador é como nasce a discordância que a gente passa depois caçando.
   */
  vicios?: ViciosDoKpi;
}

const TOOLTIP_STYLE = { backgroundColor: 'var(--surface)', borderColor: 'var(--border-subtle)', borderRadius: '8px', color: 'var(--ink)' } as const;

function countWords(text?: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}



export default function AnalysisExpandedKpi({ kpi, onClose, utterances, vicios }: AnalysisExpandedKpiProps) {
  if (!kpi) return null;

  const rows = utterances ?? [];

  const renderContent = () => {
    switch (kpi) {
      case 'ppm': {
        // Ritmo de fala derivado do texto + tempos reais de cada enunciado.
        const timed = rows.filter(u => u.tStartMs != null && u.tEndMs != null && (u.tEndMs as number) > (u.tStartMs as number));
        const series = timed
          .map(u => {
            const dur = (u.tEndMs as number) - (u.tStartMs as number);
            const wpm = dur > 0 ? Math.round(countWords(u.sourceText) / (dur / 60000)) : 0;
            return { time: fmtClock(u.tStartMs as number), ppm: wpm };
          })
          .filter(p => p.ppm > 0);
        const totalWords = timed.reduce((a, u) => a + countWords(u.sourceText), 0);
        const totalMs = timed.reduce((a, u) => a + ((u.tEndMs as number) - (u.tStartMs as number)), 0);
        const avgWpm = totalMs > 0 && totalWords > 0 ? Math.round(totalWords / (totalMs / 60000)) : null;

        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Seu ritmo de fala (Palavras por Minuto) é calculado a partir do texto e dos tempos reais de cada enunciado desta sessão. Um ritmo entre 130 e 160 PPM costuma ser confortável para o ouvinte.
              </p>
            </div>
            {avgWpm == null || series.length === 0 ? (
              <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Esta métrica precisa da transcrição da sessão com tempos de início e fim (tStartMs/tEndMs)." />
            ) : (
              <>
                <div className="bg-surface border border-border-subtle p-4 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Ritmo médio (real)</span>
                  <div className="font-display text-2xl font-black text-accent">{avgWpm}<span className="text-[14px] text-ink-faint ml-1">PPM</span></div>
                </div>
                <div className="h-[250px] w-full bg-surface/30 p-3 rounded-2xl border border-border-subtle/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series}>
                      <defs>
                        <linearGradient id="colorPpm" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="time" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="ppm" name="PPM por enunciado" stroke="var(--accent)" fillOpacity={1} fill="url(#colorPpm)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        );
      }

      /* Era um AiPlaceholder dizendo "exige classificação linguística". Não exige: é busca de
         token, feita em `core/learning/fillers.ts`. O que exige cuidado é a lista ser por idioma. */
      case 'fillers': {
        if (!vicios || vicios.palavras === 0) {
          return <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Nenhuma fala em idioma com lista de marcadores. Só português e inglês têm lista — em outros idiomas o app diz que não sabe, em vez de mostrar zero." />;
        }
        const maior = vicios.detalhe[0]?.vezes ?? 1;
        return (
          <div className="space-y-6">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Contagem de marcadores de hesitação no seu transcrito — <strong className="text-ink">{vicios.total}</strong> em{' '}
              {vicios.palavras} palavras ({vicios.porMilPalavras} por mil), usando a lista de{' '}
              {vicios.idiomas.join(' e ')}.
            </p>

            {vicios.detalhe.length === 0 ? (
              <SemDado motivo={`Sem dados suficientes para esta análise nesta sessão. Nenhum marcador de hesitação encontrado em ${vicios.palavras} palavras.`} />
            ) : (
              <div className="bg-surface p-5 rounded-2xl border border-border-subtle space-y-2.5">
                {vicios.detalhe.map(d => (
                  <div key={d.marcador} className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-ink w-24 shrink-0 truncate" title={d.marcador}>"{d.marcador}"</span>
                    <div className="flex-1 h-4 bg-canvas rounded-full overflow-hidden border border-border-subtle">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.round((d.vezes / maior) * 100)}%` }} />
                    </div>
                    <span className="text-[13px] font-bold text-ink-muted w-10 text-right shrink-0">{d.vezes}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Sem isto o total parece completo quando não é. */}
            {vicios.palavrasSemLista > 0 && (
              <p className="text-[12px] text-ink-faint leading-relaxed">
                {vicios.palavrasSemLista} palavras ficaram de fora da conta — estão em idiomas sem lista
                de marcadores, e chutar seria inventar.
              </p>
            )}

            <p className="text-[11.5px] text-ink-faint leading-relaxed">
              Só entram marcadores que não podem ser outra coisa. Palavras ambíguas ficam fora de
              propósito: <em>like</em> é verbo, <em>assim</em> é advérbio, <em>sabe</em> é verbo — incluí-las
              inflaria a contagem em cerca de 5× no inglês. E <em>um</em> conta como hesitação só em fala
              inglesa; em português é artigo.
            </p>
          </div>
        );
      }

      case 'lexical_richness':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                A Riqueza Lexical mede a diversidade e a sofisticação do vocabulário utilizado. Uma análise aprofundada (palavras avançadas, raridade, variação) depende de processamento de linguagem.
              </p>
            </div>
            <SemDado motivo="Esta análise exigiria um modelo de linguagem, que este painel não chama." />
          </div>
        );

      case 'dominant_tone':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                A assinatura emocional da fala (tom confiante, calmo, hesitante) depende de análise de pitch e prosódia por IA, ainda não implementada.
              </p>
            </div>
            <SemDado motivo="Esta análise exigiria um modelo de linguagem, que este painel não chama." />
          </div>
        );

      case 'long_pauses':
      case 'articulatory_pauses': {
        // Silêncios REAIS entre enunciados (gap = início do próximo − fim do anterior).
        const timed = rows
          .filter(u => u.tStartMs != null && u.tEndMs != null)
          .sort((a, b) => (a.tStartMs as number) - (b.tStartMs as number));
        const gaps: { label: string; seconds: number }[] = [];
        for (let i = 1; i < timed.length; i++) {
          const gapMs = (timed[i].tStartMs as number) - (timed[i - 1].tEndMs as number);
          if (gapMs > 0) gaps.push({ label: fmtClock(timed[i - 1].tEndMs as number), seconds: Math.round(gapMs / 100) / 10 });
        }
        const LONG_S = 2;
        const longCount = gaps.filter(g => g.seconds >= LONG_S).length;
        const totalSilence = Math.round(gaps.reduce((a, g) => a + g.seconds, 0) * 10) / 10;

        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Pausas entre enunciados, calculadas a partir dos tempos reais da transcrição. Silêncios longos podem indicar organização de raciocínio ou hesitação.
              </p>
            </div>
            {gaps.length === 0 ? (
              <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Precisa de ao menos dois enunciados com tempos de início e fim para medir os silêncios." />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface border border-border-subtle p-3 rounded-xl">
                    <span className="text-[11px] font-semibold text-ink-muted uppercase">Pausas longas (≥ {LONG_S}s)</span>
                    <div className="text-lg font-bold text-ink mt-0.5">{longCount}</div>
                  </div>
                  <div className="bg-surface border border-border-subtle p-3 rounded-xl">
                    <span className="text-[11px] font-semibold text-ink-muted uppercase">Silêncio total</span>
                    <div className="text-lg font-bold text-ink mt-0.5">{totalSilence}s</div>
                  </div>
                </div>
                <div className="h-[240px] w-full bg-surface/30 p-3 rounded-2xl border border-border-subtle/50">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={gaps}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="seconds" name="Duração da pausa (s)" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        );
      }

      case 'words_read': {
        // Volume REAL de palavras transcritas na sessão.
        const withText = rows.filter(u => countWords(u.sourceText) > 0);
        const totalWords = withText.reduce((a, u) => a + countWords(u.sourceText), 0);
        const timed = withText
          .filter(u => u.tStartMs != null)
          .sort((a, b) => (a.tStartMs as number) - (b.tStartMs as number));
        let cum = 0;
        const series = timed.map(u => {
          cum += countWords(u.sourceText);
          return { time: fmtClock(u.tStartMs as number), words: cum };
        });

        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Volume total de palavras transcritas nesta sessão, contadas diretamente do texto real dos enunciados.
              </p>
            </div>
            {totalWords === 0 ? (
              <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Nenhum enunciado com texto foi encontrado para esta sessão." />
            ) : (
              <>
                <div className="bg-surface border border-border-subtle p-4 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">Palavras transcritas (real)</span>
                  <div className="font-display text-2xl font-black text-good">{totalWords.toLocaleString('pt-BR')}</div>
                </div>
                {series.length > 0 && (
                  <div className="h-[240px] w-full bg-surface/30 p-3 rounded-2xl border border-border-subtle/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series}>
                        <defs>
                          <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--good)" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="var(--good)" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                        <XAxis dataKey="time" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                        <YAxis stroke="var(--ink-muted)" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Area type="monotone" dataKey="words" name="Palavras acumuladas" stroke="var(--good)" fillOpacity={1} fill="url(#colorWords)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      case 'study_time':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Tempo de estudo ativo/passivo (revisões SRS, audição contextual, análise de termos) depende de um histórico de atividade que ainda não é registrado.
              </p>
            </div>
            <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Nenhum registro de tempo de estudo é rastreado para esta sessão no momento." />
          </div>
        );

      case 'flesch':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                O índice de facilidade de leitura Flesch avalia a complexidade do texto com base em sílabas por palavra e tamanho das frases — cálculo que exige análise linguística (contagem silábica) ainda não implementada.
              </p>
            </div>
            <SemDado motivo="Esta análise exigiria um modelo de linguagem, que este painel não chama." />
          </div>
        );

      case 'density':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                A densidade lexical é a proporção de palavras de conteúdo (substantivos, verbos, adjetivos, advérbios) sobre palavras funcionais — sua medição requer etiquetagem gramatical (POS tagging) por NLP.
              </p>
            </div>
            <SemDado motivo="Esta análise exigiria um modelo de linguagem, que este painel não chama." />
          </div>
        );

      case 'jargons':
        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Identificar termos e acrônimos ultra-específicos (jargões) exige classificação de vocabulário por IA para distinguir jargão de linguagem comum.
              </p>
            </div>
            <SemDado motivo="Esta análise exigiria um modelo de linguagem, que este painel não chama." />
          </div>
        );

      case 'topics': {
        // Palavras-chave REAIS por frequência: extrai termos salientes do transcrito
        // (determinístico, sem IA) e conta quantas vezes cada um aparece no texto real.
        const fullText = rows.map(u => u.sourceText ?? '').join(' ');
        const keywords = extractKeywords(fullText, { max: 12 });
        const normalized = fullText.toLowerCase();
        const freq: { name: string; count: number }[] = keywords
          .map(kw => {
            const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = normalized.match(new RegExp(`\\b${escaped}\\b`, 'gu'));
            return { name: kw, count: matches ? matches.length : 0 };
          })
          .filter(k => k.count > 0)
          .sort((a, b) => b.count - a.count);

        return (
          <div className="space-y-6">
            <div>
              <p className="text-[13px] text-ink-muted leading-relaxed">
                Palavras-chave por frequência: os termos de conteúdo mais salientes do
                transcrito desta sessão, com a contagem real de ocorrências. Classificação
                semântica em tópicos nomeados exigiria um modelo de linguagem — estes são termos, não tópicos.
              </p>
            </div>
            {freq.length === 0 ? (
              <SemDado motivo="Sem dados suficientes para esta análise nesta sessão. Nenhuma palavra-chave de conteúdo foi encontrada no transcrito desta sessão." />
            ) : (
              <div className="h-[300px] w-full bg-surface/30 p-3 rounded-2xl border border-border-subtle/50">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={freq} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                    <XAxis type="number" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="var(--ink-muted)" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" name="Ocorrências" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      }

      default:
        return (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted leading-relaxed">
              Detalhamento da métrica {kpi}.
            </p>
            <SemDado motivo="Sem dados suficientes para esta análise nesta sessão." />
          </div>
        );
    }
  };

  const getTitle = () => {
    switch (kpi) {
      case 'ppm': return 'Análise de Ritmo (PPM)';
      case 'fillers': return 'Detalhamento: Vícios de Linguagem';
      case 'lexical_richness': return 'Detalhamento: Riqueza Lexical';
      case 'dominant_tone': return 'Análise de Tom Vocal';
      case 'long_pauses': return 'Análise de Pausas Articulatórias';
      case 'words_read': return 'Volume de Leitura';
      case 'study_time': return 'Estimativa de Tempo de Estudo';
      case 'flesch': return 'Complexidade Flesch-Kincaid';
      case 'density': return 'Densidade de Informação';
      case 'jargons': return 'Mapeamento de Jargões';
      case 'articulatory_pauses': return 'Análise de Silêncio e Pausas';
      case 'topics': return 'Categorização e Tópicos';
      default: return 'Detalhamento da Métrica';
    }
  };

  const getIcon = () => {
    const cls = 'w-5 h-5';
    switch (kpi) {
      case 'ppm': return <Activity className={cls} />;
      case 'fillers': return <MessageSquareWarning className={cls} />;
      case 'lexical_richness': return <Crosshair className={cls} />;
      case 'dominant_tone': return <TrendingUp className={cls} />;
      case 'long_pauses':
      case 'articulatory_pauses': return <AlertTriangle className={cls} />;
      case 'words_read': return <BookOpen className={cls} />;
      case 'study_time': return <Clock className={cls} />;
      case 'flesch': return <Crosshair className={cls} />;
      case 'density': return <BarChart2 className={cls} />;
      case 'jargons': return <Zap className={cls} />;
      case 'topics': return <Tags className={cls} />;
      default: return <BarChart2 className={cls} />;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-canvas w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border-subtle">
          <h2 className="font-display font-extrabold text-xl text-ink flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center shrink-0">
              {getIcon()}
            </span>
            {getTitle()}
          </h2>
          <button
            onClick={onClose}
            className="p-2 bg-surface hover:bg-surface-hover rounded-full transition-colors text-ink-muted hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
