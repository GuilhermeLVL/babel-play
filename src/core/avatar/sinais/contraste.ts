/**
 * ALTO CONTRASTE: escolhe o fundo do quadro das mãos para que a mão (tom de pele da receita) tenha pelo menos
 * 3:1 contra ele (WCAG 1.4.11, componentes gráficos). Entre os dois extremos (quase preto e quase branco) o pior
 * caso de qualquer tom é ~4,6:1, então o mínimo é sempre alcançável.
 */
export const CONTRASTE_MINIMO = 3;
export const FUNDO_ESCURO = '#0b1320';
export const FUNDO_CLARO = '#f7f6f0';
/** Pele assumida quando a receita usa "as cores do modelo" (não dá para saber a cor sem ler o material). */
export const PELE_ASSUMIDA = '#d7a074';

function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (WCAG) de `#rrggbb`. */
export function luminancia(hex: string): number {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

export function razaoDeContraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** O fundo (escuro ou claro) de maior contraste com a pele; sempre >= 3:1. */
export function fundoDeAltoContraste(pele: string | null): { fundo: string; razao: number } {
  const p = pele ?? PELE_ASSUMIDA;
  const escuro = razaoDeContraste(p, FUNDO_ESCURO);
  const claro = razaoDeContraste(p, FUNDO_CLARO);
  return escuro >= claro ? { fundo: FUNDO_ESCURO, razao: escuro } : { fundo: FUNDO_CLARO, razao: claro };
}

/** As duas flags da soletração: `avatar_sinais` exige `avatar_3d` (docs/flags.md). */
export function sinaisHabilitados(flags: { avatar_3d?: boolean; avatar_sinais?: boolean }): boolean {
  return flags.avatar_3d === true && flags.avatar_sinais === true;
}
