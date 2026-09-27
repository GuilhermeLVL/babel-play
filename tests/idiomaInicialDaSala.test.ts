import { describe, expect, it } from 'vitest';

import { idiomaInicialDaSala } from '../src/core/minigames/source';

/**
 * A SALA ABRE NO IDIOMA QUE TEM PALAVRAS (QA dos jogos, 2026-09-26).
 *
 * Medido com um caderno só em português: a sala mostrava a pílula "português 23" (desmarcada), o
 * idioma vigente continuava "en", "Minhas gravações" dizia 0 e o rodapé "Esta escolha não tem
 * palavras prontas ainda" — a pessoa tinha 23 palavras e a tela dizia que não tinha nenhuma.
 */
const idiomas = [
  { lang: 'pt', total: 24, jogaveis: 23 },
  { lang: 'fr', total: 5, jogaveis: 4 },
];

describe('idiomaInicialDaSala', () => {
  it('gravações num idioma sem material: abre no idioma que tem mais palavras jogáveis', () => {
    expect(idiomaInicialDaSala({ lang: 'en', origem: 'gravacoes' }, idiomas)).toBe('pt');
  });

  it('o idioma vigente com material é respeitado', () => {
    expect(idiomaInicialDaSala({ lang: 'fr', origem: 'gravacoes' }, idiomas)).toBe('fr');
  });

  it('na Trilha o idioma é o da lista curada, não o do caderno', () => {
    expect(idiomaInicialDaSala({ lang: 'en', origem: 'trilha' }, idiomas)).toBe('en');
  });

  it('sem nenhum idioma com material, fica como está', () => {
    expect(idiomaInicialDaSala({ lang: 'en', origem: 'gravacoes' }, [{ lang: 'pt', total: 3, jogaveis: 0 }])).toBe('en');
    expect(idiomaInicialDaSala({ lang: 'en', origem: 'gravacoes' }, [])).toBe('en');
  });

  it('código regional casa com a base (pt-BR vigente, pt no caderno)', () => {
    expect(idiomaInicialDaSala({ lang: 'pt-BR', origem: 'gravacoes' }, idiomas)).toBe('pt-BR');
  });
});
