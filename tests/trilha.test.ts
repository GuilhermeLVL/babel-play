import { describe, it, expect } from 'vitest';
import {
  proximasPalavras, progressoDaTrilha, nivelSugerido, chaveDaPalavra, cartoesDaTrilha,
  NIVEIS_CEFR, CONFIANCA_CURADA, type DadoTrilha,
} from '../src/core/learning/trilha';
import { cartoesDaFonte, SESSAO_DA_TRILHA } from '../src/core/minigames/source';
import { buildItems } from '../src/core/minigames/itemSource';
import { pistaUtil } from '../src/core/learning/quality';
import { COMO_SE_JOGA } from '../src/components/minigames/ComoSeJoga';
import { MINIGAMES } from '../src/core/minigames/types';
import trilhaEn from '../src/data/trilha/en.json';
import type { VocabCard } from '../src/types';

/**
 * A TRILHA E O "COMO SE JOGA".
 *
 * O que estes testes protegem: a trilha não pode reapresentar o que a pessoa já sabe (é o jeito
 * mais rápido de ela parecer inútil), não pode misturar níveis (a promessa é "vocabulário A2"),
 * e o nível curado não pode ser rebaixado a chute na entrada.
 *
 * E, desde que o dado passou a guardar o par `[palavra, traducao]`: os cartões montados em memória
 * não podem sair com `id`, porque `Play.tsx` revisaria um id que não existe no banco.
 */

const semSorte = <T,>(xs: T[]) => [...xs];

const FALSA: DadoTrilha = {
  lang: 'en',
  fonte: 'teste',
  versao: '0',
  niveis: {
    A1: [['house', 'casa'], ['water', 'água'], ['bread', 'pão']],
    A2: [['bridge', 'ponte'], ['candle', 'vela']],
    B1: [['reluctant', 'relutante']],
  },
};

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c', word: 'house', phonetics: '', translation: 'casa', explanation: '',
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: '', fsrsState: 'New',
    fsrsStability: 0, fsrsDifficulty: 5, fsrsPredictedRetention: 0, fsrsDueAt: '',
    inDeck: true, srcLang: 'en', ...over,
  };
}

describe('escolha das palavras', () => {
  it('nunca traz o que já está no baralho', () => {
    const r = proximasPalavras(FALSA, 'A1', { quantidade: 3, jaTem: new Set(['house', 'water']), shuffle: semSorte });
    expect(r.map(x => x.palavra)).toEqual(['bread']);
  });

  it('a palavra vem com a tradução curada junto — é ela que vira pista', () => {
    // Sem isto a trilha voltaria a depender de tradutor externo na hora de baixar o lote.
    const r = proximasPalavras(FALSA, 'A2', { quantidade: 2, jaTem: new Set(), shuffle: semSorte });
    expect(r.map(x => [x.palavra, x.traducao])).toEqual([['bridge', 'ponte'], ['candle', 'vela']]);
  });

  it('casa com o baralho ignorando acento e caixa', () => {
    expect(chaveDaPalavra('Água')).toBe(chaveDaPalavra('agua'));
    expect(chaveDaPalavra("don't")).toBe('dont');
  });

  it('devolve MENOS em vez de completar com outro nível', () => {
    // A promessa é "vocabulário A2". Completar com B1 cumpriria o número e quebraria a promessa.
    const r = proximasPalavras(FALSA, 'A2', { quantidade: 8, jaTem: new Set(), shuffle: semSorte });
    expect(r).toHaveLength(2);
    expect(r.every(x => x.nivel === 'A2')).toBe(true);
  });

  it('nível esgotado devolve vazio, não erro', () => {
    const r = proximasPalavras(FALSA, 'A1', { quantidade: 5, jaTem: new Set(['house', 'water', 'bread']), shuffle: semSorte });
    expect(r).toEqual([]);
  });
});

