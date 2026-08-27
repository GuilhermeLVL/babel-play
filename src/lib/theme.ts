/**
 * Fonte da verdade da aparência (tema + claro/escuro + paleta customizada).
 *
 * Duas camadas, de propósito:
 *  - `localStorage` é a camada RÁPIDA: `bootTheme()` roda antes do primeiro
 *    render (em `main.tsx`) e já pinta o `<html>`, evitando o flash de tema
 *    errado enquanto o `fetchSettings()` viaja.
 *  - `settings.ui` (servidor) é a camada DURÁVEL: sobrevive a limpar o
 *    navegador e acompanha o usuário. `hydrateTheme()` reconcilia depois.
 *
 * Escrita sempre pelos dois: `persistTheme()`.
 */
import { patchUiSettings } from '../data/api';
import {
  applyCustomColors,
  readCustomColors,
  DEFAULT_CUSTOM_COLORS,
  type CustomColors,
  type ThemeType,
} from './appearance';
import { setSoundTheme } from './soundFx';

export const THEME_KEY = 'app_theme';
export const DARK_KEY = 'theme';

export const DEFAULT_THEME: ThemeType = 'babel';

/**
 * TEM DE ESPELHAR `THEME_OPTIONS` (appearance.ts). `tests/temasOferecidos.test.ts` trava essa
 * invariante — `premium` estava OFERECIDO no seletor, tipado em `ThemeType` e com paleta
 * completa no CSS (inclusive modo escuro), mas ausente daqui: `coerceTheme()` caía no
 * `?? DEFAULT_THEME` e quem escolhesse "premium" recebia "babel", sem erro e sem aviso.
 */
const VALID_THEMES: readonly ThemeType[] = ['babel', 'linear', 'vercel', 'mochi', 'notion', 'premium', 'custom'];

/**
 * Presets mortos da versão anterior das Configurações. Eram persistidos em
 * `settings.ui.theme` mas nunca tiveram efeito visual. Mapeados para o tema
 * novo mais próximo em vez de descartados, para não ressetar quem já escolheu.
 */
const LEGACY_THEME_ALIASES: Record<string, ThemeType> = {
  rams: 'babel',
  obs: 'notion',
  brutal: 'vercel',
};

/** Normaliza qualquer string (legada ou inválida) para um `ThemeType` real. */
export function coerceTheme(value: unknown): ThemeType {
  if (typeof value !== 'string') return DEFAULT_THEME;
  if ((VALID_THEMES as readonly string[]).includes(value)) return value as ThemeType;
  return LEGACY_THEME_ALIASES[value] ?? DEFAULT_THEME;
}

export function readTheme(): ThemeType {
  try {
    return coerceTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function readDarkMode(): boolean {
  try {
    return localStorage.getItem(DARK_KEY) === 'dark';
  } catch {
    return false;
  }
}

/** Pinta o `<html>`: `data-theme` + as vars `--custom-*` quando o tema é `custom`. */
export function applyTheme(theme: ThemeType): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  // O kit sonoro acompanha o tema. Fica AQUI, no único ponto que já aplica o tema, para não
  // existir um segundo lugar capaz de dessincronizar som e paleta (ver lib/soundFx).
  setSoundTheme(theme);
  if (theme === 'custom') {
    applyCustomColors(readCustomColors());
  } else {
    // Sem isso, um painel com override `data-theme="custom"` herdaria a paleta
    // de um tema global antigo em vez de cair nos defaults do `index.css`.
    for (const k of ['canvas', 'surface', 'ink', 'accent']) {
      root.style.removeProperty(`--custom-${k}`);
    }
  }
}

/** A classe `.dark` precisa ir no `<html>` E no `<body>` — o `index.css` mira nos dois. */
export function applyDarkMode(dark: boolean): void {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
}

/**
 * Chamado UMA vez, síncrono, antes do React montar. Só toca no DOM e no
 * localStorage — nada de rede aqui, senão o flash volta.
 */
export function bootTheme(): void {
  applyTheme(readTheme());
  applyDarkMode(readDarkMode());
}

interface PersistOptions {
  theme?: ThemeType;
  darkMode?: boolean;
  customColors?: CustomColors;
}

/**
 * Escrita no servidor: acumulada e serializada.
 *
 * Motivo: `patchUiSettings` é um read-modify-write (GET + PUT). O seletor de cor
 * dispara `onChange` a cada passo do arrastar, então uma escrita direta viraria
 * dezenas de idas ao servidor — e duas em voo ao mesmo tempo se sobrescreveriam,
 * porque ambas leem o mesmo blob antigo. Aqui: junta as mudanças por 400ms e
 * encadeia o envio no anterior.
 */
const SERVER_DEBOUNCE_MS = 400;
let pendingPatch: Record<string, unknown> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

function scheduleServerPatch(patch: Record<string, unknown>): void {
  Object.assign(pendingPatch, patch);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const toSend = pendingPatch;
    pendingPatch = {};
    flushTimer = null;
    // Best-effort: a UI já refletiu a mudança; se o servidor cair, o localStorage segura.
    inFlight = inFlight
      .then(() => patchUiSettings(toSend))
      .catch(() => { /* offline, o espelho local basta */ });
  }, SERVER_DEBOUNCE_MS);
}

/**
 * Grava no localStorage e no DOM imediatamente; no servidor, com debounce.
 * O `patchUiSettings` MESCLA no blob `ui` — nunca sobrescreve
 * `onboarded`/`providerMode`/`credentialId`.
 */
export function persistTheme({ theme, darkMode, customColors }: PersistOptions): void {
  const patch: Record<string, unknown> = {};

  if (customColors) {
    applyCustomColors(customColors); // já escreve `custom_theme_colors` + as vars
    patch.customColors = customColors;
  }
  if (theme !== undefined) {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* modo privado */ }
    applyTheme(theme);
    patch.theme = theme;
  }
  if (darkMode !== undefined) {
    try { localStorage.setItem(DARK_KEY, darkMode ? 'dark' : 'light'); } catch { /* modo privado */ }
    applyDarkMode(darkMode);
    patch.darkMode = darkMode;
  }

  if (Object.keys(patch).length > 0) scheduleServerPatch(patch);
}

export interface HydratedTheme {
  theme: ThemeType;
  darkMode: boolean;
}

/**
 * Reconcilia o que veio do servidor (`settings.ui`) com o que o boot já aplicou.
 * O servidor VENCE: é a cópia durável. Devolve o estado final para o React.
 */
export function hydrateTheme(ui: Record<string, unknown> | null | undefined): HydratedTheme {
  const current: HydratedTheme = { theme: readTheme(), darkMode: readDarkMode() };
  if (!ui) return current;

  if (ui.customColors && typeof ui.customColors === 'object') {
    applyCustomColors({ ...DEFAULT_CUSTOM_COLORS, ...(ui.customColors as Partial<CustomColors>) });
  }
  if (ui.theme !== undefined) {
    current.theme = coerceTheme(ui.theme);
    try { localStorage.setItem(THEME_KEY, current.theme); } catch { /* modo privado */ }
    applyTheme(current.theme);
  }
  if (typeof ui.darkMode === 'boolean') {
    current.darkMode = ui.darkMode;
    try { localStorage.setItem(DARK_KEY, current.darkMode ? 'dark' : 'light'); } catch { /* modo privado */ }
    applyDarkMode(current.darkMode);
  }
  return current;
}
