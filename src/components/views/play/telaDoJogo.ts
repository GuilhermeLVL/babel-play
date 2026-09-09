import type { MinigameId } from '../../../core/minigames/types';
import BlitzGame from '../../minigames/BlitzGame';
import BaoGame from '../../minigames/culturais/BaoGame';
import CadavreExquisGame from '../../minigames/culturais/CadavreExquisGame';
import ChoseongGame from '../../minigames/culturais/ChoseongGame';
import KarutaGame from '../../minigames/culturais/KarutaGame';
import KofferGame from '../../minigames/culturais/KofferGame';
import ShiritoriGame from '../../minigames/culturais/ShiritoriGame';
import TabooGame from '../../minigames/culturais/TabooGame';
import TenseTennisGame from '../../minigames/culturais/TenseTennisGame';
import VitendawiliGame from '../../minigames/culturais/VitendawiliGame';
import MemoryGame from '../../minigames/MemoryGame';
import WordSearchGame from '../../minigames/WordSearchGame';
import type { TelaDoJogo } from './componentesDosJogos';

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
