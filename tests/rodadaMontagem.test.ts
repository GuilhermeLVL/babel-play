/**
 * CARACTERIZAÇÃO DE `montarRodada` — os oito ramos, com semente fixa.
 *
 * POR QUE ESTE ARQUIVO EXISTE. `montarRodada` era uma closure dentro de `Play.tsx` que lia quinze
 * valores do componente e escrevia a rodada por `setState`. Doze pontos de chamada, oito ramos, e
 * nenhuma forma de exercitá-la sem montar a tela inteira com a rede em pé — ou seja, a regra mais
 * cara do app era a única sem rede de proteção. Estes casos FIXAM o que cada ramo produz hoje,
 * para que a mudança de casa (`Play.tsx` → `@core/minigames/rodada`) seja verificável e não uma
 * promessa.
 *
 * O QUE ESTE ARQUIVO NÃO É: não é um teste de regra de jogo. Cada construtor (`rodadasDaEscada`,
 * `buildItems`, `buildRodadasEscuta`…) tem os seus. Aqui o objeto é a MONTAGEM — qual ramo pega o
 * comando, o que ele recebe depois dos recortes (etapa da trilha, faixa automática, `apenas`,
 * `evitarTambem`) e que forma sai do outro lado.
 *
 * DETERMINISMO. O relógio entra por `agora` e a semente do dia deriva dele, então as escolhas são
 * reprodutíveis. Duas coisas não são, e estão marcadas caso a caso: a ORDEM das alternativas do
 * "Qual foi?" da trilha (um `Math.random` de apresentação) e a ordem das frases do caça-conectores
 * (`embaralhar` sem semente, dentro de `buildRodadasConectores`). Nesses dois, o teste fixa o
 * CONJUNTO e o tamanho, que é o que a montagem de fato decide.
 */
import { describe, it, expect } from 'vitest';
import type { VocabCard } from '../src/types';
import { montarRodada, type EntradaDaRodada, type FalaDaRodada } from '../src/core/minigames/rodada';

/** Um dia fixo: `diaLocal(agora)` é a semente de todos os construtores. */
const AGORA = new Date('2026-03-15T12:00:00Z').getTime();

const carta = (word: string, extra: Partial<VocabCard> = {}): VocabCard => ({
  id: `c-${word}`,
  word,
  phonetics: '',
  translation: `t-${word}`,
  explanation: '',
  srcLang: 'en',
  cefrLevel: 'A1',
  cefrConfidence: 1,
  inDeck: true,
  /* O agendador não é o assunto aqui: os campos do FSRS/Leitner ficam num estado NOVO, que é o
     que deixa `isDueNow` e `byUrgency` decidirem sem interferência do fixture. */
  leitnerBox: 1,
  leitnerDueAt: '',
  fsrsState: 'New',
  fsrsStability: 0,
  fsrsDifficulty: 5,
  fsrsPredictedRetention: 0.9,
  fsrsDueAt: '',
  ...extra,
});

/* Sete palavras de CINCO letras e traduções distintas: é o que a escada do Termo consome
   (1+2+4) sem cair no segundo corte por pista repetida. */
const CARTAS: VocabCard[] = [
  carta('water'),
  carta('bread'),
  carta('house'),
  carta('green'),
  carta('light'),
  carta('money'),
  carta('night'),
];

const fala = (i: number, text: string, translation: string): FalaDaRodada => ({
  id: `f${i}`,
  text,
  translation,
  lang: 'en',
  startMs: i * 1000,
  endMs: i * 1000 + 900,
});

/* Frases longas o bastante para os jogos de frase (mínimo de palavras) e com conector em inglês,
   para o ramo de conectores ter o que marcar. */
const FALAS: FalaDaRodada[] = [
  fala(1, 'I stayed at home because it was raining hard', 'Fiquei em casa porque chovia forte'),
  fala(2, 'She wanted to leave but the door was locked', 'Ela queria sair mas a porta estava trancada'),
  fala(3, 'We can meet tomorrow if you are free then', 'Podemos nos encontrar amanha se voce estiver livre'),
  fala(4, 'He bought the tickets and we went together', 'Ele comprou os ingressos e fomos juntos'),
  fala(5, 'They waited outside while the meeting was running', 'Eles esperaram fora enquanto a reuniao corria'),
  fala(6, 'The food was cold so nobody wanted to eat', 'A comida estava fria entao ninguem quis comer'),
];

