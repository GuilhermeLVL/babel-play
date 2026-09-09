/**
 * AS MÉTRICAS DA SESSÃO, FIXADAS.
 *
 * Este arquivo nasce junto com `src/lib/analise/metricasDaSessao.ts`, que saiu de
 * `views/Analysis.tsx` na divisão do último arquivo-deus. Enquanto os cálculos viviam dentro do
 * componente, NENHUM deles tinha teste: para exercitá-los era preciso montar a tela inteira, com
 * gateway, deck, popover e player. É por isso que estes números são exatamente o tipo de coisa que
 * já foi inventada aqui — o cartão de pausas exibia "45 seg / 12% da gravação, ritmo saudável"
 * cravado no JSX, e o de vícios exibia "8".
 *
 * O que cada caso protege é a REGRA DE HONESTIDADE: sem timing confiável o valor é `null` e a tela
 * mostra "—". Um `0` no lugar de `null` seria uma afirmação ("não houve pausa nenhuma") sobre uma
 * gravação da qual não sabemos nada.
 */
import { describe, expect,it } from 'vitest';

import {
  calcularMaiorMonologo,
  calcularSilencio,
  calcularWpm,
  contarPausasLongas,
  medirSobreposicao,
  medirVicios,
  montarDetalheLexical,
} from '../src/lib/analise/metricasDaSessao';
import type { FalaDaAnalise } from '../src/lib/analise/tiposDaAnalise';
import type { Sentence } from '../src/lib/sentences';

/** Uma linha crua de `utterances` como o backend a entrega (só o timing importa aqui). */
const fala = (tStartMs: number | null, tEndMs: number | null) => ({ tStartMs, tEndMs });

/** Uma frase canônica montada à mão — os campos que as métricas leem, e nada mais. */
function frase(p: Partial<Sentence>): Sentence {
  return {
    id: p.id ?? 'u1',
    text: p.text ?? '',
    translation: '',
    lang: p.lang ?? 'pt',
    translationLang: '',
    speaker: p.speaker ?? '',
    source: p.source ?? '',
    startMs: p.startMs ?? 0,
    endMs: p.endMs ?? 0,
    index: p.index ?? 0,
  };
}

describe('WPM real da sessão', () => {
  it('divide as palavras pelo tempo do primeiro início ao último fim', () => {
    // 30 s de fala (0 → 30 000 ms) com 60 palavras = 120 palavras por minuto.
    const r = calcularWpm([fala(0, 10_000), fala(12_000, 30_000)], 60);
    expect(r).toBe(120);
  });

  it('ignora as falas SEM timing nas pontas e mede só o intervalo conhecido', () => {
    // O primeiro com `tStartMs` é o segundo (10 000); o último com `tEndMs` é o terceiro (70 000).
    // 60 s de fala com 100 palavras = 100 wpm.
    const r = calcularWpm([fala(null, null), fala(10_000, 40_000), fala(45_000, 70_000)], 100);
    expect(r).toBe(100);
  });

  it('devolve null (e não 0) quando NENHUMA fala tem timing', () => {
    expect(calcularWpm([fala(null, null), fala(null, null)], 42)).toBeNull();
  });

  it('devolve null com menos de um segundo de fala — a divisão explodiria o número', () => {
    expect(calcularWpm([fala(0, 900)], 10)).toBeNull();
  });

  it('devolve null sem palavra nenhuma e sem fala nenhuma', () => {
    expect(calcularWpm([fala(0, 60_000)], 0)).toBeNull();
    expect(calcularWpm([], 10)).toBeNull();
  });
});

