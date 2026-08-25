import { describe, it, expect } from 'vitest';
import {
  avaliarCartao, avaliarFrase, triarCartoes, contarPorMotivo, pistaUtil, resumoDosPulados,
  ehGramatical, ROTULO_MOTIVO, type MotivoDescarte,
} from '../src/core/learning/quality';
import { cartoesDaFonte, idiomasDisponiveis, rotuloDaFonte } from '../src/core/minigames/source';
import { promptFor } from '../src/core/minigames/itemSource';
import type { VocabCard } from '../src/types';

/**
 * A RÉGUA E A FONTE.
 *
 * Cada caso reprovado aqui é um caso REAL, visto na tela enquanto jogava — não hipótese. Se algum
 * deles voltar a passar, o Quarteto volta a pedir para soletrar a palavra cuja definição é
 * "Isso é", e o jogo volta a parecer quebrado funcionando.
 */

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c', word: 'house', phonetics: '', translation: 'casa', explanation: '',
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: '2026-08-01T00:00:00.000Z',
    fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: '2026-08-01T00:00:00.000Z', inDeck: true, srcLang: 'en', ...over,
  };
}

describe('a régua reprova o que apareceu de verdade no jogo', () => {
  const casos: Array<[string, Partial<VocabCard>, MotivoDescarte]> = [
    ['fragmento de fala como definição', { translation: 'Isso é' }, 'pista-ruim'],
    ['interjeição como definição', { translation: 'rápida!!' }, 'pista-ruim'],
    ['frase cortada como definição', { translation: '...ambém o idioma que' }, 'pista-ruim'],
    ['nome próprio quebrado', { word: 'T-Lisa', translation: 'Tu' }, 'pista-ruim'],
    ['palavra de uma letra', { word: 'a', translation: 'um' }, 'palavra-curta'],
    ['dígito no meio da palavra', { word: 'covid19', translation: 'doença' }, 'palavra-ruido'],
    ['letra repetida de captura', { word: 'aaah', translation: 'suspiro' }, 'palavra-ruido'],
    ['sem tradução e sem frase', { translation: '', sentence: '' }, 'sem-pista'],
    ['tradução igual à palavra', { word: 'hotel', translation: 'Hotel' }, 'traducao-igual'],
    ['tradução igual só variando acento', { word: 'video', translation: 'vídeo' }, 'traducao-igual'],
    ['artigo inglês', { word: 'the', translation: 'o' }, 'gramatical'],
    ['pronome português', { word: 'aquilo', translation: 'that', srcLang: 'pt' }, 'gramatical'],
  ];

  for (const [nome, over, motivo] of casos) {
    it(nome + ' → ' + motivo, () => {
      const v = avaliarCartao(card(over));
      expect(v.serve).toBe(false);
      expect(v.motivo).toBe(motivo);
    });
  }

  it('aprova o que presta, e a pontuação premia pista curta com frase de origem', () => {
    const simples = avaliarCartao(card({ translation: 'casa' }));
    const completo = avaliarCartao(card({ translation: 'casa', sentence: 'I live in a house.' }));
    const prolixo = avaliarCartao(card({ translation: 'lugar onde se mora' }));
    expect(simples.serve && completo.serve && prolixo.serve).toBe(true);
    expect(completo.pontuacao).toBeGreaterThan(simples.pontuacao);
    expect(simples.pontuacao).toBeGreaterThan(prolixo.pontuacao);
  });

  it('todo motivo tem rótulo e conserto escritos — a tela não inventa texto', () => {
    for (const motivo of Object.keys(ROTULO_MOTIVO) as MotivoDescarte[]) {
      expect(ROTULO_MOTIVO[motivo].titulo.length).toBeGreaterThan(3);
      expect(ROTULO_MOTIVO[motivo].conserto.length).toBeGreaterThan(10);
    }
  });
});

describe('a régua gramatical é POR IDIOMA', () => {
  it('não usa a lista inglesa para reprovar palavra de outro idioma', () => {
    // "no" é advérbio em inglês e preposição em português — mas em espanhol/italiano
    // "sole", "mare" etc. não podem cair na lista errada. O caso duro: idioma SEM lista.
    expect(ehGramatical('the', 'en')).toBe(true);
    expect(ehGramatical('the', 'pt')).toBe(false);
    expect(ehGramatical('aquilo', 'pt')).toBe(true);
    expect(ehGramatical('aquilo', 'en')).toBe(false);
  });

  it('idioma sem lista não filtra NADA — filtro que erra é pior que filtro nenhum', () => {
    expect(ehGramatical('le', 'fr')).toBe(false);
    expect(ehGramatical('der', 'de')).toBe(false);
    // Palavra de conteúdo em idioma sem lista passa inteira, sem a régua inglesa opinar.
    expect(avaliarCartao(card({ word: 'fenêtre', translation: 'janela', srcLang: 'fr' })).serve).toBe(true);
    expect(avaliarCartao(card({ word: 'Fenster', translation: 'janela', srcLang: 'de' })).serve).toBe(true);
  });

  it('pista de um caractere não é definição', () => {
    // São sempre artigo ou pronome — e esses já são ruído gramatical por outro caminho.
    expect(pistaUtil('o')).toBe(false);
    expect(pistaUtil('um')).toBe(true);
  });
});

