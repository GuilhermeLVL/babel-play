import React, { useState, useMemo, useEffect } from 'react';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { ficharPalavraDoAnalista } from '../../lib/adicionarAoDeck';
import { fetchMetrics, fetchDeck, fetchAllUtterances, type AppMetrics, type UtteranceRow } from '../../data/api';
import { Recording, VocabCard, VocabWord } from '../../types';
import EditablePanel from '../EditablePanel';
import { t, coreOnly } from '../../lib/profile';
import {
  BookOpen, Clock, Activity, Zap, ArrowUpRight, AlertCircle,
  Download, LayoutGrid, Brain, Mic, Info, PieChart as PieChartIcon,
  Sprout, Eye, MoreHorizontal, BarChart2, MessageSquareWarning, Target} from 'lucide-react';
import {
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import MetricsExpandedKpi, { KpiType } from './MetricsExpandedKpi';
import { retrievability, computeTextStats, detectarVozPassiva } from '@core';
import CatalogoDePalavras from './vocab/CatalogoDePalavras';
import { baseLang } from '../../lib/languages';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import type { PracticeSeed, ExerciseId } from '../../lib/sentences';
import VocabularyPanel from '../VocabularyPanel';
import { Confianca, SemDado, ehBaixaConfianca } from '../Honestidade';
import { Abas, Barra, PainelDeAba } from '../ui';
import EvolucaoSemanal from '../metrics/EvolucaoSemanal';

// --- HELPERS ---

// Cores dos gráficos Recharts lidas dos tokens do tema (nunca hex fixos) — mesmo padrão
// de `exercises/WaveformDrill.tsx` (getComputedStyle sobre :root). Sem isto os gráficos
// ficavam chumbados numa paleta escura fixa: ilegíveis no tema claro e nunca respeitavam
// `--accent`. Os 6 tons também alimentam a paleta categórica da distribuição de níveis.
type ChartTheme = {
  accent: string;
  ink: string;
  inkMuted: string;
  surface: string;
  borderSubtle: string;
  good: string;
  warn: string;
  rare: string;
  error: string;
};

const CHART_THEME_FALLBACK: ChartTheme = {
  accent: '#F04E23',
  ink: '#26241F',
  inkMuted: '#5E5A50',
  surface: '#F5F2EA',
  borderSubtle: '#C6BFAC',
  good: '#3E6B44',
  warn: '#C98A12',
  rare: '#5B5EA6',
  error: '#C92A2A',
};

function readChartTheme(): ChartTheme {
  if (typeof document === 'undefined') return CHART_THEME_FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: get('--accent', CHART_THEME_FALLBACK.accent),
    ink: get('--ink', CHART_THEME_FALLBACK.ink),
    inkMuted: get('--ink-muted', CHART_THEME_FALLBACK.inkMuted),
    surface: get('--surface', CHART_THEME_FALLBACK.surface),
    borderSubtle: get('--border-subtle', CHART_THEME_FALLBACK.borderSubtle),
    good: get('--good', CHART_THEME_FALLBACK.good),
    warn: get('--warn', CHART_THEME_FALLBACK.warn),
    rare: get('--rare', CHART_THEME_FALLBACK.rare),
    error: get('--error', CHART_THEME_FALLBACK.error),
  };
}