describe('pausas longas (> 3 s entre falas)', () => {
  it('conta só os vãos acima de três segundos', () => {
    const r = contarPausasLongas([
      fala(0, 1_000),
      fala(9_000, 10_000), // vão de 8 s → conta
      fala(12_000, 13_000), // vão de 2 s → não conta
      fala(20_000, 21_000), // vão de 7 s → conta
    ]);
    expect(r).toBe(2);
  });

  it('não conta o vão de exatamente 3 s (a régua é ESTRITAMENTE maior)', () => {
    expect(contarPausasLongas([fala(0, 1_000), fala(4_000, 5_000)])).toBe(0);
  });

  it('devolve 0 — e não null — quando há timing e nenhuma pausa longa', () => {
    expect(contarPausasLongas([fala(0, 1_000), fala(1_500, 2_000)])).toBe(0);
  });

  it('devolve null sem timing e com menos de duas falas', () => {
    expect(contarPausasLongas([fala(null, null), fala(null, null)])).toBeNull();
    expect(contarPausasLongas([fala(0, 1_000)])).toBeNull();
  });
});

describe('silêncio total da sessão', () => {
  it('soma os vãos e devolve a fração da gravação, sem julgamento', () => {
    // Gravação de 0 a 20 000 ms; vãos de 4 000 e 6 000 = 10 000 ms, metade dos 20 s.
    const r = calcularSilencio([fala(0, 2_000), fala(6_000, 8_000), fala(14_000, 20_000)]);
    expect(r).toEqual({ ms: 10_000, pct: 50 });
  });

  it('ignora sobreposição (vão negativo) em vez de descontá-la do silêncio', () => {
    const r = calcularSilencio([fala(0, 5_000), fala(4_000, 10_000)]);
    expect(r).toEqual({ ms: 0, pct: 0 });
  });

  it('devolve null sem timing', () => {
    expect(calcularSilencio([fala(null, null), fala(null, null)])).toBeNull();
  });
});

describe('maior monólogo', () => {
  it('é a maior duração de UMA fala, não a soma delas', () => {
    expect(calcularMaiorMonologo([fala(0, 4_000), fala(5_000, 26_000), fala(30_000, 31_000)])).toBe(21_000);
  });

  it('devolve null sem timing', () => {
    expect(calcularMaiorMonologo([fala(null, null)])).toBeNull();
    expect(calcularMaiorMonologo([])).toBeNull();
  });
});

describe('sobreposição de fala', () => {
  it('mede a intersecção quando pessoas DIFERENTES falam ao mesmo tempo', () => {
    const r = medirSobreposicao([
      frase({ id: 'a', speaker: 'Ana', startMs: 0, endMs: 5_000, index: 0 }),
      frase({ id: 'b', speaker: 'Bruno', startMs: 3_000, endMs: 8_000, index: 1 }),
    ]);
    expect(r?.total).toBe(1);
    expect(r?.maiorMs).toBe(2_000);
  });

  it('NÃO conta duas falas coexistentes da MESMA pessoa como interrupção', () => {
    // Bruno entra só para haver dois falantes (com um só, a medição é `null`, não zero). As duas
    // falas que de fato coexistem no tempo são as duas da Ana — recorte do motor, não conversa.
    const r = medirSobreposicao([
      frase({ id: 'a', speaker: 'Ana', startMs: 0, endMs: 5_000, index: 0 }),
      frase({ id: 'b', speaker: 'Ana', startMs: 3_000, endMs: 8_000, index: 1 }),
      frase({ id: 'c', speaker: 'Bruno', startMs: 20_000, endMs: 25_000, index: 2 }),
    ]);
    expect(r?.total).toBe(0);
  });

  it('com um falante só devolve null (e não zero, que se leria como "nunca interrompeu")', () => {
    const r = medirSobreposicao([
      frase({ id: 'a', speaker: 'Ana', startMs: 0, endMs: 5_000, index: 0 }),
      frase({ id: 'b', speaker: 'Ana', startMs: 3_000, endMs: 8_000, index: 1 }),
    ]);
    expect(r).toBeNull();
  });

  it('não conta encostar (fim de uma = início da outra) como sobreposição', () => {
    const r = medirSobreposicao([
      frase({ id: 'a', speaker: 'Ana', startMs: 0, endMs: 5_000, index: 0 }),
      frase({ id: 'b', speaker: 'Bruno', startMs: 5_000, endMs: 9_000, index: 1 }),
    ]);
    expect(r?.total).toBe(0);
  });
});

