import {
  AlertTriangle,
  Bell,
  Eye,
  Gamepad2,
  Languages,
  Moon,
  Palette,
  Server,
  ShieldCheck,
  Sun,
  User,
  Zap,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';

import { fetchSettings, saveSettings } from '../../data/api';
import { DEFAULT_PROFILE_ID } from '../../gateway/profiles';
import type { ThemeType } from '../../lib/appearance';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';
import { idiomasAbaixoDoPiso, t } from '../../lib/i18n';
import { irPara } from '../../lib/irPara';
import {
  DEFAULT_LANG_CONFIG,
  fetchLangConfig,
  idiomasDaInterfaceOferecidos,
  type LangConfig,
  langConfigFrom,
  saveLangConfig,
} from '../../lib/langConfig';
import { baseLang, langLabelNaUI } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import AiEnginePanel from '../AiEnginePanel';
import LangPicker from '../LangPicker';
import type { FontScale } from '../shell/ControlCluster';
import type { AgeProfileType, MenuPositionType } from '../shell/navItems';
import { toast } from '../Toast';
import { Abas, CabecalhoDeTela, IconeEmBloco, PainelDeAba, Tela, TituloDeSecao } from '../ui';
import AbaConta from './ajustes/AbaConta';
import AbaNotificacoes from './ajustes/AbaNotificacoes';
import AbaPrivacidade from './ajustes/AbaPrivacidade';
import { Linha } from './ajustes/Linha';
import LangAudit from './LangAudit';

/* O painel da Tradução Nuance (D6 da Fase D): registro padrão, variantes e glossário, por `import()`. */
const PainelDaNuance = lazyComRecarga(() => import('./ajustes/PainelDaNuance'));

/**
 * AJUSTES — idêntico ao protótipo aprovado (`T.ajustes` + override em
 * `docs/prototipos/consistencia-telas.html`): seis abas — Idiomas · Aparência · Notificações ·
 * Processamento · Privacidade · Conta —, linhas `.ajuste` dentro de `.cartao`, `.seg` para escolhas
 * curtas e `.interruptor` para ligar/desligar.
 *
 * Cada aba grande mora no seu arquivo (`views/ajustes/*`). As preferências novas (avisos,
 * consentimentos, formato da cópia) são guardadas por `lib/preferencias` no blob `settings.ui`, o
 * mesmo caminho do idioma e da apresentação.
 */
export const ABAS_DOS_AJUSTES = ['idiomas', 'aparencia', 'notificacoes', 'contas', 'privacidade', 'conta'] as const;
export type AbaDosAjustes = (typeof ABAS_DOS_AJUSTES)[number];

const ABAS = [
  { id: 'idiomas', rotulo: 'Idiomas', icone: <Languages aria-hidden /> },
  { id: 'aparencia', rotulo: 'Aparência', icone: <Palette aria-hidden /> },
  { id: 'notificacoes', rotulo: 'Notificações', icone: <Bell aria-hidden /> },
  { id: 'contas', rotulo: 'Processamento', icone: <Server aria-hidden /> },
  { id: 'privacidade', rotulo: 'Privacidade', icone: <ShieldCheck aria-hidden /> },
  { id: 'conta', rotulo: 'Conta', icone: <User aria-hidden /> },
];

const PROFILE_STORAGE_KEY = 'babel.activeProfileId';

/** Tamanho do texto: os três degraus do protótipo (o "muito grande" continua no botão A da barra). */
const TAMANHOS: [FontScale, string, string][] = [
  ['sm', 'P', 'Pequeno'],
  ['md', 'M', 'Médio'],
  ['lg', 'G', 'Grande'],
];

interface SettingsProps {
  theme: ThemeType;
  darkMode: boolean;
  /** Troca claro/escuro. Sem ele, o seletor aciona o botão da barra de controles (o dono atual). */
  setDarkMode?: (escuro: boolean) => void;
  onOpenStudio: () => void;
  /** Reabre a apresentação só na sessão atual (não apaga a escolha de IA). */
  onReplayTour: () => void;
  /** Mantido por compatibilidade: o Sobre saiu dos Ajustes (fica no menu), como no protótipo. */
  onAbrirSobre?: () => void;
  /** Aba em que a tela abre ("Som, animações" → aparencia; "Preferências" do sino → notificacoes). */
  abaInicial?: string | null;
  nivel?: number;
  ageProfile?: AgeProfileType;
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
  onChangeView: (view: string) => void;
}

/**
 * CLARO/ESCURO. Se o App passar `setDarkMode`, é ele; senão o seletor aciona o mesmo botão da barra
 * de controles, que é o dono da preferência (localStorage + servidor).
 */
function definirEscuro(querEscuro: boolean, atual: boolean, setDarkMode?: (v: boolean) => void) {
  if (querEscuro === atual) return;
  if (setDarkMode) return setDarkMode(querEscuro);
  const alvo = document.querySelector<HTMLButtonElement>(
    `button[title="${querEscuro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}"], button[aria-label="${
      querEscuro ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'
    }"]`,
  );
  if (alvo) alvo.click();
  else toast.warn(t('Use o botão de claro/escuro na barra de controles.'));
}

const abaValida = (a: string | null | undefined): AbaDosAjustes | null =>
  a && (ABAS_DOS_AJUSTES as readonly string[]).includes(a) ? (a as AbaDosAjustes) : null;

export default function Settings({
  darkMode,
  setDarkMode,
  onReplayTour,
  abaInicial,
  ageProfile = 'pro',
  fontScale,
  setFontScale,
  animationsEnabled,
  toggleAnimations,
  soundEnabled,
  toggleSound,
  performanceMode,
  togglePerformanceMode,
}: SettingsProps) {
  const [langCfg, setLangCfg] = useState<LangConfig>(DEFAULT_LANG_CONFIG);
  const [activeProfileId, setActiveProfileId] = useState<string>(
    () => localStorage.getItem(PROFILE_STORAGE_KEY) ?? DEFAULT_PROFILE_ID,
  );
  const [entitlements, setEntitlements] = useState(() => getEntitlements());
  useEffect(() => onPlanChange(() => setEntitlements(getEntitlements())), []);
  const [aba, setAba] = useState<string>(abaValida(abaInicial) ?? 'idiomas');
  useEffect(() => {
    const a = abaValida(abaInicial);
    if (a) setAba(a);
  }, [abaInicial]);
  const loaded = useRef(false);

  /** Erro REAL de gravação: a UI volta ao valor do servidor e diz o que houve. */
  const [saveError, setSaveError] = useState<string | null>(null);

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
        localStorage.setItem(PROFILE_STORAGE_KEY, s.activeProfileId);
      }
      let uiBlob: Record<string, unknown> = {};
      if (s.ui) {
        try {
          uiBlob = JSON.parse(s.ui) as Record<string, unknown>;
        } catch {
          /* ui inválido — ignora */
        }
      }
      setLangCfg(langConfigFrom(uiBlob, s.targetLanguage));
      loaded.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Grava um dos idiomas e CONFIRMA relendo do servidor (a API devolve `null` em vez de lançar). */
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
      setLangCfg(previous);
      setSaveError(t('Não foi possível salvar o idioma. Verifique a conexão com o servidor e tente de novo.'));
    }
  };

  const changeProfile = async (id: string) => {
    const previous = activeProfileId;
    setActiveProfileId(id);
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
    setSaveError(null);
    const saved = await saveSettings({ activeProfileId: id });
    if (!saved) {
      setActiveProfileId(previous);
      localStorage.setItem(PROFILE_STORAGE_KEY, previous);
      setSaveError(t('Não foi possível salvar o perfil de IA. Verifique a conexão com o servidor e tente de novo.'));
    }
  };

  return (
    <Tela largura="estreita">
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
              : 'Idiomas, aparência, avisos, privacidade e a sua conta.'
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
            <div className="ajuste">
              <h3>{t('Idioma que estou aprendendo')}</h3>
              <p className="mut">
                {t('O idioma do áudio ou texto estrangeiro. É o idioma das palavras que vão para o seu deck.')}
              </p>
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
              {baseLang(langCfg.mine) === baseLang(langCfg.studying) && (
                <p className="mut" style={{ color: 'var(--warn-ink)', marginTop: 8, marginBottom: 0 }}>
                  {t('Os dois idiomas são o mesmo, não há tradução a fazer, e os cartões ficarão sem verso.')}
                </p>
              )}
            </div>
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

        {/* O convite ao Premium é promocional: o perfil protegido não o recebe. */}
        <Suspense fallback={null}>
          <PainelDaNuance aoConhecer={perfilProtegido() ? undefined : () => irPara({ view: 'planos' })} />
        </Suspense>

        <LangAudit />
      </PainelDeAba>

      {/* ═════════════ APARÊNCIA ═════════════ */}
      <PainelDeAba id="aparencia" ativo={aba}>
        <section>
          <TituloDeSecao icone={Palette} titulo={t('Como o app se parece')} />
          <div className="cartao">
            <Linha titulo={t('Tema')} desc={t('Claro ou escuro. O tema de cores você troca em Personalizar.')}>
              <div className="seg" role="group" aria-label={t('Tema')}>
                <button
                  type="button"
                  aria-pressed={!darkMode}
                  onClick={() => definirEscuro(false, darkMode, setDarkMode)}
                >
                  <Sun aria-hidden style={{ width: 14, height: 14 }} /> {t('Claro')}
                </button>
                <button
                  type="button"
                  aria-pressed={darkMode}
                  onClick={() => definirEscuro(true, darkMode, setDarkMode)}
                >
                  <Moon aria-hidden style={{ width: 14, height: 14 }} /> {t('Escuro')}
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
            {/* Fora do protótipo, de propósito: sem estas duas linhas o som do app só se ligaria pela
                pausa de um jogo, e o modo desempenho (partículas e efeitos pesados desligados) ficaria
                sem controle nenhum — o antigo popover "Som, animações e desempenho" saiu do rodapé. */}
            <Linha titulo={t('Sons')} desc={t('Efeitos sonoros dos jogos e das conquistas.')}>
              <label className="check">
                <input type="checkbox" checked={soundEnabled} onChange={toggleSound} /> {t('Ligados')}
              </label>
            </Linha>
            <Linha
              titulo={t('Modo desempenho')}
              desc={t(
                'Menos efeitos visuais. Liga sozinho no Meta Quest, em celulares mais simples e com "reduzir movimento" do sistema; a sua escolha aqui vale mais.',
              )}
            >
              <label className="check">
                <input type="checkbox" checked={performanceMode} onChange={togglePerformanceMode} /> {t('Ligado')}
              </label>
            </Linha>
          </div>
        </section>
      </PainelDeAba>

      {/* ═════════════ NOTIFICAÇÕES ═════════════ */}
      <PainelDeAba id="notificacoes" ativo={aba}>
        <AbaNotificacoes />
      </PainelDeAba>

      {/* ═════════════ PROCESSAMENTO ═════════════ */}
      <PainelDeAba id="contas" ativo={aba}>
        <AiEnginePanel
          activeId={activeProfileId}
          onSelect={(id) => void changeProfile(id)}
          bloqueados={entitlements.managedCloudStt ? [] : ['cloud-quality']}
        />
      </PainelDeAba>

      {/* ═════════════ PRIVACIDADE ═════════════ */}
      <PainelDeAba id="privacidade" ativo={aba}>
        <AbaPrivacidade />
      </PainelDeAba>

      {/* ═════════════ CONTA ═════════════ */}
      <PainelDeAba id="conta" ativo={aba}>
        <AbaConta onReplayTour={onReplayTour} aoIrParaPrivacidade={() => setAba('privacidade')} />
      </PainelDeAba>
    </Tela>
  );
}
