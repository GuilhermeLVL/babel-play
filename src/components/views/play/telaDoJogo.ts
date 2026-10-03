import type { MinigameId } from '../../../core/minigames/types';
import { lazyComRecarga } from '../../../lib/lazyComRecarga';
import type { TelaDoJogo } from './componentesDosJogos';

/* Cada tabuleiro é um chunk próprio, baixado ao abrir a antessala (`precarregarJogo`, em
   `jogosSobDemanda.ts`) — não vai mais junto com o lobby do `/jogar`. */
/** `null` = o jogo tem tela propria fora deste caminho (rodadas de frase/audio, montadas antes). */
export const TELA_DO_JOGO: Record<MinigameId, TelaDoJogo> = {
  memory: lazyComRecarga(() => import('../../minigames/MemoryGame')),
  wordsearch: lazyComRecarga(() => import('../../minigames/WordSearchGame')),
  blitz: lazyComRecarga(() => import('../../minigames/BlitzGame')),
  termo: null,
  scramble: null,
  karaoke: null,
  escuta: null,
  ditado: null,
  conectores: null,
  karuta: lazyComRecarga(() => import('../../minigames/culturais/KarutaGame')),
  choseong: lazyComRecarga(() => import('../../minigames/culturais/ChoseongGame')),
  tenis: lazyComRecarga(() => import('../../minigames/culturais/TenseTennisGame')),
  koffer: lazyComRecarga(() => import('../../minigames/culturais/KofferGame')),
  bao: lazyComRecarga(() => import('../../minigames/culturais/BaoGame')),
  vitendawili: lazyComRecarga(() => import('../../minigames/culturais/VitendawiliGame')),
  shiritori: lazyComRecarga(() => import('../../minigames/culturais/ShiritoriGame')),
  cadavre: lazyComRecarga(() => import('../../minigames/culturais/CadavreExquisGame')),
  taboo: lazyComRecarga(() => import('../../minigames/culturais/TabooGame')),
};
