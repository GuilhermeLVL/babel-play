import {
  AlertTriangle,
  BookOpen,
  Check,
  CreditCard,
  Database,
  Download,
  Eye,
  Gamepad2,
  Info,
  Languages,
  Loader2,
  Moon,
  Palette,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  User,
  Wrench,
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
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import LangAudit from './LangAudit';
import { baixarMeusDados } from './perfil/AbaDados';

/**
 * AJUSTES — na forma do protótipo aprovado (`T.ajustes` em `docs/prototipos/consistencia-telas.html`):
 * abas Idiomas · Aparência · Processamento · Privacidade · Conta, linhas `.ajuste` dentro de
 * `.cartao`, `.seg` para escolhas curtas.
 *
 * O QUE DO PROTÓTIPO FICOU DE FORA, e por quê: a aba Notificações (o app não envia lembrete,
 * e-mail nem push), os consentimentos de Privacidade (não existe telemetria nem uso de trechos
 * para treino), e em Conta a troca de e-mail, aparelhos conectados, atividade recente e a zona de
 * exclusão (a exclusão real, com a palavra digitada, vive em Perfil → Seus dados). Um controle
 * que não faz nada não entra. Senha, 2FA e sair continuam no `AccountSecuritySection`, que só
 * existe no modo com login.
 *
 * O QUE DO APP O PROTÓTIPO NÃO DESENHA e ficou, discreto: a auditoria de idioma completa, a meta de
 * comunicação com o ritmo medido, o plano atual, os perfis de IA com o teste ao vivo, o guia, o
 * Sobre e o "Reconfigurar".
 */
const ABAS = [
  { id: 'idiomas', rotulo: 'Idiomas', icone: <Languages aria-hidden /> },
  { id: 'aparencia', rotulo: 'Aparência', icone: <Palette aria-hidden /> },
  { id: 'contas', rotulo: 'Processamento', icone: <Server aria-hidden /> },
  { id: 'privacidade', rotulo: 'Privacidade', icone: <ShieldCheck aria-hidden /> },
  { id: 'conta', rotulo: 'Conta', icone: <User aria-hidden /> },
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

const METAS: { id: string; titulo: string; desc: string }[] = [
  { id: 'executivo', titulo: 'Comunicação Executiva', desc: 'Foco em concisão, clareza e ritmo pausado.' },
  { id: 'creator', titulo: 'Criador / YouTuber', desc: 'Foco em energia, retenção e vocabulário acessível.' },
  { id: 'tedx', titulo: 'Estilo Palestrante (TED)', desc: 'Pausas, vocabulário raro e storytelling.' },
  { id: 'tech', titulo: 'Tech / Developer', desc: 'Inglês/Português misto, termos técnicos sem tradução.' },
];

/** Tamanho do texto: as quatro escalas reais do app (o protótipo desenha três). */
const TAMANHOS: [FontScale, string, string][] = [
  ['sm', 'P', 'Pequeno'],
  ['md', 'M', 'Médio'],
  ['lg', 'G', 'Grande'],
  ['xl', 'GG', 'Muito grande'],
];

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
  // desta view.
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

/**
 * CLARO/ESCURO SEM UM SEGUNDO DONO. O estado vive no App (`useAparencia`) e esta tela não recebe o
 * setter — só `darkMode`. Em vez de duplicar a gravação (localStorage + servidor), o seletor aciona
 * o mesmo botão da barra de controles, que é o dono da preferência.
 */
function definirEscuro(querEscuro: boolean, atual: boolean) {
  if (querEscuro === atual) return;
  const alvo = document.querySelector<HTMLButtonElement>(
    `button[title="${querEscuro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}"]`,
  );
  if (alvo) alvo.click();
  else toast.warn(t('Use o botão de claro/escuro na barra de controles.'));
}

/** Uma linha `.ajuste` com o texto à esquerda e o controle à direita (marcação do protótipo). */
function Linha({
  titulo,
  desc,
  children,
}: {
  titulo: React.ReactNode;
  desc: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="ajuste ajuste-l">
      <div>
        <h3>{titulo}</h3>
        <p className="mut">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export default function Settings({
  darkMode,
  onReplayTour,
  onAbrirSobre,
  ageProfile = 'pro',
  onChangeView,
  fontScale,
  setFontScale,
  animationsEnabled,
  toggleAnimations,
}: SettingsProps) {
  /**
   * Idiomas do usuário — a configuração REAL, lida e escrita por `lib/langConfig`.
   * `targetLanguage` é a fonte autoritativa de `studying`, e `saveLangConfig` mantém a Captura em
   * sincronia.
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
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState('');
  const loaded = useRef(false);

  /**
   * Erro REAL de gravação. Se a chamada falhar, a UI VOLTA ao valor do servidor e diz o que houve.
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
   * Grava um dos idiomas e CONFIRMA que a gravação valeu: a camada de API devolve `null` em vez de
   * LANÇAR quando a rede falha, então relemos a configuração do servidor.
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

  async function exportar() {
    setExportando(true);
    setErroExport('');
    const ok = await baixarMeusDados();
    setExportando(false);
    if (!ok) setErroExport(t('Não consegui gerar o arquivo agora. Tente de novo em instantes.'));
  }

  const ppmAlvo = GOAL_TARGETS[ui.goal]?.ppm ?? null;

  return (
    <Tela largura="estreita">
      {/* A tela tinha TRÊS nomes — "Ajustes" no menu, "Configurações" no título, "Preferências do app"
          no kicker (auditoria de UX, 31/08). Um vocabulário: ela se chama Ajustes. */}
      <CabecalhoDeTela
        icone={ageProfile === 'kids' ? Gamepad2 : ageProfile === 'senior' ? Eye : Zap}
        sobrancelha={
          ageProfile === 'kids'
            ? t('Ajustes do jogador')
            : ageProfile === 'senior'
              ? t('Painel de opções')
              : t('Preferências do app')
        }
        titulo={
          ageProfile === 'kids'
            ? t('Ajustes do jogo')
            : ageProfile === 'senior'
              ? t('Ajustes do aplicativo')
              : t('Ajustes')
        }
        sub={
          ageProfile === 'kids'
            ? t('Escolha os idiomas que você quer praticar e personalize o visual do seu jogo.')
            : ageProfile === 'senior'
              ? t('Configure o idioma que você deseja aprender e altere opções de leitura de forma simples.')
              : t('Idiomas, aparência, privacidade e a sua conta.')
        }
        abas={
          <Abas
            itens={ABAS.map((a) => ({ ...a, rotulo: t(a.rotulo) }))}
            ativo={aba}
            aoTrocar={setAba}
            rotuloDoGrupo={t('Seções dos ajustes')}
          />
        }
      />

      {/* Erro HONESTO de gravação — o valor exibido volta ao do servidor, e o usuário sabe por quê. */}
      {saveError && (
        <div role="status" className="cartao p5 linha" style={{ gap: 12, marginBottom: 24 }}>
          <IconeEmBloco icone={AlertTriangle} tom="warn" />
          <span style={{ fontSize: 13 }}>{saveError}</span>
        </div>
      )}

      {/* ═════════════ IDIOMAS ═════════════ */}
      <PainelDeAba id="idiomas" ativo={aba}>
        <section>
          <TituloDeSecao icone={Languages} titulo={t('Os dois idiomas')} />
          <div className="cartao">
            {/* Os DOIS idiomas, com nomes que não admitem inversão: o que você fala e o que estuda.
                O "meu idioma" decide a DIREÇÃO da tradução de todo cartão de vocabulário. */}
            <div className="ajuste">
              <h3>{t('Idioma que estou aprendendo')}</h3>
              <p className="mut">
                {t('O idioma do áudio ou texto estrangeiro. É o idioma das palavras que vão para o seu deck.')}
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
            <div className="ajuste">
              <h3>{t('Meu idioma')}</h3>
              <p className="mut">{t('O que você já fala: o do seu microfone e o das traduções que você lê.')}</p>
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
                <p className="mut" style={{ color: 'var(--warn-ink)', marginTop: 8, marginBottom: 0 }}>
                  {t('Os dois idiomas são o mesmo, não há tradução a fazer, e os cartões ficarão sem verso.')}
                </p>
              )}
            </div>
            {/* O TERCEIRO EIXO — a tela. Só entra idioma cujo catálogo passou do piso de cobertura. */}
            <div className="ajuste">
              <h3>{t('Idioma da interface')}</h3>
              <p className="mut">{t('O idioma dos textos do app. Não muda o microfone nem a direção da tradução.')}</p>
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
              {/* Dizer o que NÃO está na lista, e por quê. */}
              {idiomasAbaixoDoPiso().length > 0 && (
                <p className="mut" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
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

        {/* Auditoria de idioma — depende dos seletores acima: o par proposto vem de `mine`/`studying`. */}
        <LangAudit />

        {/* Meta de comunicação — do app, não do protótipo: guarda o alvo e compara com o ritmo MEDIDO. */}
        <section className="secao">
          <TituloDeSecao
            icone={Target}
            titulo={t('Meta de Comunicação')}
            desc={t('O alvo com que o seu ritmo medido é comparado.')}
          />
          <div className="cartao">
            <div className="ajuste ajuste-l">
              <div>
                <h3>{t('Meta')}</h3>
                <p className="mut">{t(METAS.find((m) => m.id === ui.goal)?.desc ?? '')}</p>
              </div>
              <span className="linha" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${GOAL_TARGETS[ui.goal]?.badgeClass ?? 'neu'}`}>
                  {t(GOAL_TARGETS[ui.goal]?.badge ?? 'sem alvo de ppm')}
                </span>
                <select
                  className="campo"
                  style={{ width: 'auto' }}
                  aria-label={t('Meta de Comunicação')}
                  value={ui.goal}
                  onChange={(e) => setGoal(e.target.value)}
                >
                  {METAS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t(m.titulo)}
                    </option>
                  ))}
                </select>
              </span>
            </div>
            {/* Benchmark: alvo declarado da meta escolhida × ppm REALMENTE medido nas sessões */}
            <Linha
              titulo={
                <>
                  {t('Seu ritmo medido')}{' '}
                  {wpmMeasured != null && wpmLowConf && <span className="badge neu">{t('estimativa')}</span>}
                </>
              }
              desc={
                wpmMeasured != null
                  ? t('Comparado ao alvo da meta selecionada ({alvo}).', {
                      alvo: t(GOAL_TARGETS[ui.goal]?.badge ?? 'sem alvo de ppm'),
                    })
                  : t('Grave ou faça Shadowing para medir seu ritmo, ainda sem dados suficientes.')
              }
            >
              <span className="linha" style={{ alignItems: 'baseline', gap: 6 }}>
                <b className="tn" style={{ font: '900 24px var(--font-display)', color: 'var(--accent-ink)' }}>
                  {wpmMeasured != null ? wpmMeasured : '-'}
                </b>
                <span className="mut">{t('ppm')}</span>
                {wpmMeasured != null && ppmAlvo != null && (
                  <span className="mut tn">{t('/ {n} alvo', { n: ppmAlvo })}</span>
                )}
              </span>
            </Linha>
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ APARÊNCIA ═════════════ */}
      <PainelDeAba id="aparencia" ativo={aba}>
        <section>
          <TituloDeSecao icone={Palette} titulo={t('Como o app se parece')} />
          <div className="cartao">
            <Linha titulo={t('Tema')} desc={t('Claro ou escuro. O tema de cores você troca em Personalizar.')}>
              <div className="seg" role="group" aria-label={t('Tema')}>
                <button type="button" aria-pressed={!darkMode} onClick={() => definirEscuro(false, darkMode)}>
                  <Sun aria-hidden style={{ display: 'inline', width: 14, height: 14, verticalAlign: -2 }} />{' '}
                  {t('Claro')}
                </button>
                <button type="button" aria-pressed={darkMode} onClick={() => definirEscuro(true, darkMode)}>
                  <Moon aria-hidden style={{ display: 'inline', width: 14, height: 14, verticalAlign: -2 }} />{' '}
                  {t('Escuro')}
                </button>
              </div>
            </Linha>
            <Linha titulo={t('Tamanho do texto')} desc={t('Vale para o app inteiro.')}>
              <div className="seg" role="group" aria-label={t('Tamanho do texto')}>
                {TAMANHOS.map(([id, rotulo, nome]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={fontScale === id}
                    aria-label={t(nome)}
                    onClick={() => setFontScale(id)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </Linha>
            <Linha titulo={t('Reduzir movimento')} desc={t('Desliga partículas e animações.')}>
              <label className="check">
                <input type="checkbox" checked={!animationsEnabled} onChange={toggleAnimations} /> {t('Reduzir')}
              </label>
            </Linha>
            {/* Tudo o mais que muda a cara do app mora em Personalizar — um dono por preferência. */}
            <Linha
              titulo={t('Tema de cores, fonte e efeitos')}
              desc={
                <T txt="Paletas, partículas, cursor, posição do menu e perfis prontos ficam em <b>Personalizar</b>." />
              }
            >
              <button type="button" onClick={() => onChangeView('loja')} className="btn btn-outline">
                <Sparkles aria-hidden /> {t('Abrir Personalizar')}
              </button>
            </Linha>
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ PROCESSAMENTO ═════════════ */}
      <PainelDeAba id="contas" ativo={aba}>
        {/* UM SELETOR, UM DONO: o painel de perfis é o único controle; aqui ele recebe a
            persistência e o gate Pro. */}
        <AiEnginePanel
          activeId={activeProfileId}
          onSelect={(id) => void changeProfile(id)}
          bloqueados={entitlements.managedCloudStt ? [] : ['cloud-quality']}
        />

        {/* Plano do usuário — leitura: quem decide é o servidor (GET /api/me/entitlements). */}
        <section className="secao">
          <TituloDeSecao icone={CreditCard} titulo={t('Seu plano')} />
          <div className="cartao" data-testid="settings-plano">
            <Linha
              titulo={<T txt="Seu plano: <b>{plano}</b>" val={{ plano: t(PLAN_LABELS[entitlements.plan]) }} />}
              desc={
                entitlements.armazenamento
                  ? `${t('Armazenamento: {n} MB', { n: Math.round(entitlements.armazenamento.usados / 1_048_576) })}${
                      entitlements.armazenamento.teto === null
                        ? ` ${t('(sem teto)')}`
                        : ` ${t('de {n} MB', { n: Math.round(entitlements.armazenamento.teto / 1_048_576) })}`
                    }`
                  : t(
                      'Com a SUA chave de API (BYOK) a nuvem é liberada em qualquer plano. Rodando no seu computador (self-host), tudo é liberado.',
                    )
              }
            >
              {/* DESCOBRIBILIDADE (auditoria de UX, 31/08): um dos caminhos visíveis até Planos. */}
              <button type="button" onClick={() => onChangeView('planos')} className="btn btn-outline">
                {t('Ver planos e preços')}
              </button>
            </Linha>
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ PRIVACIDADE ═════════════ */}
      <PainelDeAba id="privacidade" ativo={aba}>
        {/* LGPD art. 18, V: a mesma exportação de Perfil → Seus dados (`GET /api/me/exportar`). */}
        <section>
          <TituloDeSecao
            icone={Download}
            titulo={t('Baixar os seus dados')}
            desc={t(
              'Uma cópia de tudo o que o app guarda sobre você: perfil, sessões, transcrições, vocabulário e histórico de revisão.',
            )}
          />
          <div className="cartao p5">
            <div className="linha" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" onClick={() => void exportar()} disabled={exportando}>
                {exportando ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}{' '}
                {exportando ? t('Preparando…') : t('Baixar meus dados')}
              </button>
              <span className="mut" style={{ fontSize: 12.5 }}>
                {t('Arquivo JSON. Chaves de API saem só como registro de que existem, nunca o valor.')}
              </span>
            </div>
            {erroExport && (
              <p role="alert" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--error-ink)' }}>
                {erroExport}
              </p>
            )}
          </div>
        </section>

        <section className="secao">
          <TituloDeSecao
            icone={Database}
            titulo={t('Onde ficam')}
            desc={t('O que roda e o que fica guardado, do jeito que o app faz hoje.')}
          />
          <div className="cartao p5">
            <ul className="lista-check">
              {[
                t(
                  'Processamento local por padrão: os perfis "Grátis/Web" e "Privado/Local" transcrevem e traduzem no dispositivo sempre que possível.',
                ),
                t('Sessões salvas na Biblioteca: as capturas ficam gravadas localmente.'),
                t('Chave de IA (se usar): cifrada no servidor, nunca volta ao navegador.'),
              ].map((x) => (
                <li key={x}>
                  <Check aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ CONTA ═════════════ */}
      <PainelDeAba id="conta" ativo={aba}>
        {/* Senha, 2FA e sair — só no modo com login (authRequired); no self-host não renderiza. */}
        <AccountSecuritySection />

        <section className="secao">
          <TituloDeSecao icone={RotateCcw} titulo={t('Recomeçar')} />
          <div className="cartao">
            <Linha
              titulo={t('Rever a apresentação')}
              desc={t('Os passos do primeiro uso, de novo. Não altera sua configuração atual.')}
            >
              {/* Só reabre o tour nesta sessão — não apaga a escolha local/nuvem já salva. */}
              <button type="button" onClick={onReplayTour} className="btn btn-outline peq">
                <RotateCcw aria-hidden /> {t('Rever')}
              </button>
            </Linha>
            <Linha
              titulo={t('Guia rápido')}
              desc={t('Os fluxos principais do app em uma página: capturar, importar, overlay, tutor e estudo.')}
            >
              <button type="button" onClick={() => setShowGuide(true)} className="btn btn-outline peq">
                <BookOpen aria-hidden /> {t('Abrir guia')}
              </button>
            </Linha>
            {onAbrirSobre && (
              <Linha
                titulo={t('Sobre o Babel Play')}
                desc={t('Quem fez o app, como entrar em contato e como apoiar o projeto.')}
              >
                <button type="button" onClick={onAbrirSobre} className="btn btn-outline peq">
                  <Info aria-hidden /> {t('Abrir')}
                </button>
              </Linha>
            )}
            {/* "Reconfigurar" APAGA a escolha (onboarded:false no servidor) e recarrega — por isso por
                último, dizendo o que apaga ANTES de ser clicado. */}
            <Linha
              titulo={t('Configuração inicial (local vs nuvem)')}
              desc={t('Refaça a escolha de rodar local ou usar sua chave de API. Apaga a configuração atual.')}
            >
              <button type="button" onClick={() => void reconfigureAi()} className="btn btn-outline peq">
                <Wrench aria-hidden /> {t('Reconfigurar')}
              </button>
            </Linha>
          </div>
        </section>
      </PainelDeAba>

      {/* Fora dos painéis: é uma sobreposição, e some junto com a aba se ficar dentro de uma. */}
      {showGuide && <GuidePanel onClose={() => setShowGuide(false)} />}
    </Tela>
  );
}
