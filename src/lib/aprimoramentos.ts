/**
 * APRIMORAMENTOS — a progressão DENTRO de um item da loja (pedido do dono, 2026-08-27).
 *
 * Comprar libera; APRIMORAR (Nv.0 → Nv.3, com barra e %) torna o efeito maior: mais partículas,
 * partículas maiores, mais chance de evento raro. E dominar não te prende no exagero: a
 * INTENSIDADE é editável depois (pequena/média/grande) — quem sente a tela cheia demais volta
 * para a pequena sem perder o nível conquistado. Upgrade é posse (permanente, idempotente via
 * gastarSeeds `apr-<id>-n<k>`); intensidade é preferência (grátis, reversível).
 */

export const NIVEL_MAXIMO = 3;

/** Custo do PRÓXIMO nível (índice = nível atual). */
export const CUSTOS_DE_NIVEL = [30, 60, 120] as const;

export type Intensidade = 'pequena' | 'media' | 'grande';

const CHAVE_NIVEIS = 'babel.aprimoramentos';
const CHAVE_INTENSIDADE = 'babel.particulas_intensidade';

function lerNiveis(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE_NIVEIS) || '{}') as Record<string, number>; } catch { return {}; }
}

export function nivelDoAprimoramento(id: string): number {
  const n = lerNiveis()[id] ?? 0;
  return Math.max(0, Math.min(NIVEL_MAXIMO, n));
}

export function custoDoProximoNivel(id: string): number | null {
  const n = nivelDoAprimoramento(id);
  return n >= NIVEL_MAXIMO ? null : CUSTOS_DE_NIVEL[n];
}

export function registrarAprimoramento(id: string): number {
  const niveis = lerNiveis();
  niveis[id] = Math.min(NIVEL_MAXIMO, (niveis[id] ?? 0) + 1);
  try { localStorage.setItem(CHAVE_NIVEIS, JSON.stringify(niveis)); } catch { /* sem storage */ }
  return niveis[id];
}

/** % para a barra de progressão (0..100). */
export function progressoDoAprimoramento(id: string): number {
  return Math.round((nivelDoAprimoramento(id) / NIVEL_MAXIMO) * 100);
}

// ── Intensidade (preferência livre, com teto no nível dominado) ──

/** Intensidade exige nível: média = Nv.1+, grande = Nv.2+. Pequena é sempre livre. */
export function intensidadeMaxima(nivel: number): Intensidade {
  return nivel >= 2 ? 'grande' : nivel >= 1 ? 'media' : 'pequena';
}

const ORDEM: Intensidade[] = ['pequena', 'media', 'grande'];

export function lerIntensidade(): Intensidade {
  try {
    const v = localStorage.getItem(CHAVE_INTENSIDADE);
    return v === 'pequena' || v === 'media' || v === 'grande' ? v : 'media';
  } catch { return 'media'; }
}

export function setIntensidade(v: Intensidade): void {
  try { localStorage.setItem(CHAVE_INTENSIDADE, v); } catch { /* sem storage */ }
}

/** A intensidade EFETIVA nunca passa do teto do nível de "Explosão de partículas". */
export function intensidadeEfetiva(): Intensidade {
  const teto = intensidadeMaxima(nivelDoAprimoramento('particulas'));
  const desejada = lerIntensidade();
  return ORDEM.indexOf(desejada) <= ORDEM.indexOf(teto) ? desejada : teto;
}

// ── Multiplicadores consumidos pelo ParticleCanvas e pelos eventos ──

const FATOR_INTENSIDADE: Record<Intensidade, { count: number; size: number }> = {
  pequena: { count: 0.7, size: 0.8 },
  media: { count: 1, size: 1 },
  grande: { count: 1.45, size: 1.35 },
};

/**
 * Multiplicadores das RAJADAS: nível do aprimoramento "particulas" (o upgrade comprado) vezes a
 * intensidade escolhida. Teto duro para nunca virar custo de quadro (o TETO de partículas vivas
 * do canvas continua valendo por cima).
 */
export function ajusteDeBurst(): { countMul: number; sizeMul: number } {
  const n = nivelDoAprimoramento('particulas');
  const f = FATOR_INTENSIDADE[intensidadeEfetiva()];
  return {
    countMul: Math.min(2.2, (1 + 0.35 * n) * f.count),
    sizeMul: Math.min(2, (1 + 0.22 * n) * f.size),
  };
}

/** Multiplicador da CHANCE de eventos raros (aprimoramento "sorte"): 1 → 1.75. */
export function sorteDeEventos(): number {
  return Math.min(1.75, 1 + 0.25 * nivelDoAprimoramento('sorte'));
}
