/**
 * O ÍCONE DE CADA CONQUISTA — lucide, o mesmo na grade de Desafios, no perfil e no modal de resgate.
 *
 * O core guarda o NOME do ícone (`conquista.icone`, recompensas v2): ele não importa `lucide-react`
 * (fronteira do núcleo isomórfico). Este mapa traduz o nome para o componente, e o tipo
 * `Record<IconeDaConquista, LucideIcon>` não compila se um nome do core ficar sem ícone. Id que não
 * é de conquista cai no genérico (`iconeDaConquista`).
 */
import { CONQUISTAS, type IconeDaConquista } from '@core';
import type { LucideIcon } from 'lucide-react';
import {
  AudioLines,
  Award,
  BookmarkPlus,
  BookOpen,
  Brain,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronsUp,
  Compass,
  Crosshair,
  Crown,
  Ear,
  Flame,
  Gem,
  Globe,
  GraduationCap,
  Headphones,
  Joystick,
  Landmark,
  Languages,
  Library,
  Lightbulb,
  Medal,
  Mic,
  Mountain,
  Music,
  Pickaxe,
  Radio,
  RadioTower,
  Rainbow,
  Repeat,
  Rocket,
  Shapes,
  Shield,
  ShoppingBag,
  Star,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

export const ICONE_DA_CONQUISTA: Record<IconeDaConquista, LucideIcon> = {
  BookmarkPlus,
  BookOpen,
  Library,
  Landmark,
  Lightbulb,
  Brain,
  BrainCircuit,
  Shield,
  Crosshair,
  Mic,
  Headphones,
  Radio,
  RadioTower,
  Pickaxe,
  Globe,
  Languages,
  Ear,
  AudioLines,
  Music,
  Star,
  Crown,
  Gem,
  Medal,
  Compass,
  Shapes,
  Joystick,
  GraduationCap,
  Zap,
  Rocket,
  Rainbow,
  CalendarPlus,
  CalendarDays,
  Flame,
  Mountain,
  Repeat,
  CalendarCheck,
  Target,
  Trophy,
  ChevronsUp,
  ShoppingBag,
};

/** O ícone da conquista pelo id — lido de `conquista.icone`. Id desconhecido: o genérico. */
export function iconeDaConquista(id: string): LucideIcon {
  const c = CONQUISTAS.find((x) => x.id === id);
  return c ? ICONE_DA_CONQUISTA[c.icone] : Award;
}
