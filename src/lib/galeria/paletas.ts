/**
 * GALERIA DE PALETAS — centenas de temas SEM centenas de CSS.
 *
 * Um tema "de verdade" custa ~80 linhas de CSS por variante (ver `index.css`); 200 desses seriam
 * inviáveis. Mas o app já tem o tema `custom`, que lê quatro variáveis (`--custom-canvas/surface/
 * ink/accent`) e deriva o resto. Uma paleta, portanto, é só quatro cores: 30 matizes × 6 estilos
 * = 180 paletas geradas em tempo de execução + as curadas. Custo: zero CSS, ~2 KB de código.
 *
 * Os estilos foram calibrados para contraste legível: `ink` sempre bem escuro sobre fundo claro
 * ou bem claro sobre fundo escuro; o acento é o único que carrega o matiz forte.
 */
import type { CustomColors } from '../appearance';

export interface Paleta extends CustomColors {
  id: string;
  nome: string;
  /** Fundo escuro? A UI mostra e o modo escuro acompanha. */
  escura: boolean;
  estilo: EstiloDePaleta;
  /** Nome da família de matiz (para busca/filtro). */
  familia: string;
}

export type EstiloDePaleta = 'claro' | 'pastel' | 'papel' | 'escuro' | 'neon' | 'meia-noite';

export const ESTILOS: Array<{ id: EstiloDePaleta; nome: string }> = [
  { id: 'claro', nome: 'Claro' },
  { id: 'pastel', nome: 'Pastel' },
  { id: 'papel', nome: 'Papel' },
  { id: 'escuro', nome: 'Escuro' },
  { id: 'neon', nome: 'Néon' },
  { id: 'meia-noite', nome: 'Meia-noite' },
];

const MATIZES: Array<{ id: string; nome: string; h: number }> = [
  { id: 'vermelho', nome: 'Vermelho', h: 4 }, { id: 'terracota', nome: 'Terracota', h: 16 }, { id: 'laranja', nome: 'Laranja', h: 28 },
  { id: 'ambar', nome: 'Âmbar', h: 40 }, { id: 'mostarda', nome: 'Mostarda', h: 50 }, { id: 'oliva', nome: 'Oliva', h: 70 },
  { id: 'lima', nome: 'Lima', h: 90 }, { id: 'verde', nome: 'Verde', h: 130 }, { id: 'esmeralda', nome: 'Esmeralda', h: 152 },
  { id: 'menta', nome: 'Menta', h: 165 }, { id: 'turquesa', nome: 'Turquesa', h: 178 }, { id: 'ciano', nome: 'Ciano', h: 190 },
  { id: 'petroleo', nome: 'Petróleo', h: 200 }, { id: 'celeste', nome: 'Celeste', h: 208 }, { id: 'azul', nome: 'Azul', h: 220 },
  { id: 'safira', nome: 'Safira', h: 232 }, { id: 'indigo', nome: 'Índigo', h: 245 }, { id: 'violeta', nome: 'Violeta', h: 262 },
  { id: 'roxo', nome: 'Roxo', h: 275 }, { id: 'lilas', nome: 'Lilás', h: 288 }, { id: 'magenta', nome: 'Magenta', h: 305 },
  { id: 'rosa', nome: 'Rosa', h: 330 }, { id: 'framboesa', nome: 'Framboesa', h: 345 }, { id: 'coral', nome: 'Coral', h: 10 },
  { id: 'cobre', nome: 'Cobre', h: 22 }, { id: 'ouro', nome: 'Ouro', h: 45 }, { id: 'jade', nome: 'Jade', h: 158 },
  { id: 'oceano', nome: 'Oceano', h: 214 }, { id: 'ametista', nome: 'Ametista', h: 270 }, { id: 'cereja', nome: 'Cereja', h: 350 },
];

