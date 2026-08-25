import { describe, it, expect } from 'vitest';
import { buildItems, canPlay, promptFor, distractorsFor, shortPrompt } from '../src/core/minigames/itemSource';
import { gradeFor, scoreRound, xpFromRound, summarize, LIMITE_RESPOSTA_RAPIDA_MS } from '../src/core/minigames/grade';
import { MINIGAMES } from '../src/core/minigames/types';
import type { ItemOutcome } from '../src/core/minigames/types';
import type { VocabCard } from '../src/types';

const AGORA = Date.parse('2026-07-28T12:00:00.000Z');
const DIA = 86_400_000;
const iso = (d: number) => new Date(AGORA + d).toISOString();
/** Embaralhador determinístico (identidade) — o teste não pode depender de sorte. */
const semSorte = <T,>(xs: T[]) => [...xs];

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c', word: 'house', phonetics: '', translation: 'casa', explanation: '',
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: iso(+DIA),
    fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: iso(+DIA), inDeck: true, srcLang: 'en', ...over,
  };
}
/**
 * Baralho de teste com palavras que PARECEM dados reais.
 *
 * Já foi `w${i}` / `t${i}`, e isso escondia um problema: a régua de qualidade reprova palavra com
 * dígito (é a assinatura do ruído de captura), então o gerador antigo produzia um baralho que o
 * app inteiro descarta — e o teste passava a medir o gerador, não o código.
 */
const PALAVRAS: Array<[string, string]> = [
  ['house', 'casa'], ['water', 'água'], ['table', 'mesa'], ['bread', 'pão'],
  ['light', 'luz'], ['river', 'rio'], ['stone', 'pedra'], ['cloud', 'nuvem'],
  ['heart', 'coração'], ['smile', 'sorriso'], ['field', 'campo'], ['grass', 'grama'],
  ['music', 'música'], ['paper', 'papel'], ['glass', 'vidro'], ['chair', 'cadeira'],
  ['plant', 'planta'], ['beach', 'praia'], ['brain', 'cérebro'], ['dream', 'sonho'],
  ['knife', 'faca'], ['train', 'trem'], ['coast', 'costa'], ['flame', 'chama'],
  ['skirt', 'saia'], ['peace', 'paz'], ['crown', 'coroa'], ['bench', 'banco'],
  ['wheat', 'trigo'], ['ocean', 'oceano'], ['forest', 'floresta'], ['window', 'janela'],
];
const baralho = (n: number, over: (i: number) => Partial<VocabCard> = () => ({})) =>
  Array.from({ length: n }, (_, i) => {
    // Além da lista, prefixa com letras (nunca dígitos) para continuar distinto e válido.
    const [w, t] = PALAVRAS[i % PALAVRAS.length];
    const volta = Math.floor(i / PALAVRAS.length);
    const sufixo = volta ? 'x'.repeat(volta) : '';
    return card({ id: `c${i}`, word: w + sufixo, translation: t + sufixo, ...over(i) });
  });

describe('promptFor — a pista é a TRADUÇÃO, nunca a palavra', () => {
  it('usa a tradução quando existe', () => {
    expect(promptFor(card())).toEqual({ prompt: 'casa', clozed: false });
  });

  it('sem tradução, cai na frase REAL com lacuna', () => {
    const p = promptFor(card({ translation: '', sentence: 'I live in a big house.' }));
    expect(p?.clozed).toBe(true);
    expect(p?.prompt).toContain('___');
    expect(p?.prompt).not.toContain('house'); // a resposta não pode estar à vista
  });

  it('sem tradução E sem frase, o cartão fica de fora — não inventa definição', () => {
    expect(promptFor(card({ translation: '', sentence: '' }))).toBeNull();
  });
});

