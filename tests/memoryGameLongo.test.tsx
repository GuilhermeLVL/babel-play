// @vitest-environment jsdom
/**
 * S5 — pista curada de até 160 caracteres vazava da carta.
 *
 * A carta tinha altura fixa (`min-h-[5.5rem]`/`min-h-[4.5rem]`) e o texto do verso não tinha
 * clamp nenhum: com uma tradução longa (o perfil 'curado' de baralho Anki permite até 160
 * caracteres) o texto estourava a carta e sobrepunha o layout vizinho. `overflow` sozinho corta
 * sem avisar que há mais texto; a correção soma clamp de linhas + `title` com o texto completo.
 *
 * jsdom não mede layout (`overflow` visual não é observável aqui) — por isso o teste fixa o
 * MECANISMO: a classe de `line-clamp` está presente, a fonte desce um passo quando o texto passa
 * de ~80 caracteres, e o `title` carrega a string inteira (o clamp é só visual).
 */
import { cleanup, fireEvent,render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach,describe, expect, it } from 'vitest';

import type { MinigameItem, RoundReport } from '../src/core/minigames/types';

const { default: MemoryGame } = await import('../src/components/minigames/MemoryGame');

afterEach(() => cleanup());

/** Abre as duas cartas de um baralho de UM item só — casam entre si e ficam reveladas
 *  (`fechados` também conta como `aberta`), então a ordem embaralhada não importa. */
function abrirTudo(): void {
  const botoes = screen.getAllByRole('button', { name: /./ }).filter(b =>
    (b as HTMLButtonElement).className.includes('carta3d'));
  for (const b of botoes) fireEvent.click(b);
}

describe('MemoryGame — a pista longa não vaza da carta', () => {
  it('tradução de 160 caracteres ganha clamp, fonte reduzida e title com o texto completo', () => {
    const longa = 'a'.repeat(159) + 'b'; // 160 chars, > 80 → dispara o downscale de fonte
    const items: MinigameItem[] = [{ cardId: 'c1', prompt: longa, answer: 'curto', lang: 'en' }];
    let relatorio: RoundReport | null = null;
    render(<MemoryGame items={items} ageProfile="pro" onFinish={r => { relatorio = r; }} onExit={() => {}} />);

    abrirTudo();

    const span = screen.getByText(longa);
    expect(span.className).toMatch(/line-clamp-3|line-clamp-4/);
    expect(span.getAttribute('title')).toBe(longa);
    // Perfil 'pro' não é folgado: a base é text-[13px]; acima de 45 chars desce para text-[10px], que é o que cabe em 3 linhas na carta de 55px.
    expect(span.className).toContain('text-[10px]');
    void relatorio;
  });

  it('item curto não sofre downscale de fonte, mas continua com clamp e title', () => {
    const curta = 'gato';
    const items: MinigameItem[] = [{ cardId: 'c1', prompt: curta, answer: 'cat', lang: 'en' }];
    render(<MemoryGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />);

    abrirTudo();

    const span = screen.getByText(curta);
    expect(span.className).toContain('text-[13px]');
    expect(span.className).toMatch(/line-clamp-3|line-clamp-4/);
    expect(span.getAttribute('title')).toBe(curta);
  });
});