const base = (over: Partial<EntradaDaRodada> = {}): EntradaDaRodada => ({
  jogo: 'memory',
  agora: AGORA,
  jogaveis: CARTAS,
  fonte: { id: 'baralho', lang: 'en' },
  etapaDaTrilha: null,
  memoria: new Map(),
  /* 'equilibrado' e não 'auto': o modo automático tem caso próprio abaixo. */
  estrategia: 'equilibrado',
  faixas: [],
  cortes: null,
  decisaoAuto: () => ({ faixa: 'medio' }),
  vistasRecentes: new Set(),
  frasesGravadas: FALAS,
  frasesDaTrilha: [],
  frasesDoAcervo: [],
  comTrilha: false,
  temVoz: true,
  temAudio: true,
  porPalavra: new Map(CARTAS.map((c) => [c.word.toLowerCase(), c])),
  origemDaPalavra: () => 'baralho',
  tituloDaSessao: 'Aula de terça',
  ...over,
});

const refs = (r: { previa: Array<{ ref: string }> }) => r.previa.map((p) => p.ref);

describe('montarRodada — ramo 1: Termo (escada de palavras)', () => {
  it('monta a escada e a prévia NÃO revela a palavra', () => {
    const r = montarRodada(base({ jogo: 'termo' }));
    expect(r).not.toBeNull();
    expect(r!.material.tipo).toBe('termo');
    expect(r!.previa.length).toBeGreaterThanOrEqual(3);
    /* A cerca anti-spoiler: o Termo pede para soletrar, então o título é o esqueleto, nunca a
       palavra. Foi o defeito que o funil único da prévia fechou. */
    for (const p of r!.previa) expect(p.titulo).not.toBe(p.ref);
    /* Material e prévia descrevem a MESMA rodada — a antessala não é uma amostra parecida. */
    const m = r!.material as { tipo: 'termo'; rodadas: Array<{ palavra: string }> };
    expect(m.rodadas.map((x) => x.palavra)).toEqual(refs(r!));
  });

  it('é determinístico com o mesmo `agora`', () => {
    const a = montarRodada(base({ jogo: 'termo' }));
    const b = montarRodada(base({ jogo: 'termo' }));
    expect(refs(a!)).toEqual(refs(b!));
  });

  it('devolve null quando o acervo não sustenta a escada', () => {
    expect(montarRodada(base({ jogo: 'termo', jogaveis: [carta('water')] }))).toBeNull();
  });
});

describe('montarRodada — ramo 2: Frase embaralhada (scramble)', () => {
  it('sai das falas gravadas e a prévia mostra o esqueleto, não a frase', () => {
    const r = montarRodada(base({ jogo: 'scramble' }));
    expect(r).not.toBeNull();
    expect(r!.material.tipo).toBe('frase');
    expect(refs(r!).every((x) => x.startsWith('f'))).toBe(true);
    for (const p of r!.previa) expect(p.titulo).not.toContain('because');
  });

  it('`evitarTambem` tira a fala do material — é o contrato de "mais uma, com palavras novas"', () => {
    const cheio = montarRodada(base({ jogo: 'scramble' }))!;
    const primeira = refs(cheio)[0];
    const depois = montarRodada(base({ jogo: 'scramble', evitarTambem: new Set([primeira]) }))!;
    expect(refs(depois)).not.toContain(primeira);
  });
});

describe('montarRodada — ramo 3: trilha com palavra falada (ditado, escuta, karaokê)', () => {
  const naTrilha = (jogo: 'ditado' | 'escuta' | 'karaoke', over: Partial<EntradaDaRodada> = {}) =>
    montarRodada(base({ jogo, fonte: { id: 'trilha', lang: 'en' }, comTrilha: true, ...over }));

  it('Ditado da trilha vira UMA palavra falada por rodada', () => {
    const r = naTrilha('ditado');
    expect(r!.material.tipo).toBe('ditado');
    const m = r!.material as { tipo: 'ditado'; rodadas: Array<{ fala: { text: string }; palavras: number }> };
    expect(m.rodadas.every((x) => x.palavras === 1)).toBe(true);
    expect(m.rodadas.map((x) => x.fala.text)).toEqual(refs(r!));
  });

  it('Qual foi? da trilha monta par mínimo com as OUTRAS palavras da mesma leva', () => {
    const r = naTrilha('escuta');
    const m = r!.material as { tipo: 'escuta'; rodadas: Array<{ correta: { text: string }; opcoes: Array<{ text: string }> }> };
    expect(m.rodadas.length).toBeGreaterThanOrEqual(4);
    for (const rod of m.rodadas) {
      /* A ORDEM das opções é sorteio de apresentação (Math.random) — o que a montagem decide é o
         CONJUNTO, e a certa tem de estar nele. */
      expect(rod.opcoes.map((o) => o.text)).toContain(rod.correta.text);
      expect(rod.opcoes.length).toBeLessThanOrEqual(4);
    }
  });

  it('Karaokê da trilha fala a palavra, com o clipe zerado (não há áudio a recortar)', () => {
    const r = naTrilha('karaoke');
    const m = r!.material as { tipo: 'karaoke'; falas: Array<{ texto: string; startMs: number; endMs: number }> };
    expect(m.falas.every((f) => f.startMs === 0 && f.endMs === 0)).toBe(true);
    expect(m.falas.map((f) => f.texto)).toEqual(refs(r!));
  });

  it('sem voz no idioma, o ramo recusa em vez de montar rodada muda', () => {
    expect(naTrilha('ditado', { temVoz: false })).toBeNull();
  });

  it('a ETAPA da trilha recorta o material antes dos ramos', () => {
    const r = naTrilha('ditado', {
      etapaDaTrilha: { palavras: ['water', 'bread', 'house', 'green', 'light'] },
    });
    /* `night` e `money` estão fora da etapa e não vencidos: não podem cair. */
    expect(refs(r!)).not.toContain('night');
    expect(refs(r!)).not.toContain('money');
  });
});

