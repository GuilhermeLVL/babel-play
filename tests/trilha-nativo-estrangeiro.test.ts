import { describe, expect, it } from 'vitest';
import { carregarTrilha } from '../src/data/trilha/carregar';

/**
 * Quem estuda com outro idioma nativo não pode receber a tradução de um par alheio. A trilha v1 do
 * inglês traz glosa PORTUGUESA embutida: para um alemão isso não é pista, é uma terceira língua
 * servida como resposta — e os jogos de par montariam cartas que ensinam errado.
 */
describe('trilha para quem não fala português', () => {
  it('o inglês (v1) não serve a glosa portuguesa a um nativo alemão', async () => {
    const paraAlemao = await carregarTrilha('en', 'de');
    expect(paraAlemao).toBeTruthy();
    const pares = Object.values(paraAlemao!.niveis).flat();
    expect(pares.length).toBeGreaterThan(100);
    expect(pares.every(p => p![1] === '')).toBe(true);
    // A palavra e a frase continuam: a trilha joga monolíngue, não some.
    expect(pares.every(p => !!p![0])).toBe(true);
  });

  it('para um nativo português a glosa embutida continua valendo', async () => {
    const paraBrasileiro = await carregarTrilha('en', 'pt');
    const pares = Object.values(paraBrasileiro!.niveis).flat();
    expect(pares.filter(p => !!p![1]).length).toBeGreaterThan(100);
  });

  it('trilha v2 sem par para o nativo entrega palavra sem tradução', async () => {
    const paraAlemao = await carregarTrilha('es', 'de');
    const pares = Object.values(paraAlemao!.niveis).flat();
    expect(pares.every(p => p![1] === '')).toBe(true);
  });
});