describe('a régua chega ao funil dos jogos', () => {
  it('promptFor recusa a tradução ruim em vez de transformá-la em pergunta', () => {
    expect(promptFor(card({ translation: 'Isso é' }))).toBeNull();
    expect(promptFor(card({ translation: 'rápida!!' }))).toBeNull();
  });

  it('tradução ruim + frase real ainda dá lacuna: são dois defeitos independentes', () => {
    const p = promptFor(card({ translation: 'Isso é', sentence: 'I live in a big house.' }));
    expect(p?.clozed).toBe(true);
    expect(p?.prompt).not.toContain('house');
  });

  it('defeito na PALAVRA invalida o cartão, nem a frase salva', () => {
    expect(promptFor(card({ word: 'a', sentence: 'this is a big house' }))).toBeNull();
  });
});

describe('a fonte separa idioma de defeito', () => {
  const misto = [
    card({ id: 'en1', word: 'house', translation: 'casa', srcLang: 'en' }),
    card({ id: 'en2', word: 'water', translation: 'água', srcLang: 'en' }),
    card({ id: 'pt1', word: 'saudade', translation: 'longing', srcLang: 'pt' }),
    card({ id: 'ruim', word: 'stone', translation: 'Isso é', srcLang: 'en' }),
  ];

  it('cartão de outro idioma NÃO é defeito — vai para a terceira pilha', () => {
    const t = triarCartoes(misto, { lang: 'en' });
    expect(t.usaveis.map(c => c.id).sort()).toEqual(['en1', 'en2']);
    expect(t.outroIdioma.map(c => c.id)).toEqual(['pt1']);
    expect(t.fora.map(f => f.motivo)).toEqual(['pista-ruim']);
  });

  it('trocar o idioma devolve conjuntos DISJUNTOS — é o fim da mistura', () => {
    const en = new Set(triarCartoes(misto, { lang: 'en' }).usaveis.map(c => c.id));
    const pt = new Set(triarCartoes(misto, { lang: 'pt' }).usaveis.map(c => c.id));
    expect([...en].some(id => pt.has(id))).toBe(false);
    expect(pt.has('pt1')).toBe(true);
  });

  it('sem idioma na fonte, joga tudo (compatibilidade com o baralho antigo)', () => {
    const t = triarCartoes(misto, { lang: '' });
    expect(t.outroIdioma).toHaveLength(0);
    expect(t.usaveis).toHaveLength(3);
  });

  it('a fonte "sessao" recorta pela gravação de origem', () => {
    const comSessao = [
      card({ id: 'a', word: 'house', sourceSessionId: 's1' }),
      card({ id: 'b', word: 'water', sourceSessionId: 's2' }),
    ];
    const t = cartoesDaFonte(comSessao, { id: 'sessao', lang: 'en', sessionId: 's1' });
    expect(t.usaveis.map(c => c.id)).toEqual(['a']);
  });

  it('deduplica mantendo a cópia MAIS COMPLETA', () => {
    const dupes = [
      card({ id: 'magra', word: 'house', translation: 'casa' }),
      card({ id: 'completa', word: 'House', translation: 'casa', sentence: 'A big house.' }),
    ];
    const t = triarCartoes(dupes, { lang: 'en' });
    expect(t.usaveis.map(c => c.id)).toEqual(['completa']);
    expect(t.fora).toEqual([{ card: dupes[0], motivo: 'duplicada' }]);
  });

  it('conta por motivo — é o número que a tela de curadoria mostra', () => {
    const t = triarCartoes([
      card({ id: '1', word: 'a' }),
      card({ id: '2', word: 'b' }),
      card({ id: '3', word: 'stone', translation: 'Isso é' }),
    ], { lang: 'en' });
    const c = contarPorMotivo(t.fora);
    expect(c['palavra-curta']).toBe(2);
    expect(c['pista-ruim']).toBe(1);
    expect(c['sem-pista']).toBe(0);
  });

  it('só oferece idiomas que o baralho realmente tem, ordenados pelo que dá para JOGAR', () => {
    /* `jogaveis` não é o mesmo que `total`, e a diferença é a razão de a função existir: o docblock
       sempre prometeu contar só o que passa na régua, e a implementação contava cartão bruto — o
       que deixava escolher um idioma e cair numa tela vazia sem explicação. Aqui `stone → "Isso é"`
       é inglês e é reprovado por pista inútil: entra em `total`, não em `jogaveis`. */
    expect(idiomasDisponiveis(misto)).toEqual([
      { lang: 'en', total: 3, jogaveis: 2 },
      { lang: 'pt', total: 1, jogaveis: 1 },
    ]);
  });

  it('o rótulo da fonte é escrito em um lugar só', () => {
    expect(rotuloDaFonte({ id: 'baralho', lang: 'en' })).toBe('Minhas palavras');
    expect(rotuloDaFonte({ id: 'sessao', lang: 'en' }, 'Aula 3')).toBe('Sessão: Aula 3');
    expect(rotuloDaFonte({ id: 'trilha', lang: 'en', nivel: 'B1' })).toBe('Trilha B1');
  });
});

