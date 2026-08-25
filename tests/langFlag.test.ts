import { describe, it, expect } from 'vitest';
import { langCountry, langShortLabel } from '../src/lib/langFlag';

describe('langCountry', () => {
  it('região explícita do BCP-47 vence', () => {
    expect(langCountry('pt-BR')).toBe('BR');
    expect(langCountry('pt-PT')).toBe('PT');
    expect(langCountry('en-GB')).toBe('GB');
    expect(langCountry('es-MX')).toBe('MX');
    expect(langCountry('zh-TW')).toBe('TW');
  });

  it('código curto usa o país da primeira variante oferecida', () => {
    expect(langCountry('pt')).toBe('BR');
    expect(langCountry('en')).toBe('US');
    expect(langCountry('es')).toBe('ES');
    expect(langCountry('zh')).toBe('CN');
    expect(langCountry('nb')).toBe('NO');
  });

  it('desconhecido/vazio → "" (a UI cai no chip textual, nunca inventa bandeira)', () => {
    expect(langCountry('xx')).toBe('');
    expect(langCountry('')).toBe('');
  });

  it('é case-insensitive no idioma', () => {
    expect(langCountry('PT-br')).toBe('BR');
  });
});

describe('langShortLabel', () => {
  it('devolve o ISO-639-1 maiúsculo', () => {
    expect(langShortLabel('pt-BR')).toBe('PT');
    expect(langShortLabel('en')).toBe('EN');
  });
  it('vazio → "?"', () => {
    expect(langShortLabel('')).toBe('?');
  });
});
