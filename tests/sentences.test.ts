import { describe, it, expect } from 'vitest';
import { toSentences, seedFromSentence, seedFromSelection } from '../src/lib/sentences';
import type { UtteranceRow } from '../src/data/api';

const row = (over: Partial<UtteranceRow>): UtteranceRow => ({
  id: 'u1',
  sessionId: 's1',
  idx: 0,
  speakerName: 'Você',
  source: 'mic',
  sourceText: 'hello world',
  translatedText: 'olá mundo',
  sourceLang: 'en-US',
  targetLang: 'pt-BR',
  tStartMs: 0,
  tEndMs: 1000,
  ...over,
} as UtteranceRow);

describe('toSentences', () => {
  it('ordena por idx e reindexa', () => {
    const out = toSentences([row({ id: 'b', idx: 2 }), row({ id: 'a', idx: 1 })]);
    expect(out.map(s => s.id)).toEqual(['a', 'b']);
    expect(out.map(s => s.index)).toEqual([0, 1]);
  });

  it('descarta utterances sem texto e não inventa idioma', () => {
    const out = toSentences([
      row({ id: 'vazia', sourceText: '   ' }),
      row({ id: 'sem-lang', sourceLang: null as any }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('sem-lang');
    expect(out[0].lang).toBe(''); // '' = desconhecido, jamais chutado
  });

  it('normaliza BCP-47 para ISO-639-1', () => {
    const [s] = toSentences([row({})]);
    expect(s.lang).toBe('en');
    expect(s.translationLang).toBe('pt');
  });
});

describe('seeds de prática', () => {
  it('seedFromSentence preserva id/idioma e omite tradução vazia', () => {
    const [s] = toSentences([row({ translatedText: '' })]);
    const seed = seedFromSentence(s, 'sess-1', 'karaoke');
    expect(seed).toMatchObject({ sentenceId: 'u1', sessionId: 'sess-1', lang: 'en', exercise: 'karaoke' });
    expect(seed.translation).toBeUndefined();
  });

  it('seedFromSelection apara texto e normaliza idioma', () => {
    const seed = seedFromSelection('  good morning  ', 'en-GB');
    expect(seed.text).toBe('good morning');
    expect(seed.lang).toBe('en');
  });
});
