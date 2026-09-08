import type { MinigameId } from '../../../core/minigames/types';
import type { TelaDoJogo } from './componentesDosJogos';
import MemoryGame from '../../minigames/MemoryGame';
import WordSearchGame from '../../minigames/WordSearchGame';
import BlitzGame from '../../minigames/BlitzGame';
import KarutaGame from '../../minigames/culturais/KarutaGame';
import ChoseongGame from '../../minigames/culturais/ChoseongGame';
import TenseTennisGame from '../../minigames/culturais/TenseTennisGame';
import KofferGame from '../../minigames/culturais/KofferGame';
import BaoGame from '../../minigames/culturais/BaoGame';
import VitendawiliGame from '../../minigames/culturais/VitendawiliGame';
import ShiritoriGame from '../../minigames/culturais/ShiritoriGame';
import CadavreExquisGame from '../../minigames/culturais/CadavreExquisGame';
import TabooGame from '../../minigames/culturais/TabooGame';

/** `null` = o jogo tem tela propria fora deste caminho (rodadas de frase/audio, montadas antes). */
export const TELA_DO_JOGO: Record<MinigameId, TelaDoJogo> = {
  memory: MemoryGame,
  wordsearch: WordSearchGame,
  blitz: BlitzGame,
  termo: null,
  scramble: null,
  karaoke: null,
  escuta: null,
  ditado: null,
  conectores: null,
  karuta: KarutaGame,
  choseong: ChoseongGame,
  tenis: TenseTennisGame,
  koffer: KofferGame,
  bao: BaoGame,
  vitendawili: VitendawiliGame,
  shiritori: ShiritoriGame,
  cadavre: CadavreExquisGame,
  taboo: TabooGame,
};
