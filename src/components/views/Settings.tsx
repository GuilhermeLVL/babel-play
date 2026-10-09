import { Bell, Languages, Palette, Server, ShieldCheck, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { fetchSettings, saveSettings } from '../../data/api';
import { DEFAULT_PROFILE_ID } from '../../gateway/profiles';
import type { ThemeType } from '../../lib/appearance';
import { getEntitlements, onPlanChange } from '../../lib/entitlements';
import { t } from '../../lib/i18n';
import {
  DEFAULT_LANG_CONFIG,
  fetchLangConfig,
  type LangConfig,
  langConfigFrom,
  saveLangConfig,
} from '../../lib/langConfig';
import type { AgeProfileType, FontScale, MenuPositionType } from '../shell/navItems';
import { toast } from '../Toast';
import AjustesDoQuest from './ajustes/quest/AjustesDoQuest';

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
  // A apresentação é `AjustesDoQuest`; o estado e a gravação são estes.
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

  const sobrancelha =
    ageProfile === 'kids'
      ? t('Ajustes do jogador')
      : ageProfile === 'senior'
        ? t('Painel de opções')
        : t('Preferências do app');
  const titulo =
    ageProfile === 'kids' ? t('Ajustes do jogo') : ageProfile === 'senior' ? t('Ajustes do aplicativo') : t('Ajustes');

  /* QUEST: as mesmas seis abas e os mesmos ajustes, no desenho do headset (`AjustesDoQuest`). */
  return (
    <AjustesDoQuest
      sobrancelha={sobrancelha}
      titulo={titulo}
      abas={ABAS.map((a) => ({ ...a, rotulo: t(a.rotulo) }))}
      aba={aba}
      aoTrocarAba={setAba}
      erro={saveError}
      idiomas={langCfg}
      aoMudarIdioma={(mudanca) => void changeLang(mudanca)}
      escuro={darkMode}
      aoEscolherEscuro={(escuro) => definirEscuro(escuro, darkMode, setDarkMode)}
      tamanhos={TAMANHOS}
      fontScale={fontScale}
      setFontScale={setFontScale}
      animationsEnabled={animationsEnabled}
      toggleAnimations={toggleAnimations}
      soundEnabled={soundEnabled}
      toggleSound={toggleSound}
      performanceMode={performanceMode}
      togglePerformanceMode={togglePerformanceMode}
      perfilDeIa={activeProfileId}
      aoMudarPerfilDeIa={(id) => void changeProfile(id)}
      perfisBloqueados={entitlements.managedCloudStt ? [] : ['cloud-quality']}
      onReplayTour={onReplayTour}
    />
  );
}
