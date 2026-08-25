import { Moon, Sun, User, Shield, Sparkles, Server, Target, Globe, Mic, Layers, Video, PenTool, BarChart2, Languages, Palette, PlayCircle, AlertTriangle, Gamepad2, Zap, Eye, PanelTop, PanelBottom, PanelLeft, PanelRight, Volume2, Gauge, Type } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import AiEnginePanel from '../AiEnginePanel';
import GuidePanel from '../GuidePanel';
import AccountSecuritySection from '../auth/AccountSecuritySection';
import LangAudit from './LangAudit';
import LangPicker from '../LangPicker';
import { BUILTIN_PROFILES, DEFAULT_PROFILE_ID } from '../../gateway/profiles';
import { fetchSettings, saveSettings, patchUiSettings, fetchMetrics, type AppMetrics } from '../../data/api';
import { THEME_OPTIONS, type ThemeType } from '../../lib/appearance';
import { baseLang } from '../../lib/languages';
import {
  langConfigFrom,
  saveLangConfig,
  fetchLangConfig,
  DEFAULT_LANG_CONFIG,
  type LangConfig,
} from '../../lib/langConfig';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import type { FontScale } from '../shell/ControlCluster';
import { Abas, PainelDeAba } from '../ui';

/**
 * AS QUATRO ABAS, e por que esta tela deixou de ser uma rolagem só.
 *
 * Ajustes acumulou onze assuntos numa página única: conta, os dois idiomas, perfil de IA, plano,
 * guia, tour, reconfiguração, meta de fala, aparência, desempenho, persona, privacidade e motores.
 * Quem entrava para trocar o idioma rolava por cima de tudo isso, e quem entrava para conferir se a
 * nuvem estava ligada não tinha como saber que a resposta estava lá embaixo.
 *
 * O AGRUPAMENTO SEGUE A PERGUNTA QUE TRAZ A PESSOA AQUI, não a arquitetura do código:
 *  - "o que eu estudo?"        → Idiomas
 *  - "como isto se parece?"    → Como o app se parece
 *  - "onde isto processa?"     → Onde as contas rodam
 *  - "e a minha conta?"        → Conta e recomeço
 *
 * Nada foi removido. Cada seção que existia continua existindo, na aba onde alguém a procuraria.
 */
const ABAS = [
  { id: 'idiomas', rotulo: 'Idiomas', icone: <Languages className="w-4 h-4" /> },
  { id: 'aparencia', rotulo: 'Como o app se parece', icone: <Palette className="w-4 h-4" /> },
  { id: 'motores', rotulo: 'Onde as contas rodam', icone: <Server className="w-4 h-4" /> },
  { id: 'conta', rotulo: 'Conta e recomeço', icone: <User className="w-4 h-4" /> },
];

const PROFILE_STORAGE_KEY = 'babel.activeProfileId';

// Alvo de ritmo DECLARADO por meta (benchmark, não medição). `ppm: null` = a meta
// não é medida por ppm (é riqueza lexical / termos híbridos). O valor MEDIDO com que
// comparamos vem sempre de fetchMetrics().wpm.
const GOAL_TARGETS: Record<string, { ppm: number | null; badge: string; badgeClass: string }> = {
  executivo: { ppm: 140, badge: 'Alvo: 140 ppm', badgeClass: 'ok' },
  creator: { ppm: 170, badge: 'Alvo: 170 ppm', badgeClass: 'ok' },
  tedx: { ppm: null, badge: 'Alvo: Riqueza Lexical', badgeClass: 'rare' },
  tech: { ppm: null, badge: 'Alvo: Termos Híbridos', badgeClass: 'acc' },
};

/**
 * Preferências de uso guardadas no blob `settings.ui`. A APARÊNCIA (tema,
 * claro/escuro, paleta) mora no mesmo blob mas é gerida por `lib/theme.ts` —
 * não entra aqui, senão os dois escreveriam a mesma chave.
 */
interface UiPrefs {
  goal: string;
  persona: string;
}

const DEFAULT_UI: UiPrefs = { goal: 'executivo', persona: 'tudo' };

