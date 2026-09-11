import {
  AlertTriangle,
  Eye,
  Gamepad2,
  Languages,
  Palette,
  PlayCircle,
  Server,
  Shield,
  Sparkles,
  Target,
  User,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { type AppMetrics, fetchMetrics, fetchSettings, patchUiSettings, saveSettings } from '../../data/api';
import { DEFAULT_PROFILE_ID } from '../../gateway/profiles';
import type { ThemeType } from '../../lib/appearance';
import { getEntitlements, onPlanChange, PLAN_LABELS } from '../../lib/entitlements';
import { idiomasAbaixoDoPiso, t } from '../../lib/i18n';
import {
  DEFAULT_LANG_CONFIG,
  fetchLangConfig,
  idiomasDaInterfaceOferecidos,
  type LangConfig,
  langConfigFrom,
  saveLangConfig,
} from '../../lib/langConfig';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { T } from '../../lib/T';
import AiEnginePanel from '../AiEnginePanel';
import AccountSecuritySection from '../auth/AccountSecuritySection';
import GuidePanel from '../GuidePanel';
import LangPicker from '../LangPicker';
import type { FontScale } from '../shell/ControlCluster';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import { Abas, CabecalhoDeTela, PainelDeAba } from '../ui';
import LangAudit from './LangAudit';

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
  /** Abre a tela Sobre (quem fez o app). Opcional: fora da leve o App pode não passar. */
  onAbrirSobre?: () => void;
  /** Nível do jogador — a aba de aparência respeita os mesmos cadeados do painel rápido. */
  nivel?: number;
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
  /** Navegar para outra tela (o atalho "Abrir Personalizar"). */
  onChangeView: (view: string) => void;
}

/* As props de aparência/efeitos continuam no contrato (o App as passa), mas esta tela NÃO as
   edita mais — ver o bloco "Aparência" abaixo. Só o que é usado é desestruturado. */
