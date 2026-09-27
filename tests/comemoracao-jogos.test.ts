import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type MinigameId,MINIGAMES } from '../src/core/minigames/types';

/**
 * OS 18 JOGOS NO MESMO CAMINHO DE COMEMORAÇÃO (recompensas v2, onda 1).
 *
 * Varredura do fonte: cada jogo comemora acerto e erro pelo motor (`celebrar`), e nenhum compõe a
 * festa à mão — nada de `gameFeel`, `canvas-confetti`, vibração ou rajada direta. Era assim que o
 * mesmo acerto vibrava duas vezes num jogo e nenhuma no outro. O fim de rodada comemora só no
 * `ResultadoDaRodada` (`celebrar({ tipo: 'rodada' })`), nunca dentro do jogo.
 */

const ARQUIVO: Record<MinigameId, string> = {
  memory: 'MemoryGame',
  wordsearch: 'WordSearchGame',
  blitz: 'BlitzGame',
  termo: 'TermoGame',
  scramble: 'ScrambleGame',
  karaoke: 'KaraokeGame',
  escuta: 'EscutaGame',
  ditado: 'DitadoGame',
  conectores: 'ConectoresGame',
  karuta: 'culturais/KarutaGame',
  choseong: 'culturais/ChoseongGame',
  tenis: 'culturais/TenseTennisGame',
  koffer: 'culturais/KofferGame',
  bao: 'culturais/BaoGame',
  vitendawili: 'culturais/VitendawiliGame',
  shiritori: 'culturais/ShiritoriGame',
  cadavre: 'culturais/CadavreExquisGame',
  taboo: 'culturais/TabooGame',
};

const fonte = (id: MinigameId) =>
  readFileSync(join(__dirname, '../src/components/minigames', `${ARQUIVO[id]}.tsx`), 'utf8');

describe('os 18 jogos no motor único de comemoração', () => {
  it('a lista cobre todos os jogos do registro', () => {
    expect(Object.keys(ARQUIVO).sort()).toEqual(Object.keys(MINIGAMES).sort());
  });

  for (const id of Object.keys(ARQUIVO) as MinigameId[]) {
    describe(id, () => {
      const src = fonte(id);

      it('não usa gameFeel nem canvas-confetti', () => {
        expect(src).not.toMatch(/lib\/gameFeel|canvas-confetti/);
      });

      it('comemora acerto e erro pelo motor', () => {
        expect(src).toMatch(/celebrar\(\{\s*tipo: 'acerto'/);
        expect(src).toMatch(/celebrar\(\{\s*tipo: 'erro'/);
      });

      it('não vibra, não solta rajada e não chama a festa antiga à mão', () => {
        expect(src).not.toMatch(/\bvibrar\(|triggerHaptic\(|emitBurst\(|burstFromElement\(|\bcomemorar\(/);
      });

      it('não comemora o fim da rodada dentro do jogo', () => {
        expect(src).not.toMatch(/celebrar\(\{\s*tipo: 'rodada'/);
      });
    });
  }
});

describe('fim de rodada e recompensas', () => {
  const ler = (p: string) => readFileSync(join(__dirname, '../src', p), 'utf8');

  it('o fim de rodada comum comemora a rodada pelas estrelas', () => {
    expect(ler('components/minigames/ResultadoDaRodada.tsx')).toMatch(/celebrar\(\{\s*tipo: 'rodada'/);
  });

  it('o modal de recompensa comemora pelo motor', () => {
    const src = ler('components/RecompensaDesbloqueada.tsx');
    expect(src).toMatch(/celebrar\(\{\s*tipo: '(conquista|bau|nivel)'/);
    expect(src).not.toMatch(/\bcomemorar\(/);
  });

  it('gameFeel saiu: nada mais o importava depois do motor', () => {
    expect(existsSync(join(__dirname, '../src/lib/gameFeel.ts'))).toBe(false);
  });

  it('canvas-confetti saiu das dependências', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const todas = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(todas).not.toHaveProperty('canvas-confetti');
    expect(todas).not.toHaveProperty('@types/canvas-confetti');
  });
});
