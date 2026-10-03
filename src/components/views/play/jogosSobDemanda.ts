import type { MinigameId } from '../../../core/minigames/types';
import { lazyComRecarga } from '../../../lib/lazyComRecarga';

/**
 * AS TELAS DE JOGO SOB DEMANDA (perf do `/jogar`, 03/10/2026).
 *
 * O `/jogar` mostra o lobby; o tabuleiro de um jogo só abre DEPOIS do clique em "Jogar". Com o import
 * estático, os dezoito jogos, a antessala, a casca, o resultado e o tour iam no mesmo chunk do lobby
 * (o Lighthouse mobile listava ~100 KB de JS não usado na tela de jogos). Cada um agora é um chunk
 * próprio, baixado ao abrir a antessala (`precarregarJogo`) — quem lê a prévia já baixou o tabuleiro
 * antes de apertar "Jogar" — e `lazyComRecarga`, como as outras telas, sobrevive a um deploy.
 */
export const carregadores: Record<MinigameId, () => Promise<unknown>> = {
  memory: () => import('../../minigames/MemoryGame'),
  wordsearch: () => import('../../minigames/WordSearchGame'),
  blitz: () => import('../../minigames/BlitzGame'),
  termo: () => import('../../minigames/TermoGame'),
  scramble: () => import('../../minigames/ScrambleGame'),
  karaoke: () => import('../../minigames/KaraokeGame'),
  escuta: () => import('../../minigames/EscutaGame'),
  ditado: () => import('../../minigames/DitadoGame'),
  conectores: () => import('../../minigames/ConectoresGame'),
  karuta: () => import('../../minigames/culturais/KarutaGame'),
  choseong: () => import('../../minigames/culturais/ChoseongGame'),
  tenis: () => import('../../minigames/culturais/TenseTennisGame'),
  koffer: () => import('../../minigames/culturais/KofferGame'),
  bao: () => import('../../minigames/culturais/BaoGame'),
  vitendawili: () => import('../../minigames/culturais/VitendawiliGame'),
  shiritori: () => import('../../minigames/culturais/ShiritoriGame'),
  cadavre: () => import('../../minigames/culturais/CadavreExquisGame'),
  taboo: () => import('../../minigames/culturais/TabooGame'),
};

/** Baixa o tabuleiro do jogo e as telas que o cercam (casca, resultado) sem esperar o clique. */
export function precarregarJogo(jogo: MinigameId): void {
  for (const carregar of [carregadores[jogo], carregarCasca, carregarResultado]) carregar().catch(() => {});
}

export const carregarCasca = () => import('../../minigames/casca/CascaDaRodada');
export const carregarResultado = () => import('../../minigames/ResultadoDaRodada');

export const CascaDaRodada = lazyComRecarga(carregarCasca);
export const ResultadoDaRodada = lazyComRecarga(carregarResultado);
export const AntessalaDaRodada = lazyComRecarga(() => import('../../minigames/AntessalaDaRodada'));
export const ComoSeJoga = lazyComRecarga(() => import('../../minigames/ComoSeJoga'));
export const TourGuiado = lazyComRecarga(() => import('../../minigames/TourGuiado'));

/** Os jogos de frase/áudio: telas próprias, montadas antes da tabela abaixo. */
export const TermoGame = lazyComRecarga(() => import('../../minigames/TermoGame'));
export const ScrambleGame = lazyComRecarga(() => import('../../minigames/ScrambleGame'));
export const EscutaGame = lazyComRecarga(() => import('../../minigames/EscutaGame'));
export const DitadoGame = lazyComRecarga(() => import('../../minigames/DitadoGame'));
export const ConectoresGame = lazyComRecarga(() => import('../../minigames/ConectoresGame'));
export const KaraokeGame = lazyComRecarga(() => import('../../minigames/KaraokeGame'));
