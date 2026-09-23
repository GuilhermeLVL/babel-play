import { estimativaDeMinutos, rotuloDeDuracao } from '@core';
import {
  ArrowRight,
  ChevronUp,
  Eye,
  FileText,
  Gamepad2,
  Headphones,
  History,
  Mic,
  Sparkles,
  Sprout,
  Target,
  TrendingUp,
  Upload,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { type AppMetrics, fetchExerciseResults, fetchSettings, patchUiSettings } from '../../data/api';
import { numero, t, tp } from '../../lib/i18n';
import { type DerivedProgress, type Mission } from '../../lib/progress';
import { Recording } from '../../types';
import CardDePlanos from '../CardDePlanos';
import AvisoDeConta from '../conta/AvisoDeConta';
import EditablePanel from '../EditablePanel';
import { ehBaixaConfianca } from '../Honestidade';
import FaixaDeProgresso from '../progress/FaixaDeProgresso';
import { Abas, CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao, Vazio } from '../ui';

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
  const ir = (view: string, data?: unknown) => onChangeView(view, data as never);
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
  const filteredRecs = recordings.filter((r) => filterCategory === 'all' || r.type === filterCategory).slice(0, 6);
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
        } catch {
          /* ui inválido, ignora */
        }
      }
      levelLoaded.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);
  const chooseLevel = (lvl: 'B2' | 'C1' | 'C2') => {
    setSelectedLevel(lvl);
    if (levelLoaded.current) void patchUiSettings({ cefrGoal: lvl });
  };

  // Nível CEFR ESTIMADO derivado da distribuição real de níveis do deck (não é avaliação oficial).
  const levelDist = metrics?.levelDistribution ?? [];
  const levelTotal = levelDist.reduce((s, l) => s + l.count, 0);
  const topLevel = levelDist.length ? levelDist.reduce((a, b) => (b.count > a.count ? b : a)).level : null;
  const levelBars =
    levelTotal > 0
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
  const atOrAbove = levelDist.filter((l) => (CEFR_RANK[l.level] ?? 0) >= targetRank).reduce((s, l) => s + l.count, 0);
  const vocabAdherence = levelTotal > 0 ? Math.round((atOrAbove / levelTotal) * 100) : null;

  return (
    <Tela largura="larga">
      {/* Cabeçalho — a linguagem muda por perfil; a estrutura, não. O protótipo aprovado
          (23/09/2026) devolve ao perfil `pro` o rótulo "Seu estudo" e a frase de apoio: com eles
          o Início abre igual às outras telas (sobrancelha, título, apoio). */}
      <CabecalhoDeTela
        icone={ageProfile === 'kids' ? Gamepad2 : ageProfile === 'senior' ? Eye : Sparkles}
        sobrancelha={
          ageProfile === 'kids'
            ? t('Central do jogador')
            : ageProfile === 'senior'
              ? t('Aprendizado fácil')
              : t('Seu estudo')
        }
        titulo={
          ageProfile === 'kids'
            ? t('Pronto para os desafios?')
            : ageProfile === 'senior'
              ? t('Bem-vindo ao Babel Play')
              : t('O que você quer fazer?')
        }
        sub={
          ageProfile === 'kids'
            ? t('Três frentes para evoluir: gravar, praticar e cultivar palavras.')
            : t('Escolha um dos três passos. Cada um leva a uma tela só, com o que precisa.')
        }
      />

      {/* Marcação do protótipo aprovado (`T.inicio`), o "Figma" do app: os três passos em `.g3`, a
          peça de progresso com a faixa de revisão colada embaixo, e o link de estatísticas. */}
      <EditablePanel
        viewKey="hub"
        panelKey="quickActions"
        title={t('Ações Rápidas')}
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
        <section className="g3" aria-label={t('Três passos')}>
          {PILLARS.map((pillar) => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              ageProfile={ageProfile}
              mission={progress.missions.find((m) => m.id === pillar.id)}
              progressAvailable={progress.available}
              onChangeView={onChangeView}
            />
          ))}
        </section>
      </EditablePanel>

      <FaixaDeProgresso
        progress={progress}
        ageProfile={ageProfile}
        className="secao"
        style={{ marginTop: 24 }}
        destaque={!!metrics && metrics.dueToday > 0}
      >
        {/* A faixa de revisão só existe quando há o que revisar (sem vencidas ela some inteira,
            em vez de um "0 palavras" no lugar mais nobre da tela). Enquanto as métricas não
            chegaram, o espaço fica reservado para a tela não pular (CLS, achado F0-02). */}
        {metrics === null && (
          <div className="faixa-rev animate-pulse" aria-hidden>
            <span className="contador" />
            <span style={{ flex: 1, height: 20, borderRadius: 8, background: 'var(--surface-hover)' }} />
          </div>
        )}
        {metrics && metrics.dueToday > 0 && (
          <div className="faixa-rev">
            <span className="contador">{agora}</span>
            <p style={{ flex: 1, minWidth: 180 }}>
              <b>
                {ageProfile === 'kids'
                  ? t('Você está quase esquecendo estas {n}', { n: agora })
                  : ageProfile === 'senior'
                    ? tp(agora, '{n} palavra está na hora de rever', '{n} palavras estão na hora de rever')
                    : tp(agora, '{n} palavra pronta para revisar', '{n} palavras prontas para revisar')}
              </b>{' '}
              <span className="mut">
                · {rotuloDeDuracao(estimativaDeMinutos(agora, temposMedidos))}
                {metrics.dueToday > agora && <> {t('· {n} no total', { n: numero(metrics.dueToday) })}</>}
              </span>
            </p>
            <button type="button" className="btn btn-solid" onClick={() => ir('study')}>
              {ageProfile === 'kids'
                ? t('Bora!')
                : ageProfile === 'senior'
                  ? t('Começar a revisão')
                  : t('Revisar agora')}
            </button>
            <button type="button" className="link" onClick={() => onChangeView('play')}>
              {t('escolher outro jogo')}
            </button>
          </div>
        )}
      </FaixaDeProgresso>

      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          className="link"
          onClick={() => setShowDetailedStats(!showDetailedStats)}
          aria-expanded={showDetailedStats}
        >
          {t('Ver estatísticas detalhadas')}{' '}
          {showDetailedStats ? <ChevronUp aria-hidden /> : <ArrowRight aria-hidden />}
        </button>
      </div>

      {/* DESCOBRIBILIDADE DO PLANO, segunda rodada (spec planos-visiveis): a linha discreta da
          auditoria anterior informava mas não tinha o peso de card que o dono pediu. O componente
          carrega TODAS as regras (só Grátis/anônimo, nunca na leve, dispensável, preço da
          matriz) — aqui só se diz onde ele fica. */}
      {/* O AVISO POR MARCO DE USO (mudança porta-de-entrada). Vem ANTES do card de planos porque
          é mais urgente: um fala de guardar o que já existe, o outro de comprar mais. Só aparece
          sem conta, com motivo concreto, e some para sempre quando dispensado. */}
      <AvisoDeConta metrics={metrics} onEntrar={() => onChangeView('login')} />

      <CardDePlanos onVerPlanos={() => onChangeView('planos')} />

      {/* Progress Dashboard & Metrics — só quando expandido */}
      {showDetailedStats && (
        <EditablePanel
          viewKey="hub"
          panelKey="statsDashboard"
          title={t('Dashboard de Estatísticas')}
          canResizeWidth={false}
          canResizeHeight={false}
          defaultHeight={0}
        >
          <section className="mb-8 animate-in slide-in-from-top-2 duration-300">
            <TituloDeSecao icone={TrendingUp} titulo={t('Métricas do Perfil')} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <button
                className="card-panel p-5 text-start hover:border-accent hover:shadow-card transition-all group"
                onClick={() => ir('metrics')}
              >
                <span className="label-mono block mb-1 text-ink-muted group-hover:text-accent transition-colors">
                  {t('Palavras Produzidas')}
                </span>
                <div className="font-display font-black text-2xl tracking-tight text-ink mb-1">
                  {metrics ? fmtNum(metrics.wordsCaptured) : '-'}
                </div>
                <div className="text-[11.5px] font-semibold text-ink-muted flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />{' '}
                  {tp(metrics?.sessions ?? 0, '{n} sessão capturada', '{n} sessões capturadas')}
                </div>
              </button>

              <button
                className="card-panel p-5 text-start hover:border-accent hover:shadow-card transition-all group"
                onClick={() => ir('metrics')}
              >
                <span className="label-mono block mb-1 text-ink-muted group-hover:text-accent transition-colors">
                  {t('Vocabulário no Deck')}
                </span>
                <div className="font-display font-black text-2xl tracking-tight text-ink mb-1">
                  {metrics ? fmtNum(metrics.deckSize) : '-'}
                </div>
                <div className="text-[11.5px] font-medium text-ink-muted">
                  {t('{revisar} para revisar hoje • {novos} novos', {
                    revisar: metrics?.dueToday ?? 0,
                    novos: metrics?.newCards ?? 0,
                  })}
                </div>
              </button>

              <div className="card-panel p-5 text-start relative overflow-hidden flex flex-col justify-between border-dashed border-accent-soft/60 hover:border-accent transition-colors bg-surface">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="label-mono block mb-1 text-ink-muted">{t('Ritmo de Fala')}</span>
                    <span className="text-[9px] bg-accent-soft text-accent-ink px-1.5 py-0.5 rounded font-mono font-bold uppercase">
                      WPM
                    </span>
                  </div>
                  {metrics && metrics.speakingMs > 0 ? (
                    <>
                      <div className="font-display font-bold text-sm text-ink mt-2 mb-1">
                        {t('{n} palavras/min', { n: Math.round(metrics.wpm) })}
                        {wpmLowConf ? ` ${t('(estimativa)')}` : ''}
                      </div>
                      <p className="text-[11px] leading-snug text-ink-muted">
                        {t('Baseado em {n} min de fala capturada.', { n: (metrics.speakingMs / 60000).toFixed(1) })}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="font-display font-bold text-sm text-ink mt-2 mb-1">
                        {t('Sem medição recente')}
                      </div>
                      <p className="text-[11px] leading-snug text-ink-muted">
                        {t('Grave ou faça Shadowing para medir seu ritmo de fala.')}
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => ir('study')}
                  className="mt-3 text-xs font-bold text-accent hover:text-accent-ink flex items-center gap-1 transition-colors group/btn self-start"
                >
                  {t('Medir agora')}{' '}
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="card-panel p-5 text-start group bg-surface">
                <span className="label-mono block mb-1 text-ink-muted">{t('Vícios de Linguagem')}</span>
                {/* A contagem de vícios (marcadores de hesitação) é REAL desde src/core/learning/fillers.ts
               , não requer processamento de linguagem, é busca de token por idioma. Ela já aparece
                por sessão na tela de Análise (aba "Desempenho & Fluência"). O que falta é só o
                SOMATÓRIO entre todas as sessões: exigiria campo novo em AppMetrics (src/data/api.ts)
                mais agregação no servidor, fora do escopo desta correção, por isso o card mostra
                onde o número já existe em vez de fingir que a contagem em si está pendente. */}
                <div className="font-display font-bold text-sm text-ink mt-2 mb-1 flex items-center gap-2">
                  {t('Por sessão')}
                  <span className="kpi-pill opacity-60 cursor-default text-[11px]">{t('Sem agregado')}</span>
                </div>
                <div className="text-[11.5px] font-medium text-ink-muted leading-snug">
                  {t(
                    'Contagem real por sessão, na aba "Desempenho & Fluência" da tela de Análise. O somatório entre todas as sessões ainda não existe.',
                  )}
                </div>
              </div>
            </div>

            {/* Nível CEFR estimado a partir da distribuição real de níveis do deck */}
            <div className="card-panel p-6 mb-8 bg-surface">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <h3 className="font-display font-extrabold text-[15px] text-ink">
                    {t('Nível Estimado do Vocabulário (CEFR)')}
                  </h3>
                  <p className="text-[12px] text-ink-muted mt-1">
                    {t(
                      'Estimativa derivada da distribuição de níveis das palavras do seu deck. Não é uma avaliação oficial.',
                    )}
                  </p>
                </div>
                {topLevel && (
                  <div className="flex items-center gap-2 bg-canvas border border-border-subtle rounded-xl px-3 py-1.5 self-start sm:self-auto">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                      {t('Estimativa')}
                    </span>
                    <span className="text-sm font-extrabold text-accent">{topLevel}</span>
                    {metrics && metrics.levelConfidence > 0 && (
                      <span className="text-[10px] text-ink-muted">
                        {t('· conf. {n}%', { n: Math.round(metrics.levelConfidence * 100) })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {levelBars.length === 0 ? (
                <p className="text-[12px] text-ink-muted leading-snug">
                  {t(
                    'Sem palavras suficientes para estimar o nível. Capture sessões e adicione palavras ao deck para gerar a estimativa.',
                  )}
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {levelBars.map((b) => (
                    <div key={b.level}>
                      <div className="flex justify-between items-center text-[12px] mb-2">
                        <span className="font-bold text-ink-muted">{b.level}</span>
                        <span className="font-extrabold text-accent">{tp(b.count, '{n} palavra', '{n} palavras')}</span>
                      </div>
                      <div className="w-full h-2 bg-canvas rounded-full overflow-hidden border border-border-subtle">
                        <div
                          className="h-full bg-accent transition-all duration-500 rounded-full"
                          style={{ width: `${b.pct}%` }}
                        ></div>
                      </div>
                      <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                        {t('{n}% do vocabulário classificado neste nível.', { n: b.pct })}
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
                  <h3 className="font-display font-extrabold text-[15px] text-ink">
                    {t('Nível de Comunicação Corporativa & Alinhamento')}
                  </h3>
                  <p className="text-[12px] text-ink-muted mt-1">
                    {t('Escolha um nível-alvo. Comparamos o alvo declarado com o que foi medido nas suas sessões.')}
                  </p>
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
                      {lvl === 'B2' ? t('B2 - Gerente') : lvl === 'C1' ? t('C1 - Executivo') : t('C2 - Conselheiro')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Ritmo: alvo declarado × wpm medido (real) */}
                <div>
                  <div className="flex justify-between items-center text-[12px] mb-2">
                    <span className="font-bold text-ink-muted">{t('Ritmo de Fala')}</span>
                    <span className="font-mono font-extrabold text-accent">
                      {wpmMeasured != null ? `${wpmMeasured}` : '-'}{' '}
                      <span className="text-ink-faint font-normal">{t('/ {n} ppm', { n: targetWpm })}</span>
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full">
                    <div
                      className="h-full bg-accent transition-all duration-500 rounded-full"
                      style={{ width: `${pacePct}%` }}
                    ></div>
                  </div>
                  <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                    {wpmMeasured != null ? (
                      <>
                        {t('Medido: {n} ppm', { n: wpmMeasured })}
                        {wpmLowConf ? ` ${t('(estimativa, poucas sessões)')}` : ''}
                        {' · '}
                        {t('alvo declarado {n} ppm.', { n: targetWpm })}
                      </>
                    ) : (
                      <>
                        {t('Alvo declarado {n} ppm. Sem fala capturada suficiente para medir seu ritmo.', {
                          n: targetWpm,
                        })}
                      </>
                    )}
                  </span>
                </div>

                {/* Vocabulário: aderência real ao nível-alvo (derivada da distribuição) */}
                <div>
                  <div className="flex justify-between items-center text-[12px] mb-2">
                    <span className="font-bold text-ink-muted">{t('Vocabulário no Nível-Alvo')}</span>
                    <span className="font-mono font-extrabold text-good">
                      {vocabAdherence != null ? `${vocabAdherence}%` : '-'}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full">
                    <div
                      className="h-full bg-good transition-all duration-500 rounded-full"
                      style={{ width: `${vocabAdherence ?? 0}%` }}
                    ></div>
                  </div>
                  <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                    {vocabAdherence != null ? (
                      <>
                        {t('{pct}% do seu vocabulário está classificado em {nivel} ou acima', {
                          pct: vocabAdherence,
                          nivel: selectedLevel,
                        })}
                        {topLevel ? (
                          <>
                            {' · '}
                            {t('nível estimado {n}', { n: topLevel })}
                          </>
                        ) : null}
                        .
                      </>
                    ) : (
                      <>
                        {t('Sem palavras suficientes no deck para medir a aderência ao nível {n}.', {
                          n: selectedLevel,
                        })}
                      </>
                    )}
                  </span>
                </div>

                {/* Clareza & Concisão: a metade "vícios" já é medida (fillers.ts, por sessão), mas esta
                caixa é uma comparação alvo × medido AGREGADA como as duas irmãs acima, e o
                agregado entre sessões não existe (ver comentário do card "Vícios de Linguagem"
                mais acima). "Pausas preenchidas" (duração de silêncio) também nunca foi medido;
                fillers.ts conta MARCADORES de hesitação (palavras), não pausas. Por isso o pill
                não diz "Em breve": não é uma feature no roadmap, são dois dados que faltam. */}
                <div>
                  <div className="flex justify-between items-center text-[12px] mb-2">
                    <span className="font-bold text-ink-muted">{t('Clareza & Concisão')}</span>
                    <span className="kpi-pill opacity-60 cursor-default text-[11px]">{t('Sem agregado')}</span>
                  </div>
                  <div className="w-full h-2.5 bg-canvas overflow-hidden border border-border-subtle/40 rounded-full opacity-50">
                    <div className="h-full bg-border-subtle" style={{ width: '0%' }}></div>
                  </div>
                  <span className="text-[11px] text-ink-muted mt-2 block leading-snug">
                    {t(
                      'A contagem de vícios já existe por sessão (aba "Desempenho & Fluência" na tela de Análise). Faltam aqui o somatório entre sessões e a medição de pausas preenchidas, que ainda não existe.',
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Recomendações e Próximos Passos — CTAs com dado real, sem números fabricados */}
            <h3 className="font-display font-extrabold text-[15px] text-ink mb-4">
              {t('Recomendações e Próximos Passos')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Shadowing — CTA genérico honesto (sem alegar que você "não treinou hoje") */}
              <div className="card-panel p-5 flex flex-col justify-between min-h-[160px] bg-rare-soft/10 border-rare/20 hover:border-rare/40">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-rare-soft text-rare">
                      {t('Precisão Acústica')}
                    </span>
                    <Sparkles className="w-4 h-4 text-rare" />
                  </div>
                  <h4 className="font-display font-bold text-[13.5px] text-ink mb-1">{t('Exercício de Shadowing')}</h4>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    {t('Pratique Shadowing para medir e elevar a fidelidade da sua pronúncia.')}
                  </p>
                </div>
                <button
                  onClick={() => ir('study')}
                  className="mt-4 w-full py-2 text-[11.5px] font-bold rounded-xl bg-surface transition-all duration-200 cursor-pointer text-center border border-rare/30 text-rare hover:bg-rare-soft hover:text-rare-ink"
                >
                  {t('Medir precisão')}
                </button>
              </div>

              {/* Vocabulário — copy ligada a dado real (deckSize / uniqueWords / nível estimado) */}
              <div className="card-panel p-5 flex flex-col justify-between min-h-[160px] bg-rare-soft/10 border-rare/20 hover:border-rare/40">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-rare-soft text-rare">
                      {t('Vocabulário')}
                    </span>
                    <TrendingUp className="w-4 h-4 text-rare" />
                  </div>
                  <h4 className="font-display font-bold text-[13.5px] text-ink mb-1">{t('Seu Vocabulário')}</h4>
                  <p className="text-[12px] text-ink-muted leading-relaxed">
                    {t('Seu deck tem {cartas} cartas, com {unicas} palavras únicas capturadas', {
                      cartas: metrics ? fmtNum(metrics.deckSize) : '0',
                      unicas: metrics ? fmtNum(metrics.uniqueWords) : '0',
                    })}
                    {topLevel ? (
                      <>
                        {' · '}
                        {t('nível estimado {n}', { n: topLevel })}
                      </>
                    ) : null}
                    .
                  </p>
                </div>
                <button
                  onClick={() => ir('study')}
                  className="mt-4 w-full py-2 text-[11.5px] font-bold rounded-xl bg-surface transition-all duration-200 cursor-pointer text-center border border-rare/30 text-rare hover:bg-rare-soft hover:text-rare-ink"
                >
                  {t('Estudar deck')}
                </button>
              </div>

              {/* O cartão "Revisão de Hoje" SAIU daqui (auditoria de UX, 31/08): era o TERCEIRO lugar
              da mesma tela com um botão "Revisar agora" para o mesmo destino — o cartão-herói e o
              pilar já cobrem a revisão. Painel de estatísticas mostra estatística. */}
            </div>
          </section>
        </EditablePanel>
      )}

      {/* Sessões recentes — marcação do protótipo: título de seção, abas em pílula por tipo e as
          sessões como `.sessao-mini`. */}
      <EditablePanel
        viewKey="hub"
        panelKey="recentRecordings"
        title={t('Sessões recentes')}
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
        {/* A margem vai explícita: dentro do EditablePanel a seção é "primeiro filho", e o CSS do
            protótipo zera a margem de `.secao:first-child`. */}
        <section className="secao" style={{ marginTop: 36 }}>
          <TituloDeSecao
            icone={History}
            titulo={t('Sessões recentes')}
            desc={t('Estudos e mídias salvos, organizados por tipo de arquivo.')}
            direita={
              <button type="button" className="link" onClick={() => onChangeView('library')}>
                {t('Ver biblioteca completa')} <ArrowRight aria-hidden />
              </button>
            }
          />
          <Abas
            variante="pilula"
            rotuloDoGrupo={t('Tipo de mídia')}
            ativo={filterCategory}
            aoTrocar={(id) => setFilterCategory(id as typeof filterCategory)}
            itens={[
              { id: 'all', rotulo: t('Tudo'), contagem: recordings.length },
              {
                id: 'video',
                rotulo: 'YouTube',
                icone: <Youtube aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'video').length,
              },
              {
                id: 'audio',
                rotulo: t('Áudio'),
                icone: <Headphones aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'audio').length,
              },
              {
                id: 'document',
                rotulo: t('Documentos'),
                icone: <FileText aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'document').length,
              },
            ]}
          />

          <div role="tabpanel" id={`painel-${filterCategory}`} aria-labelledby={`aba-${filterCategory}`}>
            {filteredRecs.length === 0 ? (
              <Vazio
                className="mt-3.5"
                icone={<Headphones className="w-7 h-7" />}
                titulo={recordings.length === 0 ? t('Nenhuma sessão ainda') : t('Nada nesta categoria')}
                explicacao={
                  recordings.length === 0
                    ? t('Capture sua primeira sessão ou importe uma mídia pela Biblioteca, ela aparecerá aqui.')
                    : t(
                        'Nenhuma sessão salva com este tipo de arquivo. Escolha outra categoria ou capture uma nova sessão.',
                      )
                }
                acao={{
                  rotulo: (
                    <>
                      <Mic className="w-4 h-4" /> {t('Nova captura')}
                    </>
                  ),
                  aoClicar: () => onChangeView('capture'),
                }}
                acaoSecundaria={
                  recordings.length === 0
                    ? {
                        rotulo: (
                          <>
                            <Upload className="w-4 h-4" /> {t('Importar mídia')}
                          </>
                        ),
                        aoClicar: () => onChangeView('library'),
                      }
                    : { rotulo: t('Ver todas as categorias'), aoClicar: () => setFilterCategory('all') }
                }
              />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 340px))',
                  gap: 14,
                  marginTop: 14,
                }}
              >
                {filteredRecs.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    className="cartao clicavel sessao-mini"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => onChangeView('analysis', { id: rec.id })}
                  >
                    <IconeEmBloco
                      icone={rec.type === 'video' ? Youtube : rec.type === 'document' ? FileText : Headphones}
                      tom="rare"
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-display)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {rec.title}
                      </b>
                      <span className="meta">
                        {rec.date} ·{' '}
                        <span className="label-mono">
                          {rec.type === 'video' ? 'YouTube' : rec.type === 'document' ? t('Documento') : t('Áudio')}
                        </span>
                        {/* O estado só aparece quando muda o que dá para fazer: sem transcrição
                            ainda, abrir a sessão leva a uma tela pela metade. */}
                        {rec.status !== 'Processado' && (
                          <> · {ageProfile === 'kids' ? t('lendo ainda') : t('processando')}</>
                        )}
                      </span>
                    </span>
                    <ArrowRight aria-hidden style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </EditablePanel>
    </Tela>
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
      senior: 'Traduzir som ou voz',
    },
    /* O texto do perfil `pro` é de UMA LINHA (referência de design): quem escolheu densidade
       alta lê o cartão de relance, não um parágrafo. Kids e sênior mantêm a frase inteira —
       nesses perfis a explicação é o que faz o cartão funcionar. */
    body: {
      kids: 'Grave o som do Roblox, do YouTube ou do Discord e veja a legenda aparecer na hora.',
      pro: 'Áudio do sistema ou do microfone, em tempo real.',
      senior: 'Grave o áudio do computador ou a sua própria voz. As frases aparecem traduzidas enquanto você ouve.',
    },
    cta: { kids: 'Começar a gravar', pro: 'Iniciar captura', senior: 'Abrir o gravador' },
  },
  {
    id: 'practice',
    view: 'study',
    icon: Target,
    tone: 'warn',
    title: {
      kids: 'Desafios de pronúncia',
      pro: 'Exercícios',
      senior: 'Praticar frases salvas',
    },
    body: {
      kids: 'Fale no microfone, acerte os desafios e ganhe pontos de pronúncia.',
      pro: 'Shadowing, ditado, reescrita, roleplay.',
      senior: 'Exercícios de repetição simples, no seu ritmo e sem cronômetro.',
    },
    cta: { kids: 'Iniciar desafio', pro: 'Abrir exercícios', senior: 'Ver exercícios' },
  },
  {
    id: 'vocabulary',
    view: 'metrics',
    icon: Sprout,
    tone: 'good',
    title: {
      kids: 'Jardim de palavras',
      pro: 'Vocabulário',
      senior: 'Minhas palavras',
    },
    body: {
      kids: 'Regue as palavras do seu deck para elas não murcharem, e colha Seeds.',
      pro: 'Deck com repetição espaçada.',
      senior: 'Seu caderno de palavras, com tradução e pronúncia em áudio.',
    },
    cta: { kids: 'Regar palavras', pro: 'Abrir vocabulário', senior: 'Ver minhas palavras' },
  },
];



interface PillarCardProps {
  pillar: PillarDef;
  ageProfile: AgeProfile;
  mission: Mission | undefined;
  progressAvailable: boolean;
  onChangeView: (view: string, data?: any) => void;
}

const PillarCard: React.FC<PillarCardProps> = ({ pillar, ageProfile, mission, progressAvailable, onChangeView }) => {
  /* Marcação do protótipo (`article.cartao.pilar`): a ação primária (capturar) é o cartão escuro
     com botão cheio; os outros dois são claros com botão de contorno. A linha `.extra` só existe
     no pilar de vocabulário, com a fila real de palavras novas. */
  const escuro = pillar.id === 'capture';
  const extra =
    pillar.id === 'vocabulary' && progressAvailable && mission
      ? mission.pending > 0
        ? tp(mission.pending, '{n} palavra nova esperando', '{n} palavras novas esperando')
        : t('Tudo revisado hoje')
      : null;
  return (
    <article className={`cartao pilar ${escuro ? 'escuro' : ''}`}>
      <IconeEmBloco icone={pillar.icon} tom={escuro ? 'accent' : pillar.tone} />
      <h3>{t(pillar.title[ageProfile])}</h3>
      <p className="mut">{t(pillar.body[ageProfile])}</p>
      {extra && <p className="extra">{extra}</p>}
      <div className="espaco" />
      <button
        type="button"
        className={`btn ${escuro ? 'btn-solid' : 'btn-outline'} bloco`}
        onClick={() => onChangeView(pillar.view)}
      >
        {t(pillar.cta[ageProfile])} <ArrowRight aria-hidden />
      </button>
    </article>
  );
};

/**
 * Faixa de progresso. Nível, XP e Seeds são função pura das métricas (lib/progress.ts) —
 * não há contador paralelo nem número escrito à mão. Sem métricas, mostra esqueleto.
 */