describe('frases reais', () => {
  it('reprova fala cortada no meio (começa minúscula e não termina em pontuação)', () => {
    expect(avaliarFrase('e por que isso deve').serve).toBe(false);
  });

  it('aceita frase inteira e premia a que tem tradução', () => {
    const sem = avaliarFrase('I live in a big house near the river.');
    const com = avaliarFrase('I live in a big house near the river.', { traducao: 'Moro numa casa grande.' });
    expect(sem.serve).toBe(true);
    expect(com.pontuacao).toBeGreaterThan(sem.pontuacao);
  });

  it('reprova frase curta demais e longa demais', () => {
    expect(avaliarFrase('Sim.').serve).toBe(false);
    expect(avaliarFrase(Array.from({ length: 40 }, () => 'palavra').join(' ') + '.').serve).toBe(false);
  });
});

describe('pistaUtil continua exportada do Termo (quem importava não quebra)', () => {
  it('mesma implementação, um lugar só', async () => {
    const doTermo = await import('../src/core/minigames/termo');
    expect(doTermo.pistaUtil).toBe(pistaUtil);
  });
});

/**
 * A LINHA QUE A CAPTURA MOSTRA depois de salvar. Ela existe porque a tela anunciava o total
 * TENTADO ("30 cards") e o servidor gravava 12 — o número era falso desde que a régua entrou.
 */
describe('resumoDosPulados', () => {
  it('agrupa por motivo e usa o plural certo', () => {
    const r = resumoDosPulados([
      { motivo: 'duplicada' }, { motivo: 'duplicada' }, { motivo: 'sem-pista' },
    ]);
    expect(r).toBe('2 repetidas, 1 sem tradução');
  });

  it('põe o motivo mais comum primeiro — é o que vale agir sobre', () => {
    const r = resumoDosPulados([
      { motivo: 'sem-pista' }, { motivo: 'duplicada' }, { motivo: 'duplicada' }, { motivo: 'duplicada' },
    ]);
    expect(r.startsWith('3 repetidas')).toBe(true);
  });

  it('não usa a frase do singular, que viraria "2 já está no seu baralho"', () => {
    expect(resumoDosPulados([{ motivo: 'duplicada' }, { motivo: 'duplicada' }]))
      .not.toContain('já está');
  });

  it('devolve vazio quando nada foi pulado, para a tela concatenar sem checar', () => {
    expect(resumoDosPulados([])).toBe('');
  });

  it('ignora motivo desconhecido em vez de quebrar (o motivo vem do servidor como texto)', () => {
    expect(resumoDosPulados([{ motivo: 'invento-novo' }, { motivo: 'duplicada' }])).toBe('1 repetidas');
  });
});

/**
 * O `\b` DO JAVASCRIPT NÃO CONHECE ACENTO — e isso reprovava pista boa em silêncio.
 *
 * `\b` é definido por `[A-Za-z0-9_]`, então entre "esta" e "ção" existe uma fronteira de palavra e
 * `/^esta\b/` casava com "estação". Achado por um teste do léxico embutido, onde as pistas
 * "estação" (de `station` e de `season`) eram as duas únicas reprovadas — mas o defeito valia para
 * qualquer cartão capturado, e ninguém veria: o cartão só desaparecia da rodada.
 */
describe('pistaUtil e o acento na fronteira de palavra', () => {
  it('aceita palavra que apenas COMEÇA como um pronome', () => {
    for (const t of ['estação', 'estágio', 'estância', 'estado', 'essência', 'elefante', 'itálico']) {
      expect(pistaUtil(t), t).toBe(true);
    }
  });

  it('continua reprovando o pronome de verdade', () => {
    for (const t of ['isso é', 'Tu', 'aquilo', 'this is', 'ela']) {
      expect(pistaUtil(t), t).toBe(false);
    }
  });
});
