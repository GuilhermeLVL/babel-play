// @vitest-environment jsdom
/**
 * O BAU DA RODADA APARECE — e aparece UMA vez.
 *
 * A onda 3 fez o servidor sortear e conceder o item; nenhuma tela mostrava. Pior: `creditarSeeds`
 * (`src/data/api.ts`) nem declarava o campo `item` que o servidor devolve, entao o premio era
 * descartado no `await res.json()`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import React from 'react';
import RecompensaDesbloqueada, {
  chaveDaRecompensa, recompensasVistas, marcarVista, EVENTO_RODADA_FECHOU, type Recompensa,
} from '../src/components/RecompensaDesbloqueada';
import { CATALOGO_DA_LOJA } from '../src/lib/loja';
import { SEEDS_DO_DROP } from '../src/core/economiaAutoridade';

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), explodirAleatorio: vi.fn() }));

const item = CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined && !i.exclusivoDe)!;
const drop = (roundId = 'karuta-1-abc'): Recompensa => ({ tipo: 'drop', roundId, seeds: 5, item });

function montar(fila: Recompensa[]) {
  const onFechar = vi.fn();
  render(<RecompensaDesbloqueada fila={fila} onEquipar={() => true} onFechar={onFechar} onVerPersonalizar={() => {}} />);
  act(() => { window.dispatchEvent(new Event(EVENTO_RODADA_FECHOU)); });
  return { onFechar };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('o bau da rodada na fila de recompensas', () => {
  it('mostra o item que o servidor sorteou', () => {
    montar([drop()]);
    expect(screen.getByText('Bau da rodada')).toBeTruthy();
    expect(screen.getAllByText(item.nome).length).toBeGreaterThan(0);
  });

  /* A TELA MOSTRAVA O SALDO, NAO O PREMIO. `creditarSeeds` devolve `seedsCreditadas` = total
     acumulado da conta, e o primeiro corte passou esse numero adiante: o bau anunciava
     "+2049 Seeds" por um premio de 5. Quanto o bau paga e regra, e a regra e `SEEDS_DO_DROP`.
     Pego no navegador, nao no teste — por isso o teste agora existe. */
  it('anuncia o valor do bau, nunca o saldo da conta', () => {
    montar([{ tipo: 'drop', roundId: 'r', seeds: SEEDS_DO_DROP, item }]);
    expect(screen.getByText(`+${SEEDS_DO_DROP} Seeds`, { exact: false })).toBeTruthy();
    expect(SEEDS_DO_DROP).toBeLessThan(100);
  });

  /* A chave e o roundId porque o credito e idempotente POR rodada no servidor: pedir de novo
     devolve o MESMO item, e mostrar de novo seria anunciar duas vezes o mesmo premio. */
  it('a chave e o roundId, e nao o item', () => {
    expect(chaveDaRecompensa(drop('r1'))).toBe('drop:r1');
    expect(chaveDaRecompensa(drop('r2'))).toBe('drop:r2');
  });

  it('depois de visto, nao volta', () => {
    const r = drop();
    marcarVista(r);
    expect(recompensasVistas().has(chaveDaRecompensa(r))).toBe(true);
  });

  it('oferece equipar a peca ganha', () => {
    montar([drop()]);
    expect(screen.getByText(/Equipar/i)).toBeTruthy();
  });

  /* Com jogo EM CURSO o modal espera: aparecer no meio da partida tiraria a pessoa dela. O bau
     e o unico dos tres tipos que nasce exatamente no fim de uma rodada, entao essa espera e o
     que impede o premio de cobrir a tela do jogo antes do apito. */
  it('com jogo em curso, espera a rodada fechar', () => {
    document.body.setAttribute('data-jogo-ativo', '1');
    try {
      render(<RecompensaDesbloqueada fila={[drop()]} onEquipar={() => true} onFechar={() => {}} onVerPersonalizar={() => {}} />);
      expect(screen.queryByText('Bau da rodada')).toBeNull();
      act(() => { window.dispatchEvent(new Event(EVENTO_RODADA_FECHOU)); });
      expect(screen.getByText('Bau da rodada')).toBeTruthy();
    } finally {
      document.body.removeAttribute('data-jogo-ativo');
    }
  });
});