// Reage à troca de tema/modo em tempo real: o app alterna `data-theme` e a classe `.dark`
// no `<html>` (mesmo padrão de `MutationObserver` usado em `DocumentPiP.tsx`).
function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readChartTheme);
  useEffect(() => {
    const update = () => setTheme(readChartTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

// Formata milissegundos em mm:ss.
function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// F3 — `ConfTag` e `AiPlaceholder` viviam aqui, e outras três telas tinham as suas próprias
// versões, com limiares e redações diferentes. Agora vêm de `components/Honestidade`.

// --- COMPONENT ---

/**
 * "há 21 dias" — a distância desde a última revisão FSRS.
 *
 * Responde a pergunta que o percentual levanta e não resolve: por que ESTA caiu tanto. O dado vem
 * de `last_review`, coluna que o banco sempre gravou e que o cliente descartava até pouco tempo.
 *
 * Devolve string vazia sem revisão — e não "nunca": os cartões nunca revisados já ficam FORA desta
 * lista por construção (sem revisão não há retenção calculável), então "nunca" aqui seria uma
 * contradição com o próprio critério de entrada.
 */
function desdeAUltimaRevisao(lastReview?: number): string {
  if (!lastReview) return '';
  const dias = Math.floor((Date.now() - lastReview) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

export default function Metrics({ recordings, onChangeView, ageProfile = 'pro' }: {
  recordings: Recording[];
  /** Navegação entre telas (ex.: abrir um exercício a partir de uma métrica). */
  onChangeView?: (view: string, data?: any) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
}) {
  const [mainTab, setMainTab] = useState<'dashboard' | 'lexical' | 'fluency'>('dashboard');
  const [expandedKpi, setExpandedKpi] = useState<KpiType>(null);
  // Revela as abas densas em Kids/Sênior. Uma vez aberto, fica: quem procurou já sabe onde está.
  const [showAllTabs, setShowAllTabs] = useState<boolean>(false);

  // Tokens do tema em vigor, para alimentar os gráficos Recharts (ver `useChartTheme` acima).
  const chartTheme = useChartTheme();
  const levelColors = useMemo(
    () => [chartTheme.accent, chartTheme.good, chartTheme.warn, chartTheme.rare, chartTheme.error, chartTheme.inkMuted],
    [chartTheme]
  );

  // Métricas REAIS computadas no backend (sem dados fabricados).
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  useEffect(() => {
    fetchMetrics().then(setMetrics).catch(() => setMetrics(null));
  }, [recordings]);

  // --- Dados derivados reais ---

  // A transformação da série semanal saiu daqui: mora dentro de `EvolucaoSemanal`. Cada uma das
  // três cópias do gráfico fazia a sua, e era exatamente aí que o formato da data divergia
  // ('02/ago' aqui, '02/08' nas outras duas).

  /* Distribuição por nível (CEFR) — ESTIMATIVA de baixa confiança.
     MEMOIZADO: sem isto, o `?? []` cria um array NOVO em cada render sempre que não há métricas, e
     o `useMemo` do `topLevel` logo abaixo recalculava a cada render por causa da identidade. */
  const levelDist = useMemo(() => metrics?.levelDistribution ?? [], [metrics]);
  const levelTotal = levelDist.reduce((sum, l) => sum + l.count, 0);
  const topLevel = useMemo(() => {
    if (!levelDist.length) return '—';
    return [...levelDist].sort((a, b) => b.count - a.count)[0].level;
  }, [levelDist]);

  const pieData = levelDist.map((l) => ({ name: l.level, value: l.count }));

  /* C1 — quando o nível não tem base, ele não ocupa posição de herói (ver a faixa abaixo dos KPIs).

     `levelTotal` NÃO serve para dizer "quantas foram classificadas": ele soma o balde 'N/D'
     junto, e o texto saía se contradizendo ("1901 classificadas de 1901 — a maior parte está
     fora da wordlist"). Classificada é a que tem nível CEFR de verdade. */
  const niveisComCefr = useMemo(
    () => levelDist.filter((l) => l.level !== 'N/D').reduce((n, l) => n + l.count, 0),
    [levelDist]
  );
  const niveisSemBase = !levelDist.length || ehBaixaConfianca(metrics?.levelConfidence ?? 0);

  // --- ANALISTA DE VOCABULÁRIO (painel compartilhado) ---
  // Fonte REAL da lista de vocábulos desta tela: o deck do backend (mesmo do Estudo/FSRS).
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  useEffect(() => {
    fetchDeck().then(setVocabCards).catch(() => setVocabCards([]));
  }, []);

  // Falas REAIS de todas as sessões — fonte do painel "Complexidade Estrutural & Tom" (abaixo).
  // Mesmo endpoint que a Auditoria de Idioma já usa (`fetchAllUtterances`, uma chamada só).
  const [allUtterances, setAllUtterances] = useState<UtteranceRow[]>([]);
  useEffect(() => {
    fetchAllUtterances().then(setAllUtterances).catch(() => setAllUtterances([]));
  }, []);

  // --- ANALISTA DE VOCABULÁRIO ---
  // C12 — mesma rotina da tela de Revisão, agora em `lib/useExameDePalavra`.
  // A votação do par de idiomas usa o baralho INTEIRO aqui (esta tela fala do acervo
  // todo), contra o recorte em estudo lá — a diferença virou parâmetro explícito em vez
  // de uma divergência silenciosa entre duas cópias.
  const exame = useExameDePalavra(vocabCards);
  const { langCfg, deckLangPair, cardFor, langPairOf } = exame;
  const selectedExamWord = exame.palavraExaminada;
  const setSelectedExamWord = exame.setPalavraExaminada;
  const examineWord = exame.examinar;
  const speakWord = exame.falar;
  const ttsSpeed = exame.velocidade;
  const setTtsSpeed = exame.setVelocidade;
  const [addedWords, setAddedWords] = useState<string[]>([]);

  const handleAddWordToDeck = async (w: VocabWord) => {
    setAddedWords((prev) => (prev.includes(w.word) ? prev : [...prev, w.word]));
    if (vocabCards.some((c) => c.word.toLowerCase() === w.word.toLowerCase())) return; // já no deck
    // Idiomas do cartão pelo produtor ÚNICO — vindos da frase de contexto, não do par do deck.
    // A rotina inteira (contexto, cloze, resolução e o aviso de recusa) é a MESMA do Estudo e vive
    // em `lib/adicionarAoDeck`; aqui só resta guardar o que entrou.
    const created = await ficharPalavraDoAnalista(w, langCfg);
    if (created.length) setVocabCards((prev) => [...prev, ...created]);
  };

  /** Já fichada? (deck do backend ou adicionada agora, nesta tela) */
  const isWordAdded = (w: VocabWord) =>
    addedWords.includes(w.word) ||
    vocabCards.some((c) => c.word.toLowerCase() === w.word.toLowerCase());

  /**
   * "Praticar esta palavra" a partir do Analista de Vocabulário das Métricas.
   *
   *  • `review` → só se revisa o que está no deck; então fichamos ANTES (reusando `handleAddWordToDeck`)
   *    e só então abrimos a revisão — "adicionar e torcer" vira "adicionar e revisar agora".
   *  • demais → semente com a palavra + idioma REAL e o Estudo abre o exercício direto nela.
   *
   * Idioma: o do CARTÃO real (`srcLang`), com o par predominante do deck como fallback. Vazio quando
   * genuinamente desconhecido — o exercício cai no idioma estudado configurado.
   */
  const handlePracticeWord = async (w: VocabWord, exercise: ExerciseId) => {
    if (!onChangeView) return;
    if (exercise === 'review' && !isWordAdded(w)) {
      await handleAddWordToDeck(w);
    }
    const card = cardFor(w.word);
    const lang = baseLang(langPairOf(card).src || deckLangPair.src || '');
    // Sessão de origem do cartão, quando o deck a registrou — mantém o exercício no contexto certo.
    const sessionId = card?.sourceSessionId;
    const seed: PracticeSeed = {
      ...seedFromSelection(w.word, lang, exercise, sessionId),
      word: w.word,
    };
    onChangeView(telaDoExercicio(exercise), { seed, id: sessionId });
  };

  /**
   * TERMOS COM BAIXA RETENÇÃO — dado REAL, FSRS puro (`retrievability`, `@core`), sem IA nenhuma.
   *
   * O painel "Requer Atenção" dizia que isto "requer análise por cartão com IA — em breve". Estava
   * simplesmente ERRADO: retenção por palavra é a mesma conta que `Analysis.tsx` já faz para o
   * Analista de Vocabulário (`retrievability(dias, estabilidade)`), e os dois insumos SEMPRE
   * estiveram no cartão. O que faltava era `lastReview` chegar do servidor até aqui — `rowToVocabCard`
   * (`data/api.ts`) o descartava, a mesma classe de bug já corrigida para `cefrLevel`/`cefrConfidence`.
   *
   * Um cartão só entra no ranqueamento se tiver estabilidade > 0 E uma última revisão registrada —
   * sem os dois, não existe retenção calculável, e mostrar 0%/100% seria inventar. `semEstabilidade`
   * e `semRevisao` contam, separadamente, os que ficaram de fora e por quê (a tela mostra os dois).
   */
  const lowRetentionAnalysis = useMemo(() => {
    const now = Date.now();
    const comRetencao: Array<{ card: VocabCard; retencaoPct: number }> = [];
    let semEstabilidade = 0;
    let semRevisao = 0;
    for (const c of vocabCards) {
      const estabilidade = Number(c.fsrsStability ?? c.stability ?? 0);
      const ultima = Number(c.lastReview ?? 0);
      if (!(estabilidade > 0)) { semEstabilidade++; continue; }
      if (!(ultima > 0)) { semRevisao++; continue; }
      const dias = Math.max(0, (now - ultima) / 86_400_000);
      comRetencao.push({ card: c, retencaoPct: Math.round(retrievability(dias, estabilidade) * 100) });
    }
    comRetencao.sort((a, b) => a.retencaoPct - b.retencaoPct);
    return {
      piores: comRetencao.slice(0, 8),
      totalCalculavel: comRetencao.length,
      semEstabilidade,
      semRevisao,
      totalDeck: vocabCards.length,
    };
  }, [vocabCards]);

  /**
   * CORPUS DE FALA REAL EM INGLÊS — insumo dos dois painéis de "Complexidade Estrutural" abaixo.
   *
   * `computeTextStats` e `detectarVozPassiva` (`@core`) são heurísticas AJUSTADAS PARA INGLÊS (a
   * contagem de sílabas, o Flesch Reading Ease e o padrão "be + particípio" — ver os comentários nos
   * próprios módulos). Por isso o corpus filtra só falas cujo `sourceLang` normaliza para 'en';
   * falas em outros idiomas ficam de fora e `emOutrosIdiomas` conta quantas, para a tela ser honesta
   * sobre a fatia do que foi de fato analisado.
   */
  const englishCorpus = useMemo(() => {
    const comTexto = allUtterances.filter((u) => (u.sourceText ?? '').trim().length > 0);
    const emIngles = comTexto.filter((u) => baseLang(u.sourceLang ?? '') === 'en');
    return {
      texto: emIngles.map((u) => u.sourceText).join('. '),
      emIngles: emIngles.length,
      emOutrosIdiomas: comTexto.length - emIngles.length,
      totalFalas: comTexto.length,
    };
  }, [allUtterances]);

  const textStats = useMemo(() => computeTextStats(englishCorpus.texto), [englishCorpus.texto]);
  const vozPassiva = useMemo(() => detectarVozPassiva(englishCorpus.texto), [englishCorpus.texto]);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full min-h-0 bg-surface">
    <div className="flex-1 min-w-0 flex flex-col h-full bg-surface overflow-y-auto relative custom-scrollbar">

      {/* KPI DEEP DIVE MODAL */}
      <MetricsExpandedKpi kpi={expandedKpi} onClose={() => setExpandedKpi(null)} metrics={metrics} />

      {/* Main Header */}
      <EditablePanel
        viewKey="metrics"
        panelKey="header"
        title="Cabeçalho Métricas"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
        <div className="px-6 md:px-10 pt-8 pb-4 bg-canvas shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mb-2 flex items-center gap-2">
                {ageProfile === 'kids' ? (
                  <>
                    <Sprout className="w-7 h-7 text-good inline" />
                    <span>Jardim de Palavras &amp; Recompensas</span>
                  </>
                ) : ageProfile === 'senior' ? (
                  <>
                    <Eye className="w-7 h-7 text-accent inline" />
                    <span>Seu Caderno de Palavras &amp; Frases</span>
                  </>
                ) : (
                  <span>Analytics &amp; Inteligência Lexical</span>
                )}
              </h1>
              <p className="text-xs md:text-sm text-ink-muted max-w-2xl">
                {ageProfile === 'kids' ? (
                  <span className="flex items-center gap-1 flex-wrap">
                    <span>Suas palavras salvas prontas para regar! Revise suas cartas para ganhar Seeds</span>
                    <Sprout className="w-3.5 h-3.5 text-good inline" />
                    <span>e subir de nível.</span>
                  </span>
                ) : ageProfile === 'senior' ? (
                  'Veja todas as palavras salvas das suas gravações com botão de pronúncia em áudio e explicações fáceis.'
                ) : (
                  'Acompanhe sua evolução com base nos dados reais das suas sessões e revisões. Métricas estimadas vêm sempre com o nível de confiança correspondente.'
                )}
              </p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-surface border border-border-subtle rounded-lg text-xs md:text-sm font-bold text-ink hover:bg-surface-hover hover:border-ink transition-colors shadow-sm cursor-pointer">
              <Download className="w-4 h-4" /> {ageProfile === 'kids' ? 'Baixar Palavras' : ageProfile === 'senior' ? 'Exportar Meu Caderno' : 'Exportar Relatório'}
            </button>
          </div>

          {/* Abas — em Kids/Sênior as duas mais densas ficam atrás de "Mais". Elas continuam
              existindo e a UM clique; o que muda é não abrirem três frentes de análise de uma vez
              para quem só quer ver as próprias palavras. */}
          {/* "Mais" NÃO é uma aba: ele não tem painel, ele revela as outras duas. Passá-lo por
              `Abas` o faria anunciar-se como aba selecionável para quem usa leitor de tela, e as
              setas do teclado parariam nele à toa. Fica ao lado, como o botão que sempre foi. */}
          <div className="flex gap-2 border-b border-border-subtle mt-4">
            <Abas
              rotuloDoGrupo="Seções do vocabulário"
              ativo={mainTab}
              aoTrocar={(id) => setMainTab(id as typeof mainTab)}
              className="border-b-0"
              itens={[
                { id: 'dashboard', rotulo: t('metricsTab.dashboard', ageProfile), icone: <LayoutGrid className="w-4 h-4" /> },
                ...((!coreOnly(ageProfile) || showAllTabs || mainTab !== 'dashboard')
                  ? [
                    { id: 'lexical', rotulo: t('metricsTab.lexical', ageProfile), icone: <Brain className="w-4 h-4" /> },
                    { id: 'fluency', rotulo: t('metricsTab.fluency', ageProfile), icone: <Mic className="w-4 h-4" /> },
                  ]
                  : []),
              ]}
            />
            {coreOnly(ageProfile) && !showAllTabs && mainTab === 'dashboard' && (
              <button
                onClick={() => setShowAllTabs(true)}
                className="pb-3 px-4 text-[13px] font-bold border-b-2 border-transparent text-ink-muted hover:text-ink transition-colors flex items-center gap-2 cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" /> Mais
              </button>
            )}
          </div>
        </div>
      </EditablePanel>

      {/* Main Content Area */}
      <div className="flex-1 p-6 md:p-10 bg-surface min-h-full">

        {/* --- DASHBOARD TAB --- */}
        <PainelDeAba id="dashboard" ativo={mainTab} className="animate-in fade-in space-y-8 max-w-7xl mx-auto">
            {/* Top Level KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                className="card-panel p-6 relative overflow-hidden cursor-pointer hover:shadow-md transition-all group"
                onClick={() => setExpandedKpi('volume')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedKpi('volume'); } }}
                role="button"
                tabIndex={0}
                aria-label="Abrir o detalhamento do volume lexical"
              >
                <div className="flex items-center gap-2 mb-3 text-ink-muted group-hover:text-ink transition-colors">
                  <BookOpen className="w-4 h-4 text-accent" />
                  <span className="text-[11px] font-bold uppercase tracking-wider font-mono">{t('metric.deckSize', ageProfile)}</span>
                </div>
                <div className="font-display font-black text-4xl tracking-tight text-ink mb-1">{(metrics?.deckSize ?? 0).toLocaleString('pt-BR')}</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[12px] text-ink-muted font-bold">
                    {metrics?.newCards ?? 0} novos • {metrics?.dueToday ?? 0} p/ revisar
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div
                className="card-panel p-6 relative overflow-hidden cursor-pointer hover:shadow-md transition-all group"
                onClick={() => setExpandedKpi('retention')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedKpi('retention'); } }}
                role="button"
                tabIndex={0}
                aria-label="Abrir o detalhamento da taxa de retenção"
              >
                <div className="flex items-center gap-2 mb-3 text-ink-muted group-hover:text-ink transition-colors">
                  <Activity className="w-4 h-4 text-good" />
                  <span className="text-[11px] font-bold uppercase tracking-wider font-mono">{t('metric.retention', ageProfile)}</span>
                </div>
                <div className="font-display font-black text-4xl tracking-tight text-ink mb-1">{metrics && metrics.avgRetentionConfidence > 0 ? Math.round(metrics.avgRetention * 100) + '%' : '—'}</div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[12px] text-ink-muted font-bold">
                    {metrics && metrics.avgRetentionConfidence > 0
                      ? <Confianca valor={metrics.avgRetentionConfidence} estimativa />
                      : 'sem revisões ainda'}
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div
                className="card-panel p-6 relative overflow-hidden cursor-pointer hover:shadow-md transition-all group"
                onClick={() => setExpandedKpi('time')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedKpi('time'); } }}
                role="button"
                tabIndex={0}
                aria-label="Abrir o detalhamento das revisões feitas"
              >
                <div className="flex items-center gap-2 mb-3 text-ink-muted group-hover:text-ink transition-colors">
                  <Clock className="w-4 h-4 text-rare" />
                  <span className="text-[11px] font-bold uppercase tracking-wider font-mono">{t('metric.reviews', ageProfile)}</span>
                </div>
                <div className="font-display font-black text-4xl tracking-tight text-ink mb-1">{metrics?.reviews ?? 0}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-[12px] text-ink-muted">{metrics?.sessions ?? 0} sessões • {metrics?.streakDays ?? 0} dias seguidos</div>
                  <ArrowUpRight className="w-4 h-4 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* C1 — "NÍVEL PREDOMINANTE" SAIU DA FAIXA DE HERÓI.
                  Exibia "N/D" com o selo "estimativa · confiança 12%" ocupando um quarto da faixa
                  mais nobre da tela. A honestidade estava impecável — o produto sabe que não sabe,
                  e diz — mas a POSIÇÃO estava errada: 88% do acervo está fora da wordlist CEFR, ou
                  seja, não há base para um nível único, e um dado que não existe não disputa
                  espaço com os que existem. Ele continua na tela, logo abaixo, com o motivo.
                  Mesmo tratamento dado ao "Tom Vocal" na aba da Sessão. */}
            </div>

            {niveisSemBase && (
              <SemDado
                compacto
                className="mb-6"
                motivo={`Nível predominante: só ${niveisComCefr} de ${metrics?.deckSize ?? 0} palavras têm nível CEFR conhecido — o resto está fora da wordlist, e nível fora dela não é estimado. Sem essa base, um nível único do acervo não significaria nada.`}
              />
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Evolução do vocabulário — componente ÚNICO (era renderizado por três
                  implementações diferentes, que divergiram em margem, eixo, formato de data e
                  rodapé). A transformação da série mora dentro do componente. */}
              <div className="lg:col-span-2">
                <EvolucaoSemanal
                  serie={metrics?.vocabByWeek}
                  titulo="Evolução do Vocabulário"
                  altura={280}
                />
              </div>

              {/* Attention Required — retenção REAL por cartão (FSRS puro, `retrievability` de `@core`) */}
              <div className="card-panel p-6 h-[380px] flex flex-col">
                <div className="flex justify-between items-center mb-4 shrink-0">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-warn" /> Requer Atenção
                  </h3>
                </div>
                {lowRetentionAnalysis.totalCalculavel > 0 ? (
                  <>
                    {/* F8 — A BASE SOBE PARA JUNTO DO TÍTULO.
                        Ela existia, mas como nota de rodapé em cinza de 10,5px no fim do card —
                        e, no inventário, estava parcialmente COBERTA pelo balão do iChat. O
                        usuário lia quatro termos "que precisam de atenção" sem saber que 92% do
                        acervo não entrou na conta. A ressalva não mudou de texto; mudou de lugar. */}
                    <p className="text-[12px] text-ink-muted mb-1 shrink-0">
                      Termos com menor retenção prevista agora (FSRS).
                    </p>
                    <p className="text-[11.5px] text-ink-faint mb-3 shrink-0">
                      Calculado sobre <strong className="text-ink-muted">{lowRetentionAnalysis.totalCalculavel}</strong> de{' '}
                      <strong className="text-ink-muted">{lowRetentionAnalysis.totalDeck}</strong> cartões.
                    </p>
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                      {lowRetentionAnalysis.piores.map(({ card, retencaoPct }) => (
                        <button
                          key={card.id}
                          onClick={() => void examineWord(card.word, card.sentence)}
                          className="w-full text-left p-2.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-hover transition-colors cursor-pointer flex items-center justify-between gap-3"
                          title="Analisar termo no Analista de Vocabulário"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold text-[13px] text-ink truncate">{card.word}</span>
                            {card.translation && (
                              <span className="block text-[11px] text-ink-muted truncate">{card.translation}</span>
                            )}
                          </span>

                          {/* A BARRA, e por que ela vale a pena ao lado de um número já escrito.
                              "18%" e "34%" são dois números que exigem ser comparados de cabeça,
                              linha a linha. A barra torna a ordem — e a distância entre a pior e a
                              menos pior — legível de relance, que é para isso que a lista existe.
                              O número fica: é ele que permite conferir, e a barra sozinha não diz
                              quanto. */}
                          <span className="shrink-0 flex items-center gap-2.5">
                            <Barra
                              pct={retencaoPct}
                              tom={retencaoPct < 50 ? 'error' : 'warn'}
                              tamanho="fina"
                              rotuloAcessivel={`Chance de lembrar ${card.word} agora`}
                              className="w-16 sm:w-24"
                            />
                            {/* C9 — `-ink` e não a cor cheia: `--error`/`--warn` são de
                                PREENCHIMENTO e como texto sobre o card davam 2,54:1. */}
                            <span className={`text-[12px] font-bold font-mono w-9 text-right ${retencaoPct < 50 ? 'text-error-ink' : 'text-warn-ink'}`}>
                              {retencaoPct}%
                            </span>
                            {/* "há 21 dias" responde a pergunta seguinte — por que esta caiu tanto
                                — e vem de `lastReview`, que o banco sempre gravou. Só aparece
                                quando existe: um traço em branco não informa nada. */}
                            <span className="hidden md:block text-[11px] text-ink-faint font-mono w-20 text-right">
                              {desdeAUltimaRevisao(card.lastReview)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* F8 — A PONTE QUE FALTAVA.
                        Esta tela identificava os termos em risco e não oferecia caminho nenhum
                        para agir sobre eles: o único botão da página era "Exportar Relatório".
                        Informar sem conduzir é o que fazia dela um beco — não estava escondida
                        (1 clique do menu), estava sem saída. */}
                    <button
                      onClick={() => onChangeView?.('study')}
                      className="btn-solid w-full mt-3 shrink-0"
                    >
                      <Target className="w-4 h-4" aria-hidden />
                      Revisar {lowRetentionAnalysis.piores.length} agora
                    </button>

                    {(lowRetentionAnalysis.semRevisao > 0 || lowRetentionAnalysis.semEstabilidade > 0) && (
                      <p className="text-[10.5px] text-ink-muted mt-3 pt-3 border-t border-border-subtle shrink-0">
                        {lowRetentionAnalysis.semRevisao + lowRetentionAnalysis.semEstabilidade} de {lowRetentionAnalysis.totalDeck} cartões ficaram FORA do cálculo — sem revisão FSRS, retenção não existe:{' '}
                        {lowRetentionAnalysis.semRevisao} nunca revisados, {lowRetentionAnalysis.semEstabilidade} sem estabilidade FSRS ainda.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <SemDado
                      compacto
                      motivo={lowRetentionAnalysis.totalDeck === 0
                        ? 'Seu deck ainda está vazio — sem cartões, não há retenção para ranquear.'
                        : `Nenhum dos ${lowRetentionAnalysis.totalDeck} cartões tem retenção calculável ainda: ${lowRetentionAnalysis.semRevisao} nunca foram revisados e ${lowRetentionAnalysis.semEstabilidade} não têm estabilidade FSRS. Revise alguns cartões no Estudo para começar a ver este ranqueamento.`}
                    />
                  </div>
                )}
              </div>
            </div>
        </PainelDeAba>

        {/* --- LEXICAL INTELLIGENCE TAB --- */}
        <PainelDeAba id="lexical" ativo={mainTab} className="animate-in fade-in space-y-6 max-w-7xl mx-auto">

            {/* Resumo lexical real */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card-panel p-6">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">Palavras Distintas</div>
                <div className="font-display font-black text-3xl text-ink">{(metrics?.uniqueWords ?? 0).toLocaleString('pt-BR')}</div>
              </div>
              <div className="card-panel p-6">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">Cartões no Deck</div>
                <div className="font-display font-black text-3xl text-ink">{(metrics?.deckSize ?? 0).toLocaleString('pt-BR')}</div>
              </div>
              <div className="card-panel p-6">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">Palavras Capturadas</div>
                <div className="font-display font-black text-3xl text-ink">{(metrics?.wordsCaptured ?? 0).toLocaleString('pt-BR')}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Level Distribution — ESTIMATIVA */}
              <div className="card-panel p-6">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-rare" /> Distribuição por Nível (CEFR)
                  </h3>
                  {levelDist.length > 0 && <Confianca valor={metrics?.levelConfidence ?? 0} estimativa />}
                </div>
                <p className="text-[12px] text-ink-muted mb-6">Estimativa aproximada de nível — não represente como classificação exata.</p>

                {levelDist.length > 0 ? (
                  <>
                    <div className="w-full" style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={levelColors[i % levelColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: chartTheme.surface, border: `1px solid ${chartTheme.borderSubtle}`, borderRadius: '8px', color: chartTheme.ink }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {levelDist.map((l, i) => (
                        <div key={l.level} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2 text-ink font-medium">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: levelColors[i % levelColors.length] }}></span>
                            {l.level}
                          </span>
                          <span className="text-ink-muted font-bold">
                            {l.count} {levelTotal > 0 ? `• ${Math.round((l.count / levelTotal) * 100)}%` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <SemDado compacto motivo={`Sem dados suficientes para estimar a distribuição de níveis.`} />
                )}
              </div>

              {/* Per-word deep dive — lista REAL do deck; o clique abre o Analista de Vocabulário */}
              <div className="card-panel p-6 flex flex-col">
                <h3 className="font-display font-extrabold text-[16px] text-ink mb-1 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-accent" /> Análise Lexical por Palavra
                </h3>
                <p className="text-[12px] text-ink-muted mb-4">
                  Busque, filtre por nível e origem, ordene. Clique num termo para abrir o Analista de Vocabulário.
                </p>
                {/* F5: a lista antiga era `vocabCards.map()` sobre os 2.116 cartões medidos, num
                    scroller de 320px — sem busca, filtro, ordenação, paginação, loading nem erro.
                    O catálogo resolve tudo isso no servidor e virtualiza a lista. */}
                <CatalogoDePalavras aoAbrirPalavra={(id) => {
                  const c = vocabCards.find((x) => x.id === id)
                  if (c) void examineWord(c.word, c.sentence)
                }} />
              </div>
            </div>
        </PainelDeAba>

        {/* --- FLUENCY TAB --- */}
        <PainelDeAba id="fluency" ativo={mainTab} className="animate-in fade-in space-y-6 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Acoustic competences radar — requer IA */}
              <div className="card-panel p-6 flex flex-col h-[400px]">
                <h3 className="font-display font-extrabold text-[16px] text-ink mb-2">Radar de Competências Acústicas</h3>
                <p className="text-[12px] text-ink-muted mb-4">Avaliação multidimensional da fala espontânea.</p>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  {/* Sem "em breve": não há nada a caminho. Um radar por dimensão exigiria uma
                      avaliação por modelo de linguagem A CADA abertura de tela — custo por token e
                      envio do seu texto para fora, que o perfil Privado/Local proíbe. É uma feature
                      com preço e consentimento a decidir, não uma data. */}
                  <SemDado compacto motivo={`Avaliar fluência, gramática e pronúncia por dimensão exigiria um modelo de linguagem, que este painel não chama.`} />
                </div>
              </div>

              <div className="space-y-6">
                {/* Speech Pace (WPM) — dado real */}
                <div className="card-panel p-6">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-accent" /> Ritmo de Fala (WPM)
                  </h3>
                  {metrics && metrics.wpm > 0 ? (
                    <>
                      <div className="flex items-end gap-4 mb-3 flex-wrap">
                        <div className="text-5xl font-black font-display text-ink">{Math.round(metrics.wpm)}</div>
                        <div className="text-[13px] text-ink-muted font-medium mb-1">Palavras por Minuto</div>
                        <div className="mb-2"><Confianca valor={metrics.wpmConfidence} /></div>
                      </div>
                      <div className="relative h-2 bg-surface rounded-full border border-border-subtle overflow-hidden mb-2">
                        {/* Zonas: Lento (0-110), Bom (110-150), Acelerado (150+) */}
                        <div className="absolute top-0 left-0 h-full w-[30%] bg-rare/20"></div>
                        <div className="absolute top-0 left-[30%] h-full w-[40%] bg-good/20"></div>
                        <div className="absolute top-0 left-[70%] h-full w-[30%] bg-warn/20"></div>
                        {/* Indicador atual: mapeia 0..200 WPM em 0..100% (limitado). */}
                        <div
                          /* O brilho era `rgba(255,255,255,0.5)` fixo — branco sobre fundo claro
                             é invisível, então o marcador não brilhava em nenhum tema claro.
                             `color-mix` sobre o token acompanha os dois modos. */
                          className="absolute top-0 h-full w-2 bg-ink shadow-[0_0_8px_color-mix(in_srgb,var(--ink)_50%,transparent)] rounded-full z-10 transition-all duration-1000"
                          style={{ left: `${Math.min(100, Math.max(0, (metrics.wpm / 200) * 100))}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                        <span>Lento</span>
                        <span className="text-good-ink">Nativo / Fluído</span>
                        <span>Acelerado</span>
                      </div>
                    </>
                  ) : (
                    <SemDado compacto motivo={`Sem dados suficientes. Grave algumas sessões de fala para calcular seu ritmo.`} />
                  )}
                </div>

                {/* Speaking Time — dado real */}
                <div className="card-panel p-6">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-rare" /> Tempo Total de Fala
                  </h3>
                  {metrics && metrics.speakingMs > 0 ? (
                    <div className="flex items-end gap-4 flex-wrap">
                      <div className="text-5xl font-black font-display text-ink">{formatMs(metrics.speakingMs)}</div>
                      <div className="text-[13px] text-ink-muted font-medium mb-1">min : seg • {recordings.length} capturas</div>
                    </div>
                  ) : (
                    <SemDado compacto motivo={`Sem dados suficientes de fala capturada ainda.`} />
                  )}
                </div>
              </div>
            </div>

            {/*
              Complexidade Estrutural & Tom. Antes era UM aviso culpando "IA generativa" por três
              coisas — só o TOM depende disso. Complexidade gramatical (`computeTextStats`) e voz
              passiva (`detectarVozPassiva`) são determinísticas, sem IA, e vêm de baixo. As duas são
              heurísticas AJUSTADAS PARA INGLÊS (ver os módulos em `@core`), por isso só falas cujo
              `sourceLang` normaliza para 'en' entram no corpus — a tela diz quantas ficaram fora.
            */}
            <div className="card-panel p-6 space-y-6">
              <div>
                <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-1">
                  <BarChart2 className="w-5 h-5 text-accent" /> Complexidade Gramatical
                </h3>
                <p className="text-[11.5px] text-ink-muted mb-4">
                  Estatísticas determinísticas do texto (sem IA) — heurística ajustada para INGLÊS
                  (sílabas e Flesch Reading Ease não valem para outros idiomas).
                  {englishCorpus.totalFalas > 0 && (
                    <> {englishCorpus.emIngles} de {englishCorpus.totalFalas} falas capturadas são em inglês
                    {englishCorpus.emOutrosIdiomas > 0 && ` (${englishCorpus.emOutrosIdiomas} em outros idiomas ficaram fora)`}.</>
                  )}
                </p>
                {textStats.wordCount > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Palavras/Frase</div>
                      <div className="font-display font-black text-xl text-ink">{textStats.avgSentenceLength}</div>
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Flesch Reading Ease</div>
                      <div className="font-display font-black text-xl text-ink">{textStats.readingEase != null ? textStats.readingEase : '—'}</div>
                      {textStats.readingEase == null && <div className="text-[10px] text-ink-muted mt-0.5">precisa de 10+ palavras</div>}
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Densidade Lexical</div>
                      <div className="font-display font-black text-xl text-ink">{textStats.lexicalDensityPct}%</div>
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Riqueza Lexical (TTR)</div>
                      <div className="font-display font-black text-xl text-ink">{Math.round(textStats.typeTokenRatio * 100)}/100</div>
                    </div>
                  </div>
                ) : (
                  <SemDado compacto motivo={`{englishCorpus.totalFalas === 0
                      ? 'Nenhuma fala capturada ainda — grave ou importe uma sessão para medir complexidade.'
                      : 'Nenhuma das falas capturadas está em inglês — a heurística de complexidade só vale para inglês.'}`} />
                )}
              </div>

              <div className="pt-6 border-t border-border-subtle">
                <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-1">
                  <MessageSquareWarning className="w-5 h-5 text-warn" /> Uso de Voz Passiva
                </h3>
                <p className="text-[11.5px] text-ink-muted mb-4">
                  Detecção por padrão "be + particípio" (inglês), sem IA. É HEURÍSTICA, não um parser
                  gramatical: perde particípios irregulares fora da lista curada e pode confundir um
                  punhado de adjetivos em "-ed" com voz passiva — os números são um indício, não um veredito.
                </p>
                {textStats.wordCount > 0 ? (
                  <>
                    <div className="flex items-end gap-4 flex-wrap mb-3">
                      <div className="font-display font-black text-3xl text-ink">{vozPassiva.ocorrencias}</div>
                      <div className="text-[12px] text-ink-muted font-medium mb-1">
                        ocorrências • {vozPassiva.por100Palavras} a cada 100 palavras
                      </div>
                    </div>
                    {vozPassiva.exemplos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {vozPassiva.exemplos.map((ex, i) => (
                          <span key={i} className="text-[11px] font-mono px-2 py-1 rounded bg-warn-soft text-warn-ink">{ex}</span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-ink-muted">Sem texto em inglês suficiente para detectar.</p>
                )}
              </div>

              <div className="pt-6 border-t border-border-subtle">
                <h3 className="font-display font-extrabold text-[16px] text-ink mb-2">Tom da Fala</h3>
                <SemDado compacto motivo={`Classificar tom (confiante/analítico/hesitante) exige análise acústica e prosódica do
                  áudio — o app transcreve, mas não mede pitch nem entonação. Nada foi estimado.`} />
              </div>
            </div>
        </PainelDeAba>
      </div>
    </div>

      {/* Analista de Vocabulário — coluna à direita; só monta quando há palavra selecionada. */}
      <VocabularyPanel
        viewKey="metrics"
        word={selectedExamWord}
        onClose={() => setSelectedExamWord(null)}
        onSpeak={speakWord}
        onAddToDeck={handleAddWordToDeck}
        isAdded={!!selectedExamWord && isWordAdded(selectedExamWord)}
        ttsSpeed={ttsSpeed}
        setTtsSpeed={setTtsSpeed}
        // Sem navegação → sem botões de praticar (nada de botão morto).
        onPractice={onChangeView ? handlePracticeWord : undefined}
      />
    </div>
  );
}
