// @vitest-environment jsdom
import { cleanup,render } from '@testing-library/react';
import { beforeEach,describe, expect, it } from 'vitest';

import { registrarCatalogo, tp, usarIdioma } from '../src/lib/i18n';
import { T } from '../src/lib/T';

/**
 * O piloto real (`ModalDeMigracao`): texto rico + interpolação + DOIS plurais na mesma frase.
 * Cada sintagma é resolvido por `tp` e entra como valor; a moldura continua uma string inteira,
 * então o tradutor pode reordenar. Este teste prova que a montagem sai certa nos dois idiomas.
 */
const MOLDURA = 'Encontrei <b>{n}</b> {sessoes} ({audio} com áudio) e <b>{m}</b> {cartoes}.';

function montarPiloto(sessoes: number, cartoes: number, audio: number) {
  return render(
    <T txt={MOLDURA} val={{
      n: sessoes, sessoes: tp(sessoes, 'sessão', 'sessões'),
      audio, m: cartoes, cartoes: tp(cartoes, 'cartão', 'cartões'),
    }} />,
  );
}

describe('piloto de texto rico com dois plurais', () => {
  beforeEach(async () => {
    registrarCatalogo('en', {
      [MOLDURA]: 'I found <b>{n}</b> {sessoes} ({audio} with audio) and <b>{m}</b> {cartoes}.',
      'sessões': { one: 'session', other: 'sessions' },
      'cartões': { one: 'card', other: 'cards' },
    });
    await usarIdioma('pt');
  });

  it('em português, singular e plural na mesma frase', () => {
    const { container } = montarPiloto(1, 42, 1);
    expect(container.textContent).toBe('Encontrei 1 sessão (1 com áudio) e 42 cartões.');
    cleanup();
    const b = montarPiloto(3, 1, 2);
    expect(b.container.textContent).toBe('Encontrei 3 sessões (2 com áudio) e 1 cartão.');
  });

  it('em inglês, cada sintagma pega a forma certa', async () => {
    await usarIdioma('en');
    const { container } = montarPiloto(1, 42, 1);
    expect(container.textContent).toBe('I found 1 session (1 with audio) and 42 cards.');
    cleanup();
    const b = montarPiloto(3, 1, 2);
    expect(b.container.textContent).toBe('I found 3 sessions (2 with audio) and 1 card.');
  });

  it('os números continuam em negrito, as palavras não', async () => {
    await usarIdioma('en');
    const { container } = montarPiloto(3, 7, 1);
    expect([...container.querySelectorAll('strong')].map(e => e.textContent)).toEqual(['3', '7']);
  });
});
