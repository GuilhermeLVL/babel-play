/**
 * A SUGESTÃO E O AGRUPAMENTO — o que a tela propõe antes de a pessoa decidir qualquer coisa.
 *
 * É a primeira frase que se lê no lobby; se ela mentir, o resto da tela perde credibilidade junto.
 * O caso que motivou o teste é real: com o baralho importado, a tela propunha "revisar 2.225
 * palavras" sobre material que ninguém nunca tinha visto.
 */
import { describe, it, expect } from 'vitest';
import { sugerirRodada, agruparJogos } from '../src/core/minigames/painelDaPratica';
import type { EstadoDoJogo } from '../src/core/minigames/estadoDosJogos';
import type { MinigameId } from '../src/core/minigames/types';

const jogo = (id: MinigameId, over: Partial<EstadoDoJogo> = {}): EstadoDoJogo => ({
  id, ok: true, disponiveis: 20, faltam: 0, fonte: 'baralho', tamanhoDaRodada: 8, ...over,
} as EstadoDoJogo);

describe('sugerirRodada', () => {
  it('com fila de revisão, escolhe quem cobre mais palavras por minuto', () => {
    const s = sugerirRodada({ estados: [jogo('memory'), jogo('blitz'), jogo('termo')], vencidas: 400, acervo: 800 });
    expect(s.jogo).toBe('blitz');
    expect(s.momento).toBe('revisao');
    expect(s.quantas).toBe(400);
    expect(s.justificativa).toContain('por minuto');
  });

  it('sem nada vencido, escolhe quem faz PRODUZIR a palavra — e fala de aprender, não de revisar', () => {
    const s = sugerirRodada({ estados: [jogo('memory'), jogo('blitz'), jogo('termo')], vencidas: 0, acervo: 2228 });
    expect(s.jogo).toBe('termo');
    expect(s.momento).toBe('aprender');
    expect(s.quantas).toBe(2228);
  });

  it('o defeito real: acervo recém-importado não vira proposta de revisão', () => {
    // 2.222 nunca vistas, 3 vencidas — poucas demais para qualquer jogo abrir uma rodada de revisão.
    const s = sugerirRodada({ estados: [jogo('memory'), jogo('blitz')], vencidas: 3, acervo: 2225 });
    expect(s.momento).toBe('aprender');
    expect(s.quantas).toBe(2225);
  });

  it('fila menor que o mínimo do jogo não conta como fila', () => {
    const s = sugerirRodada({ estados: [jogo('blitz')], vencidas: 2, acervo: 500 });
    expect(s.momento).toBe('aprender');
  });

  it('nenhum jogo aberto devolve o estado vazio, sem inventar um botão morto', () => {
    const s = sugerirRodada({ estados: [jogo('memory', { ok: false, faltam: 4 })], vencidas: 0, acervo: 2 });
    expect(s.jogo).toBeNull();
    expect(s.momento).toBe('vazio');
    expect(s.justificativa).toBe('');
  });

  it('é determinística — a mesma entrada propõe sempre o mesmo jogo', () => {
    const entrada = { estados: [jogo('memory'), jogo('wordsearch'), jogo('escuta')], vencidas: 100, acervo: 300 };
    expect(sugerirRodada(entrada).jogo).toBe(sugerirRodada(entrada).jogo);
  });

  it('no empate de perfil, ganha a rodada maior', () => {
    const s = sugerirRodada({
      estados: [jogo('wordsearch', { tamanhoDaRodada: 4 }), jogo('escuta', { tamanhoDaRodada: 12 })],
      vencidas: 200, acervo: 400,
    });
    expect(s.jogo).toBe('escuta');
  });
});

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
