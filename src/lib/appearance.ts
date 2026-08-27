/**
 * Registro de aparência: temas, paletas e presets de tamanho.
 *
 * `ThemeType` mora AQUI (e não no `Sidebar`, como no fork de design) para que o
 * tipo não dependa de um componente — `lib/theme.ts`, `EditablePanel` e o
 * `LayoutStudio` precisam dele sem arrastar a sidebar junto.
 */
export type ThemeType = 'babel' | 'linear' | 'vercel' | 'mochi' | 'notion' | 'premium' | 'custom';

/** Temas que um PAINEL isolado pode assumir (sem `custom`, que é global). */
export type PanelThemeType = Exclude<ThemeType, 'custom'>;

export interface CustomColors {
  canvas: string;
  surface: string;
  ink: string;
  accent: string;
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  canvas: '#E6E2D6',
  surface: '#F5F2EA',
  ink: '#26241F',
  accent: '#F04E23'
};

export interface ThemeOption {
  id: ThemeType;
  name: string;
  desc: string;
  // Representative swatches (light variant) for visual previews in the picker.
  swatches: { canvas: string; surface: string; accent: string; ink: string };
}

// Swatch values mirror the light-mode theme tokens defined in src/index.css.
/** Fonte global da interface. 'pixel' e a linguagem da marca (Silkscreen/VT323, jogos classicos). */
export type FonteType = 'padrao' | 'pixel';

export interface FonteOption { id: FonteType; name: string; desc: string }

export const FONTE_OPTIONS: FonteOption[] = [
  { id: 'padrao', name: 'Padrão', desc: 'A tipografia normal do app (Inter/Archivo).' },
  { id: 'pixel', name: 'Arcade (pixel)', desc: 'Estilo jogos clássicos: tudo pixelado, partículas quadradas e som 8-bits.' },
];

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'babel',
    name: 'Babel Atelier',
    desc: 'Cinza quente com acentos terracotta.',
    swatches: { canvas: '#E6E2D6', surface: '#F5F2EA', accent: '#F04E23', ink: '#26241F' }
  },
  {
    id: 'linear',
    name: 'Linear Indigo',
    desc: 'Índigo elegante, claro ou escuro.',
    swatches: { canvas: '#f9f9fb', surface: '#ffffff', accent: '#5e6ad2', ink: '#1c1d21' }
  },
  {
    id: 'vercel',
    name: 'Vercel Geist',
    desc: 'Monocromático, cantos retos e contraste.',
    swatches: { canvas: '#ffffff', surface: '#fafafa', accent: '#000000', ink: '#000000' }
  },
  {
    id: 'mochi',
    name: 'Mochi Parchment',
    desc: 'Orgânico everforest, cantos arredondados.',
    swatches: { canvas: '#f3efdf', surface: '#fdf6e3', accent: '#87c095', ink: '#2b3339' }
  },
  {
    id: 'notion',
    name: 'Notion Charcoal',
    desc: 'Minimalismo corporativo cinza e azul.',
    swatches: { canvas: '#ffffff', surface: '#f7f7f5', accent: '#2383e2', ink: '#37352f' }
  },
  {
    id: 'premium',
    name: 'Instrument Premium',
    desc: 'Dark premium: camadas profundas teal→navy, brilho e metal sutis.',
    swatches: { canvas: '#05090D', surface: '#0D1720', accent: '#2DD4BF', ink: '#E9F2F0' }
  },
  {
    id: 'custom',
    name: 'Customizado',
    desc: 'Crie sua própria paleta de cores.',
    swatches: { canvas: '#E6E2D6', surface: '#F5F2EA', accent: '#F04E23', ink: '#26241F' }
  }
];

export interface PresetPalette extends CustomColors {
  name: string;
}

export const PRESET_PALETTES: PresetPalette[] = [
  { name: 'Babel Atelier', canvas: '#E6E2D6', surface: '#F5F2EA', ink: '#26241F', accent: '#F04E23' },
  { name: 'Linear Indigo', canvas: '#08080a', surface: '#121216', ink: '#f7f8f8', accent: '#5e6ad2' },
  { name: 'Deep Emerald', canvas: '#0A120D', surface: '#112217', ink: '#ECFDF5', accent: '#10B981' },
  { name: 'Sunset Gold', canvas: '#FAF6EE', surface: '#FFFDF9', ink: '#332A15', accent: '#D97706' },
  { name: 'Nordic Frost', canvas: '#EBF1F5', surface: '#F4F8FA', ink: '#1E293B', accent: '#0EA5E9' },
  { name: 'Amethyst Night', canvas: '#0C0A14', surface: '#151122', ink: '#FAF5FF', accent: '#A855F7' }
];

// Friendly height presets for the Layout tab; power users can still set exact px.
export const SIZE_PRESETS: { label: string; value: number }[] = [
  { label: 'Compacto', value: 250 },
  { label: 'Padrão', value: 400 },
  { label: 'Amplo', value: 600 }
];

export function readCustomColors(): CustomColors {
  try {
    const saved = localStorage.getItem('custom_theme_colors');
    if (saved) return { ...DEFAULT_CUSTOM_COLORS, ...JSON.parse(saved) };
  } catch (e) {
    console.error('Error reading custom theme colors', e);
  }
  return { ...DEFAULT_CUSTOM_COLORS };
}

// Persist the palette and apply it live via the --custom-* CSS variables that
// src/index.css consumes for the `custom` theme.
export function applyCustomColors(colors: CustomColors) {
  try {
    localStorage.setItem('custom_theme_colors', JSON.stringify(colors));
  } catch (e) {
    console.error('Error saving custom theme colors', e);
  }
  const root = document.documentElement;
  root.style.setProperty('--custom-canvas', colors.canvas);
  root.style.setProperty('--custom-surface', colors.surface);
  root.style.setProperty('--custom-ink', colors.ink);
  root.style.setProperty('--custom-accent', colors.accent);

  /**
   * As variantes ESCURAS. `index.css` lê `--custom-canvas-dark`, `--custom-surface-dark` e
   * `--custom-ink-dark` no bloco `[data-theme="custom"].dark`, mas nada no projeto as escrevia —
   * então, no tema Customizado + modo escuro, a paleta escolhida pelo usuário era simplesmente
   * ignorada e a tela caía nos valores de reserva.
   *
   * Derivadas da própria escolha em vez de inventadas: o fundo escurece, a superfície fica um
   * degrau acima dele (para o cartão continuar se destacando do fundo) e o texto inverte — a
   * mesma relação que os temas de fábrica mantêm entre claro e escuro.
   */
  root.style.setProperty('--custom-canvas-dark', darken(colors.canvas, 0.82));
  root.style.setProperty('--custom-surface-dark', darken(colors.canvas, 0.72));
  root.style.setProperty('--custom-ink-dark', isDark(colors.ink) ? '#F0F6FC' : colors.ink);
}

/** Componentes RGB de um hex (#rgb ou #rrggbb). `null` quando o formato não é reconhecido. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Luminância percebida (0..1) — pondera verde acima de vermelho e azul, como o olho. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/** A cor já é escura? Usado para decidir se o texto precisa inverter no modo escuro. */
export function isDark(hex: string): boolean {
  return luminance(hex) < 0.5;
}

/** Escurece mantendo o matiz: puxa cada canal para o preto na proporção dada. */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = Math.max(0, Math.min(1, 1 - amount));
  const to2 = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}
