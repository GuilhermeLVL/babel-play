import { describe, expect, it } from 'vitest';

import { candidatosDeLema, normalizarConsulta } from '../src/core/texto/lemas';

describe('normalizarConsulta — o que o toque entrega não é o que o dicionário indexa', () => {
  it('tira pontuação das bordas e preserva a interna (apóstrofo, hífen)', () => {
    expect(normalizarConsulta('  "Hello," ')).toBe('Hello');
    expect(normalizarConsulta('¿qué?')).toBe('qué');
    expect(normalizarConsulta("don't.")).toBe("don't");
    expect(normalizarConsulta('guarda-chuva!')).toBe('guarda-chuva');
  });

  it('palavra só de pontuação vira vazio (não há o que consultar)', () => {
    expect(normalizarConsulta('...')).toBe('');
  });
});

describe('candidatosDeLema — a forma exata primeiro, a regra depois', () => {
  it('a forma tocada vem sempre antes de qualquer regra', () => {
    const c = candidatosDeLema('Houses', 'en');
    expect(c[0]).toBe('Houses');
    expect(c[1]).toBe('houses');
    expect(c).toContain('house');
  });

  it('mapa forma→lema do pacote (Wiktextract/Wikidata) vence as regras', () => {
    // `sabia` não tem regra que chegue a `saber`: só o mapa do pacote sabe.
    const c = candidatosDeLema('Sabia', 'pt', { sabia: 'saber' });
    expect(c.slice(0, 3)).toEqual(['Sabia', 'sabia', 'saber']);
  });

  it('inglês: plurais', () => {
    expect(candidatosDeLema('cities', 'en')).toContain('city');
    expect(candidatosDeLema('wolves', 'en')).toContain('wolf');
    expect(candidatosDeLema('knives', 'en')).toContain('knife');
    expect(candidatosDeLema('boxes', 'en')).toContain('box');
    expect(candidatosDeLema('dogs', 'en')).toContain('dog');
  });

  it('inglês: -ed, -ing e possessivo', () => {
    expect(candidatosDeLema('played', 'en')).toContain('play');
    expect(candidatosDeLema('liked', 'en')).toContain('like');
    expect(candidatosDeLema('stopped', 'en')).toContain('stop');
    expect(candidatosDeLema('tried', 'en')).toContain('try');
    expect(candidatosDeLema('making', 'en')).toContain('make');
    expect(candidatosDeLema('running', 'en')).toContain('run');
    expect(candidatosDeLema('walking', 'en')).toContain('walk');
    expect(candidatosDeLema("John's", 'en')).toContain('john');
  });

  it('inglês: irregulares comuns', () => {
    expect(candidatosDeLema('went', 'en')).toContain('go');
    expect(candidatosDeLema('children', 'en')).toContain('child');
    expect(candidatosDeLema('was', 'en')).toContain('be');
  });

  it('inglês: não corta raiz curta demais (sing ≠ s, bed ≠ b)', () => {
    expect(candidatosDeLema('sing', 'en')).not.toContain('s');
    expect(candidatosDeLema('bed', 'en')).not.toContain('b');
    expect(candidatosDeLema('glass', 'en')).not.toContain('glas');
  });

  it('português: plurais', () => {
    expect(candidatosDeLema('corações', 'pt')).toContain('coração');
    expect(candidatosDeLema('pães', 'pt')).toContain('pão');
    expect(candidatosDeLema('animais', 'pt')).toContain('animal');
    expect(candidatosDeLema('papéis', 'pt')).toContain('papel');
    expect(candidatosDeLema('homens', 'pt')).toContain('homem');
    expect(candidatosDeLema('flores', 'pt')).toContain('flor');
    expect(candidatosDeLema('luzes', 'pt')).toContain('luz');
    expect(candidatosDeLema('casas', 'pt')).toContain('casa');
  });

  it('português: feminino e feminino plural', () => {
    expect(candidatosDeLema('bonita', 'pt')).toContain('bonito');
    expect(candidatosDeLema('bonitas', 'pt')).toContain('bonito');
    expect(candidatosDeLema('professora', 'pt')).toContain('professor');
    expect(candidatosDeLema('portuguesa', 'pt')).toContain('português');
  });

  it('idioma sem regras: só a forma e a minúscula (nunca inventa)', () => {
    expect(candidatosDeLema('Дома', 'ru')).toEqual(['Дома', 'дома']);
  });

  it('palavra vazia não tem candidato', () => {
    expect(candidatosDeLema('  ', 'en')).toEqual([]);
  });
});
