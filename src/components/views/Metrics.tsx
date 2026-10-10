import '../../styles/questVocabulario.css';

import { computeTextStats, detectarVozPassiva, estimativaDeMinutos, FILTRO_PADRAO, rotuloDeDuracao } from '@core';
import { BookOpen, Brain, Eye, Languages, LayoutGrid, Mic, Sprout } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type AppMetrics,
  deleteCard,
  fetchAllUtterances,
  fetchDeck,
  fetchExerciseResults,
  fetchMetrics,
  type UtteranceRow,
} from '../../data/api';
import { ficharPalavraDoAnalista } from '../../lib/adicionarAoDeck';
import { gravarFiltro } from '../../lib/filtroDaPratica';
import { numero, t, tp } from '../../lib/i18n';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { copyDoPerfil, coreOnly } from '../../lib/profile';
import type { ExerciseId, PracticeSeed } from '../../lib/sentences';
import { seedFromSelection, telaDoExercicio } from '../../lib/sentences';
import { useExameDePalavra } from '../../lib/useExameDePalavra';
import { Recording, VocabCard, VocabWord } from '../../types';
import { toast } from '../Toast';
import BaralhoAnki from './BaralhoAnki';
import AdicionarPalavra from './vocab/AdicionarPalavra';
import CatalogoDePalavras, { type FiltroDoCatalogo } from './vocab/CatalogoDePalavras';
import ExportarVocabulario from './vocab/ExportarVocabulario';
import GavetaDaPalavra from './vocab/GavetaDaPalavra';
import VocabularioDoQuest, { type AbaDoQuest } from './vocab/quest/VocabularioDoQuest';

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

// F3 — `ConfTag` e `AiPlaceholder` viviam aqui, e outras três telas tinham as suas próprias
// versões, com limiares e redações diferentes. Agora vêm de `components/Honestidade`.

// --- COMPONENT ---

