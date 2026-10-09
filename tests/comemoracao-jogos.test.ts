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
 * `casca/FimDaRodada` (`celebrar({ tipo: 'rodada' })`), nunca dentro do jogo.
 */

const ARQUIVO: Record<MinigameId, string> = {
  memory: 'MemoriaDoPrototipo',
  wordsearch: 'CacaPalavrasDoPrototipo',
  blitz: 'DueloDoPrototipo',
  termo: 'TermoDoPrototipo',
  scramble: 'FraseDoPrototipo',
  karaoke: 'KaraokeDoPrototipo',
  escuta: 'EscutaDoPrototipo',
  ditado: 'DitadoDoPrototipo',
  conectores: 'ConectoresDoPrototipo',
  karuta: 'culturais/KarutaDoPrototipo',
  choseong: 'culturais/ChoseongDoPrototipo',
  tenis: 'culturais/RaliDoPrototipo',
  koffer: 'culturais/KofferDoPrototipo',
  bao: 'culturais/BaoDoPrototipo',
  vitendawili: 'culturais/VitendawiliDoPrototipo',
  shiritori: 'culturais/ShiritoriDoPrototipo',
  cadavre: 'culturais/CadavreDoPrototipo',
  taboo: 'culturais/TabuDoPrototipo',
};

/**
 * Nos tabuleiros do protótipo dois jogos NÃO têm o momento "errou": no Caça-palavras o traço errado diz
 * "Tente de novo" e não conta erro, e no Cadavre a frase só diz quantas palavras entraram.
 */
const SEM_MOMENTO_DE_ERRO: ReadonlySet<MinigameId> = new Set(['wordsearch', 'cadavre']);

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
        if (SEM_MOMENTO_DE_ERRO.has(id)) expect(src).not.toMatch(/celebrar\(\{\s*tipo: 'erro'/);
        else expect(src).toMatch(/celebrar\(\{\s*tipo: 'erro'/);
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
    expect(ler('components/minigames/casca/FimDaRodada.tsx')).toMatch(/celebrar\(\{\s*tipo: 'rodada'/);
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