describe('montarRodada — ramos 4 a 6: escuta, ditado e conectores sobre falas gravadas', () => {
  it('Qual foi? usa as falas e devolve o id delas como `item_ref`', () => {
    const r = montarRodada(base({ jogo: 'escuta' }));
    expect(r!.material.tipo).toBe('escuta');
    expect(refs(r!).every((x) => /^f\d$/.test(x))).toBe(true);
  });

  it('Ditado usa as falas e a prévia não escreve a frase que vai pedir para transcrever', () => {
    const r = montarRodada(base({ jogo: 'ditado' }));
    expect(r!.material.tipo).toBe('ditado');
    for (const p of r!.previa) expect(p.titulo).not.toContain('raining');
  });

  it('sem áudio, os três jogos de escuta recusam', () => {
    expect(montarRodada(base({ jogo: 'escuta', temAudio: false }))).toBeNull();
    expect(montarRodada(base({ jogo: 'ditado', temAudio: false }))).toBeNull();
    expect(montarRodada(base({ jogo: 'karaoke', temAudio: false }))).toBeNull();
  });

  it('Conectores só monta em idioma com lista, e sobre frases que TÊM conector', () => {
    const r = montarRodada(base({ jogo: 'conectores' }));
    expect(r!.material.tipo).toBe('conectores');
    const m = r!.material as { tipo: 'conectores'; rodadas: Array<{ alvos: number[] }> };
    /* A ORDEM vem de `embaralhar` sem semente; o que a montagem garante é que toda rodada tem
       pelo menos um alvo — uma tela onde a resposta é "não clicar" não é rodada. */
    expect(m.rodadas.every((x) => x.alvos.length > 0)).toBe(true);
    /* Idioma sem lista de conectores: recusa, não oferece jogo impossível. */
    expect(montarRodada(base({ jogo: 'conectores', fonte: { id: 'baralho', lang: 'ja' } }))).toBeNull();
  });
});

describe('montarRodada — ramo 7: Karaokê sobre falas gravadas', () => {
  it('só entram falas com clipe real (endMs > startMs)', () => {
    const r = montarRodada(base({ jogo: 'karaoke' }));
    expect(r!.material.tipo).toBe('karaoke');
    const m = r!.material as { tipo: 'karaoke'; falas: Array<{ startMs: number; endMs: number }> };
    expect(m.falas.every((f) => f.endMs > f.startMs)).toBe(true);
  });

  it('fala sem clipe é descartada, e sem sobrar o mínimo a rodada é recusada', () => {
    const semClipe = FALAS.map((f) => ({ ...f, startMs: 0, endMs: 0 }));
    expect(montarRodada(base({ jogo: 'karaoke', frasesGravadas: semClipe }))).toBeNull();
  });
});

describe('montarRodada — ramo 8: o padrão (memória, caça-palavras, duelo)', () => {
  it('monta itens de baralho, com pista e resposta', () => {
    const r = montarRodada(base({ jogo: 'memory' }));
    expect(r!.material.tipo).toBe('itens');
    const m = r!.material as { tipo: 'itens'; jogo: string; itens: Array<{ answer: string; prompt: string }> };
    expect(m.jogo).toBe('memory');
    expect(m.itens.map((i) => i.answer)).toEqual(refs(r!));
    expect(m.itens.every((i) => !!i.prompt)).toBe(true);
  });

  it('devolve null abaixo do mínimo do jogo', () => {
    expect(montarRodada(base({ jogo: 'memory', jogaveis: [carta('water'), carta('bread')] }))).toBeNull();
  });

  it('a prévia carrega nível e procedência vindos do índice do acervo', () => {
    const r = montarRodada(base({ jogo: 'memory', origemDaPalavra: () => 'sessao' }));
    expect(r!.previa.every((p) => p.cefr === 'A1')).toBe(true);
    expect(r!.previa.every((p) => p.origem?.tipo === 'sessao')).toBe(true);
  });
});

