import type { MinigameId } from '@core';
import {
  Briefcase,
  Eye,
  Keyboard,
  Lightbulb,
  Link2,
  type LucideIcon,
  Mic,
  PenLine,
  Puzzle,
  Radar,
  Scissors,
  Search,
  Sprout,
  Timer,
  TriangleAlert,
  Volume2,
  Zap,
} from 'lucide-react';

import type { IconeDaAjuda } from '../../../core/minigames/regras';

/** O ícone de cada jogo na sobrancelha da partida (`icone` em cada `JOGOS[id]` do protótipo). */
export const ICONE_DO_JOGO: Record<MinigameId, LucideIcon> = {
  memory: Puzzle /* `jogos5.js:45` */,
  wordsearch: Search /* `jogos.js:535` */,
  termo: Keyboard /* `jogos.js:401` */,
  scramble: Puzzle /* `jogos.js:641` */,
  blitz: Zap /* `jogos.js:725` */,
  karuta: Volume2 /* `jogos2.js:14` */,
  choseong: Keyboard /* `jogos2.js:64` */,
  tenis: Zap /* `jogos2.js:146` */,
  koffer: Briefcase /* `jogos2.js:222` */,
  bao: Sprout /* `jogos2.js:287` */,
  vitendawili: Puzzle /* `jogos2.js:379` */,
  shiritori: Link2 /* `jogos2.js:431` */,
  cadavre: PenLine /* `jogos2.js:484` */,
  taboo: TriangleAlert /* `jogos2.js:527` */,
  karaoke: Mic /* `jogos2.js:580` */,
  escuta: Volume2 /* `jogos2.js:648` */,
  ditado: PenLine /* `jogos2.js:693` */,
  conectores: Link2 /* `jogos2.js:767` */,
};

/** O ícone de cada ajuda (`ajudasDoNivel`, em `core/minigames/regras.ts`, diz o nome). */
export const ICONE_DA_AJUDA: Record<IconeDaAjuda, LucideIcon> = {
  eye: Eye,
  radar: Radar,
  lightbulb: Lightbulb,
  'volume-2': Volume2,
  scissors: Scissors,
  timer: Timer,
};
