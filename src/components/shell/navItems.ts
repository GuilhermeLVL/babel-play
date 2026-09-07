import {
  Gamepad2,
  LayoutDashboard,
  Mic,
  Library,
  BarChart2,
  BookOpen,
  Settings as SettingsIcon,
  Heart,
  Shirt,
  CreditCard,
  type LucideIcon
} from 'lucide-react';
import type { ViewType } from '../../types';
import { t } from '../../lib/i18n';

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
  /* 'analysis' SAIU do menu de topo (decisão do dono, 31/08): uma aula/sessão sempre vive
     DENTRO de uma mídia capturada — o caminho é Biblioteca → mídia → aula. A rota continua
     existindo; só a porta redundante no topo foi removida. */
  {
    id: 'metrics',
    icon: BookOpen,
    short: 'Vocabulário',
    labels: { kids: 'Palavras', pro: 'Vocabulário', senior: 'Minhas Palavras' }
  },
  {
    // A vitrine da progressão: desbloqueios por nível e compras com Seeds.
    id: 'loja',
    // Camiseta, não sacola (ux-v2 §1.3): a tela é primeiro o guarda-roupa ("Meu visual" é a aba
    // default); a sacola sugeria loja e a Loja é só uma das quatro áreas.
    icon: Shirt,
    short: 'Personalizar',
    /* A tela ÚNICA de personalização (2026-08-28): visual, loja e conquistas num lugar só. */
    labels: { kids: 'Meu visual', pro: 'Personalizar', senior: 'Personalizar' },
    secondary: true
  },
  {
    // Quem fez o app, contato e apoio — identidade de projeto independente à vista.
    id: 'sobre',
    icon: Heart,
    short: 'Sobre',
    labels: { kids: 'Sobre', pro: 'Sobre', senior: 'Sobre o App' },
    secondary: true
  },
  {
    /* PLANOS ENTRA NA NAVEGAÇÃO (mudança vender-onde-se-ve). Existia só por três atalhos —
       menu do avatar, um card no Hub e um botão em Ajustes — e o próprio dono não o achou. O que
       está à venda precisa estar onde se procura, não onde quem escreveu sabe que está.
       Fica ao lado de Sobre porque as duas respondem à mesma pergunta: "o que é isto, e como se
       sustenta?". */
    id: 'planos',
    icon: CreditCard,
    short: 'Planos',
    labels: { kids: 'Planos', pro: 'Planos', senior: 'Planos e preços' },
    secondary: true
  },
  {
    // POR ÚLTIMO de propósito (pedido do dono, 2026-08-28): configuração é o que menos se abre;
    // no meio da lista ela separava as telas de uso das telas de descoberta (Loja, Sobre).
    id: 'settings',
    icon: SettingsIcon,
    short: 'Ajustes',
    labels: { kids: 'Ajustes', pro: 'Ajustes', senior: 'Configurações' },
    secondary: true
  }
];

/**
 * O rótulo, já no idioma da interface.
 *
 * A tradução entra AQUI, e não nas tabelas acima, porque este é o único ponto por onde os rótulos
 * saem — o menu inteiro passa a falar outro idioma sem que a definição de navegação mude de forma.
 * As variantes por perfil continuam sendo escolhidas antes de traduzir: "Minhas Aulas" e "Sessão"
 * são frases diferentes, e cada uma tem a sua tradução.
 */
export function navLabel(item: NavItemDef, profile: AgeProfileType, compact = false): string {
  // No modo compacto (barra horizontal estreita) o rótulo curto evita quebra de linha —
  // exceto no perfil sênior, onde a clareza vale mais que a economia de pixels.
  if (compact && profile !== 'senior') return t(item.short);
  return t(item.labels[profile]);
}

/*
 * O MENU É UM SÓ desde 07/09, quando a edição leve foi encerrada.
 *
 * Havia uma segunda lista aqui — sete itens, o subconjunto que funcionava sem conta e sem
 * servidor — escolhida em tempo de build. Quem entra sem conta continua entrando; o que some é a
 * SEGUNDA lista, que precisava ser mantida em dia toda vez que uma tela nascia. O gate de conta
 * por tela (`exigeConta`) já resolve, por tela e em tempo de execução, a pergunta que ela
 * respondia em bloco e em tempo de build.
 */
export const NAV_ITEMS: NavItemDef[] = TODOS_OS_ITENS;
