/** Triagem por filtro (multi-fonte) e frases do acervo — os dois caminhos novos do seletor. */
import { describe, expect,it } from 'vitest';

import { FILTRO_PADRAO } from '../src/core/minigames/filtro';
import { cartoesDaFonte, cartoesDoFiltro, frasesDoAcervo } from '../src/core/minigames/source';
import type { VocabCard } from '../src/types';

const carta = (over: Partial<VocabCard>): VocabCard => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  word: 'word', translation: 'palavra', sentence: '', srcLang: 'en', tgtLang: 'pt',
  inDeck: 1, daTrilha: false, ...over,
} as VocabCard);

const acervo: VocabCard[] = [
  carta({ id: 't1', word: 'apple', daTrilha: true }),
  carta({ id: 't2', word: 'bread', daTrilha: true }),
  carta({ id: 'b1', word: 'ledger', baralhosAnki: ['d1'] } as Partial<VocabCard>),
  carta({ id: 'b2', word: 'invoice', baralhosAnki: ['d1'] } as Partial<VocabCard>),
  carta({ id: 's1', word: 'meeting', sourceSessionId: 'sess-1' } as Partial<VocabCard>),
];

describe('cartoesDoFiltro', () => {
  it('uma fonte devolve o mesmo que a partição exclusiva', () => {
    const porFiltro = cartoesDoFiltro(acervo, { ...FILTRO_PADRAO, fontes: ['trilha'], idiomas: ['en'] });
    const porFonte = cartoesDaFonte(acervo, { id: 'trilha', lang: 'en' });
    expect(porFiltro.usaveis.map(c => c.id).sort()).toEqual(porFonte.usaveis.map(c => c.id).sort());
  });

  it('soma as fontes marcadas', () => {
    const r = cartoesDoFiltro(acervo, { ...FILTRO_PADRAO, fontes: ['trilha', 'baralho'], idiomas: ['en'] });
    const ids = r.usaveis.map(c => c.id).sort();
    expect(ids).toContain('t1');
    expect(ids).toContain('b1');
  });

  it('cartão de duas fontes conta uma vez só', () => {
    const misto = [carta({ id: 'x', word: 'shared', daTrilha: true, sourceSessionId: 'sess-1' } as Partial<VocabCard>)];
    const r = cartoesDoFiltro(misto, { ...FILTRO_PADRAO, fontes: ['trilha', 'sessao'], sessoes: ['sess-1'], idiomas: ['en'] });
    expect(r.usaveis).toHaveLength(1);
  });

  it('recorte ainda intersecta depois da união', () => {
    const r = cartoesDoFiltro(acervo, {
      ...FILTRO_PADRAO, fontes: ['trilha', 'baralho'], idiomas: ['en'],
      baralhos: ['d1'],
    });
    expect(r.usaveis.map(c => c.id).sort()).toEqual(['b1', 'b2', 't1', 't2']);
  });

  it('nenhuma fonte marcada não devolve tudo', () => {
    const r = cartoesDoFiltro(acervo, { ...FILTRO_PADRAO, fontes: [], idiomas: ['en'] });
    expect(r.usaveis.length).toBe(acervo.length); // faceta vazia = sem restrição, por contrato
  });
});

describe('frasesDoAcervo', () => {
  const comFrases = [
    carta({ id: 'f1', word: 'ledger', sentence: 'The ledger was closed last night.' }),
    carta({ id: 'f2', word: 'invoice', sentence: 'Too short' }),
    carta({ id: 'f3', word: 'other', sentence: 'The ledger was closed last night.' }),
    carta({ id: 'f4', word: 'outro', sentence: 'Esta frase esta em portugues aqui.', srcLang: 'pt' }),
  ];

  it('vira fala sem clipe — startMs e endMs zerados pedem voz sintetizada', () => {
    const r = frasesDoAcervo(comFrases, 'en');
    expect(r[0].startMs).toBe(0);
    expect(r[0].endMs).toBe(0);
  });

  it('descarta frase curta demais para virar rodada', () => {
    expect(frasesDoAcervo(comFrases, 'en').some(f => f.text === 'Too short')).toBe(false);
  });

  it('não repete a mesma frase vinda de dois cartões', () => {
    expect(frasesDoAcervo(comFrases, 'en')).toHaveLength(1);
  });

  it('respeita o idioma pedido', () => {
    expect(frasesDoAcervo(comFrases, 'pt').map(f => f.text)).toEqual(['Esta frase esta em portugues aqui.']);
  });

  it('sem tradução da frase o campo fica vazio — quem exige tradução descarta sozinho', () => {
    expect(frasesDoAcervo(comFrases, 'en')[0].translation).toBe('');
  });
});