describe('montarRodada — os recortes que valem para todos os ramos', () => {
  it('`apenas` limita o material aos `item_ref` pedidos — é o "repetir estas"', () => {
    const r = montarRodada(base({ jogo: 'memory', apenas: new Set(['water', 'bread', 'house', 'green']) }));
    expect(refs(r!).sort()).toEqual(['bread', 'green', 'house', 'water']);
  });

  it('`apenas` IGNORA `evitarTambem`: ali repetir é justamente o pedido', () => {
    const r = montarRodada(
      base({
        jogo: 'memory',
        apenas: new Set(['water', 'bread', 'house', 'green']),
        evitarTambem: new Set(['water', 'bread']),
      }),
    );
    expect(refs(r!).sort()).toEqual(['bread', 'green', 'house', 'water']);
  });

  it('o modo AUTO filtra pela faixa decidida, e alarga quando não há material nela', () => {
    const comScore = CARTAS.map((c, i) => carta(c.word, { difficultyScore: i < 5 ? 0.2 : 0.9 }));
    const naFaixa = montarRodada(
      base({
        jogo: 'memory',
        jogaveis: comScore,
        porPalavra: new Map(comScore.map((c) => [c.word.toLowerCase(), c])),
        estrategia: 'auto',
        decisaoAuto: () => ({ faixa: 'facil' }),
      }),
    );
    /* `money` e `night` são 0,9 (difícil) — fora da faixa fácil, e há material suficiente sem eles. */
    expect(refs(naFaixa!)).not.toContain('money');
    expect(refs(naFaixa!)).not.toContain('night');

    /* Sem material NENHUM na faixa pedida, alarga para o acervo em vez de recusar a rodada. */
    const alargou = montarRodada(
      base({
        jogo: 'memory',
        jogaveis: comScore,
        porPalavra: new Map(comScore.map((c) => [c.word.toLowerCase(), c])),
        estrategia: 'auto',
        decisaoAuto: () => ({ faixa: 'dificil' }),
      }),
    );
    expect(alargou).not.toBeNull();
    expect(refs(alargou!).length).toBeGreaterThanOrEqual(4);
  });

  it('a fala em OUTRO idioma não entra numa rodada deste idioma', () => {
    const emArabe = FALAS.map((f) => ({ ...f, lang: 'ar' }));
    /* Sem fala do idioma e sem frase do acervo, não há material de frase: recusa. */
    expect(montarRodada(base({ jogo: 'scramble', frasesGravadas: emArabe }))).toBeNull();
  });

  /**
   * A mesma entrada devolve a mesma rodada — a antessala não pode mentir.
   *
   * A varredura cobre os ramos com semente do dia (`buildItems`, `rodadasDaEscada`,
   * `buildScrambleRounds` com `rngDe`). Ficam de fora, e é dado ANTERIOR a esta mudança de casa:
   * `buildRodadasEscuta`/`buildRodadasDitado`/`buildRodadasConectores` chamam `embaralhar` SEM
   * semente, então a ordem das falas varia entre duas montagens iguais. Fixamos o conjunto,
   * que é o que a montagem escolhe; a ordem é decisão do construtor, e tem casa própria lá.
   */
  it('a mesma entrada devolve a mesma rodada nos ramos com semente do dia', () => {
    for (const jogo of ['memory', 'wordsearch', 'blitz', 'termo', 'scramble'] as const) {
      const a = montarRodada(base({ jogo }));
      const b = montarRodada(base({ jogo }));
      expect(refs(a!)).toEqual(refs(b!));
    }
  });

  it('nos ramos de fala, duas montagens iguais dão o mesmo TAMANHO, do mesmo acervo', () => {
    /* `embaralhar` sem semente escolhe QUAIS falas entram quando há mais material que o teto do
       jogo — comportamento de `buildRodadasEscuta`/`buildRodadasDitado`, anterior a esta mudança
       de casa. O que a montagem garante, e é o que se fixa aqui: a rodada tem o tamanho do jogo e
       todo item dela veio do acervo de falas. */
    const doAcervo = new Set(FALAS.map((f) => f.id));
    for (const jogo of ['escuta', 'ditado'] as const) {
      const a = montarRodada(base({ jogo }))!;
      const b = montarRodada(base({ jogo }))!;
      expect(refs(a).length).toBe(refs(b).length);
      expect(refs(a).every((x) => doAcervo.has(x))).toBe(true);
      expect(refs(b).every((x) => doAcervo.has(x))).toBe(true);
    }
  });
});