export default function Metrics({
  recordings,
  onChangeView,
  ageProfile = 'pro',
  metrics: metricsDoApp,
  embutida = false,
  pedidoDeAdicionar = 0,
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
  /**
   * A ABA "PALAVRAS" DA TELA CARTÕES (10/10/2026): o Vocabulário deixou de ser tela própria e é
   * desenhado dentro de Cartões, sem o palco e o cabeçalho dele. Trazer do Anki e exportar passam a
   * morar na aba "Trazer e levar" de lá.
   */
  embutida?: boolean;
  /** Muda (cresce) quando o "+ Palavra" do cabeçalho de Cartões é tocado: abre o diálogo daqui. */
  pedidoDeAdicionar?: number;
}) {
  /* 'palavras' É A ABA DE ENTRADA (referência de design): a tela chamada Vocabulário abria num
     painel de analytics — retenção, WPM, CEFR, complexidade — e o acervo, que é o que o nome
     promete, ficava enterrado lá embaixo. A análise inteira continua existindo, uma aba ao lado. */
  const [mainTab, setMainTab] = useState<'palavras' | 'dashboard' | 'lexical' | 'fluency'>('palavras');
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

  /* C1 — quando o nível não tem base, ele não ocupa posição de herói (ver a faixa abaixo dos KPIs).

     `levelTotal` NÃO serve para dizer "quantas foram classificadas": ele soma o balde 'N/D'
     junto, e o texto saía se contradizendo ("1901 classificadas de 1901, a maior parte está
     fora da wordlist"). Classificada é a que tem nível CEFR de verdade. */
  const niveisComCefr = useMemo(
    () => levelDist.filter((l) => l.level !== 'N/D').reduce((n, l) => n + l.count, 0),
    [levelDist],
  ); /** Há distribuição para desenhar? Só "N/D" é ausência de dado, não uma fatia. */
  const temNivelReal = niveisComCefr > 0;

  // --- ANALISTA DE VOCABULÁRIO (painel compartilhado) ---
  // Fonte REAL da lista de vocábulos desta tela: o deck do backend (mesmo do Estudo/FSRS).
  const [vocabCards, setVocabCards] = useState<VocabCard[]>([]);
  const [deckCarregado, setDeckCarregado] = useState(false);
  useEffect(() => {
    fetchDeck()
      .then(setVocabCards)
      .catch(() => setVocabCards([]))
      .finally(() => setDeckCarregado(true));
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
     aqui para a tela poder dizer, e apontar onde se conserta a causa. */ const semVerso = useMemo(
    () => vocabCards.filter((c) => !(c.translation ?? '').trim()).length,
    [vocabCards],
  );
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
  const [respostas, setRespostas] = useState<Array<{ ms: number; em: number }>>([]);
  const temposMedidos = useMemo(() => respostas.map((r) => r.ms), [respostas]);
  useEffect(() => {
    let vivo = true;
    fetchExerciseResults()
      .then((linhas) => {
        if (vivo)
          setRespostas(
            linhas
              .filter((l) => typeof l.ms === 'number')
              .map((l) => ({ ms: l.ms as number, em: Number(l.createdAt ?? 0) })),
          );
      })
      .catch(() => {
        /* sem medição: o rótulo cai para "rodada curta" */
      });
    return () => {
      vivo = false;
    };
  }, []);

  /* "Palavras revisadas por dia": os carimbos de `review_logs` dos últimos dias, agrupados no dia
     de quem olha. A altura da barra segue o protótipo (28 px por revisão) até caber no gráfico. */
  const revisoesPorDia = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const nomes = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    return Array.from({ length: 7 }, (_, k) => {
      const ini = new Date(hoje);
      ini.setDate(hoje.getDate() - (6 - k));
      const fim = new Date(ini);
      fim.setDate(ini.getDate() + 1);
      const n = (metrics?.revisoesRecentes ?? []).filter((t) => t >= ini.getTime() && t < fim.getTime()).length;
      return { rotulo: k === 6 ? 'hoje' : nomes[ini.getDay()], n };
    });
  }, [metrics]);
  /** O tempo MEDIDO nas respostas de hoje (jogos e revisão), como em Estatísticas. */
  const minutosHoje = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.round(respostas.filter((r) => r.em >= hoje.getTime()).reduce((s, r) => s + r.ms, 0) / 60_000);
  }, [respostas]);

  /* A gaveta da palavra (V3): abre sobre o cartão real; o analista busca a tradução se faltar. */
  const [cartaoAberto, setCartaoAberto] = useState<VocabCard | null>(null);
  /* EXCLUIR COM DESFAZER: o cartão some na hora e o DELETE (que leva as revisões junto) só sai
     depois da janela do aviso — ou ao sair da página. */
  const exclusoes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pendentes = exclusoes.current;
    const agora = () => {
      pendentes.forEach((t, id) => {
        clearTimeout(t);
        void deleteCard(id);
      });
      pendentes.clear();
    };
    window.addEventListener('pagehide', agora);
    return () => {
      window.removeEventListener('pagehide', agora);
      agora();
    };
  }, []);
  const excluirCartao = (c: VocabCard) => {
    setVocabCards((prev) => prev.filter((x) => x.id !== c.id));
    setVersaoDoCatalogo((v) => v + 1);
    exclusoes.current.set(
      c.id,
      setTimeout(() => {
        exclusoes.current.delete(c.id);
        void deleteCard(c.id);
      }, 8000),
    );
    toast.ok(`“${c.word}” excluída.`, {
      duration: 8000,
      action: {
        label: 'Desfazer',
        onClick: () => {
          clearTimeout(exclusoes.current.get(c.id));
          exclusoes.current.delete(c.id);
          setVocabCards((prev) => [c, ...prev]);
          setVersaoDoCatalogo((v) => v + 1);
        },
      },
    });
  };
  /** Quando abre a próxima rodada: o vencimento mais próximo do baralho. */
  const proximaRodada = useMemo(() => {
    const dues = vocabCards.filter((c) => c.inDeck && c.dueAtMs).map((c) => c.dueAtMs as number);
    if (!dues.length) return '';
    const amanha = new Date();
    amanha.setHours(24, 0, 0, 0);
    const d = Math.min(...dues);
    if (d < amanha.getTime()) return 'ainda hoje';
    const dias = Math.round((d - amanha.getTime()) / 86_400_000);
    return dias === 0 ? 'amanhã' : `em ${dias + 1} dias`;
  }, [vocabCards]);

  /* Os três botões do cabeçalho (protótipo: "+ Palavra", "Trazer do Anki", "Exportar"). */
  const [adicionando, setAdicionando] = useState(false);
  useEffect(() => {
    if (pedidoDeAdicionar > 0) setAdicionando(true);
  }, [pedidoDeAdicionar]);
  const [exportando, setExportando] = useState(false);
  const [filtroDoCatalogo, setFiltroDoCatalogo] = useState<FiltroDoCatalogo | null>(null);
  const [noAnki, setNoAnki] = useState(false);
  /** Muda quando o deck muda por aqui — o catálogo (paginado no servidor) recarrega junto. */
  const [versaoDoCatalogo, setVersaoDoCatalogo] = useState(0);

  /* "Trazer do Anki" abre a tela do Anki que o Jogar já usava, no lugar desta — ela importa, ativa
     e exporta; ao voltar, o deck e o catálogo recarregam. */
  const recarregarDoAnki = async () => {
    try {
      setVocabCards(await fetchDeck());
      setVersaoDoCatalogo((v) => v + 1);
    } catch {
      /* mantém o deck em tela */
    }
  };
  const jogarComBaralho = (deckId: string) => {
    gravarFiltro({ ...FILTRO_PADRAO, fontes: ['baralho'], baralhos: [deckId] });
    onChangeView?.('play');
  };
  if (noAnki && !embutida) {
    return (
      <BaralhoAnki
        deck={vocabCards}
        idioma={baseLang(langCfg.studying)}
        idiomaNativo={baseLang(langCfg.mine)}
        ageProfile={ageProfile}
        rotuloVoltar="Vocabulário"
        onVoltar={() => setNoAnki(false)}
        onImportou={recarregarDoAnki}
        onMudouBaralhos={recarregarDoAnki}
        /* Daqui, jogar com um baralho é ir ao Jogar com o recorte já escolhido: o filtro guardado é
           o mesmo que a gaveta Fonte grava, e o Jogar o restaura ao abrir. */
        onJogarCom={jogarComBaralho}
        onJogarSoCom={jogarComBaralho}
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

  const dialogos = (
    <>
      {adicionando && (
        <AdicionarPalavra
          cartoes={vocabCards}
          langCfg={langCfg}
          traduzir={exame.traduzir}
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
          filtro={filtroDoCatalogo}
          aoFechar={() => setExportando(false)}
        />
      )}
    </>
  );
  const abrirPalavra = (id: string) => {
    const c = vocabCards.find((x) => x.id === id);
    if (!c) return;
    setCartaoAberto(c);
    void examineWord(c.word, c.sentence);
  };
  const gaveta = cartaoAberto && (
    <GavetaDaPalavra
      key={cartaoAberto.id}
      cartao={cartaoAberto}
      palavra={selectedExamWord}
      gravacoes={recordings}
      velocidade={ttsSpeed}
      aoTrocarVelocidade={setTtsSpeed}
      aoFalar={speakWord}
      aoFechar={() => {
        setCartaoAberto(null);
        setSelectedExamWord(null);
      }}
      aoMudar={(novo) => {
        setVocabCards((prev) => prev.map((c) => (c.id === novo.id ? novo : c)));
        setCartaoAberto(novo);
        setVersaoDoCatalogo((v) => v + 1);
      }}
      aoExcluir={excluirCartao}
      aoExercitar={(c) => void handlePracticeWord({ word: c.word, translation: c.translation }, 'memory')}
      aoRevisar={() => onChangeView?.('study')}
    />
  );
  const rotuloDeExportar =
    ageProfile === 'kids' ? 'Baixar Palavras' : ageProfile === 'senior' ? 'Exportar Meu Caderno' : 'Exportar';

  const abasDeAnalise: AbaDoQuest[] = [
    { id: 'dashboard', rotulo: copyDoPerfil('metricsTab.dashboard', ageProfile), Icone: LayoutGrid },
    { id: 'lexical', rotulo: copyDoPerfil('metricsTab.lexical', ageProfile), Icone: Brain },
    { id: 'fluency', rotulo: copyDoPerfil('metricsTab.fluency', ageProfile), Icone: Mic },
  ];
  const abasDoQuest: AbaDoQuest[] = [
    { id: 'palavras', rotulo: ageProfile === 'kids' ? 'Minhas cartas' : 'Minhas palavras', Icone: BookOpen },
    ...(mostrarMais ? [] : abasDeAnalise),
  ];
  return (
    <VocabularioDoQuest
      titulo={titulo}
      sub={sub}
      infantil={ageProfile === 'kids'}
      abas={abasDoQuest}
      aba={mainTab}
      aoTrocarAba={setMainTab}
      aoMostrarMais={mostrarMais ? () => setShowAllTabs(true) : undefined}
      rotuloDeExportar={rotuloDeExportar}
      aoAdicionar={() => setAdicionando(true)}
      embutida={embutida}
      aoAnki={() => setNoAnki(true)}
      aoExportar={() => setExportando(true)}
      metrics={metrics}
      duracaoDaRevisao={metrics ? rotuloDeDuracao(estimativaDeMinutos(metrics.dueToday, temposMedidos)) : ''}
      proximaRodada={proximaRodada}
      fases={fasesDoBaralho}
      deckCarregado={deckCarregado}
      catalogo={
        <CatalogoDePalavras
          key={versaoDoCatalogo}
          cartoes={vocabCards}
          aoMudarFiltro={setFiltroDoCatalogo}
          aoAbrirPalavra={abrirPalavra}
          rodape={
            semVerso > 0 && (
              <div className="q-aviso qv-sem-verso" role="note">
                <span>
                  <b>
                    {tp(semVerso, '{n} palavra está sem tradução.', '{n} palavras estão sem tradução.', {
                      n: numero(semVerso),
                    })}
                  </b>{' '}
                  {t(
                    'Isso acontece quando o idioma que você aprende e o seu idioma são o mesmo: não há o que traduzir, e o cartão fica sem verso.',
                  )}
                </span>
                <button type="button" className="q-ctl" onClick={() => onChangeView?.('settings')}>
                  <Languages aria-hidden /> {t('Conferir os dois idiomas')}
                </button>
              </div>
            )
          }
        />
      }
      aoRevisar={() => onChangeView?.('study')}
      aoJogar={() => onChangeView?.('play')}
      aoCapturar={() => onChangeView?.('capture')}
      revisoesPorDia={revisoesPorDia}
      minutosHoje={minutosHoje}
      totalDePalavras={vocabCards.length}
      niveis={levelDist}
      totalDeNiveis={levelTotal}
      temNivelReal={temNivelReal}
      coresDosNiveis={levelColors}
      capturas={recordings.length}
      nomeDoIdioma={nomeDoIdiomaEstudado}
      corpus={corpusDoAlvo}
      textStats={textStats}
      vozPassiva={vozPassiva}
    >
      {dialogos}
      {gaveta}
    </VocabularioDoQuest>
  );
}
