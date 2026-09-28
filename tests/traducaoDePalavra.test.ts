import { describe, expect, it, vi } from 'vitest';

import type { DictionaryResult } from '../src/lib/dictionary';
import { DEFAULT_LANG_CONFIG } from '../src/lib/langConfig';
import { glosaDoVerbete, glosaServe, traduzirPalavraSolta } from '../src/lib/traducaoDePalavra';
import { buildVocabWord, type MtLike } from '../src/lib/vocabWord';

const mtQueNaoDeveriaSerChamado = (): MtLike & { translate: ReturnType<typeof vi.fn> } => ({
  translate: vi.fn(async () => ({ text: 'da máquina', engine: 'server-llm-mt' })),
});

describe('traduzirPalavraSolta — a escada do toque (local → Wiktionary → MT)', () => {
  it('glosa local responde: NENHUMA chamada de MT, nem de Wiktionary', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const wiktionary = vi.fn(async () => 'cão');
    const r = await traduzirPalavraSolta('dogs', 'en', 'pt', mt, {
      local: async () => ({ glosa: 'cachorro', lema: 'dog' }),
      wiktionary,
    });
    expect(r).toEqual({ texto: 'cachorro', fonte: 'dicionario-local', motor: 'dicionario-local', lema: 'dog' });
    expect(mt.translate).not.toHaveBeenCalled();
    expect(wiktionary).not.toHaveBeenCalled();
  });

  it('sem glosa local, o Wiktionary responde antes do MT', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const r = await traduzirPalavraSolta('fellow', 'en', 'pt', mt, {
      local: async () => null,
      wiktionary: async () => 'companheiro',
    });
    expect(r?.fonte).toBe('wiktionary');
    expect(r?.texto).toBe('companheiro');
    expect(mt.translate).not.toHaveBeenCalled();
  });

  it('MT só quando local e Wiktionary falham — e declara o motor', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const r = await traduzirPalavraSolta('zeitgeist', 'en', 'pt', mt, {
      local: async () => null,
      wiktionary: async () => null,
    });
    expect(r).toEqual({ texto: 'da máquina', fonte: 'mt', motor: 'server-llm-mt' });
    expect(mt.translate).toHaveBeenCalledWith('zeitgeist', 'en', 'pt');
  });

  it('fonte que estoura não derruba a escada: segue para a próxima', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const r = await traduzirPalavraSolta('x', 'en', 'pt', mt, {
      local: async () => { throw new Error('cache quebrado'); },
      wiktionary: async () => { throw new Error('offline'); },
    });
    expect(r?.fonte).toBe('mt');
  });

  it('sem motor de MT para o par (mt = null): local ainda responde; sem local, null', async () => {
    const achou = await traduzirPalavraSolta('casa', 'es', 'pt', null, {
      local: async () => ({ glosa: 'casa', lema: 'casa' }),
      wiktionary: async () => null,
    });
    expect(achou?.fonte).toBe('dicionario-local');
    const nada = await traduzirPalavraSolta('casa', 'es', 'pt', null, {
      local: async () => null,
      wiktionary: async () => null,
    });
    expect(nada).toBeNull();
  });
});

describe('glosaServe — dado ruim do dump não vira resposta', () => {
  it('recusa glosa em escrita errada para destino latino (aljamiado do Wikidata)', () => {
    expect(glosaServe('كَاجَ', 'pt')).toBe(false);
    expect(glosaServe('casa', 'pt')).toBe(true);
    expect(glosaServe('hidrogénio/hidrogênio', 'pt')).toBe(true);
  });

  it('para destino de outra escrita não aplica o filtro latino', () => {
    expect(glosaServe('дом', 'ru')).toBe(true);
  });

  it('recusa vazio e verbete longo demais', () => {
    expect(glosaServe('', 'pt')).toBe(false);
    expect(glosaServe('a'.repeat(80), 'pt')).toBe(false);
  });
});

describe('glosaDoVerbete — o Wiktionary só serve de tradução quando define NO idioma de destino', () => {
  const verbete = (glossLang: string, definition: string): DictionaryResult => ({
    status: 'found',
    entry: {
      word: 'dog',
      lang: 'en',
      senses: [{ partOfSpeech: 'Substantivo', definition, examples: [] }],
      glossLang,
      source: { name: 'Wiktionary', wiki: `${glossLang}.wiktionary.org`, url: '', license: 'CC BY-SA 4.0' },
    },
  });

  it('pt.wiktionary definindo em português: primeira acepção, cortada', () => {
    expect(glosaDoVerbete(verbete('pt', '(zoologia) cão, cachorro'), 'pt')).toBe('cão');
  });

  it('definição em inglês não é tradução para português', () => {
    expect(glosaDoVerbete(verbete('en', 'a domesticated canine'), 'pt')).toBeNull();
  });

  it('metalinguagem ("plural de …") não é tradução', () => {
    expect(glosaDoVerbete(verbete('pt', 'plural de dog'), 'pt')).toBeNull();
  });

  it('não encontrado / erro → null', () => {
    expect(glosaDoVerbete({ status: 'not-found', word: 'x', sourceUrl: '' }, 'pt')).toBeNull();
    expect(glosaDoVerbete({ status: 'error', message: 'x' }, 'pt')).toBeNull();
  });
});

describe('buildVocabWord — toque numa palavra com glosa local não chama MT', () => {
  const config = DEFAULT_LANG_CONFIG; // mine: pt-BR, studying: en-US

  it('grava a glosa e a fonte no cartão, sem MT', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const { vocab, fonte } = await buildVocabWord({ word: 'houses', declaredLang: 'en', config }, mt, {
      local: async () => ({ glosa: 'casa', lema: 'house' }),
      wiktionary: async () => null,
    });
    expect(vocab.translation).toBe('casa');
    expect(vocab.mtEngine).toBe('dicionario-local');
    expect(fonte).toBe('dicionario-local');
    expect(mt.translate).not.toHaveBeenCalled();
  });

  it('com o dicionário local de verdade (public/trilha/en.json): "houses" sai sem MT', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const { vocab } = await buildVocabWord({ word: 'Houses,', declaredLang: 'en', config }, mt, {
      wiktionary: async () => null,
    });
    expect(vocab.translation).not.toBe('');
    expect(vocab.mtEngine).toBe('dicionario-local');
    expect(mt.translate).not.toHaveBeenCalled();
  });

  it('com o pacote de glosas de verdade (public/glosas/es-pt.json): "hablar" sai sem MT', async () => {
    const mt = mtQueNaoDeveriaSerChamado();
    const { vocab } = await buildVocabWord({ word: 'hablar', declaredLang: 'es', config }, mt, {
      wiktionary: async () => null,
    });
    expect(vocab.translation).toBe('falar');
    expect(mt.translate).not.toHaveBeenCalled();
  });
});
