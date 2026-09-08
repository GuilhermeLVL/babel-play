/**
 * Registro de aparência: temas, paletas e presets de tamanho.
 *
 * `ThemeType` mora AQUI (e não no `Sidebar`, como no fork de design) para que o
 * tipo não dependa de um componente — `lib/theme.ts`, `EditablePanel` e o
 * `LayoutStudio` precisam dele sem arrastar a sidebar junto.
 */
/* `aurora` é o tema EXCLUSIVO de conquista (economia v2): não está no catálogo de níveis nem tem
   preço; só quem fez a conquista "Constante" (30 dias seguidos) consegue equipar. */
export type ThemeType = 'babel' | 'linear' | 'vercel' | 'mochi' | 'notion' | 'premium' | 'aurora' | 'custom';


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
/**
 * FONTE GLOBAL DA INTERFACE. Oito famílias, e cada uma existe porque muda a SENSAÇÃO de estudar.
 *
 * A DESCRIÇÃO CITA AS FAMÍLIAS REAIS, e isso é uma regra e não um estilo de escrita: as pilhas
 * estão em `index.css` (`[data-fonte=…]`), e a cópia tem de dizer o que de fato vai desenhar a
 * tela. A versão que veio da bancada citava Garamond, Kalam e Bebas Neue — três fontes que nenhum
 * `@import` carrega. Prometer uma tipografia que não chega é pior que não descrever nenhuma: quem
 * escolhe pelo nome recebe outra coisa e não sabe por quê.
 *
 * `previewText` é uma amostra que se LÊ, não um "Aa Bb Cc": a diferença entre Merriweather e
 * Caveat aparece numa frase, não em duas letras.
 */
export type FonteType = 'padrao' | 'pixel' | 'serif' | 'mono' | 'cyber' | 'rounded' | 'handwriting' | 'display';

export interface FonteOption { id: FonteType; name: string; desc: string; previewText: string }

export const FONTE_OPTIONS: FonteOption[] = [
  { id: 'padrao', name: 'Padrão (Inter)', desc: 'A tipografia normal do app: Inter no corpo, Archivo nos títulos.', previewText: 'Aprender todo dia' },
  { id: 'pixel', name: 'Arcade (8-bit)', desc: 'Fliperama: títulos em Silkscreen, partículas quadradas e som chiptune.', previewText: '8-BIT RETRO' },
  { id: 'serif', name: 'Literária (serifada)', desc: 'Clima de livro e jornal: Merriweather, com Georgia de reserva.', previewText: 'Estudo & Livros' },
  { id: 'mono', name: 'Técnica (monoespaçada)', desc: 'Tudo alinhado, como código: JetBrains Mono, com IBM Plex Mono de reserva.', previewText: 'fn(idioma) => 100%' },
  { id: 'cyber', name: 'Cyberpunk (futurista)', desc: 'Display de ficção científica: Orbitron nos títulos, Rajdhani no corpo.', previewText: 'NEO TÓQUIO 2099' },
  { id: 'rounded', name: 'Acolhedora (arredondada)', desc: 'Curvas suaves, sem canto duro: Baloo 2 nos títulos, Nunito no corpo.', previewText: 'Aprenda sorrindo' },
  { id: 'handwriting', name: 'Manuscrita (caderno)', desc: 'Anotação à mão: Caveat, com a cursiva do sistema de reserva.', previewText: 'Minhas notas de hoje' },
  { id: 'display', name: 'Impacto (display)', desc: 'Títulos em caixa alta, no peso máximo — cara de pôster. O corpo do texto continua Inter.', previewText: 'MAESTRIA MÁXIMA' },
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
    id: 'aurora',
    name: 'Aurora',
    desc: 'Exclusivo de conquista: noite polar com verde-aurora e violeta.',
    swatches: { canvas: '#070B14', surface: '#0E1626', accent: '#4ADE80', ink: '#E6EDF7' }
  },
  {
    id: 'custom',
    name: 'Customizado',
    desc: 'Crie sua própria paleta de cores.',
    swatches: { canvas: '#E6E2D6', surface: '#F5F2EA', accent: '#F04E23', ink: '#26241F' }
  }
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