describe('cartões jogáveis direto do dado embutido', () => {
  it('devolve a quantidade pedida, e nunca mais do que o nível tem', () => {
    expect(cartoesDaTrilha(FALSA, 'A1', { quantidade: 2, shuffle: semSorte })).toHaveLength(2);
    // O A2 tem duas palavras: pedir oito devolve duas, não oito com repetição ou de outro nível.
    expect(cartoesDaTrilha(FALSA, 'A2', { quantidade: 8, shuffle: semSorte })).toHaveLength(2);
  });

  it('sem quantidade, vai o nível inteiro — quem limita é o `maxItems` do jogo', () => {
    expect(cartoesDaTrilha(FALSA, 'A1', { shuffle: semSorte })).toHaveLength(3);
  });

  it('todo cartão sai SEM id — senão o fim da rodada revisaria um id que não existe', () => {
    // `Play.tsx` (`aoTerminar`): `if (o.cardId && def.writesSrs) await reviewCard(o.cardId, …)`.
    // Estes cartões são de memória, não há linha em `vocab_cards` para eles.
    const cartoes = cartoesDaTrilha(FALSA, 'A1', { shuffle: semSorte });
    expect(cartoes.every(c => c.id === '')).toBe(true);
  });

  it('carrega o nível e o baralho da trilha — é por eles que o filtro de fonte recorta', () => {
    const cartoes = cartoesDaTrilha(FALSA, 'A2', { shuffle: semSorte });
    expect(cartoes.every(c => c.cefrLevel === 'A2')).toBe(true);
    // O id sintético segue sendo escrito (é o que `bulkAdd` decompõe), mas quem FILTRA é `daTrilha`.
    expect(cartoes.every(c => c.sourceSessionId === SESSAO_DA_TRILHA('en'))).toBe(true);
    expect(cartoes.every(c => c.daTrilha === true)).toBe(true);
    expect(cartoes.every(c => c.cefrConfidence === CONFIANCA_CURADA)).toBe(true);
  });

  it('a tradução do par vira a pista do cartão', () => {
    const cartoes = cartoesDaTrilha(FALSA, 'A2', { shuffle: semSorte });
    expect(cartoes.map(c => [c.word, c.translation])).toEqual([['bridge', 'ponte'], ['candle', 'vela']]);
  });

  it('os cartões passam pelo filtro da fonte trilha sem serem descartados', () => {
    // Prova que o par de campos acima é o certo: a rodada "Trilha A2" não volta vazia.
    const cartoes = cartoesDaTrilha(FALSA, 'A2', { shuffle: semSorte }) as unknown as VocabCard[];
    const t = cartoesDaFonte(cartoes, { id: 'trilha', lang: 'en', nivel: 'A2' });
    expect(t.usaveis.map(c => c.word)).toEqual(['bridge', 'candle']);
    // E o nível errado não vaza para a rodada: A1 pedido, cartões A2 fora.
    expect(cartoesDaFonte(cartoes, { id: 'trilha', lang: 'en', nivel: 'A1' }).usaveis).toEqual([]);
  });

  it('nível inexistente devolve lista vazia em vez de quebrar', () => {
    expect(cartoesDaTrilha(FALSA, 'C2', { quantidade: 5, shuffle: semSorte })).toEqual([]);
  });
});

describe('progresso e sugestão de nível', () => {
  it('conta quanto de cada nível já está no baralho', () => {
    const p = progressoDaTrilha(FALSA, new Set(['house', 'water']));
    expect(p.find(x => x.nivel === 'A1')).toEqual({ nivel: 'A1', total: 3, jaTem: 2, pct: 67 });
    expect(p.find(x => x.nivel === 'A2')?.pct).toBe(0);
  });

  it('sugere o primeiro nível ainda aberto — 80% já conta como dominado', () => {
    // Exigir 100% prenderia a pessoa no A1 para sempre: as listas têm palavras raras.
    expect(nivelSugerido(progressoDaTrilha(FALSA, new Set()))).toBe('A1');
    expect(nivelSugerido(progressoDaTrilha(FALSA, new Set(['house', 'water', 'bread'])))).toBe('A2');
  });

  it('com tudo dominado, fica no último nível em vez de estourar', () => {
    const tudo = new Set(['house', 'water', 'bread', 'bridge', 'candle', 'reluctant']);
    expect(nivelSugerido(progressoDaTrilha(FALSA, tudo))).toBe('B1');
  });
});