export default function Settings({ onReplayTour, onAbrirSobre, ageProfile = 'pro', onChangeView }: SettingsProps) {
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
    () => localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID,
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
    fetchMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null));
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
        (!patch.mine || saved.mine === patch.mine) &&
        (!patch.daInterface || saved.daInterface === patch.daInterface);
      if (!landed) throw new Error('o servidor não confirmou a gravação');
      setLangCfg(saved);
    } catch {
      setLangCfg(previous); // volta ao que o SERVIDOR realmente tem
      setSaveError(t('Não foi possível salvar o idioma. Verifique a conexão com o servidor e tente de novo.'));
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
      setSaveError(t('Não foi possível salvar o perfil de IA. Verifique a conexão com o servidor e tente de novo.'));
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
      setSaveError(t('Não foi possível salvar sua preferência. Verifique a conexão com o servidor e tente de novo.'));
    }
  };

  // Refaz a configuração inicial (escolha local/nuvem + chave): limpa o flag e recarrega.
  const reconfigureAi = async () => {
    await patchUiSettings({ onboarded: false });
    window.location.reload();
  };

  const setGoal = (goal: string) => {
    void persistUi({ ...ui, goal });
  };

  /* Uma leitura só: o `GOAL_TARGETS[ui.goal]?.ppm` aparecia duas vezes (na guarda e no texto) e o
     compilador não carrega a narrowing de uma para a outra através do índice. */
  const ppmAlvo = GOAL_TARGETS[ui.goal]?.ppm ?? null;

  return (
    <div className="flex-1 overflow-y-auto w-full bg-canvas">
      <div className="p-6 md:p-10 max-w-4xl mx-auto w-full">
        {/* Cabeçalho pelo primitivo (redesign v3). A tela tinha TRÊS nomes — "Ajustes" no menu,
            "Configurações" no título, "Preferências do app" no kicker (auditoria de UX, 31/08).
            Um vocabulário: ela se chama Ajustes. */}
        <CabecalhoDeTela
          className="mb-10"
          kicker={
            <>
              {ageProfile === 'kids' ? (
                <Gamepad2 className="w-3.5 h-3.5" aria-hidden />
              ) : ageProfile === 'senior' ? (
                <Eye className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <Zap className="w-3.5 h-3.5" aria-hidden />
              )}
              <span>
                {ageProfile === 'kids'
                  ? t('Ajustes do jogador')
                  : ageProfile === 'senior'
                    ? t('Painel de opções')
                    : t('Preferências do app')}
              </span>
            </>
          }
          titulo={
            ageProfile === 'kids'
              ? t('Ajustes do jogo')
              : ageProfile === 'senior'
                ? t('Ajustes do aplicativo')
                : t('Ajustes')
          }
          subtitulo={
            ageProfile === 'kids'
              ? t('Escolha os idiomas que você quer praticar e personalize o visual do seu jogo.')
              : ageProfile === 'senior'
                ? t('Configure o idioma que você deseja aprender e altere opções de leitura de forma simples.')
                : t('Preferências de interface, processamento e integrações.')
          }
        />

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
          itens={ABAS.map((a) => ({ ...a, rotulo: t(a.rotulo) }))}
          ativo={aba}
          aoTrocar={setAba}
          rotuloDoGrupo={t('Seções dos ajustes')}
          className="mb-8"
        />

        {/* ═════════════ IDIOMAS — o que eu estudo ═════════════ */}
        <PainelDeAba id="idiomas" ativo={aba} className="space-y-8">
          <section>
            <div className="flex items-center gap-2 mb-4 text-ink">
              <Languages className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg">{t('Os dois idiomas')}</h2>
            </div>
            <div className="card-panel">
              {/* Os DOIS idiomas, com nomes que não admitem inversão: o que você fala e o que estuda.
                O "meu idioma" deixou de ser um detalhe escondido na tela de Captura, ele decide a
                DIREÇÃO da tradução de todo cartão de vocabulário. */}
              <div className="p-5 border-b border-border-subtle">
                <div className="font-bold text-[14px] mb-1">{t('Idioma que estou aprendendo')}</div>
                <p className="text-[12px] text-ink-muted mb-3">
                  {t('O idioma do áudio/texto estrangeiro. É o idioma das palavras que vão para o seu deck.')}
                </p>
                {/* Lista ÚNICA (`lib/languages`, 32 idiomas) com bandeira e busca — ver LangPicker. */}
                <LangPicker
                  id="settings-studying-lang"
                  ariaLabel={t('Idioma que estou aprendendo')}
                  block
                  value={langCfg.studying}
                  onPick={({ code }) => {
                    if (code) void changeLang({ studying: code });
                  }}
                />
              </div>
              <div className="p-5">
                <div className="font-bold text-[14px] mb-1">{t('Meu idioma')}</div>
                <p className="text-[12px] text-ink-muted mb-3">
                  {t('O idioma que você já fala, o do seu microfone e o das traduções que você lê.')}
                </p>
                <LangPicker
                  id="settings-mine-lang"
                  ariaLabel={t('Meu idioma')}
                  block
                  value={langCfg.mine}
                  onPick={({ code }) => {
                    if (code) void changeLang({ mine: code });
                  }}
                />
                {/* Aviso honesto: com os dois iguais não há o que traduzir (`mtCoverage` = 'same'). */}
                {baseLang(langCfg.mine) === baseLang(langCfg.studying) && (
                  <p className="text-[12px] text-warn-ink mt-2">
                    {t('Os dois idiomas são o mesmo, não há tradução a fazer, e os cartões ficarão sem verso.')}
                  </p>
                )}
              </div>

              {/* O TERCEIRO EIXO — a tela, que até 2026-09-07 seguia "Meu idioma" sem alternativa.
                Quem fala português e quer a interface em inglês precisava dizer que fala inglês, e
                com isso invertia a direção do microfone e da tradução de todo cartão. A lista é
                curta de propósito: só entra idioma cujo catálogo passou do piso de cobertura. */}
              <div className="p-5 border-t border-border-subtle">
                <div className="font-bold text-[14px] mb-1">{t('Idioma da interface')}</div>
                <p className="text-[12px] text-ink-muted mb-3">
                  {t('O idioma dos textos do app. Não muda o microfone nem a direção da tradução.')}
                </p>
                <LangPicker
                  id="settings-ui-lang"
                  ariaLabel={t('Idioma da interface')}
                  block
                  somente={idiomasDaInterfaceOferecidos()}
                  value={langCfg.daInterface}
                  onPick={({ code }) => {
                    if (code) void changeLang({ daInterface: code });
                  }}
                />
                {/* Dizer o que NÃO está na lista, e por quê — um seletor de dois itens sem explicação
                  parece o catálogo inteiro do produto. */}
                {idiomasAbaixoDoPiso().length > 0 && (
                  <p className="text-[11.5px] text-ink-faint mt-2">
                    {t('Traduções em andamento, ainda fora da lista: {langs}.', {
                      langs: idiomasAbaixoDoPiso()
                        .map((i) => `${langLabelNaUI(i.lang)} (${Math.round(i.cobertura * 100)}%)`)
                        .join(', '),
                    })}
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
              <h2 className="font-display font-bold text-lg">{t('Meta de Comunicação')}</h2>
            </div>
            <div className="card-panel p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => setGoal('executivo')}
                  className={`p-4 border-2 rounded-xl text-start transition-colors ${ui.goal === 'executivo' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
                >
                  <div className="font-bold text-[14px] text-ink mb-1">{t('Comunicação Executiva')}</div>
                  <p className="text-[12px] text-ink-muted mb-2">{t('Foco em concisão, clareza e ritmo pausado.')}</p>
                  <span className={`badge-tag ${GOAL_TARGETS.executivo.badgeClass}`}>
                    {t(GOAL_TARGETS.executivo.badge)}
                  </span>
                </button>
                <button
                  onClick={() => setGoal('creator')}
                  className={`p-4 border-2 rounded-xl text-start transition-colors ${ui.goal === 'creator' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
                >
                  <div className="font-bold text-[14px] text-ink mb-1">{t('Criador / YouTuber')}</div>
                  <p className="text-[12px] text-ink-muted mb-2">
                    {t('Foco em energia, retenção e vocabulário acessível.')}
                  </p>
                  <span className={`badge-tag ${GOAL_TARGETS.creator.badgeClass}`}>
                    {t(GOAL_TARGETS.creator.badge)}
                  </span>
                </button>
                <button
                  onClick={() => setGoal('tedx')}
                  className={`p-4 border-2 rounded-xl text-start transition-colors ${ui.goal === 'tedx' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
                >
                  <div className="font-bold text-[14px] text-ink mb-1">{t('Estilo Palestrante (TED)')}</div>
                  <p className="text-[12px] text-ink-muted mb-2">{t('Pausas, vocabulário raro e storytelling.')}</p>
                  <span className={`badge-tag ${GOAL_TARGETS.tedx.badgeClass}`}>{t(GOAL_TARGETS.tedx.badge)}</span>
                </button>
                <button
                  onClick={() => setGoal('tech')}
                  className={`p-4 border-2 rounded-xl text-start transition-colors ${ui.goal === 'tech' ? 'border-accent bg-accent-soft' : 'border-border-subtle bg-surface hover:border-accent'}`}
                >
                  <div className="font-bold text-[14px] text-ink mb-1">{t('Tech / Developer')}</div>
                  <p className="text-[12px] text-ink-muted mb-2">
                    {t('Inglês/Português misto, termos técnicos sem tradução.')}
                  </p>
                  <span className={`badge-tag ${GOAL_TARGETS.tech.badgeClass}`}>{t(GOAL_TARGETS.tech.badge)}</span>
                </button>
              </div>

              {/* Benchmark: alvo declarado da meta escolhida × ppm REALMENTE medido nas sessões */}
              <div className="mt-5 pt-4 border-t border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-bold text-ink flex items-center gap-2">
                    {t('Seu ritmo medido')}
                    {wpmMeasured != null && wpmLowConf && (
                      <span className="kpi-pill opacity-60 cursor-default text-[11px]">{t('estimativa')}</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-ink-muted mt-0.5">
                    {wpmMeasured != null
                      ? t('Comparado ao alvo da meta selecionada ({alvo}).', {
                          alvo: t(GOAL_TARGETS[ui.goal]?.badge ?? 'sem alvo de ppm'),
                        })
                      : t('Grave ou faça Shadowing para medir seu ritmo, ainda sem dados suficientes.')}
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="font-mono font-black text-2xl text-accent">
                    {wpmMeasured != null ? wpmMeasured : '-'}
                  </span>
                  <span className="text-[11px] font-bold text-ink-muted">{t('ppm')}</span>
                  {wpmMeasured != null && ppmAlvo != null && (
                    <span className="text-[11px] text-ink-faint font-mono ms-1">{t('/ {n} alvo', { n: ppmAlvo })}</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </PainelDeAba>

        {/* ═════════════ COMO O APP SE PARECE ═════════════ */}
        <PainelDeAba id="aparencia" ativo={aba} className="space-y-8">
          {/* CENTRALIZAÇÃO (2026-08-28): tema, perfil de exibição, posição do menu, tamanho do texto,
            som, animações e desempenho SAÍRAM daqui. Cada um tem agora UM dono: o visual inteiro
            vive em Personalizar; os interruptores de acessibilidade (texto, som, animações,
            desempenho, claro/escuro) vivem só na barra de controles, visíveis em toda tela. Dois
            controles para a mesma preferência era a confusão (e a brecha) que o dono pediu para
            remover. */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-ink">
              <Palette className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg">{t('Aparência')}</h2>
            </div>
            <div className="card-panel p-5 space-y-3">
              <p className="text-[13px] text-ink">
                <T txt="Tudo que muda a cara do app mora numa tela só: <b>Personalizar</b> (no menu). Tema e paletas, fonte, partículas, emojis, cursor, rastro, perfil de exibição, posição do menu, perfis prontos, a Loja e as conquistas." />
              </p>
              <p className="text-[12.5px] text-ink-muted">
                {t(
                  'Tamanho do texto, som, animações, modo desempenho e claro/escuro ficam nos botões da barra de controles, sempre à vista.',
                )}
              </p>
              <button onClick={() => onChangeView('loja')} className="btn-solid">
                <Sparkles className="w-4 h-4" /> {t('Abrir Personalizar')}
              </button>
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
              <h2 className="font-display font-bold text-lg">{t('Onde as contas rodam')}</h2>
            </div>
            <div className="card-panel">
              {/* UM SELETOR, UM DONO (auditoria de UX, 31/08): aqui vivia um <select> "Perfil de IA
                ativo" que escolhia A MESMA coisa que os três cartões do painel logo abaixo — dois
                controles para um estado. O painel assumiu a persistência e o gate Pro via props. */}
              {/* Plano do usuário — leitura: quem decide é o servidor (GET /api/me/entitlements). */}
              <div className="p-5" data-testid="settings-plano">
                <div className="font-bold text-[14px] mb-1">{t('Plano')}</div>
                <p className="text-[13px] mb-1">
                  <T txt="Seu plano: <b>{plano}</b>" val={{ plano: t(PLAN_LABELS[entitlements.plan]) }} />
                </p>
                {entitlements.armazenamento && (
                  <p className="text-[12px] text-ink-muted mb-2">
                    {t('Armazenamento: {n} MB', { n: Math.round(entitlements.armazenamento.usados / 1_048_576) })}
                    {entitlements.armazenamento.teto === null
                      ? ` ${t('(sem teto)')}`
                      : ` ${t('de {n} MB', { n: Math.round(entitlements.armazenamento.teto / 1_048_576) })}`}
                  </p>
                )}
                {/* DESCOBRIBILIDADE (auditoria de UX, 31/08): a tela de Planos existia e o próprio
                  dono do produto não a encontrou — ela só vivia atrás do menu do avatar. Este é o
                  primeiro dos dois caminhos visíveis (o outro está no Hub). */}
                <button onClick={() => onChangeView('planos')} className="btn-outline mt-1 mb-2">
                  {t('Ver planos e preços')}
                </button>
                <p className="text-[11px] text-ink-faint mt-2">
                  {t(
                    'No plano Grátis, a importação do YouTube e a nuvem gerenciada aparecem com o selo “Pro” — nada some, e com a SUA chave de API (BYOK, abaixo) a nuvem é liberada em qualquer plano. Rodando no seu computador (self-host), tudo é liberado.',
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* AI Engines — a matriz de capacidades e o teste ao vivo vivem aqui dentro. */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-ink">
              <Server className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg">{t('Motores de Inteligência Artificial')}</h2>
            </div>
            <AiEnginePanel
              activeId={activeProfileId}
              onSelect={(id) => void changeProfile(id)}
              bloqueados={entitlements.managedCloudStt ? [] : ['cloud-quality']}
            />
          </section>

          {/* Privacy & Processing */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-ink">
              <Shield className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg">{t('Privacidade e Processamento')}</h2>
            </div>
            <div className="card-panel">
              <div className="p-5 border-b border-border-subtle flex justify-between items-center">
                <div>
                  <div className="font-bold text-[14px]">{t('Processamento local por padrão')}</div>
                  <div className="text-[12px] text-ink-muted mt-1">
                    {t(
                      'O perfil "Grátis/Web" e "Privado/Local" transcrevem e traduzem no dispositivo sempre que possível.',
                    )}
                  </div>
                </div>
                <span className="badge-tag ok shrink-0">{t('Ativo')}</span>
              </div>
              <div className="p-5 border-b border-border-subtle flex justify-between items-center">
                <div>
                  <div className="font-bold text-[14px]">{t('Sessões salvas na Biblioteca')}</div>
                  <div className="text-[12px] text-ink-muted mt-1">
                    {t('As capturas ficam gravadas localmente e aparecem na sua Biblioteca.')}
                  </div>
                </div>
                <span className="badge-tag ok shrink-0">{t('Ativo')}</span>
              </div>
              {/* A linha "Estatísticas anônimas de uso" saiu: não existe nenhuma telemetria implementada
                no projeto (nem coleta, nem envio, nem opt-in), e "Em breve" é uma promessa de data que
                ninguém pode cumprir. Volta quando existir a feature de verdade. */}
            </div>
          </section>

          {/* A seção "Integrações de Mídia" saiu inteira (Google Calendar & Meet, Notion, Figma/FigJam):
            não existe nenhuma infraestrutura de integração com serviços externos no projeto, nem
            OAuth, nem API client, nem endpoint, e "Em breve" é uma promessa de data que ninguém pode
            cumprir. Volta quando existir a primeira integração de verdade. */}
        </PainelDeAba>

        {/* ═════════════ CONTA E RECOMEÇO ═════════════ */}
        <PainelDeAba id="conta" ativo={aba} className="space-y-8">
          {/* Conta e Segurança — só no modo com login (authRequired); no self-host não renderiza */}
          <AccountSecuritySection />

          {/* A seção "Seu Perfil de Uso" (6 botões de persona) saiu inteira: `ui.persona` não é
            lido por NENHUM outro código — era um controle que prometia "organizar o foco do seu
            uso" e não fazia nada. Mesmo critério das seções de clonagem de voz e integrações:
            controle falso não fica. O campo persistido antigo é ignorado sem erro. */}

          {/* A seção "Sua Voz & Clonagem" saiu inteira: não existe nenhuma infraestrutura de clonagem de
            voz no projeto (nem modelo, nem pipeline de treino), e "Em breve" é uma promessa de data
            que ninguém pode cumprir. Volta quando existir a feature de verdade. */}

          {/* Ajuda e recomeço. "Reconfigurar" é a única linha destrutiva desta tela — fica por último,
            separada por borda, e diz o que apaga ANTES de ser clicada. */}
          <section>
            <div className="flex items-center gap-2 mb-4 text-ink">
              <PlayCircle className="w-5 h-5" />
              <h2 className="font-display font-bold text-lg">{t('Ajuda e recomeço')}</h2>
            </div>
            <div className="card-panel">
              <div className="p-5 flex items-center justify-between gap-3 border-b border-border-subtle">
                <div>
                  <div className="font-bold text-[14px] mb-1">{t('Guia rápido')}</div>
                  <p className="text-[12px] text-ink-muted">
                    {t('Os fluxos principais do app em uma página: capturar, importar, overlay, tutor e estudo.')}
                  </p>
                </div>
                <button
                  onClick={() => setShowGuide(true)}
                  className="shrink-0 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
                >
                  {t('Abrir guia')}
                </button>
              </div>
              {onAbrirSobre && (
                <div className="p-5 flex items-center justify-between gap-3 border-b border-border-subtle">
                  <div>
                    <div className="font-bold text-[14px] mb-1">{t('Sobre o Babel Play')}</div>
                    <p className="text-[12px] text-ink-muted">
                      {t('Quem fez o app, como entrar em contato e como apoiar o projeto.')}
                    </p>
                  </div>
                  <button
                    onClick={onAbrirSobre}
                    className="shrink-0 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
                  >
                    {t('Abrir')}
                  </button>
                </div>
              )}
              <div className="p-5 flex items-center justify-between gap-3 border-b border-border-subtle">
                <div>
                  <div className="font-bold text-[14px] mb-1">{t('Rever apresentação')}</div>
                  {/* Só reabre o tour nesta sessão — não apaga a escolha local/nuvem já salva. */}
                  <p className="text-[12px] text-ink-muted">
                    {t('Reveja a introdução do app. Não altera sua configuração atual.')}
                  </p>
                </div>
                <button
                  onClick={onReplayTour}
                  className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
                >
                  <PlayCircle className="w-4 h-4" /> {t('Rever apresentação')}
                </button>
              </div>
              <div className="p-5 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-[14px] mb-1">{t('Configuração inicial (local vs nuvem)')}</div>
                  {/* "Reconfigurar" APAGA a escolha (onboarded:false no servidor) e recarrega. */}
                  <p className="text-[12px] text-ink-muted">
                    {t('Refaça a escolha de rodar local ou usar sua chave de API. Apaga a configuração atual.')}
                  </p>
                </div>
                <button
                  onClick={reconfigureAi}
                  className="shrink-0 px-4 py-2 rounded-xl border border-border-subtle bg-surface hover:border-accent text-[13px] font-bold cursor-pointer"
                >
                  {t('Reconfigurar')}
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
