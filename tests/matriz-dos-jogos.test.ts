/**
 * Matriz: TODO minijogo de `MINIGAMES` × 5 perfis de conteúdo. Alvo: pista que entrega a resposta, pool que
 * despenca sem aviso, jogo que aceita material que não sabe renderizar.
 */
import { describe, it, expect } from 'vitest';
import { buildItems } from '../src/core/minigames/itemSource';
import { rodadasDaEscada, buildTermoRounds } from '../src/core/minigames/termo';
import { estadoDoJogo } from '../src/core/minigames/estadoDosJogos';
import { MINIGAMES, type MinigameId } from '../src/core/minigames/types';
import { vazaResposta } from '../src/core/learning/pistaDeJogo';
import type { VocabCard } from '../src/types';

const AGORA = Date.parse('2026-07-28T12:00:00.000Z');
const DIA = 86_400_000;
const iso = (d: number) => new Date(AGORA + d).toISOString();
const semSorte = <T,>(xs: T[]) => [...xs];

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c', word: 'house', phonetics: '', translation: 'casa', explanation: '',
    leitnerBox: 1, leitnerDueAt: iso(+DIA),
    fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: iso(+DIA), inDeck: true, srcLang: 'en', ...over,
  } as VocabCard;
}

/*
 * AS DUAS LISTAS SÃO DERIVADAS, e a razão é o único jeito de este arquivo não mentir.
 *
 * Elas eram escritas à mão: `['memory','wordsearch','blitz','termo']` e as cinco de frase. O
 * cabeçalho aqui em cima promete "os 9 minijogos", e a promessa era verdadeira por coincidência
 * — enquanto o número fosse 9. No instante em que um jogo novo entra em `MINIGAMES`, cinco
 * invariantes deste arquivo param de cobri-lo e **a suíte continua verde**. É a pior forma de
 * falha que existe: o gate diz "passou" sobre um código que ele nem olhou.
 *
 * `tests/estadoDosJogos.test.ts:71` já derivava de `Object.keys(MINIGAMES)` e por isso falha na
 * hora quando um jogo entra sem estado — que é o comportamento certo. Aqui passa a ser igual.
 */
const IDS = Object.keys(MINIGAMES) as MinigameId[];
const JOGOS_DE_PALAVRA: MinigameId[] = IDS.filter((id) => MINIGAMES[id].modalidade === 'palavra');
const JOGOS_DE_FRASE: MinigameId[] = IDS.filter((id) => MINIGAMES[id].modalidade !== 'palavra');

/** Baralho do perfil: cada cartão com sua PRÓPRIA pista — pistas iguais colidem de propósito
 *  (`buildItems` recusa a segunda), então repetir a mesma tradução mediria o dedup, não o perfil. */
function baralhoDoPerfil(pares: Array<Partial<VocabCard>>): VocabCard[] {
  return pares.map((p, i) => card({ id: `p${i}`, ...p }));
}

const PARES_BILINGUE: Array<[string, string]> = [
  ['casa', 'house'], ['água', 'water'], ['mesa', 'table'], ['pão', 'bread'],
  ['luz', 'light'], ['rio', 'river'], ['pedra', 'stone'], ['nuvem', 'cloud'],
];
const PARES_DEFINICAO: Array<[string, string]> = [
  ['abandon', 'To abandon something is to leave it forever.'],
  ['dispute', 'A dispute is a disagreement or argument between people.'],
  ['harvest', 'To harvest is to gather a crop that is ready.'],
  ['isolate', 'To isolate is to set something apart from others.'],
  ['migrate', 'To migrate is to move from one region to another.'],
  ['nourish', 'To nourish is to provide what is needed for life.'],
  ['polish', 'To polish is to make something smooth and shiny.'],
  ['reflect', 'To reflect is to think deeply about something.'],
];
/* Palavras de 4 caracteres (a régua de comprimento do Termo, faixa 'medio', pede 4-6) — senão o
 * teste mediria "curta" em vez de "alfabeto-nao-suportado". */
const PARES_NAO_LATINO: Array<[string, string]> = [
  ['食べます', 'comer'], ['飲みます', 'beber'], ['話します', 'falar'], ['聞きます', 'ouvir'],
  ['書きます', 'escrever'], ['読みます', 'ler'], ['歩きます', 'andar'], ['見せます', 'mostrar'],
];
const FRASE_LONGA = (n: number) =>
  `this is an entire sentence used as the front of card number ${n} instead of a single word here now and it keeps going`;

const PERFIS: Record<string, Array<Partial<VocabCard>>> = {
  bilingueCurto: PARES_BILINGUE.map(([word, translation]) => ({ word, translation, sentence: `${word} está na frase.` })),
  definicaoMonolingue: PARES_DEFINICAO.map(([word, translation]) => ({ word, translation })),
  semTraducao: PARES_BILINGUE.map(([word], i) => ({ word: `${word}s`, translation: '', sentence: `Esta ${word}s apareceu na frase real número ${i}.` })),
  naoLatino: PARES_NAO_LATINO.map(([word, translation]) => ({ word, translation })),
  wordLonga: Array.from({ length: 8 }, (_, i) => ({ word: FRASE_LONGA(i), translation: `definição ${i}` })),
};

