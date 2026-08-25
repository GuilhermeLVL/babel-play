import { describe, it, expect } from 'vitest';
import { aplicarOrdem, mover, alternarFixado, ORDEM_VAZIA, type OrdemDosJogos } from '../src/lib/ordemDosJogos';

/**
 * A ordem da grade de jogos é o tipo de lógica em que o engano NÃO APARECE: a tela continua
 * mostrando as nove cartas, só que no lugar errado. Por isso mora fora do componente e é testada
 * aqui, com os casos que quebram na vida real — jogo novo, id órfão de uma versão antiga, e a
 * ponta da lista.
 */

const JOGOS = ['memory', 'wordsearch', 'termo', 'scramble', 'karaoke'];
const id = (x: string) => x;

describe('aplicarOrdem', () => {
  it('sem preferência, não mexe em nada', () => {
    expect(aplicarOrdem(JOGOS, ORDEM_VAZIA, id)).toEqual(JOGOS);
  });

  it('fixados vão para o topo, na ordem em que foram fixados', () => {
    const pref: OrdemDosJogos = { fixados: ['karaoke', 'termo'], ordem: [] };
    expect(aplicarOrdem(JOGOS, pref, id)).toEqual(['karaoke', 'termo', 'memory', 'wordsearch', 'scramble']);
  });

  it('a ordem escolhida vale para os não-fixados', () => {
    const pref: OrdemDosJogos = { fixados: [], ordem: ['scramble', 'memory'] };
    expect(aplicarOrdem(JOGOS, pref, id).slice(0, 2)).toEqual(['scramble', 'memory']);
  });

  it('JOGO NOVO vai para o fim em vez de sumir', () => {
    const pref: OrdemDosJogos = { fixados: [], ordem: ['scramble', 'memory', 'wordsearch', 'termo', 'karaoke'] };
    const comNovo = [...JOGOS, 'jogo-que-o-app-ganhou-depois'];
    const r = aplicarOrdem(comNovo, pref, id);
    expect(r).toHaveLength(6);
    expect(r[r.length - 1]).toBe('jogo-que-o-app-ganhou-depois');
  });

  it('id ÓRFÃO na preferência é ignorado, não quebra a grade', () => {
    const pref: OrdemDosJogos = { fixados: ['jogo-removido'], ordem: ['outro-que-nao-existe', 'termo'] };
    const r = aplicarOrdem(JOGOS, pref, id);
    expect(r).toHaveLength(5);
    expect(r).toEqual(expect.arrayContaining(JOGOS));
    expect(r[0]).toBe('termo');   // o único id válido da preferência
  });

  it('dois jogos novos juntos não produzem ordem indefinida', () => {
    // Com `Infinity` como posição de "não listado", `Infinity - Infinity` dá NaN e o comparador
    // devolve ordem indeterminada. Este teste existe por causa disso.
    const pref: OrdemDosJogos = { fixados: [], ordem: ['termo'] };
    const r = aplicarOrdem(['novo-a', 'termo', 'novo-b'], pref, id);
    expect(r[0]).toBe('termo');
    expect(r.slice(1).sort()).toEqual(['novo-a', 'novo-b']);
  });

  it('não muta a lista recebida', () => {
    const original = [...JOGOS];
    aplicarOrdem(JOGOS, { fixados: ['karaoke'], ordem: [] }, id);
    expect(JOGOS).toEqual(original);
  });
});

describe('mover', () => {
  it('troca com o vizinho visível', () => {
    const r = mover(ORDEM_VAZIA, JOGOS, 'termo', -1);
    expect(aplicarOrdem(JOGOS, r, id).slice(0, 3)).toEqual(['memory', 'termo', 'wordsearch']);
  });

  it('na ponta, não faz nada (nem devolve lista quebrada)', () => {
    expect(mover(ORDEM_VAZIA, JOGOS, 'memory', -1)).toEqual(ORDEM_VAZIA);
    expect(mover(ORDEM_VAZIA, JOGOS, 'karaoke', 1)).toEqual(ORDEM_VAZIA);
  });

  it('mover um FIXADO não o tira dos fixados', () => {
    const pref: OrdemDosJogos = { fixados: ['karaoke', 'termo'], ordem: [] };
    const visiveis = aplicarOrdem(JOGOS, pref, id);
    const r = mover(pref, visiveis, 'termo', -1);
    expect(r.fixados).toEqual(['termo', 'karaoke']);
    expect(aplicarOrdem(JOGOS, r, id).slice(0, 2)).toEqual(['termo', 'karaoke']);
  });

  it('mover um COMUM não o promove a fixado', () => {
    const pref: OrdemDosJogos = { fixados: ['karaoke'], ordem: [] };
    const visiveis = aplicarOrdem(JOGOS, pref, id);
    const r = mover(pref, visiveis, 'termo', -1);
    expect(r.fixados).toEqual(['karaoke']);
  });

  it('id que não está na lista não altera nada', () => {
    expect(mover(ORDEM_VAZIA, JOGOS, 'inexistente', 1)).toEqual(ORDEM_VAZIA);
  });
});

describe('alternarFixado', () => {
  it('fixa e o jogo sobe', () => {
    const r = alternarFixado(ORDEM_VAZIA, 'karaoke');
    expect(aplicarOrdem(JOGOS, r, id)[0]).toBe('karaoke');
  });

  it('desafixar devolve para a FRENTE do grupo comum, não para o fim', () => {
    // Desafixar por engano não pode custar caro para desfazer.
    const fixado = alternarFixado(ORDEM_VAZIA, 'karaoke');
    const solto = alternarFixado(fixado, 'karaoke');
    expect(solto.fixados).toEqual([]);
    expect(aplicarOrdem(JOGOS, solto, id)[0]).toBe('karaoke');
  });

  it('fixar tira o jogo da ordem comum (não fica nos dois lugares)', () => {
    const pref: OrdemDosJogos = { fixados: [], ordem: ['termo', 'memory'] };
    const r = alternarFixado(pref, 'termo');
    expect(r.fixados).toEqual(['termo']);
    expect(r.ordem).toEqual(['memory']);
  });
});