function hsl(h: number, s: number, l: number): string {
  // HSL → hex, para as variáveis CSS e os swatches.
  const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function gerar(m: { id: string; nome: string; h: number }, estilo: EstiloDePaleta): Paleta {
  const h = m.h;
  switch (estilo) {
    case 'claro': return { id: `${m.id}-claro`, nome: `${m.nome} claro`, familia: m.nome, estilo, escura: false, canvas: hsl(h, 30, 95), surface: '#FFFFFF', ink: hsl(h, 30, 14), accent: hsl(h, 72, 46) };
    case 'pastel': return { id: `${m.id}-pastel`, nome: `${m.nome} pastel`, familia: m.nome, estilo, escura: false, canvas: hsl(h, 55, 92), surface: hsl(h, 60, 97), ink: hsl(h, 25, 20), accent: hsl(h, 60, 58) };
    case 'papel': return { id: `${m.id}-papel`, nome: `${m.nome} papel`, familia: m.nome, estilo, escura: false, canvas: hsl(40, 25, 90), surface: hsl(40, 30, 96), ink: hsl(h, 20, 16), accent: hsl(h, 65, 42) };
    case 'escuro': return { id: `${m.id}-escuro`, nome: `${m.nome} escuro`, familia: m.nome, estilo, escura: true, canvas: hsl(h, 25, 9), surface: hsl(h, 22, 14), ink: hsl(h, 20, 92), accent: hsl(h, 75, 60) };
    case 'neon': return { id: `${m.id}-neon`, nome: `${m.nome} néon`, familia: m.nome, estilo, escura: true, canvas: '#07070B', surface: '#101017', ink: '#F4F4FA', accent: hsl(h, 100, 62) };
    case 'meia-noite': return { id: `${m.id}-meia-noite`, nome: `${m.nome} meia-noite`, familia: m.nome, estilo, escura: true, canvas: hsl(h, 40, 6), surface: hsl(h, 35, 11), ink: hsl(h, 15, 88), accent: hsl(h, 70, 55) };
  }
}

/** As curadas: nomes com identidade, para a vitrine. */
const CURADAS: Paleta[] = [
  { id: 'babel-atelier', nome: 'Babel Atelier', familia: 'Terracota', estilo: 'papel', escura: false, canvas: '#E6E2D6', surface: '#F5F2EA', ink: '#26241F', accent: '#F04E23' },
  { id: 'deep-emerald', nome: 'Deep Emerald', familia: 'Esmeralda', estilo: 'escuro', escura: true, canvas: '#0A120D', surface: '#112217', ink: '#ECFDF5', accent: '#10B981' },
  { id: 'sunset-gold', nome: 'Sunset Gold', familia: 'Ouro', estilo: 'claro', escura: false, canvas: '#FAF6EE', surface: '#FFFDF9', ink: '#332A15', accent: '#D97706' },
  { id: 'nordic-frost', nome: 'Nordic Frost', familia: 'Celeste', estilo: 'claro', escura: false, canvas: '#EBF1F5', surface: '#F4F8FA', ink: '#1E293B', accent: '#0EA5E9' },
  { id: 'amethyst-night', nome: 'Amethyst Night', familia: 'Ametista', estilo: 'meia-noite', escura: true, canvas: '#0C0A14', surface: '#151122', ink: '#FAF5FF', accent: '#A855F7' },
  { id: 'pato-de-borracha', nome: 'Pato de borracha', familia: 'Ouro', estilo: 'pastel', escura: false, canvas: '#FFF4C2', surface: '#FFFBE6', ink: '#3A2E00', accent: '#F59E0B' },
  { id: 'coracao-de-mel', nome: 'Coração de mel', familia: 'Rosa', estilo: 'pastel', escura: false, canvas: '#FFE4EC', surface: '#FFF3F7', ink: '#4A1F2E', accent: '#E63E7A' },
  { id: 'lo-fi', nome: 'Lo-fi', familia: 'Roxo', estilo: 'meia-noite', escura: true, canvas: '#151221', surface: '#1E1A2E', ink: '#EAE4FF', accent: '#B48CFF' },
  { id: 'arcade', nome: 'Arcade', familia: 'Magenta', estilo: 'neon', escura: true, canvas: '#0A0612', surface: '#150B24', ink: '#F9F0FF', accent: '#FF2ED1' },
  { id: 'floresta', nome: 'Floresta', familia: 'Verde', estilo: 'escuro', escura: true, canvas: '#0B1410', surface: '#12211A', ink: '#E8F5EC', accent: '#4ADE80' },
  { id: 'oceano-profundo', nome: 'Oceano profundo', familia: 'Oceano', estilo: 'meia-noite', escura: true, canvas: '#04101C', surface: '#0A1B2E', ink: '#E3F1FF', accent: '#38BDF8' },
  { id: 'cafe', nome: 'Café', familia: 'Cobre', estilo: 'papel', escura: false, canvas: '#EFE6DA', surface: '#F8F2EA', ink: '#2B1D12', accent: '#8B5A2B' },
  { id: 'menta-fresca', nome: 'Menta fresca', familia: 'Menta', estilo: 'claro', escura: false, canvas: '#E6F7F1', surface: '#F3FCF8', ink: '#0F2E24', accent: '#14B8A6' },
  { id: 'pizza', nome: 'Pizzaria', familia: 'Vermelho', estilo: 'papel', escura: false, canvas: '#F7EBDD', surface: '#FFF7EC', ink: '#3B1A0F', accent: '#D7263D' },
  { id: 'espaco-sideral', nome: 'Espaço sideral', familia: 'Índigo', estilo: 'meia-noite', escura: true, canvas: '#05061A', surface: '#0C0E2B', ink: '#E9EBFF', accent: '#7C83FF' },
  { id: 'halloween', nome: 'Halloween', familia: 'Laranja', estilo: 'escuro', escura: true, canvas: '#120A05', surface: '#1F1108', ink: '#FFF1E0', accent: '#FF7A00' },
  { id: 'natal', nome: 'Natal', familia: 'Verde', estilo: 'papel', escura: false, canvas: '#EEF3EA', surface: '#F9FBF7', ink: '#14301C', accent: '#C81E1E' },
  { id: 'praia', nome: 'Praia', familia: 'Turquesa', estilo: 'claro', escura: false, canvas: '#FBF3E4', surface: '#FFFBF3', ink: '#1E2F33', accent: '#0FA3B1' },
  { id: 'cereja-negra', nome: 'Cereja negra', familia: 'Cereja', estilo: 'escuro', escura: true, canvas: '#12070A', surface: '#1E0C12', ink: '#FFE9EF', accent: '#FF3B6B' },
  { id: 'grafite', nome: 'Grafite', familia: 'Petróleo', estilo: 'escuro', escura: true, canvas: '#111315', surface: '#191C1F', ink: '#EDEFF2', accent: '#9AA4B2' },
];

let cache: Paleta[] | null = null;

/** Todas as paletas: curadas primeiro, depois as geradas (30 matizes × 6 estilos = 180). */
export function todasAsPaletas(): Paleta[] {
  if (cache) return cache;
  const geradas: Paleta[] = [];
  for (const m of MATIZES) for (const e of ESTILOS) geradas.push(gerar(m, e.id));
  cache = [...CURADAS, ...geradas];
  return cache;
}

export function paletaPorId(id: string): Paleta | undefined {
  return todasAsPaletas().find((p) => p.id === id);
}

export function buscarPaletas(termo: string, estilo?: EstiloDePaleta | 'todos'): Paleta[] {
  const t = termo.trim().toLowerCase();
  return todasAsPaletas().filter((p) =>
    (!estilo || estilo === 'todos' || p.estilo === estilo) &&
    (!t || p.nome.toLowerCase().includes(t) || p.familia.toLowerCase().includes(t)),
  );
}

/** Amostra de cores de uma paleta, para prévias (rastro/partícula "na cor da paleta"). */
export function coresDaPaleta(p: Paleta): string[] {
  return [p.accent, p.ink, p.surface, p.canvas];
}
