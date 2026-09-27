/**
 * O ÍCONE DE CADA CONQUISTA — lucide, o mesmo na grade de Desafios, no perfil e no modal de resgate.
 *
 * O core guarda um emoji por conquista (`conquista.emoji`), e o modal de resgate mostrava esse
 * emoji enquanto a grade mostrava o ícone: a mesma conquista com duas caras. A regra de desenho é
 * lucide + tokens, sem emoji na interface; por isso o mapa mora aqui, fora de uma tela só.
 * Id novo sem ícone cai no genérico (`iconeDaConquista`).
 */
import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BookOpen,
  Brain,
  CalendarDays,
  Crown,
  Flame,
  Globe,
  Headphones,
  Mic,
  Rainbow,
  ShoppingBag,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

export const ICONE_DA_CONQUISTA: Record<string, LucideIcon> = {
  'primeira-captura': Mic,
  ouvinte: Headphones,
  'caderno-cheio': BookOpen,
  revisor: Brain,
  'sem-erro': Star,
  perfeccionista: Crown,
  maratonista: CalendarDays,
  constante: Flame,
  colecionador: Rainbow,
  poliglota: Globe,
  duelista: Zap,
  cliente: ShoppingBag,
  'nivel-5': Target,
  'nivel-10': Trophy,
};

export function iconeDaConquista(id: string): LucideIcon {
  return ICONE_DA_CONQUISTA[id] ?? Award;
}