function baralhosDosPerfis(): Record<string, VocabCard[]> {
  const saida: Record<string, VocabCard[]> = {};
  for (const [nome, pares] of Object.entries(PERFIS)) saida[nome] = baralhoDoPerfil(pares);
  return saida;
}

describe('invariante 0 — a matriz cobre a tabela inteira', () => {
  /* As duas listas são uma PARTIÇÃO de `MINIGAMES`: se um jogo cair fora das duas, ele deixa de
     ser testado e nada acusa. Esta é a única invariante que protege as outras cinco. */
  it('todo jogo de MINIGAMES está em exatamente uma das duas listas', () => {
    expect([...JOGOS_DE_PALAVRA, ...JOGOS_DE_FRASE].sort()).toEqual([...IDS].sort());
    expect(JOGOS_DE_PALAVRA.filter((id) => JOGOS_DE_FRASE.includes(id))).toEqual([]);
  });

  it('as duas listas têm conteúdo — uma lista vazia passaria em tudo sem testar nada', () => {
    expect(JOGOS_DE_PALAVRA.length).toBeGreaterThan(0);
    expect(JOGOS_DE_FRASE.length).toBeGreaterThan(0);
  });
});

describe('invariante 1 — nenhum enunciado entrega a resposta', () => {
  const baralhos = baralhosDosPerfis();
  it.each(JOGOS_DE_PALAVRA)('%s: prompt não contém a answer, em nenhum perfil', (jogo) => {
    for (const [nome, cards] of Object.entries(baralhos)) {
      const itens = buildItems(jogo, cards, { shuffle: semSorte, now: AGORA });
      for (const item of itens) {
        expect(vazaResposta(item.prompt, item.answer), `${jogo}/${nome}: "${item.prompt}" vaza "${item.answer}"`).toBe(false);
      }
    }
  });

  it('termo: pista da rodada não contém a resposta', () => {
    for (const [nome, cards] of Object.entries(baralhos)) {
      const rodadas = buildTermoRounds(cards, { shuffle: semSorte, now: AGORA, quantidade: 3 });
      for (const r of rodadas) {
        if (!r.pista) continue;
        expect(vazaResposta(r.pista, r.palavra), `termo/${nome}: pista "${r.pista}" vaza "${r.palavra}"`).toBe(false);
      }
    }
  });
});

describe('invariante 2 — nenhum item tem prompt vazio ou só pontuação', () => {
  const baralhos = baralhosDosPerfis();
  it.each(JOGOS_DE_PALAVRA)('%s: prompt tem conteúdo textual real', (jogo) => {
    for (const [nome, cards] of Object.entries(baralhos)) {
      const itens = buildItems(jogo, cards, { shuffle: semSorte, now: AGORA });
      for (const item of itens) {
        const soLetrasNumeros = item.prompt.replace(/[^\p{L}\p{N}]+/gu, '');
        expect(soLetrasNumeros.length, `${jogo}/${nome}: prompt "${item.prompt}" é vazio/pontuação`).toBeGreaterThan(0);
      }
    }
  });
});

/** Pool grande com pistas TODAS distintas — só assim "material de sobra" não esbarra no dedup
 *  de pista (`buildItems` recusa a 2ª ocorrência da mesma pista, por desenho). Sem dígito na
 *  tradução: `pistaUtil` reprova dígito como ruído de captura. */
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz';
const POOL_GRANDE: VocabCard[] = Array.from({ length: 26 }, (_, i) => card({
  id: `g${i}`, word: `word${ALFABETO[i]}`, translation: `tradução ${ALFABETO[i]}`, sentence: `word${ALFABETO[i]} está na frase.`,
}));

describe('invariante 3 — buildItems respeita maxItems e minItems do gate', () => {
  it.each(JOGOS_DE_PALAVRA)('%s: nunca excede maxItems', (jogo) => {
    const itens = buildItems(jogo, POOL_GRANDE, { shuffle: semSorte, now: AGORA });
    expect(itens.length).toBeLessThanOrEqual(MINIGAMES[jogo].maxItems);
  });

  it.each(JOGOS_DE_PALAVRA)('%s: material de sobra produz ao menos minItems', (jogo) => {
    const itens = buildItems(jogo, POOL_GRANDE, { shuffle: semSorte, now: AGORA });
    expect(itens.length).toBeGreaterThanOrEqual(MINIGAMES[jogo].minItems);
  });
});

