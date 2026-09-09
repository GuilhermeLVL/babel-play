// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { camadasAbertas,empilharCamada } from '../src/lib/camadasDeEscape';

/**
 * UM `Escape`, UMA CAMADA.
 *
 * `SeletorDeConteudo` e `SalaDeEscolha` escutavam `keydown` em `window`, cada um por conta propria
 * e sem `stopPropagation`. Os dois coexistem, e o botao que reabre a Sala fica DENTRO do seletor:
 * um unico Esc fechava as duas.
 */
const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

beforeEach(() => { while (camadasAbertas()) { /* limpa o que sobrou */ } });

describe('pilha de camadas', () => {
  it('o Esc fecha so a camada de cima', () => {
    const debaixo = vi.fn(); const emCima = vi.fn();
    const sairDebaixo = empilharCamada(debaixo);
    const sairEmCima = empilharCamada(emCima);
    esc();
    expect(emCima).toHaveBeenCalledTimes(1);
    expect(debaixo).not.toHaveBeenCalled();
    sairEmCima(); sairDebaixo();
  });

  it('fechada a de cima, o proximo Esc chega na de baixo', () => {
    const debaixo = vi.fn();
    const sairDebaixo = empilharCamada(debaixo);
    const sairEmCima = empilharCamada(vi.fn());
    sairEmCima();
    esc();
    expect(debaixo).toHaveBeenCalledTimes(1);
    sairDebaixo();
  });

  /* Desmontagem fora de ordem acontece: o React nao garante que o filho saia antes do pai. */
  it('sair do meio da pilha remove so a propria entrada', () => {
    const a = vi.fn(); const b = vi.fn(); const c = vi.fn();
    const sairA = empilharCamada(a); const sairB = empilharCamada(b); const sairC = empilharCamada(c);
    sairB();
    esc();
    expect(c).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    sairA(); sairC();
  });

  it('sem camada nenhuma, o Esc nao explode', () => {
    expect(() => esc()).not.toThrow();
  });

  it('a pilha esvazia ao sair de todas', () => {
    const s1 = empilharCamada(vi.fn()); const s2 = empilharCamada(vi.fn());
    expect(camadasAbertas()).toBe(2);
    s1(); s2();
    expect(camadasAbertas()).toBe(0);
  });
});