interface SettingsProps {
  theme: ThemeType;
  darkMode: boolean;
  onOpenStudio: () => void;
  // Reabre o tour de apresentação só na sessão atual (não persiste nada, ao
  // contrário de "Reconfigurar", que apaga a escolha local/nuvem no servidor).
  onReplayTour: () => void;
  ageProfile?: AgeProfileType;
  // Preferências de shell. Vivem no App (localStorage) porque o shell é renderizado fora
  // desta view; aqui esta tela é o lugar CANÔNICO de mexer nelas — o popover da paleta é
  // só o atalho.
  setAgeProfile: (p: AgeProfileType) => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (p: MenuPositionType) => void;
  fontScale: FontScale;
  setFontScale: (s: FontScale) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
}

/** Interruptor com rótulo e explicação — o padrão desta tela para preferências booleanas. */
function PrefToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  onLabel = 'Ligado',
  offLabel = 'Desligado'
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="w-full p-5 flex items-start gap-4 text-left cursor-pointer hover:bg-surface-hover/50 transition-colors"
    >
      <span
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          checked ? 'bg-accent-soft text-accent-ink' : 'bg-surface-hover text-ink-muted'
        }`}
        aria-hidden
      >
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[14px] text-ink">{title}</span>
        <span className="block text-[12px] text-ink-muted mt-0.5">{description}</span>
      </span>
      <span
        className={`shrink-0 mt-1 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border ${
          checked ? 'bg-good-soft text-good-ink border-good/30' : 'bg-surface-hover text-ink-muted border-border-subtle'
        }`}
      >
        {checked ? onLabel : offLabel}
      </span>
    </button>
  );
}

export default function Settings({
  theme,
  darkMode,
  onOpenStudio,
  onReplayTour,
  ageProfile = 'pro',
  setAgeProfile,
  menuPosition,
  setMenuPosition,
  fontScale,
  setFontScale,
  soundEnabled,
  toggleSound,
  animationsEnabled,
  toggleAnimations,
  performanceMode,
  togglePerformanceMode
}: SettingsProps) {
  /**
   * Idiomas do usuário — a configuração REAL, lida e escrita por `lib/langConfig`.
   *
   * O ÓRFÃO: esta tela salvava `settings.targetLanguage` e NENHUMA linha do app lia esse campo. O
   * usuário escolhia o idioma que estuda numa tela sem efeito nenhum — as outras telas usavam o par
   * escondido da Captura (e ainda por cima o liam invertido entre si). Agora `targetLanguage` é a
   * fonte autoritativa de `studying`, e `saveLangConfig` mantém a Captura em sincronia.
   */
  const [langCfg, setLangCfg] = useState<LangConfig>(DEFAULT_LANG_CONFIG);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    () => localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID
  );
  const [ui, setUi] = useState<UiPrefs>(DEFAULT_UI);
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  // Plano/entitlements: o servidor decide, esta tela só mostra (ver lib/entitlements).
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);
  const [showGuide, setShowGuide] = useState(false);
  const [aba, setAba] = useState('idiomas');
  const loaded = useRef(false);

  /**
   * Erro REAL de gravação. Antes tudo aqui era `void saveSettings(...)`: se a chamada falhasse, a tela
   * seguia exibindo o valor novo e o servidor ficava com o antigo — mentira silenciosa. Agora cada
   * escrita é aguardada e, ao falhar, a UI VOLTA ao valor do servidor e diz o que houve.
   */
  const [saveError, setSaveError] = useState<string | null>(null);

  // Métricas REAIS: usadas só para mostrar o ppm MEDIDO ao lado do alvo declarado.
  useEffect(() => {
    fetchMetrics().then(setMetrics).catch(() => setMetrics(null));
  }, []);
  // ppm medido honesto: só existe com fala capturada; senão mostramos "—"/sem dados.
  const wpmMeasured = metrics && metrics.speakingMs > 0 && metrics.wpm > 0 ? Math.round(metrics.wpm) : null;
  const wpmLowConf = !metrics || metrics.wpmConfidence < 0.5;

  // Carrega as configurações persistidas (linha única no servidor) ao montar.
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await fetchSettings();
      if (!alive || !s) {
        loaded.current = true;
        return;
      }
      if (s.activeProfileId) {
        setActiveProfileId(s.activeProfileId);
        // Espelha no localStorage (fonte usada pelo gateway).
        localStorage.setItem(PROFILE_STORAGE_KEY, s.activeProfileId);
      }
      let uiBlob: Record<string, unknown> = {};
      if (s.ui) {
        try {
          // Só as chaves DESTA tela: o blob também carrega onboarding e aparência,
          // e re-emiti-las num patch faria esta tela ecoar estado que não é dela.
          uiBlob = JSON.parse(s.ui) as Record<string, unknown>;
          setUi({
            goal: (uiBlob.goal as string) ?? DEFAULT_UI.goal,
            persona: (uiBlob.persona as string) ?? DEFAULT_UI.persona,
          });
        } catch {
          /* ui inválido — ignora */
        }
      }
      // Mesmo leitor que o resto do app usa — sem segunda ida à rede (já temos o `AppSettings`).
      setLangCfg(langConfigFrom(uiBlob, s.targetLanguage));
      loaded.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Grava um dos idiomas e CONFIRMA que a gravação valeu.
   *
   * `saveLangConfig` escreve nos dois lugares (o campo autoritativo e o blob da Captura) e avisa as
   * telas abertas. Mas a camada de API devolve `null` em vez de LANÇAR quando a rede falha — então
   * "não explodiu" não prova nada. Relemos a configuração do servidor: só o que voltou de lá pode ser
   * exibido como salvo.
   */
  const changeLang = async (patch: Partial<LangConfig>) => {
    const previous = langCfg;
    setLangCfg({ ...langCfg, ...patch });
    setSaveError(null);
    try {
      await saveLangConfig(patch);
      const saved = await fetchLangConfig();
      const landed =
        (!patch.studying || saved.studying === patch.studying) &&
        (!patch.mine || saved.mine === patch.mine);
      if (!landed) throw new Error('o servidor não confirmou a gravação');
      setLangCfg(saved);
    } catch {
      setLangCfg(previous); // volta ao que o SERVIDOR realmente tem
      setSaveError('Não foi possível salvar o idioma. Verifique a conexão com o servidor e tente de novo.');
    }
  };

  const changeProfile = async (id: string) => {
    const previous = activeProfileId;
    setActiveProfileId(id);
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
    setSaveError(null);
    // `saveSettings` devolve `null` em qualquer falha (rede ou HTTP != 2xx) — nunca lança.
    const saved = await saveSettings({ activeProfileId: id });
    if (!saved) {
      setActiveProfileId(previous);
      localStorage.setItem(PROFILE_STORAGE_KEY, previous);
      setSaveError('Não foi possível salvar o perfil de IA. Verifique a conexão com o servidor e tente de novo.');
    }
  };

  // Meta/persona persistem como JSON. MESCLA no blob `ui` (preserva
  // onboarding/providerMode/credentialId e as chaves de aparência salvas lá).
  const persistUi = async (next: UiPrefs) => {
    const previous = ui;
    setUi(next);
    if (!loaded.current) return;
    setSaveError(null);
    const saved = await patchUiSettings({ ...next });
    if (!saved) {
      setUi(previous);
      setSaveError('Não foi possível salvar sua preferência. Verifique a conexão com o servidor e tente de novo.');
    }
  };

  // Refaz a configuração inicial (escolha local/nuvem + chave): limpa o flag e recarrega.
  const reconfigureAi = async () => {
    await patchUiSettings({ onboarded: false });
    window.location.reload();
  };
  const activeTheme = THEME_OPTIONS.find(t => t.id === theme) ?? THEME_OPTIONS[0];

  const setGoal = (goal: string) => { void persistUi({ ...ui, goal }); };
  const setPersona = (persona: string) => { void persistUi({ ...ui, persona }); };

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-4xl mx-auto w-full">
      <header className="mb-10">
        <span className="label-mono text-accent flex items-center gap-1.5">
          {ageProfile === 'kids' ? <Gamepad2 className="w-3.5 h-3.5" aria-hidden /> : ageProfile === 'senior' ? <Eye className="w-3.5 h-3.5" aria-hidden /> : <Zap className="w-3.5 h-3.5" aria-hidden />}
          <span>{ageProfile === 'kids' ? 'Ajustes do jogador' : ageProfile === 'senior' ? 'Painel de opções' : 'Preferências do app'}</span>
        </span>
        <h1 className="font-display font-black text-2xl md:text-3xl text-ink tracking-tight mt-1 mb-2">
          {ageProfile === 'kids' ? 'Configurações & Ajustes' : ageProfile === 'senior' ? 'Ajustes Simples do Aplicativo' : 'Configurações'}
        </h1>
        <p className="text-ink-muted text-xs md:text-sm">
          {ageProfile === 'kids'
            ? 'Escolha os idiomas que você quer praticar e personalize o visual do seu jogo.'
            : ageProfile === 'senior'
            ? 'Configure o idioma que você deseja aprender e altere opções de leitura de forma simples.'
            : 'Preferências de interface, processamento e integrações.'}
        </p>
      </header>

      {/* Erro HONESTO de gravação — o valor exibido volta ao do servidor, e o usuário sabe por quê. */}
      {saveError && (
        <div
          role="status"
          className="mb-6 flex items-start gap-2 rounded-xl border border-border-subtle bg-warn-soft px-4 py-3 text-[12.5px] text-warn-ink"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <Abas
        itens={ABAS}
        ativo={aba}
        aoTrocar={setAba}
        rotuloDoGrupo="Seções dos ajustes"
        className="mb-8"
      />

      {/* ═════════════ IDIOMAS — o que eu estudo ═════════════ */}
      <PainelDeAba id="idiomas" ativo={aba} className="space-y-8">

        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Languages className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Os dois idiomas</h2>
          </div>
          <div className="card-panel">
            {/* Os DOIS idiomas, com nomes que não admitem inversão: o que você fala e o que estuda.
                O "meu idioma" deixou de ser um detalhe escondido na tela de Captura — ele decide a
                DIREÇÃO da tradução de todo cartão de vocabulário. */}
            <div className="p-5 border-b border-border-subtle">
              <div className="font-bold text-[14px] mb-1">Idioma que estou aprendendo</div>
              <p className="text-[12px] text-ink-muted mb-3">
                O idioma do áudio/texto estrangeiro. É o idioma das palavras que vão para o seu deck.
              </p>
              {/* Lista ÚNICA (`lib/languages`, 32 idiomas) com bandeira e busca — ver LangPicker. */}
              <LangPicker
                id="settings-studying-lang"
                ariaLabel="Idioma que estou aprendendo"
                block
                value={langCfg.studying}
                onPick={({ code }) => { if (code) void changeLang({ studying: code }); }}
              />
            </div>
            <div className="p-5">
              <div className="font-bold text-[14px] mb-1">Meu idioma</div>
              <p className="text-[12px] text-ink-muted mb-3">
                O idioma que você já fala — o do seu microfone e o das traduções que você lê.
              </p>
              <LangPicker
                id="settings-mine-lang"
                ariaLabel="Meu idioma"
                block
                value={langCfg.mine}
                onPick={({ code }) => { if (code) void changeLang({ mine: code }); }}
              />
              {/* Aviso honesto: com os dois iguais não há o que traduzir (`mtCoverage` = 'same'). */}
              {baseLang(langCfg.mine) === baseLang(langCfg.studying) && (
                <p className="text-[12px] text-warn-ink mt-2">
                  Os dois idiomas são o mesmo — não há tradução a fazer, e os cartões ficarão sem verso.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Auditoria de idioma — conserta o passivo de cartões rotulados pelo código antigo.
            Fica logo abaixo dos seletores porque depende deles: o par proposto é derivado
            de `mine`/`studying`. */}
        <LangAudit />

        {/* Goals — preferência salva (persistida como JSON) */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Target className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Meta de Comunicação</h2>
          </div>
          <div className="card-panel p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setGoal('executivo')}
                className={`p-4 border-2 rounded-xl text-left transition-colors ${ui.goal === 'executivo' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
              >
                <div className="font-bold text-[14px] text-ink mb-1">Comunicação Executiva</div>
                <p className="text-[12px] text-ink-muted mb-2">Foco em concisão, clareza e ritmo pausado.</p>
                <span className={`badge-tag ${GOAL_TARGETS.executivo.badgeClass}`}>{GOAL_TARGETS.executivo.badge}</span>
              </button>
              <button
                onClick={() => setGoal('creator')}
                className={`p-4 border-2 rounded-xl text-left transition-colors ${ui.goal === 'creator' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
              >
                <div className="font-bold text-[14px] text-ink mb-1">Criador / YouTuber</div>
                <p className="text-[12px] text-ink-muted mb-2">Foco em energia, retenção e vocabulário acessível.</p>
                <span className={`badge-tag ${GOAL_TARGETS.creator.badgeClass}`}>{GOAL_TARGETS.creator.badge}</span>
              </button>
              <button
                onClick={() => setGoal('tedx')}
                className={`p-4 border-2 rounded-xl text-left transition-colors ${ui.goal === 'tedx' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
              >
                <div className="font-bold text-[14px] text-ink mb-1">Estilo Palestrante (TED)</div>
                <p className="text-[12px] text-ink-muted mb-2">Pausas, vocabulário raro e storytelling.</p>
                <span className={`badge-tag ${GOAL_TARGETS.tedx.badgeClass}`}>{GOAL_TARGETS.tedx.badge}</span>
              </button>
              <button
                onClick={() => setGoal('tech')}
                className={`p-4 border-2 rounded-xl text-left transition-colors ${ui.goal === 'tech' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
              >
                <div className="font-bold text-[14px] text-ink mb-1">Tech / Developer</div>
                <p className="text-[12px] text-ink-muted mb-2">Inglês/Português misto, termos técnicos sem tradução.</p>
                <span className={`badge-tag ${GOAL_TARGETS.tech.badgeClass}`}>{GOAL_TARGETS.tech.badge}</span>
              </button>
            </div>

            {/* Benchmark: alvo declarado da meta escolhida × ppm REALMENTE medido nas sessões */}
            <div className="mt-5 pt-4 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-bold text-ink flex items-center gap-2">
                  Seu ritmo medido
                  {wpmMeasured != null && wpmLowConf && (
                    <span className="kpi-pill opacity-60 cursor-default text-[11px]">estimativa</span>
                  )}
                </div>
                <p className="text-[11.5px] text-ink-muted mt-0.5">
                  {wpmMeasured != null
                    ? <>Comparado ao alvo da meta selecionada ({GOAL_TARGETS[ui.goal]?.badge ?? 'sem alvo de ppm'}).</>
                    : <>Grave ou faça Shadowing para medir seu ritmo — ainda sem dados suficientes.</>}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5 shrink-0">
                <span className="font-mono font-black text-2xl text-accent">{wpmMeasured != null ? wpmMeasured : '—'}</span>
                <span className="text-[11px] font-bold text-ink-muted">ppm</span>
                {wpmMeasured != null && GOAL_TARGETS[ui.goal]?.ppm != null && (
                  <span className="text-[11px] text-ink-faint font-mono ml-1">/ {GOAL_TARGETS[ui.goal]?.ppm} alvo</span>
                )}
              </div>
            </div>
          </div>
        </section>

      </PainelDeAba>

      {/* ═════════════ COMO O APP SE PARECE ═════════════ */}
      <PainelDeAba id="aparencia" ativo={aba} className="space-y-8">

        {/* Aparência — o seletor completo vive no Studio (tema, paleta, layout).
            Aqui mostramos só o estado atual e o atalho, para não manter dois
            controles concorrentes escrevendo a mesma preferência. */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Palette className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Aparência</h2>
          </div>
          <div className="card-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex -space-x-1.5 shrink-0">
                {[activeTheme.swatches.canvas, activeTheme.swatches.surface, activeTheme.swatches.accent, activeTheme.swatches.ink].map((c, i) => (
                  <span key={i} className="w-7 h-7 rounded-full border-2 border-surface shadow-sm" style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-[14px] text-ink flex items-center gap-2">
                  {activeTheme.name}
                  <span className="kpi-pill cursor-default text-[11px] gap-1">
                    {darkMode ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                    {darkMode ? 'Escuro' : 'Claro'}
                  </span>
                </div>
                <p className="text-[12px] text-ink-muted mt-0.5">{activeTheme.desc}</p>
              </div>
            </div>
            <button onClick={onOpenStudio} className="btn-solid shrink-0">
              <Sparkles className="w-4 h-4" /> Abrir Studio
            </button>
          </div>

          {/* Perfil de exibição — a MESMA preferência do popover da paleta, escrita aqui com
              espaço para explicar o que cada uma faz. O atalho continua no topo; o lugar de
              entender a escolha é este. */}
          <div className="card-panel mt-4">
            <div className="p-5 border-b border-border-subtle">
              <div className="font-bold text-[14px] mb-1">Perfil de exibição</div>
              <p className="text-[12px] text-ink-muted mb-3">
                Muda a linguagem e a densidade das telas. Não muda o tema nem esconde recurso nenhum.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { id: 'kids' as const, icon: Gamepad2, label: 'Kids / Gamer', desc: 'Missões, recompensas e linguagem de jogo.' },
                  { id: 'pro' as const, icon: Zap, label: 'Produtividade', desc: 'Densidade alta e vocabulário técnico.' },
                  { id: 'senior' as const, icon: Eye, label: 'Leitura ampliada', desc: 'Passo a passo, alvos de 48px e mais respiro.' }
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAgeProfile(opt.id)}
                    aria-pressed={ageProfile === opt.id}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-colors ${
                      ageProfile === opt.id
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-border-subtle bg-surface hover:border-accent text-ink-muted'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-bold text-[13px]">
                      <opt.icon className="w-4 h-4 shrink-0" aria-hidden /> {opt.label}
                    </span>
                    <span className="block text-[11.5px] mt-1 opacity-80">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Posição do menu — o pedido explícito: dar liberdade de escolher onde a navegação fica. */}
            <div className="p-5 border-b border-border-subtle">
              <div className="font-bold text-[14px] mb-1">Posição do menu de navegação</div>
              <p className="text-[12px] text-ink-muted mb-3">
                Vale para telas grandes. No celular a app é sempre controles em cima e destinos embaixo,
                que é o que a mão alcança.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { id: 'top' as const, icon: PanelTop, label: 'No topo' },
                  { id: 'left' as const, icon: PanelLeft, label: 'À esquerda' },
                  { id: 'right' as const, icon: PanelRight, label: 'À direita' },
                  { id: 'bottom' as const, icon: PanelBottom, label: 'Embaixo' }
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMenuPosition(opt.id)}
                    aria-pressed={menuPosition === opt.id}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 font-bold text-[12px] cursor-pointer transition-colors ${
                      menuPosition === opt.id
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-border-subtle bg-surface hover:border-accent text-ink-muted'
                    }`}
                  >
                    <opt.icon className="w-5 h-5" aria-hidden /> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Escala de texto — o MESMO estado do A-/A+ do topo, uma fonte só de verdade. */}
            <div className="p-5">
              <div className="font-bold text-[14px] mb-1">Tamanho do texto</div>
              <p className="text-[12px] text-ink-muted mb-3">
                Escala tudo de uma vez, mantendo as proporções entre título, texto e rótulo.
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'sm' as const, label: 'Compacto', px: 13 },
                  { id: 'md' as const, label: 'Padrão', px: 15 },
                  { id: 'lg' as const, label: 'Grande', px: 17 },
                  { id: 'xl' as const, label: 'Muito grande', px: 19 }
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontScale(opt.id)}
                    aria-pressed={fontScale === opt.id}
                    className={`px-4 py-2.5 rounded-xl border font-bold cursor-pointer transition-colors flex items-center gap-2 ${
                      fontScale === opt.id
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-border-subtle bg-surface hover:border-accent text-ink-muted'
                    }`}
                    style={{ fontSize: opt.px }}
                  >
                    <Type className="w-4 h-4 shrink-0" aria-hidden /> {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Desempenho e efeitos — o modo ultra leve pedido para PCs modestos, e os interruptores
            de som e de movimento. Antes só existiam como ícones no topo, sem explicação. */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Gauge className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Desempenho e efeitos</h2>
          </div>
          <div className="card-panel divide-y divide-border-subtle">
            <PrefToggle
              icon={Gauge}
              title="Modo ultra desempenho"
              description="Desliga desfoques, sombras compostas e gradientes. Para PCs modestos — o app fica mais simples e bem mais leve."
              checked={performanceMode}
              onChange={togglePerformanceMode}
              onLabel="Ativo"
              offLabel="Inativo"
            />
            <PrefToggle
              icon={Sparkles}
              title="Animações e partículas"
              description="Transições, brilhos e a poeira luminosa de fundo. Se o sistema já pede menos movimento, o app respeita isso sozinho."
              checked={animationsEnabled}
              onChange={toggleAnimations}
            />
            <PrefToggle
              icon={Volume2}
              title="Sons da interface"
              description="Cliques curtos ao navegar e ao concluir uma ação. Não afeta o áudio das gravações nem a pronúncia."
              checked={soundEnabled}
              onChange={toggleSound}
            />
          </div>
        </section>

      </PainelDeAba>

      {/* ═════════════ ONDE AS CONTAS RODAM ═════════════ */}
      <PainelDeAba id="motores" ativo={aba} className="space-y-8">

        {/* O perfil e o plano vêm ANTES do painel de motores porque é o perfil que decide o que o
            painel mostra: escolher aqui e ver o efeito logo abaixo é a ordem que a tela ensina. */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Server className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Onde as contas rodam</h2>
          </div>
          <div className="card-panel">
            <div className="p-5 border-b border-border-subtle">
              <div className="font-bold text-[14px] mb-1">Perfil de IA ativo</div>
              <p className="text-[12px] text-ink-muted mb-3">Define quais motores alimentam cada capacidade. É o mesmo perfil testado no painel abaixo.</p>
              {/* C2 — o título é um `div`, não um `<label for>`. Sem `aria-label` o leitor de
                  tela anuncia "caixa de combinação" e nada mais (axe: `select-name`, WCAG 4.1.2). */}
              <select
                aria-label="Perfil de IA ativo"
                id="settings-ai-profile"
                name="aiProfile"
                value={activeProfileId}
                onChange={(e) => void changeProfile(e.target.value)}
                className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-[13px] outline-none focus:border-accent transition-colors"
              >
                {BUILTIN_PROFILES.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.id === 'cloud-quality' && !entitlements.managedCloudStt}>
                    {p.name}{p.id === 'cloud-quality' && !entitlements.managedCloudStt ? ' — Pro' : ''}
                  </option>
                ))}
              </select>
              {!entitlements.managedCloudStt && (
                <p className="text-[11px] text-ink-faint mt-2">O perfil de nuvem gerenciada é Pro. Com a SUA chave de API (BYOK, abaixo) a nuvem é liberada em qualquer plano.</p>
              )}
            </div>
            {/* Plano do usuário — leitura: quem decide é o servidor (GET /api/me/entitlements). */}
            <div className="p-5" data-testid="settings-plano">
              <div className="font-bold text-[14px] mb-1">Plano</div>
              <p className="text-[13px] mb-1">
                Seu plano: <strong>{PLAN_LABELS[entitlements.plan]}</strong>
              </p>
              {entitlements.armazenamento && (
                <p className="text-[12px] text-ink-muted mb-2">
                  Armazenamento: {Math.round(entitlements.armazenamento.usados / 1_048_576)} MB
                  {entitlements.armazenamento.teto === null ? ' (sem teto)' : ` de ${Math.round(entitlements.armazenamento.teto / 1_048_576)} MB`}
                </p>
              )}
              <p className="text-[11px] text-ink-faint mt-2">
                Gates do plano Grátis: importação do YouTube e nuvem gerenciada viram “Pro” (com selo e explicação — nada some).
                Rodando no seu computador (self-host), tudo é liberado.
              </p>
            </div>
          </div>
        </section>

        {/* AI Engines — a matriz de capacidades e o teste ao vivo vivem aqui dentro. */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Server className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Motores de Inteligência Artificial</h2>
          </div>
          <AiEnginePanel />
        </section>

        {/* Privacy & Processing */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <Shield className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Privacidade e Processamento</h2>
          </div>
          <div className="card-panel">
            <div className="p-5 border-b border-border-subtle flex justify-between items-center">
              <div>
                <div className="font-bold text-[14px]">Processamento local por padrão</div>
                <div className="text-[12px] text-ink-muted mt-1">O perfil "Grátis/Web" e "Privado/Local" transcrevem e traduzem no dispositivo sempre que possível.</div>
              </div>
              <span className="badge-tag ok shrink-0">Ativo</span>
            </div>
            <div className="p-5 border-b border-border-subtle flex justify-between items-center">
              <div>
                <div className="font-bold text-[14px]">Sessões salvas na Biblioteca</div>
                <div className="text-[12px] text-ink-muted mt-1">As capturas ficam gravadas localmente e aparecem na sua Biblioteca.</div>
              </div>
              <span className="badge-tag ok shrink-0">Ativo</span>
            </div>
            {/* A linha "Estatísticas anônimas de uso" saiu: não existe nenhuma telemetria implementada
                no projeto (nem coleta, nem envio, nem opt-in), e "Em breve" é uma promessa de data que
                ninguém pode cumprir. Volta quando existir a feature de verdade. */}
          </div>
        </section>

        {/* A seção "Integrações de Mídia" saiu inteira (Google Calendar & Meet, Notion, Figma/FigJam):
            não existe nenhuma infraestrutura de integração com serviços externos no projeto — nem
            OAuth, nem API client, nem endpoint — e "Em breve" é uma promessa de data que ninguém pode
            cumprir. Volta quando existir a primeira integração de verdade. */}

      </PainelDeAba>

      {/* ═════════════ CONTA E RECOMEÇO ═════════════ */}
      <PainelDeAba id="conta" ativo={aba} className="space-y-8">

        {/* Conta e Segurança — só no modo com login (authRequired); no self-host não renderiza */}
        <AccountSecuritySection />

        {/* Persona — preferência salva (persistida como JSON) */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <User className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Seu Perfil de Uso</h2>
          </div>
          <div className="card-panel p-5">
            <p className="text-[13px] text-ink-muted mb-4">Ajuda a organizar o foco principal do seu uso.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPersona('idiomas')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'idiomas' ? 'active' : ''}`}>
                <Globe className="w-3.5 h-3.5" /> Idiomas
              </button>
              <button onClick={() => setPersona('fala')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'fala' ? 'active' : ''}`}>
                <Mic className="w-3.5 h-3.5" /> Fala
              </button>
              <button onClick={() => setPersona('tudo')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'tudo' ? 'active' : ''}`}>
                <Layers className="w-3.5 h-3.5" /> Tudo
              </button>
              <button onClick={() => setPersona('conteudo')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'conteudo' ? 'active' : ''}`}>
                <Video className="w-3.5 h-3.5" /> Conteúdo
              </button>
              <button onClick={() => setPersona('escrita')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'escrita' ? 'active' : ''}`}>
                <PenTool className="w-3.5 h-3.5" /> Escrita
              </button>
              <button onClick={() => setPersona('dados')} className={`kpi-pill flex items-center gap-1.5 ${ui.persona === 'dados' ? 'active' : ''}`}>
                <BarChart2 className="w-3.5 h-3.5" /> Dados
              </button>
            </div>
          </div>
        </section>

        {/* A seção "Sua Voz & Clonagem" saiu inteira: não existe nenhuma infraestrutura de clonagem de
            voz no projeto (nem modelo, nem pipeline de treino), e "Em breve" é uma promessa de data
            que ninguém pode cumprir. Volta quando existir a feature de verdade. */}

        {/* Ajuda e recomeço. "Reconfigurar" é a única linha destrutiva desta tela — fica por último,
            separada por borda, e diz o que apaga ANTES de ser clicada. */}
        <section>
          <div className="flex items-center gap-2 mb-4 text-ink">
            <PlayCircle className="w-5 h-5" />
            <h2 className="font-display font-bold text-lg">Ajuda e recomeço</h2>
          </div>
          <div className="card-panel">
            <div className="p-5 flex items-center justify-between gap-3 border-b border-border-subtle">
              <div>
                <div className="font-bold text-[14px] mb-1">Guia rápido</div>
                <p className="text-[12px] text-ink-muted">Os fluxos principais do app em uma página: capturar, importar, overlay, tutor e estudo.</p>
              </div>
              <button
                onClick={() => setShowGuide(true)}
                className="shrink-0 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
              >
                Abrir guia
              </button>
            </div>
            <div className="p-5 flex items-center justify-between gap-3 border-b border-border-subtle">
              <div>
                <div className="font-bold text-[14px] mb-1">Rever apresentação</div>
                {/* Só reabre o tour nesta sessão — não apaga a escolha local/nuvem já salva. */}
                <p className="text-[12px] text-ink-muted">Reveja a introdução do app. Não altera sua configuração atual.</p>
              </div>
              <button
                onClick={onReplayTour}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
              >
                <PlayCircle className="w-4 h-4" /> Rever apresentação
              </button>
            </div>
            <div className="p-5 flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-[14px] mb-1">Configuração inicial (local vs nuvem)</div>
                {/* "Reconfigurar" APAGA a escolha (onboarded:false no servidor) e recarrega. */}
                <p className="text-[12px] text-ink-muted">Refaça a escolha de rodar local ou usar sua chave de API. Apaga a configuração atual.</p>
              </div>
              <button
                onClick={reconfigureAi}
                className="shrink-0 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
              >
                Reconfigurar
              </button>
            </div>
          </div>
        </section>

      </PainelDeAba>

      {/* Fora dos painéis: é uma sobreposição, e some junto com a aba se ficar dentro de uma. */}
      {showGuide && <GuidePanel onClose={() => setShowGuide(false)} />}

      </div>
    </div>
  );
}
