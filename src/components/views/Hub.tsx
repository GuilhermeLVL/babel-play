import { Mic, Upload, ArrowRight, Sparkles, TrendingUp, AlertTriangle, Video, FileText, Headphones, ChevronDown, ChevronUp, Gamepad2, Target, Sprout, Rocket, Eye, Zap, Check } from 'lucide-react';
import { EDICAO_LEVE } from '../../lib/edicao';
import React, { useState, useEffect, useRef } from 'react';
import { Recording } from '../../types';
import { fetchSettings, patchUiSettings, fetchExerciseResults, type AppMetrics } from '../../data/api';
import EditablePanel from '../EditablePanel';
import { type DerivedProgress, type Mission } from '../../lib/progress';
import { ehBaixaConfianca } from '../Honestidade';
import { Vazio } from '../ui';
import { estimativaDeMinutos, rotuloDeDuracao } from '@core';
import FaixaDeProgresso from '../progress/FaixaDeProgresso';

// Metas de ritmo DECLARADAS por nível (benchmark, não medição). O valor MEDIDO
// vem sempre de metrics.wpm; aqui só guardamos o alvo com que comparar.
const LEVEL_TARGET_WPM: Record<'B2' | 'C1' | 'C2', number> = { B2: 130, C1: 150, C2: 160 };
// Ordem CEFR para calcular "quanto do vocabulário está no nível-alvo ou acima".
const CEFR_RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

type AgeProfile = 'kids' | 'pro' | 'senior';

interface HubProps {
  onChangeView: (view: string, data?: any) => void;
  recordings: Recording[];
  ageProfile?: AgeProfile;
  /** Progresso derivado das métricas reais (ver lib/progress.ts). Vem do App. */
  progress: DerivedProgress;
  metrics: AppMetrics | null;
}