describe('invariante 4 — caça-palavras e termo recusam alfabeto não-latino', () => {
  const cardsNaoLatino = baralhoDoPerfil(PERFIS.naoLatino);

  it('wordsearch: builder devolve vazio para acervo 100% não-latino', () => {
    const itens = buildItems('wordsearch', cardsNaoLatino, { shuffle: semSorte, now: AGORA });
    expect(itens.length).toBe(0);
  });

  it('termo: builder devolve vazio para acervo 100% não-latino', () => {
    const rodadas = buildTermoRounds(cardsNaoLatino, { shuffle: semSorte, now: AGORA, quantidade: 3 });
    expect(rodadas.length).toBe(0);
  });

  it('gate: wordsearch reprova com alfabeto-nao-suportado quando o pool é suficiente por contagem', () => {
    const estado = estadoDoJogo('wordsearch', {
      cartas: cardsNaoLatino, frases: [], temAudio: false, temVoz: false,
      fonteId: 'baralho', lang: 'ja',
    });
    expect(estado.ok).toBe(false);
    expect(estado.motivo).toBe('alfabeto-nao-suportado');
  });

  it('gate: termo reprova com alfabeto-nao-suportado quando o pool é suficiente por contagem', () => {
    const estado = estadoDoJogo('termo', {
      cartas: cardsNaoLatino, frases: [], temAudio: false, temVoz: false,
      fonteId: 'baralho', lang: 'ja',
    });
    expect(estado.ok).toBe(false);
    expect(estado.motivo).toBe('alfabeto-nao-suportado');
  });
});

describe('invariante 5 — wordLonga não vira item jogável em jogo de palavra', () => {
  const cardsLongos = baralhoDoPerfil(PERFIS.wordLonga);

  it.each(JOGOS_DE_PALAVRA)('%s: nenhum item usa a word de 90+ caracteres como answer', (jogo) => {
    const itens = buildItems(jogo, cardsLongos, { shuffle: semSorte, now: AGORA });
    for (const item of itens) {
      expect(item.answer.length, `${jogo}: aceitou answer de ${item.answer.length} chars como jogável`).toBeLessThan(30);
    }
  });
});

describe('invariante 6 — semTraducao cai fora ou entra com pista da frase, nunca vazia', () => {
  const cardsSemTraducao = baralhoDoPerfil(PERFIS.semTraducao);

  it.each(JOGOS_DE_PALAVRA)('%s: item de semTraducao tem prompt não-vazio quando aparece', (jogo) => {
    const itens = buildItems(jogo, cardsSemTraducao, { shuffle: semSorte, now: AGORA });
    for (const item of itens) {
      expect(item.prompt.trim().length, `${jogo}: item sem tradução entrou com prompt vazio`).toBeGreaterThan(0);
    }
  });

  it('memory e termo (requiresTranslation): semTraducao fica inteiramente de fora', () => {
    for (const jogo of ['memory', 'termo'] as const) {
      const itens = buildItems(jogo, cardsSemTraducao, { shuffle: semSorte, now: AGORA });
      expect(itens.length, `${jogo}: aceitou cartão sem tradução, que ele exige`).toBe(0);
    }
  });
});

describe('jogos de frase — o gate bloqueia com motivo em vez de montar rodada vazia', () => {
  const entradaSemFrase = {
    cartas: baralhoDoPerfil(PERFIS.bilingueCurto),
    frases: [],
    temAudio: false,
    temVoz: false,
    fonteId: 'trilha' as const,
    lang: 'en',
  };

  it.each(JOGOS_DE_FRASE)('%s: sem frases na trilha, gate reprova com motivo dito', (jogo) => {
    const estado = estadoDoJogo(jogo, entradaSemFrase);
    expect(estado.ok).toBe(false);
    expect(estado.tamanhoDaRodada).toBe(0);
    expect(estado.motivo).toBeDefined();
  });

  const entradaSemAudioPronto = {
    cartas: baralhoDoPerfil(PERFIS.bilingueCurto),
    frases: [{ id: 'f1', text: 'A casa é grande.', startMs: 0, endMs: 1000, lang: 'pt' } as any],
    temAudio: true,
    audioPronto: false,
    temVoz: true,
    fonteId: 'sessao' as const,
    lang: 'pt',
  };

  it.each(['escuta', 'ditado', 'karaoke'] as MinigameId[])(
    '%s: áudio existe mas não baixou, gate reprova com audio-carregando',
    (jogo) => {
      const estado = estadoDoJogo(jogo, entradaSemAudioPronto);
      expect(estado.ok).toBe(false);
      expect(estado.motivo).toBe('audio-carregando');
    },
  );
});

describe('termo — a escada não vaza rodada insolúvel quando o material é ambíguo', () => {
  it('perfil não-latino: rodadasDaEscada devolve vazio, não uma escada impossível', () => {
    const cards = baralhoDoPerfil(PERFIS.naoLatino);
    const rodadas = rodadasDaEscada(cards, { shuffle: semSorte, now: AGORA });
    expect(rodadas.length).toBe(0);
  });
});
