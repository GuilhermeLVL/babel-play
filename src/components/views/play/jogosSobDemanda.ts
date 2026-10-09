import type { MinigameId } from '../../../core/minigames/types';
import { lazyComRecarga } from '../../../lib/lazyComRecarga';

/**
 * AS TELAS DE JOGO SOB DEMANDA (perf do `/jogar`, 03/10/2026).
 *
 * O `/jogar` mostra o lobby; o tabuleiro de um jogo só abre DEPOIS do clique em "Jogar". Com o import
 * estático, os dezoito jogos, a antessala, a casca e o fim da rodada iam no mesmo chunk do lobby
 * (o Lighthouse mobile listava ~100 KB de JS não usado na tela de jogos). Cada um agora é um chunk
 * próprio, baixado ao abrir a antessala (`precarregarJogo`) — quem lê a prévia já baixou o tabuleiro
 * antes de apertar "Jogar" — e `lazyComRecarga`, como as outras telas, sobrevive a um deploy.
 */
export const carregadores: Record<MinigameId, () => Promise<unknown>> = {
  memory: () => import('../../minigames/MemoriaDoPrototipo'),
  wordsearch: () => import('../../minigames/CacaPalavrasDoPrototipo'),
  blitz: () => import('../../minigames/DueloDoPrototipo'),
  termo: () => import('../../minigames/TermoDoPrototipo'),
  scramble: () => import('../../minigames/FraseDoPrototipo'),
  karaoke: () => import('../../minigames/KaraokeDoPrototipo'),
  escuta: () => import('../../minigames/EscutaDoPrototipo'),
  ditado: () => import('../../minigames/DitadoDoPrototipo'),
  conectores: () => import('../../minigames/ConectoresDoPrototipo'),
  karuta: () => import('../../minigames/culturais/KarutaDoPrototipo'),
  choseong: () => import('../../minigames/culturais/ChoseongDoPrototipo'),
  tenis: () => import('../../minigames/culturais/RaliDoPrototipo'),
  koffer: () => import('../../minigames/culturais/KofferDoPrototipo'),
  bao: () => import('../../minigames/culturais/BaoDoPrototipo'),
  vitendawili: () => import('../../minigames/culturais/VitendawiliDoPrototipo'),
  shiritori: () => import('../../minigames/culturais/ShiritoriDoPrototipo'),
  cadavre: () => import('../../minigames/culturais/CadavreDoPrototipo'),
  taboo: () => import('../../minigames/culturais/TabuDoPrototipo'),
};

/** Baixa o tabuleiro do jogo e as telas que o cercam (casca, fim da rodada) sem esperar o clique. */
export function precarregarJogo(jogo: MinigameId): void {
  for (const carregar of [carregadores[jogo], carregarCasca, carregarFim]) carregar().catch(() => {});
}

export const carregarCasca = () => import('../../minigames/casca/CascaDaRodada');
export const carregarFim = () => import('../../minigames/casca/FimDaRodada');

export const CascaDaRodada = lazyComRecarga(carregarCasca);
export const FimDaRodada = lazyComRecarga(carregarFim);
export const AntessalaDaRodada = lazyComRecarga(() => import('../../minigames/AntessalaDaRodada'));
export const ComoSeJoga = lazyComRecarga(() => import('../../minigames/ComoSeJoga'));

/** Os jogos de frase/áudio: telas próprias, montadas antes da tabela abaixo. */
export const TermoGame = lazyComRecarga(() => import('../../minigames/TermoDoPrototipo'));
export const ScrambleGame = lazyComRecarga(() => import('../../minigames/FraseDoPrototipo'));
export const EscutaGame = lazyComRecarga(() => import('../../minigames/EscutaDoPrototipo'));
export const DitadoGame = lazyComRecarga(() => import('../../minigames/DitadoDoPrototipo'));
export const ConectoresGame = lazyComRecarga(() => import('../../minigames/ConectoresDoPrototipo'));
export const KaraokeGame = lazyComRecarga(() => import('../../minigames/KaraokeDoPrototipo'));