describe('buildItems', () => {
  it('descarta cartões sem pista possível em vez de fabricar pergunta', () => {
    const deck = [card({ id: 'ok' }), card({ id: 'mudo', translation: '', sentence: '' })];
    expect(buildItems('wordsearch', deck, { shuffle: semSorte, now: AGORA }).map(i => i.cardId)).toEqual(['ok']);
  });

  it('a memória exige tradução (o par É a tradução) — frase com lacuna não vira carta', () => {
    const deck = [card({ id: 'comTraducao' }), card({ id: 'soFrase', translation: '', sentence: 'a big house' })];
    expect(buildItems('memory', deck, { shuffle: semSorte, now: AGORA }).map(i => i.cardId)).toEqual(['comTraducao']);
  });

  it('o duelo puxa os VENCIDOS primeiro, do mais atrasado ao menos', () => {
    /* Traduções DISTINTAS de propósito. A fábrica dá 'casa' a todos, e desde que `buildItems`
       passou a recusar pista repetida na mesma rodada, três cartões traduzidos igual produziriam
       uma rodada de UM item — o teste mediria a regra de pista única em vez da ordem de urgência,
       que é o que ele existe para medir. */
    const deck = [
      card({ id: 'futuro', translation: 'futura', fsrsDueAt: iso(+DIA) }),
      card({ id: 'atrasado', translation: 'atrasada', fsrsDueAt: iso(-10 * DIA) }),
      card({ id: 'recente', translation: 'recente', fsrsDueAt: iso(-DIA) }),
    ];
    expect(buildItems('blitz', deck, { shuffle: semSorte, now: AGORA }).map(i => i.cardId))
      .toEqual(['atrasado', 'recente', 'futuro']);
  });

  it('respeita o teto de itens do jogo', () => {
    const itens = buildItems('memory', baralho(30), { shuffle: semSorte, now: AGORA });
    expect(itens.length).toBe(MINIGAMES.memory.maxItems);
  });

  it('cartões fora do baralho não entram', () => {
    expect(buildItems('blitz', [card({ inDeck: false })], { shuffle: semSorte, now: AGORA })).toEqual([]);
  });
});

describe('canPlay — a tela precisa saber o que FALTA, não só que não dá', () => {
  it('diz quantas palavras faltam quando o baralho é pequeno', () => {
    const r = canPlay('memory', baralho(2), { shuffle: semSorte, now: AGORA });
    expect(r).toEqual({ ok: false, disponiveis: 2, faltam: MINIGAMES.memory.minItems - 2 });
  });

  it('com baralho suficiente, libera', () => {
    expect(canPlay('memory', baralho(8), { shuffle: semSorte, now: AGORA }).ok).toBe(true);
  });
});

describe('distractorsFor — alternativas vêm de palavras REAIS', () => {
  it('nunca inclui a resposta certa', () => {
    const itens = buildItems('blitz', baralho(6), { shuffle: semSorte, now: AGORA });
    const d = distractorsFor(itens[0], itens, 3, semSorte);
    expect(d).not.toContain(itens[0].answer);
    expect(d.length).toBe(3);
  });

  it('não repete alternativas', () => {
    const itens = buildItems('blitz', baralho(6), { shuffle: semSorte, now: AGORA });
    const d = distractorsFor(itens[0], itens, 3, semSorte);
    expect(new Set(d).size).toBe(d.length);
  });
});

const outcome = (o: Partial<ItemOutcome> = {}): ItemOutcome => ({ correct: true, attempts: 1, ms: 1000, ...o });

describe('gradeFor — de jogo para memória', () => {
  it('desistir/revelar é a única forma de virar nota 1 no caça-palavras', () => {
    expect(gradeFor('wordsearch', outcome({ revealed: true }))).toBe(1);
    // Errar a célula é MIRA, não esquecimento — não pode punir a memória como erro.
    expect(gradeFor('wordsearch', outcome({ correct: false }))).toBe(2);
  });

  it('só o duelo dá 4, e só quando a resposta é rápida', () => {
    expect(gradeFor('blitz', outcome({ ms: LIMITE_RESPOSTA_RAPIDA_MS - 1 }))).toBe(4);
    expect(gradeFor('blitz', outcome({ ms: LIMITE_RESPOSTA_RAPIDA_MS + 1 }))).toBe(3);
    expect(gradeFor('memory', outcome({ ms: 100 }))).toBe(3);      // rápido, mas não é o cronometrado
    expect(gradeFor('wordsearch', outcome({ ms: 100 }))).toBe(3);
  });

  it('dica rebaixa para 2 em qualquer jogo', () => {
    for (const g of ['memory', 'wordsearch', 'blitz'] as const) {
      expect(gradeFor(g, outcome({ hinted: true }))).toBe(2);
    }
  });

  it('na memória, a nota cai conforme as tentativas', () => {
    expect(gradeFor('memory', outcome({ attempts: 1 }))).toBe(3);
    expect(gradeFor('memory', outcome({ attempts: 3 }))).toBe(2);
    expect(gradeFor('memory', outcome({ attempts: 4 }))).toBe(1);
  });

  it('errar no duelo (ou no tempo) é 1', () => {
    expect(gradeFor('blitz', outcome({ correct: false }))).toBe(1);
  });
});