describe('vícios de linguagem', () => {
  it('conta cada fala com a lista do PRÓPRIO idioma', () => {
    const r = medirVicios([
      frase({ id: 'a', text: 'tipo, eu acho que sim', lang: 'pt', index: 0 }),
      frase({ id: 'b', text: 'so, um, I guess', lang: 'en', index: 1 }),
    ]);
    expect(r.total).toBeGreaterThan(0);
    expect(r.idiomas.sort()).toEqual(['en', 'pt']);
  });

  it('lê `text` (canônico), e não `original` — o campo errado deixava o cartão mudo', () => {
    const r = medirVicios([frase({ id: 'a', text: 'né, né, né', lang: 'pt', index: 0 })]);
    expect(r.detalhe.find((d) => d.marcador === 'né')?.vezes).toBe(3);
    expect(r.total).toBe(3);
  });

  it('"um" em português é ARTIGO, não hesitação — só conta como vício em inglês', () => {
    const pt = medirVicios([frase({ id: 'a', text: 'eu vi um cachorro', lang: 'pt', index: 0 })]);
    const en = medirVicios([frase({ id: 'b', text: 'I saw um a dog', lang: 'en', index: 0 })]);
    expect(pt.total).toBe(0);
    expect(en.total).toBe(1);
  });

  it('idioma sem lista de marcadores não inventa contagem: soma em palavrasSemLista', () => {
    const r = medirVicios([frase({ id: 'a', text: 'zzz qqq www', lang: 'xx', index: 0 })]);
    expect(r.total).toBe(0);
    expect(r.palavrasSemLista).toBe(3);
  });
});

describe('detalhe lexical da palavra selecionada', () => {
  const falas: FalaDaAnalise[] = [
    {
      id: 'a',
      original: 'A casa é azul',
      translation: '',
      lang: 'pt',
      speaker: 'Ana',
      time: '00:00',
      words: [],
      startTime: 0,
      index: 0,
    },
    {
      id: 'b',
      original: 'casaco não é casa',
      translation: '',
      lang: 'pt',
      speaker: 'Ana',
      time: '00:08',
      words: [],
      startTime: 8,
      index: 1,
    },
  ];
  const texto = falas.map((f) => f.original).join(' ');

  it('conta ocorrências com fronteira por LETRA — "casaco" não conta como "casa"', () => {
    const d = montarDetalheLexical('casa', [], falas, texto);
    expect(d?.ocorrencias).toBe(2);
    expect(d?.trechos).toHaveLength(2);
    expect(d?.trechos[0].startTime).toBe(0);
  });

  it('sem revisão no FSRS a retenção é null, não 45%', () => {
    const d = montarDetalheLexical('casa', [{ word: 'casa', stability: 0, lastReview: 0 }], falas, texto);
    expect(d?.retencao).toBeNull();
  });

  it('com estabilidade e data de revisão reais, a retenção é calculada', () => {
    const agora = 1_000_000_000_000;
    const umDiaAtras = agora - 86_400_000;
    const d = montarDetalheLexical(
      'casa',
      [{ word: 'casa', fsrsStability: 10, lastReview: umDiaAtras, inDeck: true }],
      falas,
      texto,
      agora,
    );
    expect(d?.retencao).toBeGreaterThan(0);
    expect(d?.retencao).toBeLessThanOrEqual(100);
    expect(d?.noDeck).toBe(true);
  });

  it('sem palavra selecionada o painel não monta', () => {
    expect(montarDetalheLexical(null, [], falas, texto)).toBeNull();
  });

  it('sem cartão no baralho, os campos ricos ficam null em vez de herdar de outra palavra', () => {
    const d = montarDetalheLexical('azul', [], falas, texto);
    expect(d?.fonetica).toBeNull();
    expect(d?.nivel).toBeNull();
    expect(d?.traducao).toBeNull();
    expect(d?.noDeck).toBe(false);
  });
});
