import type { Intervalo, Limites, NomeDoDedo } from './tipos';

/** Limita `v` ao intervalo; `contar` é chamado quando o clamp AGIU (diagnóstico: com dados válidos fica em 0). */
export function clampOsso(v: number, [lo, hi]: Intervalo, contar?: (excesso: number) => void): number {
  if (v < lo - 1e-3 || v > hi + 1e-3) contar?.(v < lo ? lo - v : v - hi);
  return v < lo ? lo : v > hi ? hi : v;
}

/** Intervalo de um ângulo de dedo, com a exceção por osso (o mínimo abre mais a abdução). */
export function limiteDoDedo(lim: Limites, dedo: NomeDoDedo, campo: 'mcp' | 'pip' | 'dip' | 'abd'): Intervalo {
  return lim.dedo_por_osso?.[dedo]?.[campo] ?? lim.dedo[campo];
}
