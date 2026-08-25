import { describe, it, expect } from 'vitest';
import { readAppearance, applyAppearance, APPEARANCE_ATTRS, type StyledElement } from '../src/lib/appearanceSync';

/** Elemento falso com a superfície mínima que a sincronia usa (sem DOM, roda em node). */
function fakeEl(init: { theme?: string; className?: string; vars?: Record<string, string>; fontSize?: string } = {}): StyledElement {
  const attrs: Record<string, string> = {};
  if (init.theme) attrs['data-theme'] = init.theme;
  const vars: Record<string, string> = { ...(init.vars ?? {}) };
  // Propriedades NÃO-variáveis entram na lista para provar que não atravessam a fronteira.
  const outras: Record<string, string> = { overflow: 'hidden' };
  const chaves = () => [...Object.keys(vars), ...Object.keys(outras)];
  return {
    getAttribute: (n) => attrs[n] ?? null,
    setAttribute: (n, v) => { attrs[n] = v; },
    className: init.className ?? '',
    style: {
      get length() { return chaves().length; },
      item: (i: number) => chaves()[i] ?? '',
      getPropertyValue: (p: string) => vars[p] ?? outras[p] ?? '',
      setProperty: (p: string, v: string) => { if (p.startsWith('--')) vars[p] = v; else outras[p] = v; },
      fontSize: init.fontSize ?? '',
    },
  };
}

describe('appearanceSync', () => {
  it('leva tema, classes e o modo escuro', () => {
    const origemRaiz = fakeEl({ theme: 'vercel', className: 'dark antialiased' });
    const origemBody = fakeEl({ className: 'performance-mode' });
    const destinoRaiz = fakeEl();
    const destinoBody = fakeEl();

    applyAppearance(destinoRaiz, destinoBody, readAppearance(origemRaiz, origemBody));

    expect(destinoRaiz.getAttribute('data-theme')).toBe('vercel');
    expect(destinoRaiz.className).toBe('dark antialiased');
    expect(destinoBody.className).toBe('performance-mode');
  });

  /** O bug relatado: com o tema Customizado, a janela flutuante ficava na paleta de reserva. */
  it('leva as variáveis do tema CUSTOMIZADO (que vivem em style inline)', () => {
    const origemRaiz = fakeEl({
      theme: 'custom',
      vars: { '--custom-canvas': '#101010', '--custom-accent': '#22D3EE' },
    });
    const destinoRaiz = fakeEl();

    applyAppearance(destinoRaiz, fakeEl(), readAppearance(origemRaiz, fakeEl()));

    expect(destinoRaiz.style.getPropertyValue('--custom-canvas')).toBe('#101010');
    expect(destinoRaiz.style.getPropertyValue('--custom-accent')).toBe('#22D3EE');
  });

  it('leva a escala de fonte (A+/A−), que também mora em style inline', () => {
    const destinoRaiz = fakeEl();
    applyAppearance(destinoRaiz, fakeEl(), readAppearance(fakeEl({ fontSize: '18px' }), fakeEl()));
    expect(destinoRaiz.style.fontSize).toBe('18px');
  });

  it('NÃO leva propriedades de layout — só aparência atravessa', () => {
    const destinoRaiz = fakeEl();
    const snap = readAppearance(fakeEl({ vars: { '--custom-ink': '#fff' } }), fakeEl());
    expect(Object.keys(snap.inlineVars)).toEqual(['--custom-ink']); // 'overflow' ficou de fora
    applyAppearance(destinoRaiz, fakeEl(), snap);
    expect(destinoRaiz.style.getPropertyValue('--custom-ink')).toBe('#fff');
  });

  it('sem tema declarado, cai no padrão em vez de apagar o atributo', () => {
    const snap = readAppearance(fakeEl(), fakeEl());
    expect(snap.theme).toBe('babel');
  });

  it('fontSize vazio não sobrescreve o destino', () => {
    const destinoRaiz = fakeEl({ fontSize: '16px' });
    applyAppearance(destinoRaiz, fakeEl(), readAppearance(fakeEl(), fakeEl()));
    expect(destinoRaiz.style.fontSize).toBe('16px');
  });

  /** O observador precisa vigiar 'style' — era a lacuna que segurava o bug. */
  it('a lista de atributos observados inclui style', () => {
    expect(APPEARANCE_ATTRS).toContain('style');
    expect(APPEARANCE_ATTRS).toContain('data-theme');
    expect(APPEARANCE_ATTRS).toContain('class');
  });
});
