/**
 * O NÍVEL QUE A PESSOA ESCOLHEU PARA CADA JOGO (Fácil, Médio, Difícil).
 *
 * É POR JOGO: quem vai bem no Termo pode precisar do Fácil no Ditado. Um jogo que a pessoa ainda não
 * ajustou começa no último nível que ela escolheu em qualquer jogo; sem escolha nenhuma, no Médio,
 * que é a regra de sempre (`src/core/minigames/regras.ts`).
 *
 * Fica só neste aparelho, como o som e as animações. Não vai para o servidor nem para o relatório da
 * rodada: o nível muda quanto o jogo aperta, não o que a rodada diz sobre a memória.
 */
import { useSyncExternalStore } from 'react';

import { NIVEIS_DO_JOGO, type NivelDoJogo } from '../../core/minigames/regras';
import type { MinigameId } from '../../core/minigames/types';

const CHAVE_DO_ULTIMO = 'babel.nivel';
const chaveDoJogo = (jogo: MinigameId) => `babel.nivel.${jogo}`;
const EVENTO = 'babel:nivel-do-jogo';

const ehNivel = (v: unknown): v is NivelDoJogo => NIVEIS_DO_JOGO.includes(v as NivelDoJogo);

function ler(chave: string): NivelDoJogo | null {
  try {
    const v = localStorage.getItem(chave);
    return ehNivel(v) ? v : null;
  } catch {
    return null;
  }
}

export function lerNivelDoJogo(jogo: MinigameId): NivelDoJogo {
  return ler(chaveDoJogo(jogo)) ?? ler(CHAVE_DO_ULTIMO) ?? 'medio';
}

export function guardarNivelDoJogo(jogo: MinigameId, nivel: NivelDoJogo): void {
  try {
    localStorage.setItem(chaveDoJogo(jogo), nivel);
    localStorage.setItem(CHAVE_DO_ULTIMO, nivel);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

const assinar = (aoMudar: () => void) => {
  window.addEventListener(EVENTO, aoMudar);
  return () => window.removeEventListener(EVENTO, aoMudar);
};

/** O nível do jogo, reagindo à troca. Uma rodada em curso lê uma vez: trocar o nível a recomeça. */
export function useNivelDoJogo(jogo: MinigameId): NivelDoJogo {
  return useSyncExternalStore(
    assinar,
    () => lerNivelDoJogo(jogo),
    () => 'medio' as const,
  );
}
