import { describe, it, expect } from 'vitest';
import { buildGrid, matchSelection, cellsBetween, normalizarPalavra } from '../src/core/minigames/wordsearch';
import type { MinigameItem } from '../src/core/minigames/types';

const item = (answer: string, prompt = 'pista'): MinigameItem => ({ answer, prompt, lang: 'en' });
const PALAVRAS = ['house', 'water', 'green', 'book', 'phone'];
const itens = PALAVRAS.map(p => item(p));

describe('normalizarPalavra', () => {
  it('tira acento e caixa — a grade não pode exigir acentuação', () => {
    expect(normalizarPalavra('coração')).toBe('CORACAO');
    expect(normalizarPalavra('Über')).toBe('UBER');
  });
  it('remove o que não é letra (espaço, hífen, pontuação)', () => {
    expect(normalizarPalavra('well-known')).toBe('WELLKNOWN');
    expect(normalizarPalavra('New York!')).toBe('NEWYORK');
  });
});

describe('buildGrid', () => {
  it('toda palavra colocada é RECUPERÁVEL nas células que declarou', () => {
    const g = buildGrid(itens, { seed: 7 });
    for (const p of g.colocadas) {
      const lido = p.celulas.map(c => g.letras[c.linha][c.coluna]).join('');
      expect(lido).toBe(p.palavra);
    }
  });

  it('é determinística: mesma semente, mesma grade', () => {
    const a = buildGrid(itens, { seed: 42 });
    const b = buildGrid(itens, { seed: 42 });
    expect(b.letras).toEqual(a.letras);
    expect(b.colocadas.map(p => p.palavra)).toEqual(a.colocadas.map(p => p.palavra));
  });

  it('a grade cabe a maior palavra', () => {
    const g = buildGrid([item('extraordinary')], { seed: 3 });
    expect(g.tamanho).toBeGreaterThanOrEqual('extraordinary'.length);
  });

  it('cruzamentos só acontecem com a MESMA letra', () => {
    const g = buildGrid(itens, { seed: 11 });
    const ocupadas = new Map<string, string>();
    for (const p of g.colocadas) {
      p.celulas.forEach((c, k) => {
        const chave = `${c.linha},${c.coluna}`;
        const letra = p.palavra[k];
        if (ocupadas.has(chave)) expect(ocupadas.get(chave)).toBe(letra);
        ocupadas.set(chave, letra);
      });
    }
  });

  it('nenhuma célula fica vazia depois do preenchimento', () => {
    const g = buildGrid(itens, { seed: 5 });
    for (const linha of g.letras) for (const c of linha) expect(c).toMatch(/^[A-Z]$/);
  });

  it('palavra que não cabe é REPORTADA, não truncada', () => {
    // Grade minúscula: a maioria não cabe, e isso tem de aparecer em `naoCouberam`.
    const g = buildGrid(itens, { seed: 2, tamanho: 4 });
    for (const p of g.colocadas) {
      expect(p.palavra.length).toBeLessThanOrEqual(4);
      expect(p.celulas.length).toBe(p.palavra.length);
    }
    expect(g.colocadas.length + g.naoCouberam.length).toBe(PALAVRAS.length);
  });

  it('ignora palavras de uma letra só', () => {
    const g = buildGrid([item('a'), item('house')], { seed: 1 });
    expect(g.colocadas.every(p => p.palavra.length >= 2)).toBe(true);
  });
});

describe('matchSelection — o traço do usuário', () => {
  it('reconhece o traço nas duas direções (frente e trás)', () => {
    const g = buildGrid(itens, { seed: 9 });
    const p = g.colocadas[0];
    const inicio = p.celulas[0];
    const fim = p.celulas[p.celulas.length - 1];
    expect(matchSelection(g, inicio, fim)?.palavra).toBe(p.palavra);
    expect(matchSelection(g, fim, inicio)?.palavra).toBe(p.palavra);
  });

  it('traço que não corresponde a nenhuma palavra devolve null', () => {
    const g = buildGrid(itens, { seed: 9 });
    expect(matchSelection(g, { linha: 0, coluna: 0 }, { linha: 0, coluna: 0 })).toBeNull();
  });
});

describe('cellsBetween — o que o dedo cobriu', () => {
  it('linha reta na horizontal e na vertical', () => {
    expect(cellsBetween({ linha: 2, coluna: 0 }, { linha: 2, coluna: 2 })).toEqual([
      { linha: 2, coluna: 0 }, { linha: 2, coluna: 1 }, { linha: 2, coluna: 2 },
    ]);
    expect(cellsBetween({ linha: 0, coluna: 1 }, { linha: 2, coluna: 1 })?.length).toBe(3);
  });

  it('diagonal perfeita, inclusive para trás', () => {
    expect(cellsBetween({ linha: 2, coluna: 2 }, { linha: 0, coluna: 0 })).toEqual([
      { linha: 2, coluna: 2 }, { linha: 1, coluna: 1 }, { linha: 0, coluna: 0 },
    ]);
  });

  it('traço torto (nem reta nem diagonal) é recusado', () => {
    expect(cellsBetween({ linha: 0, coluna: 0 }, { linha: 1, coluna: 3 })).toBeNull();
  });

  it('mesma célula = uma célula', () => {
    expect(cellsBetween({ linha: 1, coluna: 1 }, { linha: 1, coluna: 1 })).toEqual([{ linha: 1, coluna: 1 }]);
  });
});
