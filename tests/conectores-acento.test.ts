/**
 * Os conectores portugueses acentuados (porém, além, aliás) nunca acendiam: a lista guarda a
 * forma COM acento e a comparação normalizava para sem acento.
 */
import { describe, it, expect } from 'vitest';
import { buildRodadasConectores } from '../src/core/minigames/escuta';

const fala = (text: string) => ({ id: text.slice(0, 8), text, translation: '', lang: 'pt', startMs: 0, endMs: 0 });

describe('conectores acentuados', () => {
  it.each(['porém', 'além', 'aliás'])('"%s" é reconhecido como conector', (conector) => {
    const r = buildRodadasConectores(
      [fala(`Eu queria ir ao mercado ${conector} estava chovendo muito hoje`)],
      { lang: 'pt' },
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].alvos.length).toBeGreaterThan(0);
  });

  it('conector sem acento continua funcionando', () => {
    const r = buildRodadasConectores(
      [fala('Eu queria ir ao mercado porque estava chovendo muito hoje')],
      { lang: 'pt' },
    );
    expect(r[0]?.alvos.length).toBeGreaterThan(0);
  });
});
