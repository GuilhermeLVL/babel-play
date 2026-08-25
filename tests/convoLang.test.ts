import { describe, it, expect } from 'vitest';
import { DominantLangTracker } from '../src/lib/convoLang';

describe('DominantLangTracker', () => {
  it('sem falas → "" (quem chama usa o idioma configurado)', () => {
    expect(new DominantLangTracker().dominant()).toBe('');
  });

  it('a moda da janela vence', () => {
    const t = new DominantLangTracker();
    t.push('en'); t.push('en'); t.push('pt');
    expect(t.dominant()).toBe('en');
  });

  it('empate → o idioma mais recente vence (a conversa acabou de mudar de língua)', () => {
    const t = new DominantLangTracker();
    t.push('en'); t.push('pt');
    expect(t.dominant()).toBe('pt');
  });

  it('a janela desliza: o idioma antigo sai quando a conversa muda de vez', () => {
    const t = new DominantLangTracker(3);
    t.push('en'); t.push('en'); t.push('en');
    t.push('es'); t.push('es'); t.push('es');
    expect(t.dominant()).toBe('es');
  });

  it('ignora vazio e normaliza caixa', () => {
    const t = new DominantLangTracker();
    t.push(''); t.push('EN'); t.push('en');
    expect(t.dominant()).toBe('en');
  });

  it('reset zera a janela', () => {
    const t = new DominantLangTracker();
    t.push('en');
    t.reset();
    expect(t.dominant()).toBe('');
  });
});
