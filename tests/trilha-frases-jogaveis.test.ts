import { describe, expect, it } from 'vitest';

import { frasesDaTrilha } from '../src/core/learning/trilha';
import { buildScrambleRounds } from '../src/core/minigames/scramble';
import { carregarTrilha } from '../src/data/trilha/carregar';

/**
 * A frase da trilha só vira jogo quando vem com a tradução: `fraseJogavel` a exige, e sem ela
 * quem monta a frase não sabe qual frase montar. Este teste existe porque a trilha passou meses
 * com exemplo em 90% das palavras e os jogos de frase bloqueados por falta do par em português.
 */
describe('as frases da trilha abrem os jogos de frase', () => {
  for (const lang of ['es', 'fr', 'de']) {
    it(`${lang} entrega frases com tradução`, async () => {
      const dado = await carregarTrilha(lang, 'pt');
      expect(dado).toBeTruthy();

      const falas = frasesDaTrilha(dado!, 'A1');
      expect(falas.length).toBeGreaterThan(100);
      expect(falas.every(f => f.text.trim() && f.translation.trim())).toBe(true);

      // O construtor real do jogo, não uma aproximação.
      expect(buildScrambleRounds(falas, { quantidade: 20 }).length).toBeGreaterThanOrEqual(5);
    });
  }

  it('o inglês (v1, tradução embutida) segue intacto', async () => {
    const dado = await carregarTrilha('en', 'pt');
    const falas = frasesDaTrilha(dado!, 'A1');
    expect(falas.length).toBeGreaterThan(100);
    expect(buildScrambleRounds(falas, { quantidade: 20 }).length).toBeGreaterThanOrEqual(5);
  });
});