export default function Hub({ onChangeView, recordings, ageProfile = 'pro', progress, metrics }: HubProps) {
  // Edição leve: a Revisão (study) não existe como tela; o caminho é Jogar. Vocabulário existe.
  const ir = (view: string, data?: unknown) => onChangeView(EDICAO_LEVE && view === 'study' ? 'play' : view, data as never);
  const [filterCategory, setFilterCategory] = useState<'all' | 'video' | 'audio' | 'document'>('all');

  /**
   * Os tempos JÁ MEDIDOS por item, só para o card de revisão poder dizer quanto leva.
   *
   * Buscado aqui e não recebido por prop porque nenhum ancestral tem esse dado — e o custo é uma
   * chamada que já existe (`GET /api/exercises/results`), disparada uma vez por montagem. Falhar é
   * inofensivo: sem amostras, `estimativaDeMinutos` devolve `null` e a linha vira "rodada curta".
   */
  const [temposMedidos, setTemposMedidos] = useState<number[]>([]);

  /**
   * QUANTAS O CARD OFERECE AGORA — uma sessão, não a fila inteira.
   *
   * A primeira versão prometia todas as vencidas, e no baralho real isso deu "2057 palavras · leva
   * uns 152 minutos". A conta estava certa e o card, inútil: ninguém revisa duas horas e meia, e um
   * número desses não convida a começar — afasta. O acúmulo é justamente o estado em que a ajuda
   * mais importa, e era nele que o card falhava.
   *
   * 20 é o tamanho de uma sessão que cabe num intervalo (uns 4 minutos, no ritmo medido). A fila
   * inteira continua escrita na linha de baixo: o que muda é qual dos dois números é o convite.
   */
  const TAMANHO_DA_SESSAO = 20;
  const agora = Math.min(metrics?.dueToday ?? 0, TAMANHO_DA_SESSAO);
  useEffect(() => {
    let vivo = true;
    fetchExerciseResults()
      .then(linhas => {
        if (vivo) setTemposMedidos(linhas.map(l => l.ms).filter((ms): ms is number => typeof ms === 'number'));
      })
      .catch(() => { /* sem medição: o rótulo cai para "rodada curta" */ });
    return () => { vivo = false; };
  }, []);
  const filteredRecs = recordings
    .filter(r => filterCategory === 'all' || r.type === filterCategory)
    .slice(0, 6);
  const [showDetailedStats, setShowDetailedStats] = useState<boolean>(false);

  const fmtNum = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  // Nível-alvo CEFR: é uma META ESCOLHIDA pelo usuário (não uma medição). Persiste no
  // blob settings.ui via MERGE. Chave distinta de `ui.goal` (essa pertence à tela de
  // Configurações, que guarda executivo/creator/…) para os dois não se sobrescreverem.
  const [selectedLevel, setSelectedLevel] = useState<'B2' | 'C1' | 'C2'>('C1');
  const levelLoaded = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await fetchSettings();
      if (alive && s?.ui) {
        try {
          const parsed = JSON.parse(s.ui) as { cefrGoal?: string };
          if (parsed.cefrGoal === 'B2' || parsed.cefrGoal === 'C1' || parsed.cefrGoal === 'C2') {
            setSelectedLevel(parsed.cefrGoal);
          }
        } catch { /* ui inválido — ignora */ }
      }
      levelLoaded.current = true;
    })();
    return () => { alive = false; };
  }, []);
  const chooseLevel = (lvl: 'B2' | 'C1' | 'C2') => {
    setSelectedLevel(lvl);
    if (levelLoaded.current) void patchUiSettings({ cefrGoal: lvl });
  };

  // Nível CEFR ESTIMADO derivado da distribuição real de níveis do deck (não é avaliação oficial).
  const levelDist = metrics?.levelDistribution ?? [];
  const levelTotal = levelDist.reduce((s, l) => s + l.count, 0);
  const topLevel = levelDist.length
    ? levelDist.reduce((a, b) => (b.count > a.count ? b : a)).level
    : null;
  const levelBars = levelTotal > 0
    ? [...levelDist]
        .sort((a, b) => b.count - a.count)
        .map((l) => ({ level: l.level, count: l.count, pct: Math.round((l.count / levelTotal) * 100) }))
    : [];

  // Comparação "alvo declared × valor medido" para o card de nível-alvo.
  const targetWpm = LEVEL_TARGET_WPM[selectedLevel];
  const wpmMeasured = metrics && metrics.speakingMs > 0 && metrics.wpm > 0 ? Math.round(metrics.wpm) : null;
  // F3 — o limiar vem da primitiva compartilhada; antes era um `0.5` solto aqui, um `0.5` em
  // Metrics e um `0.6` em Analysis, e as telas discordavam sobre a mesma estimativa.
  const wpmLowConf = !metrics || ehBaixaConfianca(metrics.wpmConfidence);
  const pacePct = wpmMeasured != null ? Math.min(100, Math.round((wpmMeasured / targetWpm) * 100)) : 0;
  // Aderência do vocabulário ao nível-alvo: % das palavras classificadas no nível escolhido ou acima.
  const targetRank = CEFR_RANK[selectedLevel];
  const atOrAbove = levelDist
    .filter((l) => (CEFR_RANK[l.level] ?? 0) >= targetRank)
    .reduce((s, l) => s + l.count, 0);
  const vocabAdherence = levelTotal > 0 ? Math.round((atOrAbove / levelTotal) * 100) : null;

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-6xl mx-auto w-full">

      {/* Cabeçalho — a linguagem muda por perfil; a estrutura, não. */}
      <header className="mb-6">
        <span className="label-mono text-accent flex items-center gap-1.5">
          {ageProfile === 'kids' ? <Gamepad2 className="w-3.5 h-3.5" aria-hidden /> : ageProfile === 'senior' ? <Eye className="w-3.5 h-3.5" aria-hidden /> : <Zap className="w-3.5 h-3.5" aria-hidden />}
          <span>
            {ageProfile === 'kids' ? 'Central do jogador' : ageProfile === 'senior' ? 'Aprendizado fácil' : 'Painel de performance'}
          </span>
        </span>
        <h1 className="font-display font-black text-3xl md:text-4xl text-ink tracking-tight mt-1 mb-1 text-balance">
          {ageProfile === 'kids'
            ? 'Pronto para os desafios?'
            : ageProfile === 'senior'
            ? 'Bem-vindo ao Babel OS'
            : 'O que você quer fazer agora?'}
        </h1>
        <p className="text-ink-muted text-sm max-w-[62ch]">
          {ageProfile === 'kids'
            ? 'Três frentes para evoluir: gravar, praticar e cultivar palavras.'
            : ageProfile === 'senior'
            ? 'Escolha um dos três passos abaixo. Cada um leva a uma tela só, com o que precisa.'
            : 'Captura, prática e vocabulário — com o estado real de cada frente.'}
        </p>
      </header>

      <FaixaDeProgresso progress={progress} ageProfile={ageProfile} />

      {/* ── AS QUE ESTÃO PRESTES A ESCAPAR ────────────────────────────────────────────────────
          O Hub abria com três cards equivalentes e a revisão vencida aparecia como uma linha de
          texto num deles, lá embaixo, competindo com "Seu Vocabulário" e "Métricas". Mas revisão
          vencida é a única coisa nesta tela que PIORA com o tempo: cada dia que passa derruba a
          chance de lembrar, e o resto espera sem custo. Uma decisão que caduca merece o topo.

          O CARD SÓ EXISTE QUANDO HÁ O QUE REVISAR. Sem vencidas ele some inteiro, em vez de virar
          um "0 palavras para revisar" — que ocuparia o lugar mais nobre da tela para não dizer
          nada, e ensinaria a ignorar aquele espaço justamente nos dias em que ele importa.

          O TEMPO É MEDIDO ou não é dito: `estimativaDeMinutos` cala abaixo de 20 respostas
          cronometradas e a linha vira "rodada curta". */}
      {/* ENQUANTO AS MÉTRICAS NÃO CHEGARAM, O ESPAÇO FICA RESERVADO.
          O card entra entre a faixa de progresso e TODO o resto da tela, e nascia com a resposta
          da rede — empurrando de uma vez os três pilares, o relatório e as sessões recentes (é a
          maior parcela do CLS 0,311 medido no Início, achado F0-02). O esqueleto repete as mesmas
          classes de caixa do card real para a altura sair das mesmas regras nos dois tamanhos de
          tela; os blocos internos declaram a altura do conteúdo que vai ocupá-los. */}
      {metrics === null && (
        <div
          className="card-panel bg-surface border-accent/40 p-5 md:p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-5 animate-pulse"
          aria-hidden
        >
          <div className="w-24 h-24 rounded-full bg-surface-hover shrink-0 mx-auto sm:mx-0" />
          <div className="min-w-0 flex-1">
            {/* 56 + 6 + 40 + 16 + 44 = os 319px que o card real mede a 412px de largura (medido no
                build de produção, viewport do Lighthouse). O título ocupa duas linhas onde a
                coluna é estreita e uma a partir de `sm`. */}
            <div className="h-14 sm:h-7 rounded-lg bg-surface-hover" />
            <div className="h-10 rounded-lg bg-surface-hover mt-1.5" />
            <div className="h-11 w-56 rounded-xl bg-surface-hover mt-4" />
          </div>
        </div>
      )}

      {metrics && metrics.dueToday > 0 && (
        <section className="card-panel bg-surface border-accent/40 p-5 md:p-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-5">
          <div
            className="w-24 h-24 rounded-full bg-accent-soft flex flex-col items-center justify-center shrink-0 mx-auto sm:mx-0"
            aria-hidden
          >
            <span className="font-display font-black text-3xl text-accent-ink leading-none tabular-nums">
              {agora}
            </span>
            <span className="text-[10px] text-accent-ink mt-0.5">
              {agora === 1 ? 'palavra' : 'palavras'}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="font-display font-black text-xl md:text-2xl text-ink tracking-tight text-balance">
              {ageProfile === 'kids'
                ? `Estas ${agora} você está prestes a esquecer`
                : ageProfile === 'senior'
                  ? `${agora} palavras estão na hora de rever`
                  : `${agora} palavras venceram no agendador`}
            </h2>
            <p className="text-[13px] text-ink-muted mt-1.5">
              {rotuloDeDuracao(estimativaDeMinutos(agora, temposMedidos))}
              {ageProfile === 'kids'
                ? '. O que você acertar volta só daqui a semanas.'
                : '. Acertar agora empurra a próxima revisão para semanas à frente.'}
              {/* A FILA INTEIRA continua dita, só perde o palco. Escondê-la seria mentir por
                  omissão para quem tem 2.000 vencidas; anunciá-la como a tarefa de agora seria
                  pedir duas horas e meia de alguém que abriu o app para começar. */}
              {metrics.dueToday > agora && (
                <span className="text-ink-faint"> São {metrics.dueToday.toLocaleString('pt-BR')} no total.</span>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4">
              <button onClick={() => ir('study')} className="btn-solid py-3 px-6">
                {ageProfile === 'kids' ? 'Bora!' : ageProfile === 'senior' ? 'Começar a revisão' : 'Revisar agora'}
              </button>
              {/* Quem não quer revisar agora tem uma saída DECLARADA, em vez de precisar adivinhar
                  que a mesma coisa também mora em Jogar. */}
              <button
                onClick={() => onChangeView('play')}
                className="text-[12.5px] font-bold text-ink-muted hover:text-accent-ink underline decoration-dotted underline-offset-4 cursor-pointer min-h-6 inline-flex items-center"
              >
                escolher outro jogo
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Main Actions Panel — movido para o topo (como no design novo) */}
      <EditablePanel
        viewKey="hub"
        panelKey="quickActions"
        title="Ações Rápidas"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
      <section className="mb-8">
        {/* TRÊS PILARES — a MESMA estrutura nos três perfis.
            Antes, cada perfil renderizava uma árvore JSX completamente diferente (livro de missões
            × guia de passos × grid executivo). Trocar de perfil parecia trocar de aplicativo, e as
            três versões envelheciam separadamente — foi assim que os emojis e os números fixos
            sobreviveram só em duas delas. Aqui a estrutura é uma; o que varia é a LINGUAGEM, a
            densidade e se as recompensas aparecem. */}
        <div className={ageProfile === 'senior' ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-3 gap-5'}>
          {PILLARS.map((pillar, idx) => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              index={idx}
              ageProfile={ageProfile}
              mission={progress.missions.find((m) => m.id === pillar.id)}
              progressAvailable={progress.available}
              onChangeView={onChangeView}
            />
          ))}
        </div>
      </section>
      </EditablePanel>

      {/* Colapsável: Relatório de Performance Detalhada */}
      <div className={EDICAO_LEVE ? 'hidden' : 'mb-8'}>
        <button
          onClick={() => setShowDetailedStats(!showDetailedStats)}
          className="w-full p-4 flex items-center justify-between transition-all duration-300 group cursor-pointer border border-border-subtle bg-surface hover:bg-surface-hover shadow-sm rounded-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center transition-transform group-hover:scale-105 shrink-0 rounded-lg bg-accent/10 border border-accent/20 text-accent">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-muted">Relatório Executivo</span>
              <h4 className="font-display font-black text-xs md:text-sm mt-0.5 tracking-tight uppercase text-ink">
                {showDetailedStats ? 'Colapsar Relatório de Performance' : 'Visualizar Relatório de Performance Detalhada'}
              </h4>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-ink-muted">
            {showDetailedStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>{showDetailedStats ? 'Ocultar' : 'Expandir'}</span>
          </div>
        </button>
      </div>

      {/* Progress Dashboard & Metrics — só quando expandido */}
      {showDetailedStats && (
      <EditablePanel
        viewKey="hub"
        panelKey="statsDashboard"
        title="Dashboard de Estatísticas"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
      <section className="mb-8 animate-in slide-in-from-top-2 duration-300">
        <h2 className="font-display font-extrabold text-lg text-ink mb-4">Métricas do Perfil</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <button className="card-panel p-5 text-left hover:border-accent hover:shadow-card transition-all group" onClick={() => ir('metrics')}>
            <span className="label-mono block mb-1 text-ink-muted group-hover:text-accent transition-colors">Palavras Produzidas</span>
            <div className="font-display font-black text-2xl tracking-tight text-ink mb-1">
              {metrics ? fmtNum(metrics.wordsCaptured) : '—'}
            </div>
            <div className="text-[11.5px] font-semibold text-ink-muted flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> {metrics?.sessions ?? 0} sessão(ões) capturada(s)
            </div>
          </button>

          <button className="card-panel p-5 text-left hover:border-accent hover:shadow-card transition-all group" onClick={() => ir('metrics')}>
            <span className="label-mono block mb-1 text-ink-muted group-hover:text-accent transition-colors">Vocabulário no Deck</span>
            <div className="font-display font-black text-2xl tracking-tight text-ink mb-1">
              {metrics ? fmtNum(metrics.deckSize) : '—'}
            </div>
            <div className="text-[11.5px] font-medium text-ink-muted">{metrics?.dueToday ?? 0} para revisar hoje • {metrics?.newCards ?? 0} novos</div>
          </button>

          <div className="card-panel p-5 text-left relative overflow-hidden flex flex-col justify-between border-dashed border-accent-soft/60 hover:border-accent transition-colors bg-surface">
            <div>
              <div className="flex justify-between items-start">
                <span className="label-mono block mb-1 text-ink-muted">Ritmo de Fala</span>
                <span className="text-[9px] bg-accent-soft text-accent-ink px-1.5 py-0.5 rounded font-mono font-bold uppercase">WPM</span>
              </div>
              {metrics && metrics.speakingMs > 0 ? (
                <>
                  <div className="font-display font-bold text-sm text-ink mt-2 mb-1">
                    {Math.round(metrics.wpm)} palavras/min{wpmLowConf ? ' (estimativa)' : ''}
                  </div>
                  <p className="text-[11px] leading-snug text-ink-muted">Baseado em {(metrics.speakingMs / 60000).toFixed(1)} min de fala capturada.</p>
                </>
              ) : (
                <>
                  <div className="font-display font-bold text-sm text-ink mt-2 mb-1">
                    Sem medição recente
                  </div>
                  <p className="text-[11px] leading-snug text-ink-muted">Grave ou faça Shadowing para medir seu ritmo de fala.</p>
                </>
              )}
            </div>
            <button
              onClick={() => ir('study')}
              className="mt-3 text-xs font-bold text-accent hover:text-accent-ink flex items-center gap-1 transition-colors group/btn self-start"
            >
              Medir agora <ArrowRight className="w-3.5 h-3.5 transform group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="card-panel p-5 text-left group bg-surface">
            <span className="label-mono block mb-1 text-ink-muted">Vícios de Linguagem</span>
            {/* A contagem de vícios (marcadores de hesitação) é REAL desde src/core/learning/fillers.ts
                — não requer processamento de linguagem, é busca de token por idioma. Ela já aparece
                por sessão na tela de Análise (aba "Desempenho & Fluência"). O que falta é só o
                SOMATÓRIO entre todas as sessões: exigiria campo novo em AppMetrics (src/data/api.ts)
                mais agregação no servidor — fora do escopo desta correção, por isso o card mostra
                onde o número já existe em vez de fingir que a contagem em si está pendente. */}
            <div className="font-display font-bold text-sm text-ink mt-2 mb-1 flex items-center gap-2">
              Por sessão
              <span className="kpi-pill opacity-60 cursor-default text-[11px]">Sem agregado</span>
            </div>
            <div className="text-[11.5px] font-medium text-ink-muted leading-snug">Contagem real por sessão, na aba "Desempenho &amp; Fluência" da tela de Análise. O somatório entre todas as sessões ainda não existe.</div>
          </div>
        </div>

        {/* Nível CEFR estimado a partir da distribuição real de níveis do deck */}
        <div className="card-panel p-6 mb-8 bg-surface">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="font-display font-extrabold text-[15px] text-ink">Nível Estimado do Vocabulário (CEFR)</h3>
              <p className="text-[12px] text-ink-muted mt-1">Estimativa derivada da distribuição de níveis das palavras do seu deck. Não é uma avaliação oficial.</p>
            </div>
            {topLevel && (
              <div className="flex items-center gap-2 bg-canvas border border-border-subtle rounded-xl px-3 py-1.5 self-start sm:self-auto">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">Estimativa</span>
                <span className="text-sm font-extrabold text-accent">{topLevel}</span>
                {metrics && metrics.levelConfidence > 0 && (
                  <span className="text-[10px] text-ink-muted">· conf. {Math.round(metrics.levelConfidence * 100)}%</span>
                )}
              </div>
            )}
          </div>

          {levelBars.length === 0 ? (
            <p className="text-[12px] text-ink-muted leading-snug">
              Sem palavras suficientes para estimar o nível. Capture sessões e adicione palavras ao deck para gerar a estimativa.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {levelBars.map((b) => (
                <div key={b.level}>
                  <div className="flex justify-between items-center text-[12px] mb-2">
                    <span className="font-bold text-ink-muted">{b.level}</span>
                    <span className="font-extrabold text-accent">{b.count} palavra(s)</span>
                  </div>
                  <div className="w-full h-2 bg-canvas rounded-full overflow-hidden border border-border-subtle">
                    <div
                      className="h-full bg-accent transition-all duration-500 rounded-full"
                      style={{ width: `${b.pct}%` }}
                    ></div>
                  </div>
                  <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                    {b.pct}% do vocabulário classificado neste nível.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nível-alvo declarado × valor medido (o seletor persiste em ui.cefrGoal) */}
        <div className="card-panel p-6 mb-8 bg-surface">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h3 className="font-display font-extrabold text-[15px] text-ink">Nível de Comunicação Corporativa &amp; Alinhamento</h3>
              <p className="text-[12px] text-ink-muted mt-1">Escolha um nível-alvo. Comparamos o alvo declarado com o que foi medido nas suas sessões.</p>
            </div>
            <div className="flex gap-1 bg-canvas border border-border-subtle/50 rounded-xl p-0.5 self-start sm:self-auto shadow-inner">
              {(['B2', 'C1', 'C2'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => chooseLevel(lvl)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 active:scale-95 cursor-pointer ${
                    selectedLevel === lvl
                      ? 'bg-accent text-accent-contrast shadow-sm'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-hover/30'
                  }`}
                >
                  {lvl === 'B2' ? 'B2 - Gerente' : lvl === 'C1' ? 'C1 - Executivo' : 'C2 - Conselheiro'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Ritmo: alvo declarado × wpm medido (real) */}
            <div>
              <div className="flex justify-between items-center text-[12px] mb-2">
                <span className="font-bold text-ink-muted">Ritmo de Fala</span>
                <span className="font-mono font-extrabold text-accent">
                  {wpmMeasured != null ? `${wpmMeasured}` : '—'} <span className="text-ink-faint font-normal">/ {targetWpm} ppm</span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full">
                <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${pacePct}%` }}></div>
              </div>
              <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                {wpmMeasured != null
                  ? <>Medido: {wpmMeasured} ppm{wpmLowConf ? ' (estimativa — poucas sessões)' : ''} · alvo declarado {targetWpm} ppm.</>
                  : <>Alvo declarado {targetWpm} ppm. Sem fala capturada suficiente para medir seu ritmo.</>}
              </span>
            </div>

            {/* Vocabulário: aderência real ao nível-alvo (derivada da distribuição) */}
            <div>
              <div className="flex justify-between items-center text-[12px] mb-2">
                <span className="font-bold text-ink-muted">Vocabulário no Nível-Alvo</span>
                <span className="font-mono font-extrabold text-good">
                  {vocabAdherence != null ? `${vocabAdherence}%` : '—'}
                </span>
              </div>
              <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full">
                <div className="h-full bg-good transition-all duration-500 rounded-full" style={{ width: `${vocabAdherence ?? 0}%` }}></div>
              </div>
              <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                {vocabAdherence != null
                  ? <>{vocabAdherence}% do seu vocabulário está classificado em {selectedLevel} ou acima{topLevel ? <> · nível estimado {topLevel}</> : null}.</>
                  : <>Sem palavras suficientes no deck para medir a aderência ao nível {selectedLevel}.</>}
              </span>
            </div>

            {/* Clareza & Concisão: a metade "vícios" já é medida (fillers.ts, por sessão), mas esta
                caixa é uma comparação alvo × medido AGREGADA como as duas irmãs acima — e o
                agregado entre sessões não existe (ver comentário do card "Vícios de Linguagem"
                mais acima). "Pausas preenchidas" (duração de silêncio) também nunca foi medido;
                fillers.ts conta MARCADORES de hesitação (palavras), não pausas. Por isso o pill
                não diz "Em breve": não é uma feature no roadmap, são dois dados que faltam. */}
            <div>
              <div className="flex justify-between items-center text-[12px] mb-2">
                <span className="font-bold text-ink-muted">Clareza &amp; Concisão</span>
                <span className="kpi-pill opacity-60 cursor-default text-[11px]">Sem agregado</span>
              </div>
              <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full opacity-50">
                <div className="h-full bg-border-subtle" style={{ width: '0%' }}></div>
              </div>
              <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                A contagem de vícios já existe por sessão (aba "Desempenho &amp; Fluência" na tela de Análise). Faltam aqui o somatório entre sessões e a medição de pausas preenchidas, que ainda não existe.
              </span>
            </div>
          </div>
        </div>

        {/* Recomendações e Próximos Passos — CTAs com dado real, sem números fabricados */}
        <h3 className="font-display font-extrabold text-[15px] text-ink mb-4">Recomendações e Próximos Passos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Shadowing — CTA genérico honesto (sem alegar que você "não treinou hoje") */}
          <div className="card-panel p-5 flex flex-col justify-between min-h-[160px] bg-rare-soft/10 border-rare/20 hover:border-rare/40">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-rare-soft text-rare">Precisão Acústica</span>
                <Sparkles className="w-4 h-4 text-rare" />
              </div>
              <h4 className="font-display font-bold text-[13.5px] text-ink mb-1">Exercício de Shadowing</h4>
              <p className="text-[12px] text-ink-muted leading-relaxed">Pratique Shadowing para medir e elevar a fidelidade da sua pronúncia.</p>
            </div>
            <button
              onClick={() => ir('study')}
              className="mt-4 w-full py-2 text-[11.5px] font-bold rounded-xl bg-surface transition-all duration-200 cursor-pointer text-center border border-rare/30 text-rare hover:bg-rare-soft hover:text-rare-ink"
            >
              Medir precisão
            </button>
          </div>

          {/* Vocabulário — copy ligada a dado real (deckSize / uniqueWords / nível estimado) */}
          <div className="card-panel p-5 flex flex-col justify-between min-h-[160px] bg-rare-soft/10 border-rare/20 hover:border-rare/40">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-rare-soft text-rare">Vocabulário</span>
                <TrendingUp className="w-4 h-4 text-rare" />
              </div>
              <h4 className="font-display font-bold text-[13.5px] text-ink mb-1">Seu Vocabulário</h4>
              <p className="text-[12px] text-ink-muted leading-relaxed">
                Seu deck tem {metrics ? fmtNum(metrics.deckSize) : '0'} cartas, com {metrics ? fmtNum(metrics.uniqueWords) : '0'} palavras únicas capturadas
                {topLevel ? <> · nível estimado {topLevel}</> : null}.
              </p>
            </div>
            <button
              onClick={() => ir('study')}
              className="mt-4 w-full py-2 text-[11.5px] font-bold rounded-xl bg-surface transition-all duration-200 cursor-pointer text-center border border-rare/30 text-rare hover:bg-rare-soft hover:text-rare-ink"
            >
              Estudar deck
            </button>
          </div>

          {/* Revisão de hoje — copy ligada a dado real (dueToday / streakDays) */}
          <div className="card-panel p-5 flex flex-col justify-between min-h-[160px] bg-warn-soft/10 border-warn/20 hover:border-warn/40">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-warn-soft text-warn">Revisão</span>
                <AlertTriangle className="w-4 h-4 text-warn" />
              </div>
              <h4 className="font-display font-bold text-[13.5px] text-ink mb-1">Revisão de Hoje</h4>
              <p className="text-[12px] text-ink-muted leading-relaxed">
                {metrics && metrics.dueToday > 0
                  ? <>Você tem {metrics.dueToday} carta(s) para revisar hoje. Ofensiva atual de {metrics.streakDays} dia(s).</>
                  : <>Nenhuma carta vencida no momento. Ofensiva atual de {metrics?.streakDays ?? 0} dia(s) — continue capturando para manter o ritmo.</>}
              </p>
            </div>
            <button
              onClick={() => ir('study')}
              className="mt-4 w-full py-2 text-[11.5px] font-bold rounded-xl bg-surface transition-all duration-200 cursor-pointer text-center border border-warn/30 text-warn hover:bg-warn-soft hover:text-warn-ink"
            >
              Revisar agora
            </button>
          </div>
        </div>
      </section>
      </EditablePanel>
      )}

      {/* Recents */}
      <EditablePanel
        viewKey="hub"
        panelKey="recentRecordings"
        title="Sessões Recentes"
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-display font-extrabold text-lg text-ink">Sessões Recentes</h3>
            <p className="text-[12px] text-ink-muted">Estudos e mídias salvos organizados por tipo de arquivo.</p>
          </div>
          <button
            className="text-[12.5px] font-bold text-accent-ink hover:text-accent flex items-center gap-1 py-1 transition-colors self-start sm:self-auto"
            onClick={() => onChangeView('library')}
          >
            Ver biblioteca completa &rarr;
          </button>
        </div>

        {/* Categories segmented control */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              filterCategory === 'all'
                ? 'bg-ink text-ink-contrast border-ink shadow-sm'
                : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
            }`}
          >
            <span>Tudo ({recordings.length})</span>
          </button>
          <button
            onClick={() => setFilterCategory('video')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              filterCategory === 'video'
                ? 'bg-error-soft text-error-ink border-error/30'
                : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-error" />
            <span>YouTube ({recordings.filter(r => r.type === 'video').length})</span>
          </button>
          <button
            onClick={() => setFilterCategory('audio')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              filterCategory === 'audio'
                ? 'bg-rare-soft text-rare-ink border-rare/30'
                : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-rare" />
            <span>Áudio ({recordings.filter(r => r.type === 'audio').length})</span>
          </button>
          <button
            onClick={() => setFilterCategory('document')}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              filterCategory === 'document'
                ? 'bg-good-soft text-good-ink border-good/30'
                : 'bg-surface hover:bg-surface-hover text-ink-muted border-border-subtle'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-good" />
            <span>Documentos ({recordings.filter(r => r.type === 'document').length})</span>
          </button>
        </div>

        {filteredRecs.length === 0 ? (
          <Vazio
            icone={<Headphones className="w-7 h-7" />}
            titulo={recordings.length === 0 ? 'Nenhuma sessão ainda' : 'Nada nesta categoria'}
            explicacao={recordings.length === 0
              ? 'Capture sua primeira sessão ou importe uma mídia pela Biblioteca — ela aparecerá aqui.'
              : 'Nenhuma sessão salva com este tipo de arquivo. Escolha outra categoria ou capture uma nova sessão.'}
            acao={{
              rotulo: <><Mic className="w-4 h-4" /> Nova captura</>,
              aoClicar: () => onChangeView('capture'),
            }}
            acaoSecundaria={recordings.length === 0
              ? { rotulo: <><Upload className="w-4 h-4" /> Importar mídia</>, aoClicar: () => onChangeView('library') }
              : { rotulo: 'Ver todas as categorias', aoClicar: () => setFilterCategory('all') }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecs.map(rec => (
              <div
                key={rec.id}
                className={`card-panel p-4 flex items-center justify-between group cursor-pointer hover:shadow-card transition-all bg-surface border ${
                  rec.type === 'video'
                    ? 'hover:border-error/40'
                    : rec.type === 'document'
                    ? 'hover:border-good/40'
                    : 'hover:border-rare/40'
                }`}
                onClick={() => onChangeView('analysis', { id: rec.id })}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                    rec.type === 'video'
                      ? 'bg-error/10 text-error group-hover:bg-error/20'
                      : rec.type === 'document'
                      ? 'bg-good/10 text-good group-hover:bg-good/20'
                      : 'bg-rare/10 text-rare group-hover:bg-rare/20'
                  }`}>
                    {rec.type === 'video' ? (
                      <Video className="w-4 h-4" />
                    ) : rec.type === 'document' ? (
                      <FileText className="w-4 h-4" />
                    ) : (
                      <Headphones className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[13px] text-ink truncate group-hover:text-accent transition-colors mb-0.5">
                      {rec.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-ink-muted font-mono">
                      <span>{rec.date}</span>
                      <span>·</span>
                      <span className="uppercase">{rec.type === 'video' ? 'YouTube' : rec.type === 'document' ? 'PDF' : 'ÁUDIO'}</span>
                      {/* O ESTADO, quando ele muda o que dá para fazer.
                          Uma sessão ainda em processamento não tem transcrição, então clicar nela
                          leva a uma tela pela metade — e a lista não dizia isso em lugar nenhum.
                          "Processado" não ganha selo: o normal não precisa de etiqueta, e etiquetar
                          tudo faz o selo que importa desaparecer no meio dos outros. */}
                      {rec.status !== 'Processado' && (
                        <span className="badge-tag warn">
                          {ageProfile === 'kids' ? 'lendo ainda' : 'processando'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-ink-faint group-hover:text-ink transition-colors shrink-0" />
              </div>
            ))}
          </div>
        )}
      </section>
      </EditablePanel>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS TRÊS PILARES
   ═══════════════════════════════════════════════════════════════════════════ */

type PillarId = Mission['id'];

interface PillarDef {
  id: PillarId;
  view: string;
  icon: typeof Mic;
  /** Cor semântica do pilar — usada em fundo suave, nunca como preenchimento com texto branco. */
  tone: 'accent' | 'warn' | 'good';
  title: Record<AgeProfile, string>;
  body: Record<AgeProfile, string>;
  cta: Record<AgeProfile, string>;
}

const PILLARS: PillarDef[] = [
  {
    id: 'capture',
    view: 'capture',
    icon: Mic,
    tone: 'accent',
    title: {
      kids: 'Gravar jogo e vídeos',
      pro: 'Escutar e traduzir',
      senior: 'Traduzir som ou voz'
    },
    body: {
      kids: 'Grave o som do Roblox, do YouTube ou do Discord e veja a legenda aparecer na hora.',
      pro: 'Capture o áudio do sistema ou do microfone e receba transcrição e tradução em tempo real.',
      senior: 'Grave o áudio do computador ou a sua própria voz. As frases aparecem traduzidas enquanto você ouve.'
    },
    cta: { kids: 'Começar a gravar', pro: 'Iniciar captura', senior: 'Abrir o gravador' }
  },
  {
    id: 'practice',
    view: 'study',
    icon: Target,
    tone: 'warn',
    title: {
      kids: 'Desafios de pronúncia',
      pro: 'Exercícios e prática',
      senior: 'Praticar frases salvas'
    },
    body: {
      kids: 'Fale no microfone, acerte os desafios e ganhe pontos de pronúncia.',
      pro: 'Shadowing, ditado, reescrita, roleplay e mais — sobre o seu próprio conteúdo.',
      senior: 'Exercícios de repetição simples, no seu ritmo e sem cronômetro.'
    },
    cta: { kids: 'Iniciar desafio', pro: 'Abrir exercícios', senior: 'Ver exercícios' }
  },
  {
    id: 'vocabulary',
    view: 'metrics',
    icon: Sprout,
    tone: 'good',
    title: {
      kids: 'Jardim de palavras',
      pro: 'Vocabulário',
      senior: 'Minhas palavras'
    },
    body: {
      kids: 'Regue as palavras do seu deck para elas não murcharem — e colha Seeds.',
      pro: 'Deck com repetição espaçada: o que revisar hoje e o que ainda é novo.',
      senior: 'Seu caderno de palavras, com tradução e pronúncia em áudio.'
    },
    cta: { kids: 'Regar palavras', pro: 'Abrir vocabulário', senior: 'Ver minhas palavras' }
  }
];

const TONE_SOFT: Record<PillarDef['tone'], string> = {
  accent: 'bg-accent-soft text-accent-ink',
  warn: 'bg-warn-soft text-warn-ink',
  good: 'bg-good-soft text-good-ink'
};
const TONE_BORDER: Record<PillarDef['tone'], string> = {
  accent: 'hover:border-accent',
  warn: 'hover:border-warn',
  good: 'hover:border-good'
};

/**
 * Linha de estado do pilar — o único lugar do card que carrega NÚMERO.
 * Cada um deles vem de `AppMetrics`; nenhum é escrito à mão. Enquanto as métricas não
 * chegaram, a linha não aparece: melhor ausência do que um valor plausível e falso.
 */
function pillarStatus(mission: Mission | undefined, profile: AgeProfile): string | null {
  if (!mission) return null;
  switch (mission.id) {
    case 'capture':
      return mission.done
        ? null
        : profile === 'senior'
        ? 'Você ainda não gravou nada. Comece por aqui.'
        : 'Nenhuma gravação ainda — este é o ponto de partida.';
    case 'practice':
      if (mission.pending === 0) return profile === 'senior' ? 'Nada para revisar agora. Tudo em dia.' : 'Revisão em dia.';
      return `${mission.pending} ${mission.pending === 1 ? 'palavra pronta' : 'palavras prontas'} para revisar`;
    case 'vocabulary':
      if (mission.pending === 0) return profile === 'senior' ? 'Nenhuma palavra nova esperando.' : 'Sem palavras novas na fila.';
      return `${mission.pending} ${mission.pending === 1 ? 'palavra nova' : 'palavras novas'} esperando`;
  }
}

interface PillarCardProps {
  pillar: PillarDef;
  index: number;
  ageProfile: AgeProfile;
  mission: Mission | undefined;
  progressAvailable: boolean;
  onChangeView: (view: string, data?: any) => void;
}

const PillarCard: React.FC<PillarCardProps> = ({
  pillar,
  index,
  ageProfile,
  mission,
  progressAvailable,
  onChangeView
}) => {
  const Icon = pillar.icon;
  const status = progressAvailable ? pillarStatus(mission, ageProfile) : null;
  const isSenior = ageProfile === 'senior';
  const isKids = ageProfile === 'kids';
  // "Em dia" só faz sentido onde existe uma FILA que pode zerar (revisão, palavras novas).
  // No pilar de captura, `done` significa apenas "já gravou alguma vez" — marcar isso como
  // concluído sugeriria, falsamente, que não há mais o que gravar.
  const complete = progressAvailable && mission?.done && mission.id !== 'capture';

  return (
    <div
      className={`card-panel bg-surface p-6 ${TONE_BORDER[pillar.tone]} ${
        isSenior ? 'flex flex-col md:flex-row md:items-center gap-5' : 'flex flex-col justify-between min-h-[196px]'
      }`}
    >
      <div className={isSenior ? 'flex items-start gap-4 flex-1 min-w-0' : ''}>
        {/* Marcador: número no perfil sênior (o guia é sequencial), ícone nos demais. */}
        <span
          className={`shrink-0 flex items-center justify-center rounded-2xl font-display font-black ${TONE_SOFT[pillar.tone]} ${
            isSenior ? 'w-12 h-12 text-xl' : 'w-11 h-11 mb-4'
          }`}
          aria-hidden
        >
          {isSenior ? index + 1 : <Icon className="w-5 h-5" />}
        </span>

        <div className="min-w-0">
          <div className={`flex items-center gap-2 flex-wrap ${isSenior ? '' : 'mb-1'}`}>
            <h2 className={`font-display font-black text-ink ${isSenior ? 'text-xl' : 'text-base'}`}>
              {isSenior ? `Passo ${index + 1}. ` : ''}
              {pillar.title[ageProfile]}
            </h2>
            {/* Recompensa só no perfil Kids, e vinda da tabela de pesos de lib/progress. */}
            {isKids && mission && !complete && (
              <span
                className={`badge-tag ${pillar.tone === 'warn' ? 'warn' : pillar.tone === 'good' ? 'ok' : 'acc'}`}
                title={`Você ganha ${mission.rewardXp} XP e ${mission.rewardSeeds} Seeds ${mission.rewardUnit}`}
              >
                +{mission.rewardXp} XP · {mission.rewardSeeds} <Sprout className="w-3 h-3" aria-hidden />
                <span className="normal-case tracking-normal font-sans font-bold ml-0.5">{mission.rewardUnit}</span>
              </span>
            )}
            {complete && (
              <span className="badge-tag ok">
                <Check className="w-3 h-3" aria-hidden /> Em dia
              </span>
            )}
          </div>
          <p className={`text-ink-muted leading-relaxed ${isSenior ? 'text-sm mt-1' : 'text-xs md:text-[13px]'}`}>
            {pillar.body[ageProfile]}
          </p>
          {status && (
            <p className={`mt-2 font-bold ${isSenior ? 'text-sm' : 'text-xs'} ${complete ? 'text-good-ink' : 'text-ink'}`}>
              {status}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChangeView(pillar.view)}
        className={`btn-solid shrink-0 ${
          pillar.tone === 'warn' ? 'bg-warn' : pillar.tone === 'good' ? 'bg-good' : ''
        } ${isSenior ? 'w-full md:w-auto text-base px-6' : 'w-full mt-4'}`}
      >
        <span>{pillar.cta[ageProfile]}</span>
        {isKids ? <Rocket className="w-4 h-4" aria-hidden /> : <ArrowRight className="w-4 h-4" aria-hidden />}
      </button>
    </div>
  );
};

/**
 * Faixa de progresso. Nível, XP e Seeds são função pura das métricas (lib/progress.ts) —
 * não há contador paralelo nem número escrito à mão. Sem métricas, mostra esqueleto.
 */
