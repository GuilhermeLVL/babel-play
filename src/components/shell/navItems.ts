import {
  Gamepad2,
  LayoutDashboard,
  Mic,
  Library,
  BarChart2,
  BookOpen,
  Settings as SettingsIcon,
  Heart,
  type LucideIcon
} from 'lucide-react';
import { EDICAO_LEVE } from '../../lib/edicao';
import type { ViewType } from '../../types';

// O tipo mora em `lib/profile` (junto do dicionário de linguagem); aqui só reexportamos para não
// quebrar os ~15 imports que já apontam para este módulo.
export type { AgeProfileType } from '../../lib/profile';
import type { AgeProfileType } from '../../lib/profile';

export type MenuPositionType = 'top' | 'bottom' | 'left' | 'right';

/**
 * FONTE ÚNICA da navegação principal.
 *
 * Antes existiam DUAS listas — uma no Sidebar (que nem era renderizado) e outra no StudioHeader —
 * e elas divergiam: a mesma view aparecia como "Conteúdo da Sessão" num lugar e "Sessão" no outro.
 * Rótulo de navegação é contrato com a memória do usuário; duas verdades para o mesmo destino é
 * exatamente o atrito cognitivo que este redesign existe para remover.
 *
 * `short` é o rótulo do rail/barra (espaço apertado). `labels` adapta a linguagem ao perfil:
 * o público sênior não deve ler "Sessão", e sim "Minhas Aulas".
 */
export interface NavItemDef {
  id: ViewType;
  icon: LucideIcon;
  short: string;
  labels: Record<AgeProfileType, string>;
  /** Fora do top-5 do celular: cabe no rail e na barra, não na dock inferior. */
  secondary?: boolean;
}

const TODOS_OS_ITENS: NavItemDef[] = [
  {
    id: 'hub',
    icon: LayoutDashboard,
    short: 'Início',
    labels: { kids: 'Início', pro: 'Início', senior: 'Página Inicial' }
  },
  {
    id: 'capture',
    icon: Mic,
    short: 'Capturar',
    labels: { kids: 'Gravar', pro: 'Capturar', senior: 'Gravar Áudio' }
  },
  {
    // Logo depois de Capturar: é a sequência real de uso — grava, e joga com o que gravou.
    id: 'play',
    icon: Gamepad2,
    short: 'Jogar',
    labels: { kids: 'Jogar', pro: 'Jogar', senior: 'Praticar' }
  },
  {
    id: 'library',
    icon: Library,
    short: 'Biblioteca',
    labels: { kids: 'Biblioteca', pro: 'Biblioteca', senior: 'Minhas Mídias' }
  },
  {
    id: 'analysis',
    icon: BarChart2,
    short: 'Sessão',
    labels: { kids: 'Praticar', pro: 'Sessão', senior: 'Minhas Aulas' }
  },
  {
    id: 'metrics',
    icon: BookOpen,
    short: 'Vocabulário',
    labels: { kids: 'Palavras', pro: 'Vocabulário', senior: 'Minhas Palavras' }
  },
  {
    id: 'settings',
    icon: SettingsIcon,
    short: 'Ajustes',
    labels: { kids: 'Ajustes', pro: 'Ajustes', senior: 'Configurações' },
    secondary: true
  },
  {
    // Quem fez o app, contato e apoio — identidade de projeto independente à vista.
    id: 'sobre',
    icon: Heart,
    short: 'Sobre',
    labels: { kids: 'Sobre', pro: 'Sobre', senior: 'Sobre o App' },
    secondary: true
  }
];

export function navLabel(item: NavItemDef, profile: AgeProfileType, compact = false): string {
  // No modo compacto (barra horizontal estreita) o rótulo curto evita quebra de linha —
  // exceto no perfil sênior, onde a clareza vale mais que a economia de pixels.
  if (compact && profile !== 'senior') return item.short;
  return item.labels[profile];
}

/**
 * EDIÇÃO LEVE: só o que funciona inteiro sem conta e sem servidor — Início, Capturar, Jogar e
 * Ajustes. Biblioteca entra (as sessões vivem no IndexedDB deste navegador — provisório, sem conta). Sessão e Vocabulário voltam com a edição completa.
 */
const LEVE: ReadonlySet<ViewType> = new Set<ViewType>(['hub', 'capture', 'library', 'metrics', 'play', 'settings', 'sobre']);
export const NAV_ITEMS: NavItemDef[] = EDICAO_LEVE ? TODOS_OS_ITENS.filter((i) => LEVE.has(i.id)) : TODOS_OS_ITENS;
