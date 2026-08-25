import { describe, it, expect } from 'vitest';
import { LANGUAGES, langMatches } from '../src/lib/languages';

/** Idiomas que casam com o termo, pelo rótulo nativo. */
const buscar = (q: string) => LANGUAGES.filter(l => langMatches(l, q)).map(l => l.label);

describe('langMatches (busca do seletor de idioma)', () => {
  it('acha pelo NOME EM PORTUGUÊS — o rótulo está no idioma nativo', () => {
    expect(buscar('japonês')).toEqual(['日本語']);
    expect(buscar('russo')).toEqual(['Русский']);
    expect(buscar('chinês')).toEqual(['中文 (简体)', '中文 (繁體)']);
  });

  it('ignora acento (ninguém digita "japonês" com circunflexo na pressa)', () => {
    expect(buscar('japones')).toEqual(['日本語']);
    expect(buscar('frances')).toEqual(['Français']);
    expect(buscar('portugues')).toEqual(['Português (BR)', 'Português (PT)']);
  });

  it('acha pelo rótulo nativo', () => {
    expect(buscar('Português')).toEqual(['Português (BR)', 'Português (PT)']);
    expect(buscar('日本')).toEqual(['日本語']);
  });

  it('acha pelo código (BCP-47 e ISO-639-1)', () => {
    expect(buscar('ja')).toEqual(['日本語']);
    expect(buscar('pt-PT')).toEqual(['Português (PT)']);
  });

  it('termo vazio devolve tudo; termo sem correspondência devolve nada', () => {
    expect(buscar('').length).toBe(LANGUAGES.length);
    expect(buscar('klingon')).toEqual([]);
  });
});
