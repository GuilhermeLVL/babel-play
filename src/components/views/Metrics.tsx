import { computeTextStats, detectarVozPassiva, estimativaDeMinutos, retrievability, rotuloDeDuracao } from '@core';
import {
  Activity,
  AlertCircle,
  BarChart2,
  BookOpen,
  Brain,
  Clock,
  Download,
  Eye,
  LayoutGrid,
  MessageSquareWarning,
  Mic,
  MoreHorizontal,
  PartyPopper,
  PieChart as PieChartIcon,
  Plus,
  Sprout,
  Target,
  Upload,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import {
  type AppMetrics,
  fetchAllUtterances,
  fetchDeck,
  fetchExerciseResults,
  fetchMetrics,
  type UtteranceRow,
} from '../../data/api';
import { ficharPalavraDoAnalista } from '../../lib/adicionarAoDeck';
import { numero } from '../../lib/i18n';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { copyDoPerfil, coreOnly } from '../../lib/profile';
import type { ExerciseId, PracticeSeed } from '../../lib/sentences';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { Recording, VocabCard, VocabWord } from '../../types';
import { Confianca, ehBaixaConfianca, SemDado } from '../Honestidade';
import EvolucaoSemanal from '../metrics/EvolucaoSemanal';
import { Abas, Barra, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import VocabularyPanel from '../VocabularyPanel';
import BaralhoAnki from './BaralhoAnki';
import MetricsExpandedKpi, { KpiType } from './MetricsExpandedKpi';
import AdicionarPalavra from './vocab/AdicionarPalavra';
import CatalogoDePalavras from './vocab/CatalogoDePalavras';
import ExportarVocabulario from './vocab/ExportarVocabulario';

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

export default function Metrics({
  recordings,
  onChangeView,
  ageProfile = 'pro',
  metrics: metricsDoApp,
}: {
  recordings: Recording[];
  /** Navegação entre telas (ex.: abrir um exercício a partir de uma métrica). */
  onChangeView?: (view: string, data?: any) => void;
  ageProfile?: 'kids' | 'pro' | 'senior';
  /**
   * O PERFIL JÁ CARREGADO PELO APP.
   *
   * Esta tela chamava `fetchMetrics()` por conta própria, e o `App` já tinha chamado: duas
   * execuções de `computeProfile` — 100 ms cada, 11 consultas cada, carregando todas as falas,
   * cartões, revisões e resultados do usuário para agregar em JS — na mesma abertura de tela
   * (auditoria de 2026-09-07, achado A37). Receber por prop é a correção que o próprio arquivo já
   * documentava ter feito com o `StudioHeader`, e que ficou pela metade.
   */
  metrics?: AppMetrics | null;
}) {
  /* 'palavras' É A ABA DE ENTRADA (referência de design): a tela chamada Vocabulário abria num
     painel de analytics — retenção, WPM, CEFR, complexidade — e o acervo, que é o que o nome
     promete, ficava enterrado lá embaixo. A análise inteira continua existindo, uma aba ao lado. */
  const [mainTab, setMainTab] = useState<'palavras' | 'dashboard' | 'lexical' | 'fluency'>('palavras');
  const [expandedKpi, setExpandedKpi] = useState<KpiType>(null);
  // Revela as abas densas em Kids/Sênior. Uma vez aberto, fica: quem procurou já sabe onde está.
  const [showAllTabs, setShowAllTabs] = useState<boolean>(false);

  // Tokens do tema em vigor, para alimentar os gráficos Recharts (ver `useChartTheme` acima).
  const chartTheme = useChartTheme();
  const levelColors = useMemo(
    () => [chartTheme.accent, chartTheme.good, chartTheme.warn, chartTheme.rare, chartTheme.error, chartTheme.inkMuted],
    [chartTheme],
  );

  /* Métricas REAIS computadas no backend (sem dados fabricados) — vindas do App, que já as
     carregou. O fallback local existe para o caso de a tela ser montada sem a prop (teste, ou uma
     rota futura): melhor uma segunda chamada que uma tela vazia. */
  const [metricsLocais, setMetricsLocais] = useState<AppMetrics | null>(null);
  useEffect(() => {
    if (metricsDoApp !== undefined) return;
    fetchMetrics()
      .then(setMetricsLocais)
      .catch(() => setMetricsLocais(null));
  }, [recordings, metricsDoApp]);
  const metrics = metricsDoApp !== undefined ? metricsDoApp : metricsLocais;

  // --- Dados derivados reais ---

  // A transformação da série semanal saiu daqui: mora dentro de `EvolucaoSemanal`. Cada uma das
  // três cópias do gráfico fazia a sua, e era exatamente aí que o formato da data divergia
  // ('02/ago' aqui, '02/08' nas outras duas).

  /* Distribuição por nível (CEFR) — ESTIMATIVA de baixa confiança.
     MEMOIZADO: sem isto, o `?? []` cria um array NOVO em cada render sempre que não há métricas, e
     o `useMemo` do `topLevel` logo abaixo recalculava a cada render por causa da identidade. */
  const levelDist = useMemo(() => metrics?.levelDistribution ?? [], [metrics]);
  const levelTotal = levelDist.reduce((sum, l) => sum + l.count, 0);
  const pieData = levelDist.map((l) => ({ name: l.level, value: l.count }));

  /* C1 — quando o nível não tem base, ele não ocupa posição de herói (ver a faixa abaixo dos KPIs).

     `levelTotal` NÃO serve para dizer "quantas foram classificadas": ele soma o balde 'N/D'
     junto, e o texto saía se contradizendo ("1901 classificadas de 1901, a maior parte está
     fora da wordlist"). Classificada é a que tem nível CEFR de verdade. */
  const niveisComCefr = useMemo(
    () => levelDist.filter((l) => l.level !== 'N/D').reduce((n, l) => n + l.count, 0),
    [levelDist],
  );
  const niveisSemBase = !levelDist.length || ehBaixaConfianca(metrics?.levelConfidence ?? 0);
  /** Há distribuição para desenhar? Só "N/D" é ausência de dado, não uma fatia. */
  const temNivelReal = niveisComCefr > 0;

  // --- ANALISTA DE VOCABULÁRIO (painel compartilhado) ---
  // Fonte REAL da lista de vocábulos desta tela: o deck do backend (mesmo do Estudo/FSRS).
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => setVocabCards([]));
  }, []);

  // Falas REAIS de todas as sessões — fonte do painel "Complexidade Estrutural & Tom" (abaixo).
  // Mesmo endpoint que a Auditoria de Idioma já usa (`fetchAllUtterances`, uma chamada só).
  const [allUtterances, setAllUtterances] = useState<UtteranceRow[]>([]);
  useEffect(() => {
    fetchAllUtterances()
      .then(setAllUtterances)
      .catch(() => setAllUtterances([]));
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
  /* Cartão sem verso não é detalhe: é o acervo inteiro perdendo serventia. Acontece quando os
     dois idiomas configurados são o mesmo — o app avisa em Ajustes e mesmo assim ficha. Contamos
     aqui para a tela poder dizer, e apontar onde se conserta a causa. */
  const minutosDoIdioma = Math.round(((metrics?.listeningMs ?? 0) + (metrics?.speakingMs ?? 0)) / 60000);
  const semVerso = useMemo(() => vocabCards.filter((c) => !(c.translation ?? '').trim()).length, [vocabCards]);
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
    addedWords.includes(w.word) || vocabCards.some((c) => c.word.toLowerCase() === w.word.toLowerCase());

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
      /* A ORDEM decide o balde, e a antiga mentia: cartão NOVO (sem revisão E sem estabilidade)
         caía em "sem estabilidade", forçando a frase "0 nunca foram revisados" num deck de 201
         novos — visto em produção em 31/08. "Nunca revisado" é a causa raiz e vem primeiro;
         "sem estabilidade" fica para o caso raro de cartão revisado sem FSRS (legado Leitner). */
      if (!(ultima > 0)) {
        semRevisao++;
        continue;
      }
      if (!(estabilidade > 0)) {
        semEstabilidade++;
        continue;
      }
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
   * CORPUS DE FALA NO IDIOMA QUE A PESSOA ESTUDA — insumo dos dois paineis de "Complexidade
   * Estrutural" abaixo.
   *
   * O corpus era filtrado por `sourceLang === 'en'`, cravado. Quem estuda japones via os dois
   * paineis vazios com a explicacao "nenhuma das falas esta em ingles" — verdadeira e inutil, e a
   * pergunta que ela nao respondia e "entao o que voce mede para mim?" (auditoria de 2026-09-07,
   * achado A39). Agora o corpus segue o idioma-alvo, e sao as REGUAS que declaram o que sabem
   * medir: `computeTextStats` devolve `null` no que nao vale para o idioma, `detectarVozPassiva`
   * devolve `null` inteiro quando nao ha regua. Sem regua a tela diz isso, com o nome do idioma.
   */
  /* `langCfg` ja vem de `useExameDePalavra` (mesmo leitor unico de idioma) — nao ha segunda
     assinatura aqui, so o uso do que a tela ja tinha em maos. */
  const idiomaEstudado = baseLang(langCfg.studying);
  const corpusDoAlvo = useMemo(() => {
    const comTexto = allUtterances.filter((u) => (u.sourceText ?? '').trim().length > 0);
    const noAlvo = comTexto.filter((u) => baseLang(u.sourceLang ?? '') === idiomaEstudado);
    return {
      texto: noAlvo.map((u) => u.sourceText).join('. '),
      noAlvo: noAlvo.length,
      emOutrosIdiomas: comTexto.length - noAlvo.length,
      totalFalas: comTexto.length,
    };
  }, [allUtterances, idiomaEstudado]);

  const textStats = useMemo(
    () => computeTextStats(corpusDoAlvo.texto, idiomaEstudado),
    [corpusDoAlvo.texto, idiomaEstudado],
  );
  const vozPassiva = useMemo(
    () => detectarVozPassiva(corpusDoAlvo.texto, idiomaEstudado),
    [corpusDoAlvo.texto, idiomaEstudado],
  );
  const nomeDoIdiomaEstudado = langLabelNaUI(idiomaEstudado);

  /**
   * AS QUATRO CONTAGENS DO ACERVO — derivadas do `fsrsState` REAL de cada cartão, não de uma
   * tabela à parte. "Guardadas" é o total; as outras três são as fases do FSRS que o baralho
   * já carrega (`Relearning` entra em "Revisão": para quem olha, é material que volta).
   */
  const fasesDoBaralho = useMemo(() => {
    let novas = 0;
    let aprendendo = 0;
    let revisao = 0;
    for (const c of vocabCards) {
      if (c.fsrsState === 'New') novas++;
      else if (c.fsrsState === 'Learning') aprendendo++;
      else revisao++; // Review + Relearning
    }
    return { total: vocabCards.length, novas, aprendendo, revisao };
  }, [vocabCards]);

  /**
   * Tempos JÁ MEDIDOS por item — só para o card de revisão poder dizer quanto leva. Mesma fonte e
   * mesma regra do Início (`estimativaDeMinutos` cala com poucas amostras e a linha vira "rodada
   * curta"): o número ou é medido, ou não é dito.
   */
  const [temposMedidos, setTemposMedidos] = useState<number[]>([]);
  useEffect(() => {
    let vivo = true;
    fetchExerciseResults()
      .then((linhas) => {
        if (vivo) setTemposMedidos(linhas.map((l) => l.ms).filter((ms): ms is number => typeof ms === 'number'));
      })
      .catch(() => {
        /* sem medição: o rótulo cai para "rodada curta" */
      });
    return () => {
      vivo = false;
    };
  }, []);

  /* Os três botões do cabeçalho (protótipo: "+ Palavra", "Trazer do Anki", "Exportar"). */
  const [adicionando, setAdicionando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [noAnki, setNoAnki] = useState(false);
  /** Muda quando o deck muda por aqui — o catálogo (paginado no servidor) recarrega junto. */
  const [versaoDoCatalogo, setVersaoDoCatalogo] = useState(0);

  /* "Trazer do Anki" abre a tela do Anki que o Jogar já usava, no lugar desta — ela importa, ativa
     e exporta; ao voltar, o deck e o catálogo recarregam. */
  if (noAnki) {
    return (
      <BaralhoAnki
        deck={vocabCards}
        idioma={baseLang(langCfg.studying)}
        idiomaNativo={baseLang(langCfg.mine)}
        ageProfile={ageProfile}
        onVoltar={() => setNoAnki(false)}
        onImportou={async () => {
          try {
            setVocabCards(await fetchDeck());
            setVersaoDoCatalogo((v) => v + 1);
          } catch {
            /* mantém o deck em tela */
          }
        }}
      />
    );
  }

  const titulo =
    ageProfile === 'kids' ? (
      <>
        Jardim de Palavras &amp; Recompensas <Sprout className="inline" style={{ width: 28, height: 28 }} aria-hidden />
      </>
    ) : ageProfile === 'senior' ? (
      <>
        Seu Caderno de Palavras &amp; Frases <Eye className="inline" style={{ width: 28, height: 28 }} aria-hidden />
      </>
    ) : (
      'Vocabulário'
    );
  const sub =
    ageProfile === 'kids'
      ? 'Suas palavras salvas prontas para regar! Revise suas cartas para ganhar Seeds e subir de nível.'
      : ageProfile === 'senior'
        ? 'Veja todas as palavras salvas das suas gravações com botão de pronúncia em áudio e explicações fáceis.'
        : 'As palavras que você guardou, com revisão espaçada: cada acerto empurra a próxima revisão para mais longe.';

  /* Abas — em Kids/Sênior as três de análise ficam atrás de "Mais". Continuam a UM clique; o que
     muda é não abrirem três frentes de análise de uma vez para quem só quer ver as próprias
     palavras. "Mais" NÃO é uma aba: não tem painel, revela as outras — por isso fica fora de
     `Abas` (senão se anunciaria como aba selecionável e as setas parariam nele à toa). */
  const mostrarMais = coreOnly(ageProfile) && !showAllTabs && mainTab === 'palavras';
  const abas = (
    <Abas
      rotuloDoGrupo="Seções do vocabulário"
      ativo={mainTab}
      aoTrocar={(id) => setMainTab(id as typeof mainTab)}
      itens={[
        {
          id: 'palavras',
          rotulo: ageProfile === 'kids' ? 'Minhas cartas' : 'Minhas palavras',
          icone: <BookOpen aria-hidden />,
        },
        ...(!mostrarMais
          ? [
              {
                id: 'dashboard',
                rotulo: copyDoPerfil('metricsTab.dashboard', ageProfile),
                icone: <LayoutGrid aria-hidden />,
              },
              { id: 'lexical', rotulo: copyDoPerfil('metricsTab.lexical', ageProfile), icone: <Brain aria-hidden /> },
              { id: 'fluency', rotulo: copyDoPerfil('metricsTab.fluency', ageProfile), icone: <Mic aria-hidden /> },
            ]
          : []),
      ]}
    />
  );

  const ladrilhoDeKpi = (
    kpi: Exclude<KpiType, null>,
    rotulo: string,
    valor: React.ReactNode,
    detalhe: React.ReactNode,
    ariaLabel: string,
    tom = '',
  ) => (
    <button
      type="button"
      className="cartao ladrilho clicavel"
      style={{ textAlign: 'left' }}
      onClick={() => setExpandedKpi(kpi)}
      aria-label={ariaLabel}
    >
      <span className="label-mono">{rotulo}</span>
      <span className={`v ${tom}`}>{valor}</span>
      <small className="mut" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
        {detalhe}
      </small>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 relative">
        {/* KPI DEEP DIVE MODAL */}
        <MetricsExpandedKpi kpi={expandedKpi} onClose={() => setExpandedKpi(null)} metrics={metrics} />
        {adicionando && (
          <AdicionarPalavra
            cartoes={vocabCards}
            langCfg={langCfg}
            aoFechar={() => setAdicionando(false)}
            aoAdicionar={(criados) => {
              setVocabCards((prev) => [...prev, ...criados]);
              setVersaoDoCatalogo((v) => v + 1);
            }}
          />
        )}
        {exportando && (
          <ExportarVocabulario
            cartoes={vocabCards}
            metrics={metrics}
            idioma={baseLang(langCfg.studying)}
            aoFechar={() => setExportando(false)}
          />
        )}

        <Tela largura="larga">
          <CabecalhoDeTela
            sobrancelha="Seu caderno"
            icone={BookOpen}
            titulo={titulo}
            sub={sub}
            acoes={
              <>
                <button type="button" className="btn btn-outline" onClick={() => setAdicionando(true)}>
                  <Plus aria-hidden /> Palavra
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setNoAnki(true)}>
                  <Upload aria-hidden /> Trazer do Anki
                </button>
                {/* O antigo "Exportar relatório" (o .txt de progresso) é um dos formatos do diálogo. */}
                <button type="button" className="btn btn-solid" onClick={() => setExportando(true)}>
                  <Download aria-hidden />{' '}
                  {ageProfile === 'kids'
                    ? 'Baixar Palavras'
                    : ageProfile === 'senior'
                      ? 'Exportar Meu Caderno'
                      : 'Exportar'}
                </button>
              </>
            }
            abas={
              mostrarMais ? (
                <div className="linha" style={{ gap: 0, alignItems: 'stretch' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>{abas}</div>
                  <button type="button" className="aba" onClick={() => setShowAllTabs(true)}>
                    <MoreHorizontal aria-hidden /> Mais
                  </button>
                </div>
              ) : (
                abas
              )
            }
          />

          {/* --- MINHAS PALAVRAS (aba de entrada) ---
              O ACERVO, na tela que leva o nome dele: o que revisar, quantas em cada fase, e a
              lista inteira. A análise é o que fica atrás de uma aba, não o contrário. */}
          <PainelDeAba id="palavras" ativo={mainTab}>
            {/* O CONVITE DA REVISÃO — só com o que revisar. Sem vencidas, o estado vazio do
                protótipo diz que está tudo em dia, em vez de um "0 prontas". */}
            {metrics && metrics.dueToday > 0 ? (
              <section
                className="cartao faixa-rev"
                style={{
                  borderColor: 'color-mix(in srgb,var(--accent) 45%,var(--border-subtle))',
                  borderTopWidth: 'var(--bw-card)',
                }}
              >
                <span className="contador">{metrics.dueToday}</span>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 800 }}>
                    {ageProfile === 'kids' ? 'Cartas prontas para regar' : 'Prontas para revisar'}
                  </h2>
                  <p className="mut" style={{ fontSize: 13 }}>
                    {rotuloDeDuracao(estimativaDeMinutos(metrics.dueToday, temposMedidos))}
                    {' · '}
                    {numero(metrics.newCards)} {metrics.newCards === 1 ? 'nova' : 'novas'}
                    {' · '}
                    {numero(metrics.deckSize)} no total
                  </p>
                </div>
                <button type="button" className="btn btn-solid" onClick={() => onChangeView?.('study')}>
                  <Target aria-hidden /> {ageProfile === 'kids' ? 'Regar agora' : 'Revisar agora'}
                </button>
              </section>
            ) : metrics && metrics.deckSize > 0 ? (
              <section className="cartao">
                <div className="vazio">
                  <IconeEmBloco icone={PartyPopper} />
                  <h3>Tudo revisado por hoje</h3>
                  <p>Nada vence agora. Que tal um jogo com as mesmas palavras?</p>
                  <button type="button" className="btn btn-outline" onClick={() => onChangeView?.('play')}>
                    Abrir Jogar
                  </button>
                </div>
              </section>
            ) : null}

            {/* AS QUATRO FASES, do `fsrsState` real de cada cartão (ver `fasesDoBaralho`). */}
            <div className="ladrilhos" style={{ marginTop: 20 }}>
              {[
                { rotulo: 'Guardadas', valor: fasesDoBaralho.total, tom: '' },
                { rotulo: 'Novas', valor: fasesDoBaralho.novas, tom: 'acc' },
                { rotulo: 'Aprendendo', valor: fasesDoBaralho.aprendendo, tom: 'warn' },
                { rotulo: 'Em revisão', valor: fasesDoBaralho.revisao, tom: 'good' },
              ].map((f) => (
                <div key={f.rotulo} className="cartao ladrilho">
                  <span className="label-mono">{f.rotulo}</span>
                  <span className={`v ${f.tom}`}>{numero(f.valor)}</span>
                </div>
              ))}
            </div>

            <CatalogoDePalavras
              key={versaoDoCatalogo}
              cartoes={vocabCards}
              aoAbrirPalavra={(id) => {
                const c = vocabCards.find((x) => x.id === id);
                if (c) void examineWord(c.word, c.sentence);
              }}
              rodape={
                semVerso > 0 && (
                  <p className="mut" style={{ fontSize: 12.5, marginTop: 12, color: 'var(--warn-ink)' }}>
                    <b>
                      {numero(semVerso)} {semVerso === 1 ? 'palavra está' : 'palavras estão'} sem tradução.
                    </b>{' '}
                    Isso acontece quando o idioma que você aprende e o seu idioma são o mesmo — não há o que traduzir, e
                    o cartão fica sem verso.{' '}
                    <button type="button" className="link" onClick={() => onChangeView?.('settings')}>
                      Conferir os dois idiomas
                    </button>
                  </p>
                )
              }
            />
          </PainelDeAba>

          {/* --- VISÃO GERAL --- os números reais do acervo. O gráfico "revisadas por dia" do
              protótipo fica de fora: o servidor não guarda a série diária, só a semanal. */}
          <PainelDeAba id="dashboard" ativo={mainTab}>
            <div className="ladrilhos">
              {ladrilhoDeKpi(
                'volume',
                copyDoPerfil('metric.deckSize', ageProfile),
                numero(metrics?.deckSize ?? 0),
                <>
                  {metrics?.newCards ?? 0} novos • {metrics?.dueToday ?? 0} p/ revisar
                </>,
                'Abrir o detalhamento do volume lexical',
              )}
              {ladrilhoDeKpi(
                'retention',
                copyDoPerfil('metric.retention', ageProfile),
                metrics && metrics.avgRetentionConfidence > 0 ? Math.round(metrics.avgRetention * 100) + '%' : '—',
                metrics && metrics.avgRetentionConfidence > 0 ? (
                  <Confianca valor={metrics.avgRetentionConfidence} estimativa />
                ) : (
                  'sem revisões ainda'
                ),
                'Abrir o detalhamento da taxa de retenção',
                'good',
              )}
              {ladrilhoDeKpi(
                'time',
                copyDoPerfil('metric.reviews', ageProfile),
                metrics?.reviews ?? 0,
                <>
                  {metrics?.sessions ?? 0} sessões • {metrics?.streakDays ?? 0} dias seguidos
                </>,
                'Abrir o detalhamento das revisões feitas',
              )}
              {/* TEMPO COM O IDIOMA — `listeningMs` e `speakingMs` do servidor. É o número que
                  cresce desde o primeiro dia, mesmo antes da primeira revisão. */}
              <div className="cartao ladrilho">
                <span className="label-mono">Tempo com o idioma</span>
                <span className="v warn">{minutosDoIdioma} min</span>
                <small className="mut" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                  {numero(metrics?.wordsCaptured ?? 0)} palavras ouvidas
                  {(metrics?.speakingMs ?? 0) > 0 && ` • ${Math.round((metrics!.speakingMs ?? 0) / 60000)} min falando`}
                </small>
              </div>
            </div>

            {/* C1 — o nível predominante não disputa a faixa de herói: sem base, ele aparece aqui,
                com o motivo. */}
            {niveisSemBase && (
              <SemDado
                compacto
                className="mt-5"
                motivo={`Nível predominante: só ${niveisComCefr} de ${metrics?.deckSize ?? 0} palavras têm nível CEFR conhecido, o resto está fora da wordlist, e nível fora dela não é estimado. Sem essa base, um nível único do acervo não significaria nada.`}
              />
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
                gap: 20,
                marginTop: 20,
              }}
            >
              <EvolucaoSemanal serie={metrics?.vocabByWeek} titulo="Evolução do Vocabulário" altura={280} />

              {/* Requer atenção — retenção REAL por cartão (FSRS puro, `retrievability` de `@core`). */}
              <section className="cartao p5" style={{ display: 'flex', flexDirection: 'column', minHeight: 380 }}>
                <TituloDeSecao
                  icone={AlertCircle}
                  titulo="Requer atenção"
                  desc={
                    lowRetentionAnalysis.totalCalculavel > 0 ? (
                      <>
                        Termos com menor retenção prevista agora (FSRS). Calculado sobre{' '}
                        <b>{lowRetentionAnalysis.totalCalculavel}</b> de <b>{lowRetentionAnalysis.totalDeck}</b>{' '}
                        cartões.
                      </>
                    ) : undefined
                  }
                />
                {lowRetentionAnalysis.totalCalculavel > 0 ? (
                  <>
                    <div
                      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pe-1"
                      style={{ maxHeight: 260 }}
                    >
                      {lowRetentionAnalysis.piores.map(({ card, retencaoPct }) => (
                        <button
                          key={card.id}
                          type="button"
                          onClick={() => void examineWord(card.word, card.sentence)}
                          className="w-full text-start p-2.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-hover transition-colors cursor-pointer flex items-center justify-between gap-3"
                          title="Analisar termo no Analista de Vocabulário"
                        >
                          <span className="min-w-0">
                            <span className="block font-bold text-[13px] text-ink truncate">{card.word}</span>
                            {card.translation && (
                              <span className="block text-[11px] text-ink-muted truncate">{card.translation}</span>
                            )}
                          </span>
                          {/* A barra torna a ordem legível de relance; o número fica para conferir. */}
                          <span className="shrink-0 flex items-center gap-2.5">
                            <Barra
                              pct={retencaoPct}
                              tom={retencaoPct < 50 ? 'error' : 'warn'}
                              tamanho="fina"
                              rotuloAcessivel={`Chance de lembrar ${card.word} agora`}
                              className="w-16 sm:w-24"
                            />
                            {/* C9 — `-ink` e não a cor cheia: `--error`/`--warn` são de preenchimento. */}
                            <span
                              className={`text-[12px] font-bold font-mono w-9 text-end ${retencaoPct < 50 ? 'text-error-ink' : 'text-warn-ink'}`}
                            >
                              {retencaoPct}%
                            </span>
                            <span className="hidden md:block text-[11px] text-ink-faint font-mono w-20 text-end">
                              {desdeAUltimaRevisao(card.lastReview)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* F8 — a ponte: identificar os termos em risco e oferecer o caminho para agir. */}
                    <button
                      type="button"
                      onClick={() => onChangeView?.('study')}
                      className="btn btn-solid bloco"
                      style={{ marginTop: 12 }}
                    >
                      <Target aria-hidden />
                      Revisar {lowRetentionAnalysis.piores.length} agora
                    </button>

                    {(lowRetentionAnalysis.semRevisao > 0 || lowRetentionAnalysis.semEstabilidade > 0) && (
                      <p className="mut" style={{ fontSize: 11.5, marginTop: 12 }}>
                        {lowRetentionAnalysis.semRevisao + lowRetentionAnalysis.semEstabilidade} de{' '}
                        {lowRetentionAnalysis.totalDeck} cartões ficaram FORA do cálculo, sem revisão FSRS, retenção não
                        existe: {lowRetentionAnalysis.semRevisao} nunca revisados,{' '}
                        {lowRetentionAnalysis.semEstabilidade} sem estabilidade FSRS ainda.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex-1 min-h-0 flex items-center justify-center">
                    <SemDado
                      compacto
                      motivo={
                        lowRetentionAnalysis.totalDeck === 0
                          ? 'Seu deck ainda está vazio, sem cartões, não há retenção para ranquear.'
                          : `Nenhum dos ${lowRetentionAnalysis.totalDeck} cartões tem retenção calculável ainda${
                              lowRetentionAnalysis.semRevisao > 0
                                ? ` — ${lowRetentionAnalysis.semRevisao === lowRetentionAnalysis.totalDeck ? 'nenhum' : `${lowRetentionAnalysis.totalDeck - lowRetentionAnalysis.semRevisao} de ${lowRetentionAnalysis.totalDeck}`} foi revisado`
                                : ''
                            }. Revise alguns cartões no Estudo para começar a ver este ranqueamento.`
                      }
                    />
                  </div>
                )}
              </section>
            </div>

            {/* SUAS PALAVRAS DIFÍCEIS: o histórico do que o usuário mais ERRA (>= 2 revisões por
                cartão; base fraca fica de fora). Diferente de "Requer atenção" (retenção caindo
                AGORA). */}
            {(metrics?.palavrasDificeis?.length ?? 0) > 0 && (
              <section className="cartao p5 secao" style={{ marginTop: 20 }}>
                <TituloDeSecao
                  icone={Target}
                  titulo="Suas palavras difíceis"
                  desc="As que você mais esquece e erra, pelo histórico real de revisões (só entram cartões com 2+ revisões)."
                  direita={
                    <button type="button" onClick={() => onChangeView?.('study')} className="btn btn-outline peq">
                      Praticar estas agora
                    </button>
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {metrics!.palavrasDificeis!.map((p) => (
                    <div
                      key={p.cardId}
                      className="flex items-center justify-between gap-2 bg-canvas border border-border-subtle rounded-lg px-3 py-2"
                    >
                      <span className="font-bold text-[13.5px] text-ink truncate">{p.word}</span>
                      <span className="text-[11px] text-ink-muted font-mono shrink-0">
                        {p.lapses > 0 ? `${p.lapses}× esquecida · ` : ''}
                        {Math.round(p.fracaoDeErro * 100)}% erro
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </PainelDeAba>

          {/* --- LEXICAL INTELLIGENCE TAB --- */}
          <PainelDeAba id="lexical" ativo={mainTab} className="space-y-6">
            {/* Resumo lexical real */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="cartao p5">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">
                  Palavras Distintas
                </div>
                <div className="font-display font-black text-3xl text-ink">{numero(metrics?.uniqueWords ?? 0)}</div>
              </div>
              <div className="cartao p5">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">
                  Cartões no Deck
                </div>
                <div className="font-display font-black text-3xl text-ink">{numero(metrics?.deckSize ?? 0)}</div>
              </div>
              <div className="cartao p5">
                <div className="text-[11px] font-bold uppercase tracking-wider font-mono text-ink-muted mb-2">
                  Palavras Capturadas
                </div>
                <div className="font-display font-black text-3xl text-ink">{numero(metrics?.wordsCaptured ?? 0)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Level Distribution — ESTIMATIVA */}
              <div className="cartao p5">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-rare" /> Distribuição por Nível (CEFR)
                  </h3>
                  {levelDist.length > 0 && <Confianca valor={metrics?.levelConfidence ?? 0} estimativa />}
                </div>
                <p className="text-[12px] text-ink-muted mb-6">
                  Estimativa aproximada de nível, não represente como classificação exata.
                </p>

                {/* "N/D" NÃO É UMA DISTRIBUIÇÃO. Com todo o acervo fora da wordlist, o donut
                    desenhava uma fatia única de 100% "N/D" — um gráfico que não informa nada,
                    ao lado de um Resumo que já declara "não há base". `temNivelReal` faz o
                    componente cair no estado vazio, que explica em vez de desenhar. */}
                {temNivelReal ? (
                  <>
                    <div className="w-full" style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={90}
                            paddingAngle={2}
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={levelColors[i % levelColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: chartTheme.surface,
                              border: `1px solid ${chartTheme.borderSubtle}`,
                              borderRadius: '8px',
                              color: chartTheme.ink,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2">
                      {levelDist.map((l, i) => (
                        <div key={l.level} className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2 text-ink font-medium">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: levelColors[i % levelColors.length] }}
                            ></span>
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
            </div>
          </PainelDeAba>

          {/* --- FLUENCY TAB --- */}
          <PainelDeAba id="fluency" ativo={mainTab} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Acoustic competences radar — requer IA */}
              <div className="cartao p5 flex flex-col h-[400px]">
                <h3 className="font-display font-extrabold text-[16px] text-ink mb-2">
                  Radar de Competências Acústicas
                </h3>
                <p className="text-[12px] text-ink-muted mb-4">Avaliação multidimensional da fala espontânea.</p>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  {/* Sem "em breve": não há nada a caminho. Um radar por dimensão exigiria uma
                      avaliação por modelo de linguagem A CADA abertura de tela, custo por token e
                      envio do seu texto para fora, que o perfil Privado/Local proíbe. É uma feature
                      com preço e consentimento a decidir, não uma data. */}
                  <SemDado
                    compacto
                    motivo={`Avaliar fluência, gramática e pronúncia por dimensão exigiria um modelo de linguagem, que este painel não chama.`}
                  />
                </div>
              </div>

              <div className="space-y-6">
                {/* Speech Pace (WPM) — dado real */}
                <div className="cartao p5">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-accent" /> Ritmo de Fala (WPM)
                  </h3>
                  {metrics && metrics.wpm > 0 ? (
                    <>
                      <div className="flex items-end gap-4 mb-3 flex-wrap">
                        <div className="text-5xl font-black font-display text-ink">{Math.round(metrics.wpm)}</div>
                        <div className="text-[13px] text-ink-muted font-medium mb-1">Palavras por Minuto</div>
                        <div className="mb-2">
                          <Confianca valor={metrics.wpmConfidence} />
                        </div>
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
                    <SemDado
                      compacto
                      motivo={`Sem dados suficientes. Grave algumas sessões de fala para calcular seu ritmo.`}
                    />
                  )}
                </div>

                {/* Speaking Time — dado real */}
                <div className="cartao p5">
                  <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-rare" /> Tempo Total de Fala
                  </h3>
                  {metrics && metrics.speakingMs > 0 ? (
                    <div className="flex items-end gap-4 flex-wrap">
                      <div className="text-5xl font-black font-display text-ink">{formatMs(metrics.speakingMs)}</div>
                      <div className="text-[13px] text-ink-muted font-medium mb-1">
                        min : seg • {recordings.length} capturas
                      </div>
                    </div>
                  ) : (
                    <SemDado compacto motivo={`Sem dados suficientes de fala capturada ainda.`} />
                  )}
                </div>
              </div>
            </div>

            {/*
              Complexidade Estrutural & Tom. Complexidade gramatical (`computeTextStats`) e voz
              passiva (`detectarVozPassiva`) sao deterministicas, sem IA. O corpus segue o IDIOMA
              QUE A PESSOA ESTUDA, e cada regua declara o que sabe medir naquele idioma: silabas e
              Flesch so valem em ingles, a densidade lexical precisa de lista de stopwords, a voz
              passiva precisa do padrao "be + participio". O que nao se aplica aparece como "sem
              regua para <idioma>" — e nao como zero, que era o que a tela mostrava antes.
            */}
            <div className="cartao p5 space-y-6">
              <div>
                <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-1">
                  <BarChart2 className="w-5 h-5 text-accent" /> Complexidade Gramatical
                </h3>
                <p className="text-[11.5px] text-ink-muted mb-4">
                  Estatísticas determinísticas do texto (sem IA), calculadas sobre as falas em{' '}
                  <b>{nomeDoIdiomaEstudado}</b>, o idioma que você estuda.
                  {corpusDoAlvo.totalFalas > 0 && (
                    <>
                      {' '}
                      {corpusDoAlvo.noAlvo} de {corpusDoAlvo.totalFalas} falas capturadas estão nele
                      {corpusDoAlvo.emOutrosIdiomas > 0 &&
                        ` (${corpusDoAlvo.emOutrosIdiomas} em outros idiomas ficaram fora)`}
                      .
                    </>
                  )}
                </p>
                {textStats.wordCount > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                        Palavras/Frase
                      </div>
                      <div className="font-display font-black text-xl text-ink">{textStats.avgSentenceLength}</div>
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                        Flesch Reading Ease
                      </div>
                      <div className="font-display font-black text-xl text-ink">
                        {textStats.readingEase != null ? textStats.readingEase : '-'}
                      </div>
                      {textStats.readingEase == null && (
                        <div className="text-[10px] text-ink-muted mt-0.5">
                          {textStats.syllableCount == null
                            ? `sem régua para ${nomeDoIdiomaEstudado}`
                            : 'precisa de 10+ palavras'}
                        </div>
                      )}
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                        Densidade Lexical
                      </div>
                      <div className="font-display font-black text-xl text-ink">
                        {textStats.lexicalDensityPct != null ? `${textStats.lexicalDensityPct}%` : '-'}
                      </div>
                      {textStats.lexicalDensityPct == null && (
                        <div className="text-[10px] text-ink-muted mt-0.5">
                          sem lista de stopwords para {nomeDoIdiomaEstudado}
                        </div>
                      )}
                    </div>
                    <div className="bg-surface border border-border-subtle rounded-xl p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">
                        Riqueza Lexical (TTR)
                      </div>
                      <div className="font-display font-black text-xl text-ink">
                        {Math.round(textStats.typeTokenRatio * 100)}/100
                      </div>
                    </div>
                  </div>
                ) : (
                  // Era uma template string com o ternario DENTRO das crases — o usuario lia
                  // codigo-fonte na tela (visto em 31/08).
                  <SemDado
                    compacto
                    motivo={
                      corpusDoAlvo.totalFalas === 0
                        ? 'Nenhuma fala capturada ainda, grave ou importe uma sessão para medir complexidade.'
                        : `Nenhuma das falas capturadas está em ${nomeDoIdiomaEstudado}, que é o idioma que você estuda.`
                    }
                  />
                )}
              </div>

              <div className="pt-6 border-t border-border-subtle">
                <h3 className="font-display font-extrabold text-[16px] text-ink flex items-center gap-2 mb-1">
                  <MessageSquareWarning className="w-5 h-5 text-warn" /> Uso de Voz Passiva
                </h3>
                <p className="text-[11.5px] text-ink-muted mb-4">
                  Detecção por padrão "be + particípio", sem IA. É HEURÍSTICA, não um parser gramatical: perde
                  particípios irregulares fora da lista curada e pode confundir um punhado de adjetivos em "-ed" com voz
                  passiva, os números são um indício, não um veredito.
                </p>
                {vozPassiva == null ? (
                  /* AUSENCIA DECLARADA. O padrao "be + participio" e do ingles; para os outros
                     idiomas nao existe regua aqui, e zero ocorrencias seria uma afirmacao falsa
                     sobre a fala da pessoa. */
                  <SemDado
                    compacto
                    motivo={`Não há régua de voz passiva para ${nomeDoIdiomaEstudado}. O padrão "be + particípio" é do inglês, e aplicá-lo a outro idioma devolveria zero como se fosse medida.`}
                  />
                ) : textStats.wordCount > 0 ? (
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
                          <span key={i} className="text-[11px] font-mono px-2 py-1 rounded bg-warn-soft text-warn-ink">
                            {ex}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-ink-muted">
                    Sem texto suficiente em {nomeDoIdiomaEstudado} para detectar.
                  </p>
                )}
              </div>

              <div className="pt-6 border-t border-border-subtle">
                <h3 className="font-display font-extrabold text-[16px] text-ink mb-2">Tom da Fala</h3>
                <SemDado
                  compacto
                  motivo={`Classificar tom (confiante/analítico/hesitante) exige análise acústica e prosódica do
                  áudio, o app transcreve, mas não mede pitch nem entonação. Nada foi estimado.`}
                />
              </div>
            </div>
          </PainelDeAba>
        </Tela>
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
