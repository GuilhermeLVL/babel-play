/**
 * O TATO NO CELULAR — a vibração curta que acompanha o que acontece na tela.
 *
 * O headset já vibra o controle ao apontar (`respostaAoApontar.ts`); o celular não tinha nada, fora
 * a vibração dos eventos raros de jogo. Aqui cada tipo de acontecimento tem o seu padrão: um toque é
 * um pulso de 6 ms que mal se nota, um erro são dois pulsos graves, uma conquista é uma sequência.
 * O que faz a tela parecer um objeto é som, imagem e vibração saírem no MESMO instante, então quem
 * chama `tato()` chama junto com o som e a animação, não depois.
 *
 * Vibração não é movimento na tela: quem pediu "reduzir movimento" continua sentindo o toque. Ela tem
 * a sua própria chave, e só existe em aparelho de toque.
 */
import { useSyncExternalStore } from 'react';

export type Tato =
  | 'toque'
  | 'navegar'
  | 'aba'
  | 'abrir'
  | 'fechar'
  | 'aviso'
  | 'ligar'
  | 'desligar'
  | 'acerto'
  | 'erro'
  | 'sucesso'
  | 'festa';

/** Milissegundos: um número é um pulso; uma lista alterna vibra, pausa, vibra… */
export const PADROES_DE_TATO: Readonly<Record<Tato, number | readonly number[]>> = {
  toque: 6,
  navegar: 8,
  aba: 6,
  abrir: 10,
  fechar: 6,
  aviso: [8, 40, 8],
  ligar: 10,
  desligar: 8,
  acerto: [10, 30, 16],
  erro: [30, 40, 30],
  sucesso: [10, 50, 10, 50, 18],
  festa: [15, 40, 15, 40, 30],
};

export const CHAVE_DO_TATO = 'babel.vibracao';
const EVENTO_DO_TATO = 'babel:vibracao';

/** Ligado de fábrica: só `'nao'` desliga. */
export function tatoLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE_DO_TATO) !== 'nao';
  } catch {
    return true;
  }
}

export function guardarTato(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_DO_TATO, ligado ? 'sim' : 'nao');
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_DO_TATO));
}

const assinar = (aoMudar: () => void) => {
  window.addEventListener(EVENTO_DO_TATO, aoMudar);
  return () => window.removeEventListener(EVENTO_DO_TATO, aoMudar);
};

export function useTato(): boolean {
  return useSyncExternalStore(assinar, tatoLigado, () => true);
}

/** O aparelho tem como vibrar pela página? (O iPhone não tem `navigator.vibrate`.) */
export function aparelhoVibra(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

/** Vibra o padrão do acontecimento. Não faz nada sem motor, sem toque ou com a chave desligada. */
export function tato(tipo: Tato): boolean {
  if (!aparelhoVibra() || !tatoLigado()) return false;
  const padrao = PADROES_DE_TATO[tipo];
  try {
    return navigator.vibrate(typeof padrao === 'number' ? padrao : [...padrao]);
  } catch {
    return false;
  }
}
