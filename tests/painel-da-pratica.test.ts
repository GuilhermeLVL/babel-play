/**
 * O AGRUPAMENTO DOS JOGOS — o que abre, o que não abre, e por quê.
 *
 * Nove cartas cinzentas misturadas com as jogáveis, sem dizer o que faltava, faziam a tela parecer
 * quebrada quando o que faltava era material.
 */
import { describe, it, expect } from 'vitest';
import { agruparJogos } from '../src/core/minigames/painelDaPratica';
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos';
import type { MinigameId } from '../src/core/minigames/types';

const jogo = (id: MinigameId, over: Partial<EstadoDoJogo> = {}): EstadoDoJogo => ({
  id, ok: true, disponiveis: 20, faltam: 0, fonte: 'baralho', tamanhoDaRodada: 8, ...over,
} as EstadoDoJogo);

describe('agruparJogos', () => {
  it('separa o que abre do que não abre', () => {
    const { prontos, presos } = agruparJogos([
      jogo('memory'), jogo('termo', { ok: false, faltam: 3, disponiveis: 0 }), jogo('blitz'),
    ]);
    expect(prontos.map(p => p.id).sort()).toEqual(['blitz', 'memory']);
    expect(presos.map(p => p.estado.id)).toEqual(['termo']);
  });

  it('prontos vêm do que rende mais para o que rende menos', () => {
    const { prontos } = agruparJogos([
      jogo('memory', { tamanhoDaRodada: 4 }), jogo('blitz', { tamanhoDaRodada: 20 }),
    ]);
    expect(prontos[0].id).toBe('blitz');
  });

  it('presos vêm do mais perto de abrir para o mais longe', () => {
    const { presos } = agruparJogos([
      jogo('memory', { ok: false, faltam: 9 }), jogo('blitz', { ok: false, faltam: 1 }),
    ]);
    expect(presos.map(p => p.estado.id)).toEqual(['blitz', 'memory']);
  });

  it('todo preso carrega o porquê — carta cinzenta sem motivo era o defeito', () => {
    const { presos } = agruparJogos([
      jogo('wordsearch', { ok: false, faltam: 4, disponiveis: 0, motivo: 'alfabeto-nao-suportado' }),
      jogo('memory', { ok: false, faltam: 2, disponiveis: 2 }),
    ]);
    for (const p of presos) {
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.conserto.length).toBeGreaterThan(0);
    }
    expect(presos.find(p => p.estado.id === 'wordsearch')!.titulo).toBe('alfabeto não suportado');
    expect(presos.find(p => p.estado.id === 'memory')!.conserto).toContain('2 palavras prontas');
  });

  it('sem material nenhum, o conserto diz isso em vez de contar zero', () => {
    const { presos } = agruparJogos([jogo('memory', { ok: false, faltam: 4, disponiveis: 0 })]);
    expect(presos[0].conserto).toContain('nenhuma palavra');
  });
});