describe('pontuação e XP', () => {
  /**
   * ESTES TRÊS TESTES MUDARAM DE AFIRMAÇÃO, de propósito.
   *
   * Eles fixavam que "a sequência multiplica SÓ no duelo", com a curva própria que o duelo tinha
   * (`10 * min(sequencia, 5)`: 10, 20, 30, 40, 50, 50…). Era justamente a divergência a remover —
   * `multiplicador` já se declarava "regra única do app, para os jogos não inventarem cada um a
   * sua", e o duelo era o jogo que inventava a sua.
   *
   * Agora vale a curva única (2× aos 3 seguidos, 3× aos 6, 4× aos 10, 5× aos 15) nos nove jogos.
   * O duelo ficou menos íngreme no começo e ganhou companhia; os outros oito passaram a ter
   * motivo para não quebrar a sequência. As asserções abaixo olham para a REGRA (é maior? zera?
   * tem teto?) em vez de somas cravadas, para calibrar o tamanho dos bônus não exigir reescrevê-las.
   */
  it('a sequência de acertos multiplica em TODOS os jogos, não só no duelo', () => {
    const seguidos = Array.from({ length: 6 }, () => outcome());
    const alternados = [outcome(), outcome({ correct: false }), outcome(), outcome({ correct: false }), outcome(), outcome({ correct: false })];
    for (const g of ['memory', 'wordsearch', 'blitz', 'termo', 'escuta'] as const) {
      const emenda = scoreRound(g, seguidos);
      const quebrado = scoreRound(g, alternados);
      // Mesmo com o dobro de acertos, a comparação certa é por acerto: emendar tem de pagar mais.
      expect(emenda / 6, `${g} não paga por emendar`).toBeGreaterThan(quebrado / 3);
    }
  });

  it('errar zera a sequência — o acerto seguinte volta a valer 1×', () => {
    const semQuebra = scoreRound('blitz', [outcome(), outcome(), outcome(), outcome()]);
    const comQuebra = scoreRound('blitz', [outcome(), outcome(), outcome(), outcome({ correct: false }), outcome()]);
    // A rodada com a quebra tem UM acerto a mais e ainda assim vale menos: o combo morreu no erro.
    expect(comQuebra).toBeLessThan(semQuebra);
  });

  it('o multiplicador tem teto (5×) — o ganho por acerto para de crescer', () => {
    const pontosDo = (n: number) => scoreRound('blitz', Array.from({ length: n }, () => outcome()));
    const ganho = (n: number) => pontosDo(n) - pontosDo(n - 1);
    expect(ganho(20)).toBe(ganho(40));                       // já no teto, o acerto vale o mesmo
    expect(ganho(20)).toBeLessThanOrEqual(10 * 5 + 5 + 3);   // base×5 + rápido + sem dica
  });

  it('o XP da rodada premia acerto mas nunca é zero por participar', () => {
    const r = { gameId: 'memory' as const, items: [outcome(), outcome({ correct: false })], score: 10, durationMs: 1000 };
    expect(xpFromRound(r)).toBe(1 * 2 + 2);
    expect(summarize(r)).toEqual({ acertos: 1, total: 2, precisao: 50, xp: 4 });
  });

  it('rodada vazia não quebra a precisão', () => {
    expect(summarize({ gameId: 'blitz', items: [], score: 0, durationMs: 0 }).precisao).toBe(0);
  });
});

describe('shortPrompt — pista legível numa coluna estreita', () => {
  it('texto curto passa intacto', () => {
    expect(shortPrompt('casa')).toBe('casa');
  });

  it('frase longa COM lacuna é recortada em torno dela (é a parte que ajuda a lembrar)', () => {
    const frase = 'Os caras são versados em Brasil e sabem tudo, ué. A fama é do ___ e os países da galera sabem por isso, porque sempre foi assim.';
    const curto = shortPrompt(frase, 40);
    expect(curto.length).toBeLessThanOrEqual(42);
    expect(curto).toContain('___');   // a lacuna nunca é cortada fora
    expect(curto.startsWith('…')).toBe(true);
    expect(curto.endsWith('…')).toBe(true);
  });

  it('frase longa SEM lacuna é truncada com reticências (não finge que acabou)', () => {
    const curto = shortPrompt('a'.repeat(200), 30);
    expect(curto.length).toBe(30);
    expect(curto.endsWith('…')).toBe(true);
  });

  it('lacuna no começo não gera reticências à esquerda', () => {
    const curto = shortPrompt('___ é o que a gente precisa entender antes de seguir adiante nessa história toda.', 40);
    expect(curto.startsWith('…')).toBe(false);
  });
});
