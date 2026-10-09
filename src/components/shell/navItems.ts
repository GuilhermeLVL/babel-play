import {
  BookOpen,
  ChartColumn,
  CreditCard,
  Gamepad2,
  Heart,
  Languages,
  LayoutDashboard,
  Library,
  type LucideIcon,
  Mic,
  Settings as SettingsIcon,
  ShieldCheck,
  Shirt,
} from 'lucide-react';

import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { t } from '../../lib/i18n';
import type { ViewType } from '../../types';

// O tipo mora em `lib/profile` (junto do dicionário de linguagem); aqui só reexportamos para não
// quebrar os ~15 imports que já apontam para este módulo.
export type { AgeProfileType } from '../../lib/profile';
import type { AgeProfileType } from '../../lib/profile';

export type MenuPositionType = 'top' | 'bottom' | 'left' | 'right';

/** A escala do texto (Ajustes → Aparência). */
export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

/**
 * FONTE ÚNICA da navegação principal.
 *
 * Antes existiam DUAS listas — uma no Sidebar (que nem era renderizado) e outra no cabeçalho —
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
}

const TODOS_OS_ITENS: NavItemDef[] = [
  {
    id: 'hub',
    icon: LayoutDashboard,
    short: 'Início',
    labels: { kids: 'Início', pro: 'Início', senior: 'Página Inicial' },
  },
  {
    id: 'capture',
    icon: Mic,
    short: 'Capturar',
    labels: { kids: 'Gravar', pro: 'Capturar', senior: 'Gravar Áudio' },
  },
  {
    /* O INTÉRPRETE COM PORTA PRÓPRIA (pedido do dono, 30/09): no cabeçalho da captura ele passava
       despercebido. É a conversa frente a frente, na rua, com o celular entre as duas pessoas. Logo
       depois de Capturar, porque é a mesma captura, aberta na tela de começar a conversa. */
    id: 'interprete',
    icon: Languages,
    short: 'Intérprete',
    labels: { kids: 'Intérprete', pro: 'Intérprete', senior: 'Intérprete de conversa' },
  },
  {
    // Logo depois de Capturar: é a sequência real de uso — grava, e joga com o que gravou.
    id: 'play',
    icon: Gamepad2,
    short: 'Jogar',
    labels: { kids: 'Jogar', pro: 'Jogar', senior: 'Praticar' },
  },
  {
    id: 'library',
    icon: Library,
    short: 'Biblioteca',
    labels: { kids: 'Biblioteca', pro: 'Biblioteca', senior: 'Minhas Mídias' },
  },
  /* 'analysis' SAIU do menu de topo (decisão do dono, 31/08): uma aula/sessão sempre vive
     DENTRO de uma mídia capturada — o caminho é Biblioteca → mídia → aula. A rota continua
     existindo; só a porta redundante no topo foi removida. */
  {
    id: 'metrics',
    icon: BookOpen,
    short: 'Vocabulário',
    labels: { kids: 'Palavras', pro: 'Vocabulário', senior: 'Minhas Palavras' },
  },
  {
    // Estatísticas (protótipo aprovado, 23/09/2026): o primeiro do grupo "Mais".
    id: 'estatisticas',
    icon: ChartColumn,
    short: 'Estatísticas',
    labels: { kids: 'Meu progresso', pro: 'Estatísticas', senior: 'Estatísticas' },
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
  },
  {
    // Quem fez o app, contato e apoio — identidade de projeto independente à vista.
    id: 'sobre',
    icon: Heart,
    short: 'Sobre',
    labels: { kids: 'Sobre', pro: 'Sobre', senior: 'Sobre o App' },
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
  },
  {
    // POR ÚLTIMO de propósito (pedido do dono, 2026-08-28): configuração é o que menos se abre;
    // no meio da lista ela separava as telas de uso das telas de descoberta (Loja, Sobre).
    id: 'settings',
    icon: SettingsIcon,
    short: 'Ajustes',
    labels: { kids: 'Ajustes', pro: 'Ajustes', senior: 'Configurações' },
  },
];

/**
 * A ADMINISTRAÇÃO (`/admin`) — o item que só o papel admin vê.
 *
 * Fica FORA de `NAV_ITEMS` de propósito: aquela lista é o menu de todo mundo (e várias telas a leem
 * para achar o nome de uma view). Quem desenha o menu acrescenta este item ao grupo "Mais" SÓ
 * quando `useEhAdmin()` diz que sim. Esconder é conforto: a decisão real é do servidor (403).
 */
export const ITEM_ADMIN: NavItemDef = {
  id: 'admin',
  icon: ShieldCheck,
  short: 'Administração',
  labels: { kids: 'Administração', pro: 'Administração', senior: 'Administração' },
};

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
export const NAV_ITEMS: NavItemDef[] = edicaoEstatica()
  ? /* EDIÇÃO ESTÁTICA (site sem servidor): não há plano a assinar nem checkout — um item "Planos"
       ali seria um destino sem saída. Some do menu; o resto é o mesmo. */
    TODOS_OS_ITENS.filter((i) => i.id !== 'planos')
  : TODOS_OS_ITENS;
