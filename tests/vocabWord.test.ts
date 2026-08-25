import { describe, it, expect } from 'vitest';
import { resolveWord, buildVocabWord, cardLangs, type MtLike } from '../src/lib/vocabWord';
import { DEFAULT_LANG_CONFIG } from '../src/lib/langConfig';

const config = DEFAULT_LANG_CONFIG; // mine: pt-BR, studying: en-US

describe('resolveWord — as duas regras do produtor único', () => {
  it('palavra no idioma estudado traduz para o MEU idioma', async () => {
    const r = await resolveWord({ word: 'fellow', declaredLang: 'en-US', config });
    expect(r.lang).toBe('en');
    expect(r.targetLang).toBe('pt');
    expect(r.langSource).toBe('declared');
  });

  it('palavra no MEU idioma traduz para o idioma estudado (produzir, não entender)', async () => {
    const r = await resolveWord({ word: 'saudade', declaredLang: 'pt-BR', config });
    expect(r.lang).toBe('pt');
    expect(r.targetLang).toBe('en');
  });

  it('sem rótulo e sem contexto: assume o estudado e REGISTRA como aposta (config)', async () => {
    const r = await resolveWord({ word: 'mystery', config });
    expect(r.lang).toBe('en');
    expect(r.langSource).toBe('config');
  });

  it('o contexto pode derrubar um rótulo errado (frase claramente inglesa rotulada pt)', async () => {
    const r = await resolveWord({
      word: 'country',
      context: 'And so my fellow Americans, ask not what your country can do for you.',
      declaredLang: 'pt-BR',
      config,
    });
    expect(r.lang).toBe('en');
    expect(r.langSource).toBe('detected');
  });
});

describe('buildVocabWord — falha honesta', () => {
  const mtOk: MtLike = { translate: async () => ({ text: 'tradução', engine: 'teste' }) };
  const mtBoom: MtLike = { translate: async () => { throw new Error('boom'); } };

  it('traduz e declara o motor quando há cobertura', async () => {
    const { vocab } = await buildVocabWord({ word: 'fellow', declaredLang: 'en', config }, mtOk);
    expect(vocab.translation).toBe('tradução');
    expect(vocab.mtEngine).toBe('teste');
    expect(vocab.lang).toBe('en');
  });

  it('MT estourou → palavra SEM tradução, sem inventar nada', async () => {
    const { vocab } = await buildVocabWord({ word: 'fellow', declaredLang: 'en', config }, mtBoom);
    expect(vocab.translation).toBe('');
    expect(vocab.mtEngine).toBeUndefined();
  });
});

describe('cardLangs', () => {
  it('grava exatamente o par resolvido (o que evita os 5 produtores divergirem)', async () => {
    const r = await resolveWord({ word: 'fellow', declaredLang: 'en', config });
    expect(cardLangs(r)).toEqual({ srcLang: 'en', tgtLang: 'pt' });
  });
});