describe('a trilha é um baralho separado', () => {
  it('a fonte trilha só pega o que veio dela', () => {
    const deck = [
      card({ id: 'capturada', word: 'water', sourceSessionId: 'sessao-1' }),
      card({ id: 'daTrilha', word: 'bridge', daTrilha: true }),
    ];
    const t = cartoesDaFonte(deck, { id: 'trilha', lang: 'en', nivel: 'A2' });
    expect(t.usaveis.map(c => c.id)).toEqual(['daTrilha']);
  });

  it('o id do baralho da trilha é estável e por idioma', () => {
    expect(SESSAO_DA_TRILHA('en-US')).toBe('trilha:en');
    expect(SESSAO_DA_TRILHA('pt-BR')).toBe('trilha:pt');
    expect(SESSAO_DA_TRILHA('')).toBe('trilha:en');
  });

  it('nível curado entra com confiança 1 — medido não é a mesma coisa que estimado', () => {
    expect(CONFIANCA_CURADA).toBe(1);
  });
});

describe('a lista embutida', () => {
  const dado = trilhaEn as unknown as DadoTrilha;
  /** Todos os pares dos seis níveis. Lido por nível (e não por `Object.values`) para o par
   *  continuar tipado como `[palavra, traducao]` em vez de virar `string`. */
  const TODOS_OS_PARES = NIVEIS_CEFR.flatMap(n => dado.niveis[n] ?? []);

  it('cobre os seis níveis e cita a fonte (a licença exige atribuição)', () => {
    expect(Object.keys(dado.niveis).sort()).toEqual([...NIVEIS_CEFR].sort());
    expect(dado.fonte).toMatch(/CEFR-J/);
    expect(dado.fonte).toMatch(/Octanove/);
  });

  it('tem palavras suficientes para uma rodada de qualquer jogo em todo nível', () => {
    const maiorRodada = Math.max(...Object.values(MINIGAMES).map(m => m.maxItems));
    for (const n of NIVEIS_CEFR) {
      expect((dado.niveis[n] ?? []).length, `nível ${n}`).toBeGreaterThan(maiorRodada);
    }
  });

  it('só palavras simples: sem número, sem espaço, sem abreviação com ponto', () => {
    const ruins = TODOS_OS_PARES.filter(([palavra]) => !/^[A-Za-z][A-Za-z'-]*$/.test(palavra));
    expect(ruins).toEqual([]);
  });

  it('nenhuma palavra repetida entre níveis — cada uma tem um nível só', () => {
    const todas = TODOS_OS_PARES.map(([palavra]) => palavra.toLowerCase());
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('TODA palavra tem tradução — sem ela o cartão não vira pergunta', () => {
    // O par existe justamente para a trilha não precisar de tradutor externo. Um par pela metade
    // reintroduz o defeito que ele veio tirar, só que escondido dentro do arquivo.
    const semTraducao = TODOS_OS_PARES.filter(par => !Array.isArray(par) || !(par[1] ?? '').trim());
    expect(semTraducao).toEqual([]);
  });

  it('a tradução nunca é a própria palavra — `avaliarCartao` reprovaria com "traducao-igual"', () => {
    const iguais = TODOS_OS_PARES.filter(([p, t]) => p.toLowerCase() === (t ?? '').toLowerCase());
    expect(iguais).toEqual([]);
  });

  it('joga de verdade: o A1 embutido vira uma rodada cheia sem tocar em rede', () => {
    const cartoes = cartoesDaTrilha(dado, 'A1', { quantidade: 40, shuffle: semSorte }) as unknown as VocabCard[];
    const itens = buildItems('memory', cartoes, { shuffle: semSorte });
    expect(itens.length).toBe(MINIGAMES.memory.maxItems);
    // A pista é a tradução curada, e nenhum item leva cardId (não há linha no banco para revisar).
    expect(itens.every(i => !i.cardId)).toBe(true);
    expect(itens.every(i => i.prompt.trim().length > 0)).toBe(true);
  });
});

describe('o "como se joga" existe para todo jogo', () => {
  it('nenhum jogo fica sem explicação', () => {
    for (const id of Object.keys(MINIGAMES) as Array<keyof typeof MINIGAMES>) {
      expect(COMO_SE_JOGA[id], `jogo ${id}`).toBeDefined();
    }
  });

  it('todo jogo declara os LIMITES — método sem limite declarado é promessa vazia', () => {
    for (const [id, c] of Object.entries(COMO_SE_JOGA)) {
      expect(c.limites.length, `jogo ${id}`).toBeGreaterThan(30);
      expect(c.treina.length, `jogo ${id}`).toBeGreaterThan(10);
      expect(c.passos.length, `jogo ${id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('toda ajuda diz o preço — inclusive quando é de graça', () => {
    for (const [id, c] of Object.entries(COMO_SE_JOGA)) {
      expect(c.ajudas.length, `jogo ${id}`).toBeGreaterThan(0);
      for (const a of c.ajudas) {
        expect(a.o_que.length).toBeGreaterThan(10);
        expect(a.custo === null || a.custo.length > 5).toBe(true);
      }
    }
  });
});

/**
 * O LÉXICO EMBUTIDO — invariantes que o usuário pagou para descobrir.
 *
 * Ele jogou e viu a pista "andar" valendo `story`, "teatral" valendo `camp` e, no Termo, "morto"
 * valendo `body`. Não eram traduções erradas: eram SENTIDOS RAROS escolhidos como principais,
 * porque o gerador pegava a primeira glosa disponível e a ordem de sentidos das fontes não é ordem
 * de frequência. O conserto foi validação de IDA E VOLTA (a glosa portuguesa tem de listar a
 * palavra inglesa entre as traduções dela), e estes testes existem para o dado nunca regredir para
 * lá — nem se o arquivo for gerado de novo.
 */
describe('en.json — o dado embutido', () => {
  const dado = trilhaEn as unknown as { niveis: Record<string, [string, string][]> };
  const todos = Object.values(dado.niveis).flat();
  const mapa = new Map(todos);

  it('os casos exatos do relato estão corretos', () => {
    // `body` significa corpo; `morto` é `dead`. Trocar os dois é o defeito relatado.
    expect(mapa.get('body')).toBe('corpo');
    expect(mapa.get('dead')).toBe('morto');
    // `story` já não é "andar" (que é o sentido de pavimento).
    expect(mapa.get('story')).not.toBe('andar');
    // `camp` saiu em vez de ficar como "teatral" — melhor ausente que enganoso.
    expect(mapa.get('camp')).not.toBe('teatral');
  });

  it('nenhuma palavra é a própria tradução', () => {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const iguais = todos.filter(([p, t]) => norm(p) === norm(t));
    expect(iguais).toEqual([]);
  });

  it('toda tradução é curta o bastante para ser pista', () => {
    // A régua (`pistaUtil`) reprova pista com mais de 5 palavras, com dígito ou com "!?".
    const ruins = todos.filter(([, t]) => !pistaUtil(t));
    expect(ruins).toEqual([]);
  });

  it('a colisão de pistas está sob controle', () => {
    /* Colisão legítima existe — "conta" traduz `account` e `bill`, e as duas estão certas. O que
       não pode voltar é o patamar antigo: 1.116 de 3.997 palavras (28%) compartilhavam glosa,
       porque metade era sentido errado. Depois da ida e volta são 352 de 2.784 (13%). O teto de
       20% dá folga para o dado crescer sem deixar o defeito voltar. */
    const porTraducao = new Map<string, number>();
    for (const [, t] of todos) {
      const k = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      porTraducao.set(k, (porTraducao.get(k) ?? 0) + 1);
    }
    const afetadas = [...porTraducao.values()].filter(n => n > 1).reduce((a, b) => a + b, 0);
    expect(afetadas / todos.length).toBeLessThan(0.20);
  });

  it('todo nível tem material suficiente para uma rodada', () => {
    // O mínimo de qualquer jogo é 4. Um nível abaixo disso seria um chip que não joga.
    for (const [nivel, lista] of Object.entries(dado.niveis)) {
      expect(lista.length, `nível ${nivel}`).toBeGreaterThanOrEqual(4);
    }
  });
});
