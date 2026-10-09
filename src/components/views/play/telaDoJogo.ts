import type { MinigameId } from '../../../core/minigames/types';
import { lazyComRecarga } from '../../../lib/lazyComRecarga';
import type { TelaDoJogo } from './componentesDosJogos';

/* Cada tabuleiro é um chunk próprio, baixado ao abrir a antessala (`precarregarJogo`, em
   `jogosSobDemanda.ts`) — não vai mais junto com o lobby do `/jogar`. */
/** `null` = o jogo tem tela propria fora deste caminho (rodadas de frase/audio, montadas antes). */
export const TELA_DO_JOGO: Record<MinigameId, TelaDoJogo> = {
  memory: lazyComRecarga(() => import('../../minigames/MemoriaDoPrototipo')),
  wordsearch: lazyComRecarga(() => import('../../minigames/CacaPalavrasDoPrototipo')),
  blitz: lazyComRecarga(() => import('../../minigames/DueloDoPrototipo')),
  termo: null,
  scramble: null,
  karaoke: null,
  escuta: null,
  ditado: null,
  conectores: null,
  karuta: lazyComRecarga(() => import('../../minigames/culturais/KarutaDoPrototipo')),
  choseong: lazyComRecarga(() => import('../../minigames/culturais/ChoseongDoPrototipo')),
  tenis: lazyComRecarga(() => import('../../minigames/culturais/RaliDoPrototipo')),
  koffer: lazyComRecarga(() => import('../../minigames/culturais/KofferDoPrototipo')),
  bao: lazyComRecarga(() => import('../../minigames/culturais/BaoDoPrototipo')),
  vitendawili: lazyComRecarga(() => import('../../minigames/culturais/VitendawiliDoPrototipo')),
  shiritori: lazyComRecarga(() => import('../../minigames/culturais/ShiritoriDoPrototipo')),
  cadavre: lazyComRecarga(() => import('../../minigames/culturais/CadavreDoPrototipo')),
  taboo: lazyComRecarga(() => import('../../minigames/culturais/TabuDoPrototipo')),
};
